function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://vidbolt.xyz";
    var API_BASE = BASE_URL + "/api/resolve";
    var REFERER = BASE_URL + "/";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var SERVER_LABELS = ["quantum", "vega", "callisto", "orion", "fastva"];

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var isTvShow = mediaType === "tv";
        if (isTvShow && (season == null || episode == null)) return null;
        var query = "type=" + (isTvShow ? "tv" : "movie") + "&id=" + tmdbId;
        if (isTvShow) query += "&season=" + season + "&episode=" + episode;
        return query;
    }

    function normalizeQuality(rawQuality) {
        var value = String(rawQuality || "").trim().toLowerCase();
        if (/2160|4k|uhd/.test(value)) return "2160p";
        if (/1080|fhd/.test(value)) return "1080p";
        return null;
    }

    function getQualityRank(quality) {
        return quality === "2160p" ? 5 : 3;
    }

    function formatLanguageLabel(language) {
        var trimmed = String(language || "").trim();
        switch (trimmed.toLowerCase()) {
            case "arabic sub":
                return "Arabic [Sub]";
            case "latin american spanish":
                return "Espa\u00f1ol [Latino]";
            case "brazilian portuguese":
                return "Portugu\u00eas [Brasil]";
            default:
                return trimmed;
        }
    }

    function isEnglishLabel(label) {
        return /english|original/i.test(String(label || ""));
    }

    function hasEnglishAudio(candidate) {
        if (isEnglishLabel(candidate.language)) return true;
        if (candidate.language !== "Multi") return false;
        var i;
        for (i = 0; i < candidate.audioNames.length; i++) {
            if (isEnglishLabel(candidate.audioNames[i])) return true;
        }
        return false;
    }

    function buildSortTag(rank) {
        var bits = Math.max(0, 11099 - rank).toString(2);
        while (bits.length < 20) bits = "0" + bits;
        return bits.split("").map(function (bit) {
            return bit === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function capitalize(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
    }

    function parseMasterAudioNames(masterPlaylist) {
        var names = [];
        if (!masterPlaylist || typeof masterPlaylist !== "string") return names;
        var mediaTagPattern = /#EXT-X-MEDIA:TYPE=AUDIO([^\n]*)/g;
        var match;
        while ((match = mediaTagPattern.exec(masterPlaylist)) !== null) {
            var nameMatch = match[1].match(/NAME="([^"]+)"/);
            if (nameMatch && names.indexOf(nameMatch[1]) === -1) names.push(nameMatch[1]);
        }
        return names;
    }

    function extractSources(payload) {
        var sources = payload && payload.stream && payload.stream.sources;
        if (!Array.isArray(sources)) return [];
        return sources.filter(function (source) {
            return source && typeof source.url === "string" && source.url;
        });
    }

    function fetchResolve(query) {
        return Promise.resolve()
            .then(function () {
                return fetch(API_BASE + "?" + query, {
                    headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: REFERER }
                });
            })
            .then(function (response) { return response && response.ok ? response.json() : null; })
            .then(null, function () { return null; });
    }

    function collectCandidates(responses) {
        var seenUrls = Object.create(null);
        var candidates = [];
        var i;
        var j;

        for (i = 0; i < responses.length; i++) {
            var payload = responses[i];
            if (!payload) continue;
            var server = payload.stream && payload.stream.server
                ? String(payload.stream.server).trim()
                : "";
            var sources = extractSources(payload);

            for (j = 0; j < sources.length; j++) {
                var source = sources[j];
                if (seenUrls[source.url]) continue;
                var quality = normalizeQuality(source.quality || source.name);
                if (!quality) continue;
                seenUrls[source.url] = true;

                var audioNames = parseMasterAudioNames(source.master);
                var language = String(source.language || "").trim();
                if (!language && audioNames.length === 1) language = audioNames[0];
                if (!language && audioNames.length > 1) language = "Multi";

                candidates.push({
                    url: source.url,
                    quality: quality,
                    language: formatLanguageLabel(language),
                    audioNames: audioNames,
                    server: server,
                    isMp4: String(source.kind || "hls").toLowerCase() === "mp4",
                    order: candidates.length
                });
            }
        }

        return candidates;
    }

    function rankCandidates(candidates) {
        candidates.forEach(function (candidate) {
            var score = (hasEnglishAudio(candidate) ? 100 : 0) + Math.round(getQualityRank(candidate.quality) * 2);
            candidate.rank = score * 100 + (99 - Math.min(candidate.order, 99));
        });
        return candidates.sort(function (a, b) { return b.rank - a.rank; });
    }

    function limitPerLanguage(candidates) {
        var countByLanguage = Object.create(null);
        return candidates.filter(function (candidate) {
            countByLanguage[candidate.language] = (countByLanguage[candidate.language] || 0) + 1;
            return countByLanguage[candidate.language] <= 2;
        });
    }

    function toStream(candidate) {
        var labelParts = ["VidBolt"];
        if (candidate.server) labelParts.push(capitalize(candidate.server));
        if (candidate.language) labelParts.push(candidate.language);
        var label = buildSortTag(candidate.rank) + labelParts.join(" \u2022 ");

        var stream = {
            name: label,
            title: label,
            url: candidate.url,
            quality: candidate.quality,
            headers: { Referer: REFERER, "User-Agent": USER_AGENT }
        };
        if (!candidate.isMp4) stream.type = "hls";
        return stream;
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    var serverOptions = [""].concat(SERVER_LABELS);

    return Promise.all(serverOptions.map(function (server) {
        return fetchResolve(server ? query + "&prefer=" + server : query);
    }))
        .then(function (responses) {
            var candidates = collectCandidates(responses);
            if (!candidates.length) return [];
            return limitPerLanguage(rankCandidates(candidates)).slice(0, 10).map(toStream);
        })
        .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };