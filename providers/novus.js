function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "Dulo";
    var BASE_URL = "https://dulo.mov";
    var API_BASE = "https://doolo.dulo.mov";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var SERVERS = ["falcon", "osprey", "finch", "robin", "sparrow", "lark", "egret", "ibis", "condor"];
    var HEADERS = {
        "User-Agent": USER_AGENT,
        "Referer": BASE_URL + "/"
    };

    function request(url, options) {
        return Promise.resolve().then(function () {
            return fetch(url, options);
        }).then(null, function () {
            return null;
        });
    }

    function sortStable(list, compare) {
        var slots = list.map(function (item, index) {
            return { item: item, index: index };
        });
        slots.sort(function (a, b) {
            return compare(a.item, b.item) || a.index - b.index;
        });
        return slots.map(function (slot) {
            return slot.item;
        });
    }

    function fetchJson(url, referer) {
        return request(url, {
            headers: { "User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*", "Referer": referer }
        }).then(function (response) {
            return response ? response.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function detectQuality(label) {
        var text = String(label || "");
        var resolution = /\b(2160|1440|1080|720|480|360)\s*p\b/i.exec(text);
        if (resolution) return resolution[1] + "p";
        return /\b4K\b/i.test(text) ? "2160p" : "Auto";
    }

    function getQualityRank(quality) {
        if (quality === "2160p") return 2;
        if (quality === "1080p") return 1;
        return quality === "Auto" ? 0 : -1;
    }

    function buildSortTag(rank) {
        var binary = Math.max(0, 2 - rank).toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (bit) {
            return bit === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function cleanLabel(label) {
        var text = String(label);
        var cleaned = text.replace(/\s*[\u00B7\u2022|-]\s*(?:\d{3,4}p|4K)\b/gi, "").trim();
        return cleaned || text;
    }

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var type = mediaType === "tv" ? "tv" : "movie";
        if (type === "movie") return { tmdbId: tmdbId, type: type, season: 0, episode: 0 };
        if (season == null || episode == null) return null;
        var seasonNumber = parseInt(season, 10);
        var episodeNumber = parseInt(episode, 10);
        if (isNaN(seasonNumber) || isNaN(episodeNumber)) return null;
        return { tmdbId: tmdbId, type: type, season: seasonNumber, episode: episodeNumber };
    }

    function fetchMetadata(query) {
        return fetchJson(TMDB_API + "/" + query.type + "/" + query.tmdbId + "?api_key=" + TMDB_KEY, "").then(function (details) {
            if (!details) return null;
            var releaseDate = details.release_date || details.first_air_date || "";
            return {
                title: details.title || details.name || null,
                year: releaseDate.length >= 4 ? releaseDate.slice(0, 4) : null,
                runtime: details.runtime || null
            };
        });
    }

    function buildSourcesUrl(query, metadata) {
        var params = "tmdbId=" + encodeURIComponent(query.tmdbId) + "&type=" + query.type + "&progressive=true";
        if (query.type === "tv") params += "&seasonId=" + query.season + "&episodeId=" + query.episode;
        if (metadata) {
            if (metadata.title) params += "&title=" + encodeURIComponent(metadata.title);
            if (metadata.year) params += "&year=" + encodeURIComponent(metadata.year);
            if (metadata.runtime) params += "&runtime=" + encodeURIComponent(Math.round(metadata.runtime));
        }
        return BASE_URL + "/api/streams/resolve?" + params;
    }

    function collect(payloads) {
        var sources = [];
        var knownLabels = Object.create(null);
        for (var i = 0; i < payloads.length; i++) {
            var payload = payloads[i];
            var list = payload && Array.isArray(payload.sources) ? payload.sources : [];
            for (var j = 0; j < list.length; j++) {
                var source = list[j];
                if (!source || !source.label || knownLabels[source.label]) continue;
                knownLabels[source.label] = true;
                sources.push(source);
            }
            if (!(payload && payload.pending)) break;
        }
        return sources;
    }

    function fetchSources(query, metadata) {
        var url = buildSourcesUrl(query, metadata);
        var referer = BASE_URL + "/watch/" + query.type + "/" + query.tmdbId;
        var requests = [];
        for (var attempt = 0; attempt < 6; attempt++) requests.push(fetchJson(url, referer));
        return Promise.all(requests).then(collect);
    }

    function capitalize(name) {
        var text = String(name || "");
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }

    function fetchDooloNames() {
        return fetchJson(API_BASE + "/sources", BASE_URL + "/").then(function (data) {
            var names = [];
            var list = data && Array.isArray(data.sources) ? data.sources : [];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && typeof list[i].name === "string" && list[i].name) names.push(list[i].name);
            }
            return names;
        });
    }

    function fetchDooloSource(name, query) {
        var params = "tmdb=" + encodeURIComponent(query.tmdbId) + "&type=" + query.type;
        if (query.type === "tv") params += "&season=" + query.season + "&episode=" + query.episode;
        return fetchJson(API_BASE + "/sources/" + encodeURIComponent(name) + "?" + params, BASE_URL + "/").then(function (data) {
            var streams = data && Array.isArray(data.streams) ? data.streams : [];
            var rows = [];
            for (var i = 0; i < streams.length; i++) {
                var s = streams[i];
                if (!s || typeof s.url !== "string" || !s.url) continue;
                var kind = String(s.kind || "").toLowerCase();
                if (kind !== "hls" && kind !== "mp4") continue;
                rows.push({
                    label: capitalize(name) + (s.label ? " \u00B7 " + s.label : ""),
                    url: s.url,
                    type: kind,
                    captions: []
                });
            }
            return rows;
        }).then(null, function () {
            return [];
        });
    }

    function fetchDooloMany(names, query) {
        return Promise.all(names.map(function (name) {
            return fetchDooloSource(name, query);
        })).then(function (groups) {
            var all = [];
            groups.forEach(function (rows) { all = all.concat(rows); });
            return all;
        });
    }

    function fetchDoolo(query) {
        return fetchDooloMany(SERVERS, query).then(function (rows) {
            if (rows.length >= 2) return rows;
            return fetchDooloNames().then(function (names) {
                var extra = names.filter(function (name) {
                    return SERVERS.indexOf(String(name).toLowerCase()) < 0;
                });
                if (!extra.length) return rows;
                return fetchDooloMany(extra, query).then(function (more) {
                    return rows.concat(more);
                });
            });
        }).then(null, function () {
            return [];
        });
    }

    function buildSubtitles(captions) {
        if (!Array.isArray(captions)) return [];
        return captions.filter(function (caption) {
            return caption && typeof caption.url === "string" && caption.url;
        }).map(function (caption) {
            return { url: caption.url, language: String(caption.display || caption.language || "Unknown") };
        });
    }

    function toStreams(sources) {
        var seenUrls = Object.create(null);
        var streams = [];
        sources.forEach(function (source) {
            if (typeof source.url !== "string" || !source.url || seenUrls[source.url]) return;
            var quality = detectQuality(source.label);
            var rank = getQualityRank(quality);
            if (rank < 0) return;
            seenUrls[source.url] = true;

            var displayName = buildSortTag(rank) + PROVIDER + " \u2022 " + cleanLabel(source.label);
            var stream = {
                name: displayName,
                title: displayName,
                url: source.url,
                quality: quality,
                headers: HEADERS
            };
            if (!/^(mp4|mkv|webm)$/.test(String(source.type))) stream.type = "hls";
            var subtitles = buildSubtitles(source.captions);
            if (subtitles.length) stream.subtitles = subtitles;
            streams.push(stream);
        });
        return sortStable(streams, function (a, b) {
            return getQualityRank(b.quality) - getQualityRank(a.quality);
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    var resolvePath = fetchMetadata(query).then(function (metadata) {
        return fetchSources(query, metadata);
    }).then(null, function () {
        return [];
    });

    return Promise.all([fetchDoolo(query), resolvePath]).then(function (results) {
        return results[0].concat(results[1]);
    }).then(toStreams).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };