function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://kisskh.ovh";
    var ENC_API = "https://enc-dec.app/api/enc-kisskh";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    function buildQuery(type, seasonValue, episodeValue) {
        if (type === "tv" && (seasonValue == null || episodeValue == null)) return null;
        return { type: type, episode: episodeValue };
    }

    function fetchJson(url) {
        try {
            return fetch(url).then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function defined(value) {
        return value === null || value === undefined ? undefined : value;
    }

    function firstDefined(values) {
        for (var i = 0; i < values.length; i++) {
            if (defined(values[i]) !== undefined) return values[i];
        }
        return null;
    }

    function fetchTitle(query) {
        var endpoint = query.type === "tv" ? "tv" : "movie";
        return fetchJson(TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_KEY).then(function (data) {
            if (!data) return null;
            return firstDefined([data.title, data.name, data.original_title]);
        });
    }

    function pickDrama(results, title) {
        for (var i = 0; i < results.length; i++) {
            if (results[i].title.toLowerCase() === title.toLowerCase()) return results[i];
        }
        return results[0];
    }

    function pickEpisode(episodes, query) {
        if (query.type === "movie") return episodes[episodes.length - 1];
        for (var i = 0; i < episodes.length; i++) {
            if (parseInt(episodes[i].number, 10) === parseInt(query.episode, 10)) return episodes[i];
        }
        return null;
    }

    function fetchEpisode(title, query) {
        return fetchJson(BASE_URL + "/api/DramaList/Search?q=" + encodeURIComponent(title) + "&type=0").then(function (results) {
            if (!results || !results.length) return null;
            var matched = pickDrama(results, title);
            if (!matched) return null;
            return fetchJson(BASE_URL + "/api/DramaList/Drama/" + matched.id + "?isq=false").then(function (detail) {
                if (!detail || !detail.episodes || !detail.episodes.length) return null;
                return pickEpisode(detail.episodes, query) || null;
            });
        });
    }

    function fetchSubtitles(episodeId) {
        return fetchJson(ENC_API + "?text=" + episodeId + "&type=sub").then(function (enc) {
            if (!enc || !enc.result) return [];
            return fetchJson(BASE_URL + "/api/Sub/" + episodeId + "?kkey=" + enc.result).then(function (subs) {
                if (!Array.isArray(subs) || !subs.length) return [];
                var tracks = [];
                for (var i = 0; i < subs.length; i++) {
                    var sub = subs[i];
                    if (!sub.src) continue;
                    tracks.push({
                        url: sub.src,
                        language: firstDefined([sub.label, sub.land, "Unknown"]),
                        name: defined(sub.label)
                    });
                }
                return tracks;
            });
        }).then(null, function () {
            return [];
        });
    }

    function fetchSources(episodeId) {
        return fetchJson(ENC_API + "?text=" + episodeId + "&type=vid").then(function (enc) {
            if (!enc || !enc.result) return null;
            return fetchJson(BASE_URL + "/api/DramaList/Episode/" + episodeId + ".png?err=false&ts=&time=&kkey=" + enc.result);
        });
    }

    function normalizeUrl(url) {
        return url.indexOf("//") === 0 ? "https:" + url : url;
    }

    function toStream(link, label, headers, subtitles) {
        return {
            name: "Kisskh",
            title: "Kisskh \u2022 " + label,
            url: link,
            quality: "Auto",
            headers: headers,
            subtitles: subtitles
        };
    }

    function buildStreams(sources, subtitles) {
        var headers = { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT };
        var raw = [sources.Video, sources.ThirdParty];
        var seen = Object.create(null);
        var streams = [];
        for (var i = 0; i < raw.length; i++) {
            if (!raw[i]) continue;
            var link = normalizeUrl(raw[i]);
            var label = link.indexOf(".m3u8") !== -1 ? "HLS" : link.indexOf(".mp4") !== -1 ? "MP4" : null;
            if (!label || seen[link]) continue;
            seen[link] = true;
            streams.push(toStream(link, label, headers, subtitles));
        }
        return streams;
    }

    var query = buildQuery(mediaType, season, episode);
    if (query === null) return Promise.resolve([]);
    try {
        return fetchTitle(query).then(function (title) {
            if (!title) return [];
            return fetchEpisode(title, query).then(function (target) {
                if (!target) return [];
                return Promise.all([fetchSources(target.id), fetchSubtitles(target.id)]).then(function (replies) {
                    if (!replies[0]) return [];
                    return buildStreams(replies[0], replies[1]);
                });
            });
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };