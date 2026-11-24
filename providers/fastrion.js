function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "MultiMovies";
    var VO_API = "https://api.eclq-404.workers.dev";
    var VO_HEADER = { Referer: VO_API + "/" };
    var FLMU_BASE = "https://embed.filmu.in";
    var BLOCKED_HOSTS = ["rousav.tech", "movy.lol"];
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    function buildQuery(type, seasonValue, episodeValue) {
        if (type === "tv" && (seasonValue == null || episodeValue == null)) return null;
        return { isTv: type === "tv", season: seasonValue, episode: episodeValue };
    }

    function qualityOf(raw) {
        var text = String(raw || "").toLowerCase();
        if (text.indexOf("2160") !== -1 || text.indexOf("4k") !== -1) return "2160p";
        if (text.indexOf("1080") !== -1) return "1080p";
        if (text.indexOf("720") !== -1) return "720p";
        if (text.indexOf("480") !== -1) return "480p";
        return "HD";
    }

    function isPlayable(url) {
        if (typeof url !== "string" || url.indexOf("http") !== 0) return false;
        for (var i = 0; i < BLOCKED_HOSTS.length; i++) {
            if (url.indexOf(BLOCKED_HOSTS[i]) !== -1) return false;
        }
        return true;
    }

    function joinUrl(base, path) {
        return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
    }

    function fetchJson(url, options) {
        try {
            return fetch(url, options || {}).then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function playbackHeaders(headers) {
        var out = {};
        var keys = Object.keys(headers);
        for (var i = 0; i < keys.length; i++) out[keys[i]] = headers[keys[i]];
        out["User-Agent"] = USER_AGENT;
        return out;
    }

    function toStream(source, url, quality, headers, subtitles, title) {
        var label = PROVIDER + " \u2022 " + source;
        return {
            name: label,
            title: title || label,
            url: url,
            quality: quality,
            headers: playbackHeaders(headers),
            subtitles: subtitles
        };
    }

    function fetchVidout(query) {
        var endpoint = query.isTv
            ? VO_API + "/tv/" + tmdbId + "/" + query.season + "/" + query.episode
            : VO_API + "/movie/" + tmdbId;
        return fetchJson(endpoint).then(function (data) {
            if (!data || !data.url) return [];
            var subtitles = (data.subtitles || []).map(function (s) {
                return { url: s.url, language: s.language };
            });
            return [toStream("VidOut", data.url, "1080p", VO_HEADER, subtitles)];
        }).then(null, function () {
            return [];
        });
    }

    function fetchFilmu(query) {
        var path = query.isTv
            ? FLMU_BASE + "/api/singularity-tv?tmdb=" + tmdbId + "&s=" + query.season + "&e=" + query.episode
            : FLMU_BASE + "/api/singularity-movie?id=" + tmdbId;
        var referer = query.isTv
            ? FLMU_BASE + "/tv/" + tmdbId + "/" + query.season + "/" + query.episode
            : FLMU_BASE + "/movie/" + tmdbId;
        return fetchJson(path, { headers: { Referer: referer } }).then(function (root) {
            if (!root) return [];
            var subtitles = (root.subtitles || []).filter(function (s) {
                return s && s.url;
            }).map(function (s) {
                return { url: s.url, language: s.lang || "en" };
            });
            var base = root._base || "";
            var streams = [];

            function push(url, quality, title) {
                streams.push(toStream("Filmu", url, quality, { Referer: referer }, subtitles, title));
            }

            var sources = root.sources || [];
            if (!Array.isArray(sources)) return [];
            for (var i = 0; i < sources.length; i++) {
                var src = sources[i];
                if (!src || !src.url) continue;
                var url = src.url.indexOf("http") !== 0 && base ? joinUrl(base, src.url) : src.url;
                if (!isPlayable(url)) continue;
                push(url, qualityOf(src.quality || "1080p"));
            }

            if (streams.length === 0) {
                var quality = qualityOf(root.quality || "1080p");
                var single = (typeof root.url === "string" && root.url) || (root.multilingual && root.multilingual_url) || "";
                if (isPlayable(single)) {
                    push(single, quality, PROVIDER + " \u2022 " + quality);
                } else if (root.m3u8_path && base) {
                    var playlist = joinUrl(base, root.m3u8_path);
                    if (isPlayable(playlist)) push(playlist, quality);
                }
            }

            return streams;
        }).then(null, function () {
            return [];
        });
    }

    function gather(groups) {
        var seen = Object.create(null);
        var streams = [];
        for (var g = 0; g < groups.length; g++) {
            for (var s = 0; s < groups[g].length; s++) {
                var stream = groups[g][s];
                if (!stream || !stream.url || seen[stream.url]) continue;
                seen[stream.url] = true;
                streams.push(stream);
            }
        }
        return streams;
    }

    var query = buildQuery(mediaType, season, episode);
    if (query === null) return Promise.resolve([]);
    try {
        return Promise.all([fetchVidout(query), fetchFilmu(query)]).then(gather).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };