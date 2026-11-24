function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://anikage.cc";
    var API_BASE = "https://anikage.cc/api/media/anime";
    var BKY_BASE = "https://og.bakayaro.live";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var SOURCES = ["koto", "kiwi", "wave"];
    var LANGS = ["sub", "dub"];
    var J_HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
    };
    var S_HEADERS = {
        "User-Agent": USER_AGENT,
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
    };

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        if (type === "tv" && (seasonNumber == null || episodeNumber == null)) return null;
        return {
            id: id,
            mediaType: type,
            season: seasonNumber,
            episode: type === "movie" ? 1 : episodeNumber
        };
    }

    function getJson(url) {
        return Promise.resolve().then(function () {
            return fetch(url, { headers: J_HEADERS });
        }).then(function (res) {
            return res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function getTmdbDetails(id, type, seasonNumber) {
        var endpoint = type === "tv" ? "tv" : "movie";
        return Promise.all([
            getJson(TMDB_API + "/" + endpoint + "/" + id + "?api_key=" + TMDB_KEY),
            type === "tv" && seasonNumber != null
                ? getJson(TMDB_API + "/tv/" + id + "/season/" + seasonNumber + "?api_key=" + TMDB_KEY)
                : Promise.resolve(null)
        ]).then(function (replies) {
            var showData = replies[0];
            var seasonData = replies[1];
            var title, seasonName;
            if (!showData) return null;
            title = type === "tv" ? (showData.name || "") : (showData.title || "");
            seasonName = seasonData && seasonData.name
                && seasonData.name.toLowerCase() !== "season " + seasonNumber
                ? seasonData.name.trim()
                : null;
            return { title: title, seasonName: seasonName };
        });
    }

    function pickTitle(t) {
        t = t || {};
        return (t.english || t.romaji || t.native || "").trim();
    }

    function searchSlug(query) {
        return getJson(API_BASE + "/search?q=" + encodeURIComponent(query) + "&limit=5").then(function (data) {
            var results = (data && data.data) || [];
            var q = query.toLowerCase();
            var i;
            if (!results.length) return null;
            for (i = 0; i < results.length; i++) {
                if (pickTitle(results[i].title).toLowerCase() === q) return results[i].slug;
            }
            return results[0].slug || null;
        }).then(null, function () {
            return null;
        });
    }

    function findSlug(title, seasonNumber, seasonName) {
        var queries = [];
        if (seasonName) queries.push(seasonName);
        if (seasonNumber != null && seasonNumber > 1) queries.push(title + " Season " + seasonNumber);
        queries.push(title);
        return Promise.all(queries.map(searchSlug)).then(function (slugs) {
            var i;
            for (i = 0; i < slugs.length; i++) {
                if (slugs[i]) return slugs[i];
            }
            return null;
        });
    }

    function toSubtitles(list) {
        var out = [];
        var i;
        for (i = 0; i < list.length; i++) {
            if (!list[i] || !list[i].file) continue;
            out.push({
                url: BKY_BASE + "/stream/" + list[i].file,
                language: list[i].label || "Subtitle",
                headers: S_HEADERS
            });
        }
        return out;
    }

    function fetchSources(slug, episodeNumber, provider, lang) {
        var url = API_BASE + "/" + slug + "/episodes/" + episodeNumber + "/sources?lang=" + lang + "&provider=" + provider;
        return getJson(url).then(function (data) {
            var subtitles, langLabel, providerLabel, sources, out, i, s, label, isHls;
            if (!data) return [];
            subtitles = toSubtitles(data.subtitles || []);
            langLabel = lang === "dub" ? "English" : "Japanese";
            providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
            label = "AniKage • " + providerLabel + " • " + langLabel;
            sources = data.sources || [];
            out = [];
            for (i = 0; i < sources.length; i++) {
                s = sources[i];
                if (!s || !s.url) continue;
                isHls = s.isM3U8 !== false;
                out.push({
                    name: label,
                    title: label,
                    url: BKY_BASE + (isHls ? "/m3u8/" : "/stream/") + s.url,
                    quality: "1080p",
                    headers: S_HEADERS,
                    subtitles: subtitles
                });
            }
            return out;
        }).then(null, function () {
            return [];
        });
    }

    function gather(slug, episodeNumber) {
        var jobs = [];
        var i, j;
        for (i = 0; i < SOURCES.length; i++) {
            for (j = 0; j < LANGS.length; j++) jobs.push(fetchSources(slug, episodeNumber, SOURCES[i], LANGS[j]));
        }
        return Promise.all(jobs);
    }

    function unique(groups) {
        var seen = Object.create(null);
        var out = [];
        var i, j, s;
        for (i = 0; i < groups.length; i++) {
            for (j = 0; j < groups[i].length; j++) {
                s = groups[i][j];
                if (!s.url || seen[s.url] === true) continue;
                seen[s.url] = true;
                out.push(s);
            }
        }
        return out;
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return getTmdbDetails(query.id, query.mediaType, query.season).then(function (details) {
        if (!details || !details.title) return null;
        return findSlug(details.title, query.season, details.seasonName);
    }).then(function (slug) {
        if (!slug) return [];
        return gather(slug, query.episode).then(unique);
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };