function getStreams(tmdbId, mediaType, season, episode) {
    function resWeight(quality) {
        var q = (quality || "").toUpperCase();
        if (q === "1080P") return 4;
        if (q === "720P") return 3;
        if (q === "480P") return 2;
        if (q === "360P") return 1;
        return 0;
    }

    function getInvertedSortTag(score, maxScore) {
        maxScore = maxScore || 999999;
        var val = Math.max(0, parseInt(score, 10) || 0);
        var inv = Math.max(0, maxScore - val);
        var bin = inv.toString(2);
        while (bin.length < 20) bin = "0" + bin;
        var chars = [];
        for (var i = 0; i < bin.length; i++) {
            chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
        }
        return chars.join("");
    }

    var PROVIDER = "WcoFlix";
    var BASE_URL = "https://www.wcoflix.tv";
    var EMBD_URL = "https://embed.wcostream.com";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0 Safari/537.36";

    var QUALITIES = [
        { label: "1080p", keys: ["fhd"], setting: "enable1080p" },
        { label: "720p", keys: ["hd"], setting: "enable720p" },
        { label: "480p", keys: ["enc", "sd"], setting: "enable480p" },
        { label: "360p", keys: ["ld", "low"], setting: "enable360p" }
    ];

    function settings() {
        var raw = typeof SCRAPER_SETTINGS === "object" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
        return {
            enable1080p: raw.enable1080p !== false,
            enable720p: raw.enable720p !== false,
            enable480p: raw.enable480p === true,
            enable360p: raw.enable360p === true
        };
    }

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (mediaType === "tv" && (season == null || episode == null)) return null;
        return { mediaType: mediaType, season: season, episode: episode };
    }

    function unique(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (out.indexOf(list[i]) === -1) out.push(list[i]);
        }
        return out;
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) {
            for (var j = 0; j < lists[i].length; j++) out.push(lists[i][j]);
        }
        return out;
    }

    function uniqueBy(items, field) {
        var order = [];
        var byKey = Object.create(null);
        for (var i = 0; i < items.length; i++) {
            var key = String(items[i][field]);
            if (byKey[key] === undefined) order.push(key);
            byKey[key] = items[i];
        }
        return order.map(function (key) {
            return byKey[key];
        });
    }

    function fetchText(url, referer, extraHeaders) {
        var headers = { "User-Agent": USER_AGENT, "Referer": referer || BASE_URL + "/" };
        for (var key in extraHeaders) {
            if (Object.prototype.hasOwnProperty.call(extraHeaders, key)) headers[key] = extraHeaders[key];
        }
        return fetch(url, { headers: headers }).then(function (response) {
            return response.ok ? response.text() : null;
        }).then(null, function () {
            return null;
        });
    }

    function decodeHtmlEntities(text) {
        return String(text || "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
            .replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }

    function normalizeTitle(title) {
        return decodeHtmlEntities(title).toLowerCase()
            .replace(/\(.*?\)/g, " ")
            .replace(/\b(english\s+)?(subbed|dubbed)\b/g, " ")
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ").trim();
    }

    function fetchTmdbTitles() {
        var endpoint = mediaType === "movie" ? "movie" : "tv";
        var query = "api_key=" + TMDB_KEY + "&append_to_response=alternative_titles";
        return fetch(TMDB_API + "/" + endpoint + "/" + tmdbId + "?" + query).then(function (response) {
            return response.json();
        }).then(function (details) {
            if (!details) return [];
            var alternatives = details.alternative_titles || {};
            var alternativeTitles = (alternatives.titles || alternatives.results || [])
                .slice(0, 15)
                .map(function (alternative) {
                    return alternative.title;
                });
            var candidates = [details.title, details.name, details.original_title, details.original_name]
                .concat(alternativeTitles);
            return unique(candidates.map(normalizeTitle).filter(Boolean));
        }).then(null, function () {
            return [];
        });
    }

    function parseCatalogPage(html) {
        var source = String(html || "").replace(/\\n/g, " ");
        var linkPattern = /<li[^>]*>\s*<a\s+href="(\/anime\/[^"]+)"(?:[^>]*?\btitle="([^"]*)")?[^>]*>([^<]{0,120})<\/a>/gi;
        var entries = [];
        var seenPaths = Object.create(null);
        var match = linkPattern.exec(source);
        while (match !== null) {
            var title = decodeHtmlEntities(match[2] || match[3] || "").trim();
            if (title && seenPaths[match[1]] !== true) {
                seenPaths[match[1]] = true;
                entries.push({ normalizedTitle: normalizeTitle(title), url: BASE_URL + match[1] });
            }
            match = linkPattern.exec(source);
        }
        return entries;
    }

    function loadCatalog() {
        var paths = ["/subbed-anime-list", "/dubbed-anime-list", "/cartoon-list"];
        return Promise.all(paths.map(function (path) {
            return fetchText(BASE_URL + path).then(function (html) {
                return html === null ? [] : parseCatalogPage(html);
            });
        })).then(flatten);
    }

    function findCatalogMatches(catalog, titles) {
        var scored = [];
        for (var i = 0; i < catalog.length; i++) {
            var entry = catalog[i];
            var name = entry.normalizedTitle;
            var score = 0;
            for (var j = 0; j < titles.length; j++) {
                var title = titles[j];
                if (name === title) {
                    score = 100;
                    break;
                }
                var isPrefixMatch = title.length >= 5 && name.length >= 5 &&
                    (name.indexOf(title) === 0 || title.indexOf(name) === 0);
                if (isPrefixMatch) {
                    var lengthRatio = Math.min(name.length, title.length) / Math.max(name.length, title.length);
                    score = Math.max(score, 50 + Math.round(lengthRatio * 40));
                }
            }
            if (score >= 60) scored.push({ entry: entry, score: score, index: i });
        }
        scored.sort(function (a, b) {
            return b.score - a.score || a.index - b.index;
        });
        return scored.filter(function (item) {
            return item.score === scored[0].score;
        }).slice(0, 4).map(function (item) {
            return item.entry;
        });
    }

    function parseEpisodeLinks(html) {
        var linkPattern = /<a\s+href="(\/[^"]*?-episode-(\d+)[^"]*)"[^>]*class="dark-episode-item"[^>]*>/gi;
        var episodes = [];
        var seenPaths = Object.create(null);
        var source = String(html || "");
        var match = linkPattern.exec(source);
        while (match !== null) {
            var tag = match[0];
            var path = match[1];
            var number = match[2];
            if (seenPaths[path] !== true && parseInt(number, 10)) {
                seenPaths[path] = true;
                var dataLang = tag.match(/data-lang="(sub|dub)"/i);
                var seasonMatch = path.match(/-season-(\d+)-episode-/i);
                var language = null;
                if (dataLang) language = dataLang[1].toLowerCase();
                else if (/english-dubbed/i.test(path)) language = "dub";
                else if (/english-subbed/i.test(path)) language = "sub";
                episodes.push({
                    url: BASE_URL + path,
                    number: parseInt(number, 10),
                    season: seasonMatch ? parseInt(seasonMatch[1], 10) : null,
                    language: language
                });
            }
            match = linkPattern.exec(source);
        }
        return episodes;
    }

    function selectEpisodes(episodes, query) {
        var i;
        if (query.mediaType === "movie") {
            var firstNumber = Infinity;
            for (i = 0; i < episodes.length; i++) {
                if (episodes[i].number < firstNumber) firstNumber = episodes[i].number;
            }
            return episodes.filter(function (item) {
                return item.number === firstNumber;
            });
        }
        var hasSeasons = false;
        for (i = 0; i < episodes.length; i++) {
            if (episodes[i].season !== null) hasSeasons = true;
        }
        return episodes.filter(function (item) {
            return item.number === (parseInt(query.episode, 10) || 1) &&
                (!hasSeasons || (item.season || 1) === (parseInt(query.season, 10) || 1));
        });
    }

    function languageOf(code) {
        if (code === "dub") return " • English";
        if (code === "sub") return " • Japanese";
        return "";
    }

    function pickToken(links, keys) {
        for (var i = 0; i < keys.length; i++) {
            if (links[keys[i]]) return links[keys[i]];
        }
        return null;
    }

    function buildStreams(links, item, playerUrl, set) {
        var streams = [];
        var server = String(links.server).replace(/\/$/, "");
        var baseLabel = PROVIDER + languageOf(item.language);
        var seenTokens = Object.create(null);
        var knownFound = false;
        for (var i = 0; i < QUALITIES.length; i++) {
            var q = QUALITIES[i];
            var token = pickToken(links, q.keys);
            if (!token) continue;
            knownFound = true;
            if (!set[q.setting] || seenTokens[token] === true) continue;
            seenTokens[token] = true;
            streams.push({
                name: baseLabel,
                title: baseLabel + " • " + q.label,
                url: server + "/getvid?evid=" + token,
                quality: q.label,
                headers: { "User-Agent": USER_AGENT, "Referer": playerUrl }
            });
        }
        if (!knownFound) {
            for (var key in links) {
                if (!Object.prototype.hasOwnProperty.call(links, key)) continue;
                if (key === "server" || key === "cdn" || typeof links[key] !== "string" || !links[key]) continue;
                streams.push({
                    name: baseLabel,
                    title: baseLabel + " • Auto",
                    url: server + "/getvid?evid=" + links[key],
                    quality: "Auto",
                    headers: { "User-Agent": USER_AGENT, "Referer": playerUrl }
                });
                break;
            }
        }
        return streams;
    }

    function resolveStreams(item, set) {
        return fetchText(item.url, BASE_URL + "/").then(function (episodePage) {
            if (episodePage === null) return [];
            var iframe = episodePage.match(/<iframe[^>]+src="(https?:\/\/embed\.wcostream\.com\/inc\/embed\/index\.php\?[^"]+)"/i);
            var embedQuery = iframe && decodeHtmlEntities(iframe[1]).split("?")[1];
            if (!embedQuery) return [];

            var playerUrl = EMBD_URL + "/inc/embed/video-js.php?" + embedQuery;
            return fetchText(playerUrl, item.url).then(function (playerPage) {
                if (playerPage === null) return [];
                var resolver = playerPage.match(/"(\/inc\/embed\/getvidlink\.php\?[^"]+)"/);
                if (!resolver) return [];

                var resolverUrl = EMBD_URL + decodeHtmlEntities(resolver[1]);
                return fetchText(resolverUrl, playerUrl, { "X-Requested-With": "XMLHttpRequest" }).then(function (resolverBody) {
                    if (resolverBody === null) return [];
                    var links = JSON.parse(resolverBody);
                    if (!links || !links.server) return [];
                    return buildStreams(links, item, playerUrl, set);
                });
            });
        }).then(null, function () {
            return [];
        });
    }

    function fetchEpisodes(match, query) {
        return fetchText(match.url).then(function (html) {
            return html === null ? [] : selectEpisodes(parseEpisodeLinks(html), query);
        }).then(null, function () {
            return [];
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);
    var set = settings();

    return Promise.all([fetchTmdbTitles(), loadCatalog()]).then(function (replies) {
        return Promise.all(findCatalogMatches(replies[1], replies[0]).map(function (match) {
            return fetchEpisodes(match, query);
        }));
    }).then(function (episodeGroups) {
        return Promise.all(uniqueBy(flatten(episodeGroups), "url").map(function (item) {
            return resolveStreams(item, set);
        }));
    }).then(function (streamGroups) {
        var streams = uniqueBy(flatten(streamGroups), "url");
        var order = streams.map(function (s, i) {
            return { stream: s, index: i };
        });
        order.sort(function (a, b) {
            return resWeight(b.stream.quality) - resWeight(a.stream.quality) || a.index - b.index;
        });
        var total = order.length;
        return order.map(function (entry, i) {
            var tag = getInvertedSortTag(total - i, total + 1);
            var s = entry.stream;
            return {
                name: tag + s.name,
                title: tag + s.title,
                url: s.url,
                quality: s.quality,
                headers: s.headers
            };
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        return Promise.resolve([
            { type: "header", label: "WcoFlix" },
            { type: "header", label: "Resolution" },
            {
                type: "toggle",
                key: "enable1080p",
                label: "1080p",
                defaultValue: true,
                description: "1080p"
            },
            {
                type: "toggle",
                key: "enable720p",
                label: "720p",
                defaultValue: true,
                description: "720p"
            },
            {
                type: "toggle",
                key: "enable480p",
                label: "480p",
                defaultValue: false,
                description: "480p"
            },
            {
                type: "toggle",
                key: "enable360p",
                label: "360p",
                defaultValue: false,
                description: "360p"
            }
        ]);
    }
};