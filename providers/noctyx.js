function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://toonix.bond";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var TMDB_URL = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";

    function mark(seen, key) {
        var slot = "$" + key;
        if (seen[slot]) return false;
        seen[slot] = true;
        return true;
    }

    function slugify(name) {
        return String(name || "")
            .toLowerCase()
            .replace(/[\u2018\u2019'`]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function weigh(quality) {
        var weights = { "4K": 5, "2160P": 5, "1440P": 4, "1080P": 3, "720P": 2, "480P": 1 };
        var key = (quality || "").toUpperCase();
        return weights.hasOwnProperty(key) ? weights[key] : 0;
    }

    function sortTag(rank) {
        var bits = rank.toString(2);
        while (bits.length < 20) bits = "0" + bits;
        return bits.replace(/1/g, "\uFEFF").replace(/0/g, "\u200B");
    }

    function buildQuery(id, type, seasonValue, episodeValue) {
        var seasonNumber = Number(seasonValue);
        var episodeNumber = Number(episodeValue);
        if (type !== "tv" || !/^\d+$/.test(String(id)) || !seasonNumber || !episodeNumber) return null;
        return { id: id, season: seasonNumber, episode: episodeNumber };
    }

    function request(url, referer, asJson) {
        var headers = {
            "User-Agent": USER_AGENT,
            "Accept": asJson ? "application/json,*/*" : "text/html,*/*;q=0.8",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8"
        };
        if (referer) headers.Referer = referer;
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headers });
        }).then(function (res) {
            if (res.status !== 200) return null;
            return asJson ? res.json() : res.text();
        }).then(null, function () {
            return null;
        });
    }

    function fetchTitles(id) {
        var url = TMDB_URL + "/tv/" + encodeURIComponent(id)
            + "?api_key=" + encodeURIComponent(TMDB_KEY) + "&language=en-US&append_to_response=alternative_titles";
        return request(url, null, true).then(function (data) {
            if (!data) return null;
            var alternatives = (data.alternative_titles && data.alternative_titles.results) || [];
            if (!Array.isArray(alternatives)) return null;
            return [data.name, data.original_name].concat(alternatives.map(function (alt) {
                return alt && alt.title;
            }));
        });
    }

    function findPage(slug, seasonNumber, episodeNumber) {
        var watchUrl = BASE_URL + "/show/" + slug + "/" + seasonNumber + "/" + episodeNumber;
        return request(watchUrl, BASE_URL + "/", false).then(function (html) {
            if (html === null) return null;
            var episodeId = (html.match(/hydrax\/(\d{4,10})/) || html.match(/["']episode[Ii]d["']\s*[:=]\s*["']?(\d{4,10})/) || [])[1];
            var pair = html.match(/["']ms["']\s*:\s*(\d{13})\s*,\s*["']token["']\s*:\s*["']([A-Za-z0-9\-_]{43})["']/);
            var accessToken = (html.match(/(\d{10,20}\.[A-Za-z0-9\-_]{40,50})/) || [])[1] || (pair && pair[1] + "." + pair[2]);
            return episodeId && accessToken ? { watchUrl: watchUrl, episodeId: episodeId, accessToken: accessToken } : null;
        });
    }

    function toStreams(qualities) {
        var seen = {};
        return qualities.filter(function (entry) {
            return entry && entry.src && mark(seen, entry.src);
        }).map(function (entry, index) {
            return {
                stream: {
                    name: "Toonix",
                    title: "Toonix",
                    url: entry.src,
                    quality: entry.label || "Auto",
                    headers: { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT }
                },
                index: index
            };
        }).sort(function (a, b) {
            return weigh(b.stream.quality) - weigh(a.stream.quality) || a.index - b.index;
        }).map(function (entry, position) {
            var tag = sortTag(position + 1);
            return {
                name: tag + entry.stream.name,
                title: tag + entry.stream.title,
                url: entry.stream.url,
                quality: entry.stream.quality,
                headers: entry.stream.headers
            };
        });
    }

    function gather(query, titles) {
        if (!titles) return Promise.resolve([]);
        var seen = {};
        var slugs = titles.map(slugify).filter(function (slug) {
            return slug && mark(seen, slug);
        }).slice(0, 6);
        return Promise.all(slugs.map(function (slug) {
            return findPage(slug, query.season, query.episode);
        })).then(function (pages) {
            var page = null;
            for (var i = 0; i < pages.length && !page; i++) page = pages[i];
            if (!page) return [];
            return request(BASE_URL + "/api/hydrax/" + page.episodeId + "?t=" + encodeURIComponent(page.accessToken), page.watchUrl, true).then(function (payload) {
                if (!payload || payload.error || !Array.isArray(payload.qualities)) return [];
                return toStreams(payload.qualities);
            });
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);
    return fetchTitles(query.id).then(function (titles) {
        return gather(query, titles);
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };