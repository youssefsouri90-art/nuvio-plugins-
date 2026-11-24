function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://play4u.org";
    var TMDB_URL = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    function pad(value) {
        var text = String(value);
        while (text.length < 2) {
            text = "0" + text;
        }
        return text;
    }

    function fetchText(url, headers) {
        return Promise.resolve()
            .then(function () {
                return fetch(url, { headers: headers });
            })
            .then(function (response) {
                return response.ok ? response.text() : null;
            })
            .then(null, function () {
                return null;
            });
    }

    function fetchJson(url, headers) {
        return fetchText(url, headers).then(function (text) {
            try {
                return JSON.parse(text);
            } catch (error) {
                return null;
            }
        });
    }

    function buildQuery() {
        var isSeries = mediaType === "tv";
        var id = String(tmdbId || "").trim();
        if (!/^tt\d+$/.test(id) && !/^\d+$/.test(id)) return null;
        if (isSeries && (season == null || episode == null)) return null;
        return { id: id, isSeries: isSeries };
    }

    function imdbIdOf(query) {
        if (/^tt\d+$/.test(query.id)) return Promise.resolve(query.id);
        var url = TMDB_URL + "/" + (query.isSeries ? "tv" : "movie") + "/" + query.id +
            "/external_ids?api_key=" + encodeURIComponent(TMDB_KEY);
        return fetchJson(url, { "User-Agent": USER_AGENT, Accept: "application/json" }).then(function (data) {
            return (data && data.imdb_id) || null;
        });
    }

    function pageUrlOf(query, imdbId) {
        if (!query.isSeries) return BASE_URL + "/watch/" + imdbId;
        return BASE_URL + "/series/" + imdbId + "/s-" + pad(season) + "/ep-" + pad(episode);
    }

    function readState(html) {
        var marker = html.indexOf("window.__PA_PLAY__");
        var start = marker < 0 ? -1 : html.indexOf("{", marker);
        if (start < 0) return null;
        var end = html.indexOf("}", start);
        while (end >= 0) {
            try {
                return JSON.parse(html.slice(start, end + 1));
            } catch (error) {
                end = html.indexOf("}", end + 1);
            }
        }
        return null;
    }

    function decode(text) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var data = text.replace(/[\t\n\f\r ]/g, "");
        if (data.length % 4 === 0) data = data.replace(/={1,2}$/, "");
        if (data.length % 4 === 1 || /[^A-Za-z0-9+\/]/.test(data)) return null;
        var out = "";
        var acc = 0;
        var bits = 0;
        var i;
        for (i = 0; i < data.length; i++) {
            acc = (acc << 6) | alphabet.indexOf(data.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out += String.fromCharCode((acc >> bits) & 255);
                acc = acc & ((1 << bits) - 1);
            }
        }
        return out;
    }

    function unseal(value) {
        if (value.substring(0, 4) !== "pa!~") return value;
        var key = "pa4u-stream-seal-v1";
        var base64 = value.substring(4).replace(/-/g, "+").replace(/_/g, "/");
        var binary = decode(base64 + "===".slice(0, (4 - base64.length % 4) % 4));
        if (binary === null) return "";
        var out = "";
        var i;
        for (i = 0; i < binary.length; i++) {
            out += String.fromCharCode(binary.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    }

    function heightOf(stream) {
        var heights = (stream.qualities || []).map(function (quality) {
            var match = String(quality.label || quality.slug || "").match(/\d{3,4}/);
            return parseInt(quality.height, 10) || (match ? parseInt(match[0], 10) : 0);
        });
        var best = 0;
        var i;
        for (i = 0; i < heights.length; i++) {
            if (heights[i] > best) best = heights[i];
        }
        return best;
    }

    function qualityOf(height) {
        return height >= 2160 ? "4K" : height + "p";
    }

    function labelOf(stream) {
        var names = (stream.languages || [])
            .map(function (language) { return language && language.name; })
            .filter(Boolean);
        if (names.length > 2) return "Play4u \u2022 Multi-Dub";
        return names.length ? "Play4u \u2022 " + names.join(" \u2022 ") : "Play4u";
    }

    function collect(streams) {
        return streams
            .filter(function (stream) { return stream && stream.m3u8_url; })
            .map(function (stream, index) {
                return {
                    order: index,
                    height: heightOf(stream),
                    url: unseal(stream.m3u8_url),
                    label: labelOf(stream)
                };
            });
    }

    function select(candidates) {
        var seen = {};
        return candidates
            .filter(function (candidate) {
                if (candidate.height < 1080 || !candidate.url) return false;
                var key = "k" + candidate.url;
                if (seen[key]) return false;
                seen[key] = true;
                return true;
            })
            .sort(function (a, b) {
                return (b.height - a.height) || (a.order - b.order);
            });
    }

    function toStream(candidate) {
        return {
            name: candidate.label,
            title: candidate.label,
            url: candidate.url,
            quality: qualityOf(candidate.height),
            type: "hls",
            headers: { "User-Agent": USER_AGENT, Referer: BASE_URL + "/", Origin: BASE_URL }
        };
    }

    function load(query, imdbId) {
        if (!imdbId) return [];
        return fetchText(pageUrlOf(query, imdbId), { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" })
            .then(function (html) {
                var state = html && readState(html);
                if (!state || !state.ok || !Array.isArray(state.streams)) return [];
                return select(collect(state.streams)).map(toStream);
            });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);
    return imdbIdOf(query)
        .then(function (imdbId) {
            return load(query, imdbId);
        })
        .then(null, function () {
            return [];
        });
}

module.exports = { getStreams: getStreams };