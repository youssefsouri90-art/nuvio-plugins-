function getStreams(tmdbId, mediaType, season, episode) {
    var API_BASE = "https://streamdata.vaplayer.ru";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var REFERER = "https://nextgencloudfabric.com/";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Referer": REFERER,
        "Origin": REFERER
    };

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        if (type === "tv" && (seasonNumber == null || episodeNumber == null)) return null;
        return { id: id, mediaType: type, season: seasonNumber, episode: episodeNumber };
    }

    function fetchJson(url, headers) {
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headers });
        }).then(function (res) {
            return res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchImdbId(id, type) {
        var endpoint = type === "tv" ? "tv" : "movie";
        var url = TMDB_API + "/" + endpoint + "/" + id + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids";
        return fetchJson(url, { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" }).then(function (data) {
            return (data && data.external_ids && data.external_ids.imdb_id) || null;
        });
    }

    function buildUrl(imdbId, seasonNumber, episodeNumber) {
        if (seasonNumber != null && episodeNumber != null) {
            return API_BASE + "/api.php?imdb=" + imdbId + "&type=tv&season=" + seasonNumber + "&episode=" + episodeNumber;
        }
        return API_BASE + "/api.php?imdb=" + imdbId + "&type=movie";
    }

    function rawItemsOf(data) {
        var urls = data.stream_urls;
        var out = [];
        var keys, i;
        if (Array.isArray(urls)) return urls;
        if (typeof urls === "object" && urls !== null) {
            keys = Object.keys(urls);
            for (i = 0; i < keys.length; i++) out.push(urls[keys[i]]);
            return out;
        }
        if (data.stream_url) return [data.stream_url];
        return out;
    }

    function collectUrls(items) {
        var seen = Object.create(null);
        var out = [];
        var i, item, streamUrl, cleanUrl;
        for (i = 0; i < items.length; i++) {
            item = items[i];
            if (typeof item === "string") {
                streamUrl = item;
            } else if (item && typeof item === "object") {
                streamUrl = item.url || item.file || item.src || "";
            } else {
                continue;
            }
            if (!streamUrl) continue;
            cleanUrl = streamUrl.trim().replace(/\/+$/, "");
            if (seen[cleanUrl] === true) continue;
            seen[cleanUrl] = true;
            out.push(cleanUrl);
        }
        return out;
    }

    function collectSubtitles(data, root) {
        var subs = data.default_subs || root.default_subs || [];
        var out = [];
        var i;
        if (!Array.isArray(subs)) return out;
        for (i = 0; i < subs.length; i++) {
            if (!subs[i].url) continue;
            out.push({
                url: subs[i].url,
                language: subs[i].code || subs[i].lang || "unknown",
                name: subs[i].lang || subs[i].code || "Unknown"
            });
        }
        return out;
    }

    function toStreams(urls, subtitles) {
        return urls.map(function (url) {
            return {
                name: "VAplayer",
                title: "VAplayer",
                url: url,
                quality: "1080p",
                headers: HEADERS,
                subtitles: subtitles
            };
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return fetchImdbId(query.id, query.mediaType).then(function (imdbId) {
        var headers = { "User-Agent": HEADERS["User-Agent"], "Referer": REFERER, "Origin": REFERER, "Accept": "application/json" };
        if (!imdbId) return null;
        return fetchJson(buildUrl(imdbId, query.season, query.episode), headers);
    }).then(function (root) {
        var urls;
        if (!root || root.status_code === "error" || !root.data) return [];
        urls = collectUrls(rawItemsOf(root.data));
        if (!urls.length) return [];
        return toStreams(urls, collectSubtitles(root.data, root));
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };