function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://animecube.live";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var query = { tmdbUrl: TMDB_API + "/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY, season: 1, episode: 1 };
        if (mediaType === "movie") return query;
        if (season == null || episode == null) return null;
        if (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode))) return null;
        query.season = parseInt(season, 10);
        query.episode = parseInt(episode, 10);
        return query;
    }

    function fetchText(url, referer) {
        try {
            return fetch(url, {
                headers: { "User-Agent": USER_AGENT, "Referer": referer || BASE_URL + "/" }
            }).then(function (res) {
                return res.ok ? res.text() : null;
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url, referer) {
        return fetchText(url, referer).then(function (text) {
            if (text === null) return null;
            try {
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        });
    }

    function titleOf(data) {
        if (!data) return null;
        return (mediaType === "tv" ? data.name : data.title) || null;
    }

    function extractRscPayload(html) {
        var chunks = [];
        var chunkRe = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
        var m = chunkRe.exec(html);
        while (m !== null) {
            chunks.push(m[1]);
            m = chunkRe.exec(html);
        }
        return chunks.join("")
            .replace(/\\u([0-9a-fA-F]{4})/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
            .replace(/\\\//g, "/")
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
    }

    function selectAnimeSlug(xml, title) {
        var seen = Object.create(null);
        var slugs = [];
        var slugRe = /\/anime\/([a-z0-9\-]+)/g;
        var m = slugRe.exec(xml);
        while (m !== null) {
            if (seen[m[1]] !== true) {
                seen[m[1]] = true;
                slugs.push(m[1]);
            }
            m = slugRe.exec(xml);
        }
        var tokens = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
        for (var i = 0; i < slugs.length; i += 1) {
            var spaced = slugs[i].replace(/-/g, " ");
            var matched = true;
            for (var j = 0; j < tokens.length; j += 1) {
                if (spaced.indexOf(tokens[j]) === -1) {
                    matched = false;
                    break;
                }
            }
            if (matched) return slugs[i];
        }
        return null;
    }

    function selectEpisodeSlug(html, animeSlug, season, episode) {
        var rsc = extractRscPayload(html);
        var seen = Object.create(null);
        var eps = [];
        var epRe = new RegExp(
            '"(' + animeSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '-tab-(\\d+)-ep-(\\d+))"', "g"
        );
        var m = epRe.exec(rsc);
        while (m !== null) {
            if (seen[m[1]] !== true) {
                seen[m[1]] = true;
                eps.push({ epSlug: m[1], tab: parseInt(m[2], 10), ep: parseInt(m[3], 10), index: eps.length });
            }
            m = epRe.exec(rsc);
        }
        eps.sort(function (a, b) {
            return (a.tab - b.tab) || (a.ep - b.ep) || (a.index - b.index);
        });
        for (var i = 0; i < eps.length; i += 1) {
            if (eps[i].tab === season && eps[i].ep === episode) return eps[i].epSlug;
        }
        if (episode <= eps.length && eps[episode - 1]) return eps[episode - 1].epSlug;
        return null;
    }

    function selectSourceVersion(registry, animeSlug, epSlug) {
        var tabMatch = /-tab-(\d+)-ep-(\d+)/.exec(epSlug);
        if (!tabMatch) return null;
        var seasonId = "tab-" + tabMatch[1];
        var bySeason = (registry && registry.bySeason && registry.bySeason[animeSlug]) || {};
        for (var primaryId in bySeason) {
            if (bySeason[primaryId] && bySeason[primaryId][seasonId]) {
                return { primaryId: primaryId, token: bySeason[primaryId][seasonId], seasonId: seasonId };
            }
        }
        return null;
    }

    function resolveDailymotionStreams(videoId, animeSlug) {
        var referer = "https://geo.dailymotion.com/";
        return fetchJson(
            "https://geo.dailymotion.com/video/" + encodeURIComponent(videoId) + ".json?legacy=true&embedder=" + encodeURIComponent(BASE_URL + "/anime/" + animeSlug),
            referer
        ).then(function (data) {
            var masterUrl = data && !data.error
                && data.qualities && data.qualities.auto
                && data.qualities.auto[0] && data.qualities.auto[0].url;
            if (!masterUrl) return [];
            return [{
                name: "AnimeCube \u2022 Dailymotion",
                title: "AnimeCube \u2022 Dailymotion",
                url: masterUrl,
                quality: "Auto",
                headers: { "User-Agent": USER_AGENT, "Referer": referer }
            }];
        });
    }

    function resolveRumbleStreams(videoId) {
        var referer = "https://rumble.com/";
        return fetchJson(
            "https://rumble.com/embedJS/u3/?request=video&ver=2&v=" + encodeURIComponent(videoId),
            BASE_URL + "/"
        ).then(function (data) {
            if (!data) return [];
            var streams = [];
            var headers = { "User-Agent": USER_AGENT, "Referer": referer };
            var ua = data.ua || {};
            var hlsUrl = ua.hls && ua.hls.auto && ua.hls.auto.url;
            if (hlsUrl) {
                streams.push({
                    name: "AnimeCube \u2022 Rumblee",
                    title: "AnimeCube \u2022 Rumble",
                    url: hlsUrl,
                    quality: "Auto",
                    headers: headers
                });
            }
            var mp4 = ua.mp4 || {};
            for (var q in mp4) {
                var src = mp4[q] && mp4[q].url;
                if (!src) continue;
                streams.push({
                    name: "AnimeCube \u2022 Rumble",
                    title: "AnimeCube \u2022 Rumble",
                    url: src,
                    quality: "Auto",
                    headers: headers
                });
            }
            return streams;
        });
    }

    function resolveSource(source, animeSlug) {
        var task = Promise.resolve([]);
        if (!source || !source.platform) return task;
        if (source.platform === "dailymotion" && (source.privateId || source.videoId)) {
            task = resolveDailymotionStreams(source.privateId || source.videoId, animeSlug);
        } else if (source.platform === "rumble" && source.videoId) {
            task = resolveRumbleStreams(source.videoId);
        }
        return task.then(null, function () {
            return [];
        });
    }

    function collect(lists) {
        var seen = Object.create(null);
        var streams = [];
        for (var i = 0; i < lists.length; i += 1) {
            for (var j = 0; j < lists[i].length; j += 1) {
                var s = lists[i][j];
                if (!s.url || seen[s.url] === true) continue;
                seen[s.url] = true;
                streams.push(s);
            }
        }
        return streams;
    }

    function resolveSources(query, animeSlug, html, registry) {
        var epSlug = selectEpisodeSlug(html, animeSlug, query.season, query.episode);
        if (!epSlug) return Promise.resolve([]);
        var version = selectSourceVersion(registry, animeSlug, epSlug);
        if (!version) return Promise.resolve([]);
        var sourcesUrl = BASE_URL + "/api/anime/" + animeSlug + "/episode/" + epSlug + "/sources"
            + "?v=" + encodeURIComponent(version.token)
            + "&primaryTabId=" + encodeURIComponent(version.primaryId)
            + "&seasonId=" + encodeURIComponent(version.seasonId);
        return fetchJson(sourcesUrl, BASE_URL + "/anime/" + animeSlug).then(function (payload) {
            var sources = (payload && payload.sources) || [];
            var tasks = [];
            for (var i = 0; i < sources.length; i += 1) {
                tasks.push(resolveSource(sources[i], animeSlug));
            }
            return Promise.all(tasks);
        }).then(collect);
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (query === null) return Promise.resolve([]);
        return Promise.all([
            fetchJson(query.tmdbUrl, TMDB_API),
            fetchText(BASE_URL + "/sitemap.xml")
        ]).then(function (first) {
            var title = titleOf(first[0]);
            if (!title) return [];
            var animeSlug = selectAnimeSlug(first[1] || "", title);
            if (!animeSlug) return [];
            return Promise.all([
                fetchText(BASE_URL + "/anime/" + encodeURIComponent(animeSlug)),
                fetchJson(BASE_URL + "/api/anime-sources-versions", BASE_URL + "/anime/" + animeSlug)
            ]).then(function (second) {
                return resolveSources(query, animeSlug, second[0] || "", second[1]);
            });
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };