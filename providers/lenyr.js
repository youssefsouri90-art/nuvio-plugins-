function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://anizone.to";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Referer": "https://anizone.to/"
    };

    function buildQuery(id, type, seasonValue, episodeValue) {
        var clean = String(id || "").trim();
        if (!/^\d+$/.test(clean)) return null;
        var isSeries = type === "tv";
        if (isSeries && (seasonValue == null || episodeValue == null)) return null;
        return {
            id: clean,
            isSeries: isSeries,
            seasonNum: isSeries ? parseInt(seasonValue, 10) : 1,
            episodeNum: isSeries ? parseInt(episodeValue, 10) : 1
        };
    }

    function contains(whole, part) {
        return whole.indexOf(part) !== -1;
    }

    function hasSuffix(text, suffix) {
        return text.length >= suffix.length && text.lastIndexOf(suffix) === text.length - suffix.length;
    }

    function sortStable(list, compare) {
        var indexed = [];
        for (var i = 0; i < list.length; i++) indexed.push({ item: list[i], index: i });
        indexed.sort(function (a, b) {
            return compare(a.item, b.item) || a.index - b.index;
        });
        var out = [];
        for (var j = 0; j < indexed.length; j++) out.push(indexed[j].item);
        return out;
    }

    function unique(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (out.indexOf(list[i]) === -1) out.push(list[i]);
        }
        return out;
    }

    function valuesOf(map) {
        var out = [];
        var keys = Object.keys(map);
        for (var i = 0; i < keys.length; i++) out.push(map[keys[i]]);
        return out;
    }

    function truthy(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i]) out.push(list[i]);
        }
        return out;
    }

    function unescapeJson(raw) {
        if (!raw) return "";
        return raw
            .replace(/\\u0022/g, '"')
            .replace(/\\u0026/g, "&")
            .replace(/\\'/g, "'")
            .replace(/\\\//g, "/")
            .replace(/\\\\/g, "\\")
            .replace(/\\&/g, "&")
            .replace(/\\0/g, "\\u0000")
            .replace(/\\x([0-9a-fA-F]{2})/g, function (whole, hex) {
                return "\\u00" + hex;
            })
            .replace(/\\(?!["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "");
    }

    function parseEmbedded(raw) {
        return JSON.parse(unescapeJson(raw));
    }

    function fetchText(path) {
        var url = path.indexOf("http") === 0 ? path : BASE_URL + path;
        return fetch(url, { headers: HEADERS }).then(function (res) {
            return res && res.ok ? res.text() : "";
        }).then(null, function () {
            return "";
        });
    }

    function fetchJson(url, options) {
        return fetch(url, options).then(function (res) {
            return res && res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchPage(path) {
        var url = path.indexOf("http") === 0 ? path : BASE_URL + path;
        return fetch(url, { headers: HEADERS }).then(function (res) {
            if (!res || !res.ok) return { text: "", cookies: "", ok: false };
            return res.text().then(function (text) {
                var cookies = "";
                try {
                    cookies = res.headers.get("set-cookie") || "";
                } catch (e) {
                    cookies = "";
                }
                return { text: text, cookies: cookies, ok: true };
            });
        }).then(null, function () {
            return { text: "", cookies: "", ok: false };
        });
    }

    function fromCodePoint(code) {
        if (!(code > 0) || code > 1114111) return "\uFFFD";
        if (code <= 65535) return String.fromCharCode(code);
        var shifted = code - 65536;
        return String.fromCharCode(55296 + (shifted >> 10), 56320 + (shifted & 1023));
    }

    function decodeEntities(text) {
        if (text.indexOf("&") === -1) return text;
        var named = Object.create(null);
        named.quot = '"';
        named.amp = "&";
        named.apos = "'";
        named.lt = "<";
        named.gt = ">";
        named.nbsp = "\u00A0";
        return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (whole, body) {
            if (body.charAt(0) === "#") {
                var hex = body.charAt(1) === "x" || body.charAt(1) === "X";
                return fromCodePoint(parseInt(body.substring(hex ? 2 : 1), hex ? 16 : 10));
            }
            return named[body] !== undefined ? named[body] : whole;
        });
    }

    function isSpace(ch) {
        return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
    }

    function readTag(html, open) {
        var length = html.length;
        var i = open + 1;
        var close = false;
        if (html.charAt(i) === "/") {
            close = true;
            i++;
        }
        var nameStart = i;
        if (!/[A-Za-z]/.test(html.charAt(i))) return null;
        while (i < length && /[A-Za-z0-9:_-]/.test(html.charAt(i))) i++;
        var tag = { name: html.substring(nameStart, i).toLowerCase(), close: close, attrs: Object.create(null), end: 0 };

        while (i < length) {
            while (i < length && (isSpace(html.charAt(i)) || html.charAt(i) === "/")) i++;
            if (i >= length) return null;
            if (html.charAt(i) === ">") {
                tag.end = i + 1;
                return tag;
            }
            var attrStart = i;
            while (i < length && !isSpace(html.charAt(i)) && html.charAt(i) !== "=" && html.charAt(i) !== ">" && html.charAt(i) !== "/") i++;
            var attrName = html.substring(attrStart, i).toLowerCase();
            while (i < length && isSpace(html.charAt(i))) i++;
            var value = "";
            if (html.charAt(i) === "=") {
                i++;
                while (i < length && isSpace(html.charAt(i))) i++;
                var quote = html.charAt(i);
                if (quote === '"' || quote === "'") {
                    var closeQuote = html.indexOf(quote, i + 1);
                    if (closeQuote === -1) return null;
                    value = html.substring(i + 1, closeQuote);
                    i = closeQuote + 1;
                } else {
                    var valueStart = i;
                    while (i < length && !isSpace(html.charAt(i)) && html.charAt(i) !== ">") i++;
                    value = html.substring(valueStart, i);
                }
            }
            if (attrName && tag.attrs[attrName] === undefined) tag.attrs[attrName] = decodeEntities(value);
        }
        return null;
    }

    function parseTags(html) {
        var tags = [];
        var pos = 0;
        while (pos < html.length) {
            var open = html.indexOf("<", pos);
            if (open === -1) break;
            if (html.substring(open, open + 4) === "<!--") {
                var commentEnd = html.indexOf("-->", open + 4);
                if (commentEnd === -1) break;
                pos = commentEnd + 3;
                continue;
            }
            var tag = readTag(html, open);
            if (!tag) {
                pos = open + 1;
                continue;
            }
            tags.push(tag);
            pos = tag.end;
            if (!tag.close && (tag.name === "script" || tag.name === "style")) {
                var closer = new RegExp("</" + tag.name, "gi");
                closer.lastIndex = pos;
                var found = closer.exec(html);
                if (!found) break;
                pos = found.index;
            }
        }
        return tags;
    }

    function select(tags, name, attr) {
        var out = [];
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (tag.close) continue;
            if (name && tag.name !== name) continue;
            if (attr && tag.attrs[attr] === undefined) continue;
            out.push(tag);
        }
        return out;
    }

    function subtree(tags, index) {
        var name = tags[index].name;
        var depth = 1;
        var inner = [];
        for (var i = index + 1; i < tags.length; i++) {
            if (tags[i].name === name) depth += tags[i].close ? -1 : 1;
            if (depth === 0) break;
            inner.push(tags[i]);
        }
        return inner;
    }

    function resolveImdbId(id) {
        return fetchJson(TMDB_API + "/tv/" + id + "/external_ids?api_key=" + TMDB_KEY).then(function (data) {
            return data && data.imdb_id ? data.imdb_id : null;
        });
    }

    function malIdsOf(replies) {
        var ids = [];
        for (var i = 0; i < replies.length; i++) {
            var data = replies[i];
            if (!data) continue;
            var list = Array.isArray(data.mal_id) ? data.mal_id : data.mal_id ? [data.mal_id] : [];
            for (var j = 0; j < list.length; j++) {
                if (list[j]) ids.push(list[j]);
            }
        }
        return sortStable(unique(ids), function (a, b) {
            return b - a;
        });
    }

    function collectMalIds(imdbId, id) {
        return Promise.all([
            imdbId ? fetchJson("https://animap.id/api/map/imdb/" + imdbId) : Promise.resolve(null),
            id ? fetchJson("https://animap.id/api/map/tmdb/" + id) : Promise.resolve(null)
        ]).then(malIdsOf);
    }

    function withinTwoDays(a, b) {
        if (!a || !b) return false;
        var t1 = new Date(a.split("T")[0] + "T00:00:00Z").getTime();
        var t2 = new Date(b.split("T")[0] + "T00:00:00Z").getTime();
        return Math.ceil(Math.abs(t1 - t2) / 86400000) <= 2;
    }

    function metaOf(epData, tvData, seasonData, episodeNum) {
        if (!epData || !epData.air_date) return null;
        var airDate = epData.air_date.split("T")[0];
        var dayIndex = 0;
        if (seasonData && seasonData.episodes) {
            for (var i = 0; i < seasonData.episodes.length; i++) {
                var ep = seasonData.episodes[i];
                var date = ep.air_date ? ep.air_date.split("T")[0] : undefined;
                if (date === airDate && ep.episode_number < episodeNum) dayIndex++;
            }
        }
        return {
            airDate: airDate,
            dayIndex: dayIndex,
            showTitle: (tvData && (tvData.name || tvData.original_name)) || "",
            originalTitle: (tvData && (tvData.original_name || tvData.original_title)) || "",
            seasonName: (seasonData && seasonData.name) || ""
        };
    }

    function episodeFromAniZip(ani, airDate, dayIndex) {
        try {
            if (!ani || !ani.episodes) return null;
            var titles = ani.titles ? truthy(valuesOf(ani.titles)) : [];
            var eps = valuesOf(ani.episodes);
            var candidates = [];
            for (var i = 0; i < eps.length; i++) {
                var number = parseInt(eps[i].episode, 10);
                var date = eps[i].airDateUtc || eps[i].airDate || eps[i].airdate;
                if (!isNaN(number) && withinTwoDays(date, airDate)) candidates.push({ number: number });
            }
            candidates = sortStable(candidates, function (a, b) {
                return a.number - b.number;
            });
            if (!candidates[dayIndex]) return null;
            return { episodeNumber: candidates[dayIndex].number, titles: titles };
        } catch (e) {
            return null;
        }
    }

    function episodeFromAnimap(data, airDate, dayIndex) {
        try {
            if (!data || !data.aired_from || !withinTwoDays(data.aired_from, airDate)) return null;
            var titles = truthy([data.title, data.title_english, data.title_japanese].concat(data.title_synonyms || []));
            return { episodeNumber: dayIndex + 1, titles: titles };
        } catch (e) {
            return null;
        }
    }

    function resolveAnimeMapping(query, imdbId, meta) {
        if (!imdbId || !meta) return Promise.resolve(null);
        return collectMalIds(imdbId, query.id).then(function (malIds) {
            var requests = [];
            for (var i = 0; i < malIds.length; i++) {
                requests.push(fetchJson("https://api.ani.zip/mappings?mal_id=" + malIds[i]));
                requests.push(fetchJson("https://animap.id/api/mal/" + malIds[i]));
            }
            return Promise.all(requests).then(function (replies) {
                for (var j = 0; j < malIds.length; j++) {
                    var malData = replies[j * 2 + 1];
                    var found = episodeFromAniZip(replies[j * 2], meta.airDate, meta.dayIndex) ||
                        episodeFromAnimap(malData, meta.airDate, meta.dayIndex);
                    if (found) return { episode: found.episodeNumber, titles: found.titles, malData: malData };
                }
                if (malIds.length === 1 && query.seasonNum === 1) {
                    return { episode: query.episodeNum, titles: [], malData: replies[1] };
                }
                return null;
            });
        });
    }

    function lookupTv(query) {
        var base = TMDB_API + "/tv/" + query.id;
        return Promise.all([
            resolveImdbId(query.id),
            fetchJson(base + "/season/" + query.seasonNum + "/episode/" + query.episodeNum + "?api_key=" + TMDB_KEY),
            fetchJson(base + "?api_key=" + TMDB_KEY),
            fetchJson(base + "/season/" + query.seasonNum + "?api_key=" + TMDB_KEY)
        ]).then(function (replies) {
            var meta = metaOf(replies[1], replies[2], replies[3], query.episodeNum);
            return resolveAnimeMapping(query, replies[0], meta).then(function (mapping) {
                var found = { title: "", mappedTitles: [], fallbackTitles: [], targetEpisode: query.episodeNum, seasonName: "" };
                if (mapping) {
                    found.targetEpisode = mapping.episode || query.episodeNum;
                    found.title = meta.showTitle || "";
                    found.seasonName = meta.seasonName || "";
                    found.mappedTitles = found.mappedTitles.concat(mapping.titles);
                    var malData = mapping.malData;
                    var malTitle = malData ? malData.title || malData.title_english || null : null;
                    if (malTitle) {
                        found.mappedTitles.push(malTitle);
                        if (!found.title) found.title = malTitle;
                    }
                }
                if (!found.title && meta) {
                    found.title = meta.showTitle;
                    found.seasonName = meta.seasonName || "";
                    if (meta.originalTitle) found.fallbackTitles.push(meta.originalTitle);
                }
                return found;
            });
        });
    }

    function lookupMovie(query) {
        return fetchJson(TMDB_API + "/movie/" + query.id + "?api_key=" + TMDB_KEY).then(function (data) {
            var found = { title: "", mappedTitles: [], fallbackTitles: [], targetEpisode: query.episodeNum, seasonName: "" };
            if (data) {
                found.title = data.title || data.original_title || "";
                if (data.original_title) found.fallbackTitles.push(data.original_title);
            }
            return found;
        });
    }

    function titlesFromParsed(parsed) {
        var set = [];
        if (parsed.main_title) set.push(parsed.main_title);
        if (parsed.title_list && typeof parsed.title_list === "object") {
            var values = valuesOf(parsed.title_list);
            for (var i = 0; i < values.length; i++) {
                if (values[i]) set.push(values[i]);
            }
        }
        return unique(set);
    }

    function cardsFromEmbedded(html) {
        var m = html.match(/items:\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
        if (!m) return [];
        try {
            var parsed = parseEmbedded(m[1]);
            if (!Array.isArray(parsed)) return [];
            var results = [];
            for (var i = 0; i < parsed.length; i++) {
                if (!parsed[i] || !parsed[i].slug) continue;
                results.push({ slug: parsed[i].slug, titles: titlesFromParsed(parsed[i]) });
            }
            return results;
        } catch (e) {
            return [];
        }
    }

    function cardsFromMarkup(tags) {
        var results = [];
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (tag.close || tag.attrs["x-data"] === undefined || !contains(tag.attrs["x-data"], "anmTitles")) continue;
            var inner = subtree(tags, i);
            var anchors = select(inner, "a", "href");
            var href = null;
            for (var j = 0; j < anchors.length; j++) {
                if (contains(anchors[j].attrs.href, "/anime/")) {
                    href = anchors[j].attrs.href;
                    break;
                }
            }
            if (!href) continue;
            var parts = href.split("/");
            var titles = [];
            var xm = tag.attrs["x-data"].match(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
            if (xm) {
                try {
                    titles = unique(truthy(valuesOf(parseEmbedded(xm[1]))));
                } catch (e) {
                    titles = [];
                }
            }
            results.push({ slug: parts[parts.length - 1] || parts[parts.length - 2], titles: titles });
        }
        return results;
    }

    function extractAnimeCards(html) {
        var embedded = cardsFromEmbedded(html);
        if (embedded.length > 0) return embedded;
        return cardsFromMarkup(parseTags(html));
    }

    function norm(str) {
        if (!str) return "";
        return str.toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function anyTitle(titles, test) {
        for (var i = 0; i < titles.length; i++) {
            if (test(titles[i])) return true;
        }
        return false;
    }

    function matchesAny(text, patterns) {
        for (var i = 0; i < patterns.length; i++) {
            if (patterns[i].test(text)) return true;
        }
        return false;
    }

    function buildSeasonFilter(seasonNum) {
        if (seasonNum === 1) {
            return {
                exclude: [
                    /season\s*[2-9]/i, /saison\s*[2-9]/i, /[\s-][iI]{2,}/,
                    /\s+[2-9]nd/i, /\s+[2-9]rd/i, /\s+[2-9]th/i,
                    /\s+ii\b/i, /\s+iii\b/i, /\s+iv\b/i, /\s+v\b/i,
                    /movie/i, /gekijouban/i, /the movie/i
                ]
            };
        }
        var include = [];
        if (seasonNum === 2) include.push(/season\s*2/i, /saison\s*2/i, /2nd\s*season/i, /[\s-]ii\b/i, /\b2\b/);
        else if (seasonNum === 3) include.push(/season\s*3/i, /saison\s*3/i, /3rd\s*season/i, /[\s-]iii\b/i, /\b3\b/);
        else if (seasonNum === 4) include.push(/season\s*4/i, /saison\s*4/i, /4th\s*season/i, /[\s-]iv\b/i, /\b4\b/, /final\s*season/i);
        else include.push(new RegExp("(?:season|saison)\\s*" + seasonNum, "i"), new RegExp("\\b" + seasonNum + "\\b"));
        return { include: include };
    }

    function firstSlug(cards) {
        return cards.length ? cards[0].slug : null;
    }

    function pickSeriesSlug(cards, candidateTitles, baseTitle, seasonNum, seasonName) {
        var normCandidates = truthy(candidateTitles.map(norm));
        var normBase = norm(baseTitle);
        var normSeasonName = norm(seasonName);
        var i;

        if (normSeasonName && normSeasonName !== "season" + seasonNum) {
            for (i = 0; i < cards.length; i++) {
                if (anyTitle(cards[i].titles, function (t) { return contains(norm(t), normSeasonName); })) return cards[i].slug;
            }
        }

        for (var c = 0; c < normCandidates.length; c++) {
            for (i = 0; i < cards.length; i++) {
                if (anyTitle(cards[i].titles, function (t) { return norm(t) === normCandidates[c]; })) return cards[i].slug;
            }
        }

        var filter = buildSeasonFilter(seasonNum);
        for (i = 0; i < cards.length; i++) {
            var baseMatch = anyTitle(cards[i].titles, function (t) {
                var s = norm(t);
                return contains(s, normBase) || contains(normBase, s);
            });
            if (!baseMatch) continue;
            if (seasonNum === 1) {
                if (!anyTitle(cards[i].titles, function (t) { return matchesAny(t, filter.exclude); })) return cards[i].slug;
            } else if (anyTitle(cards[i].titles, function (t) { return matchesAny(t, filter.include); })) {
                return cards[i].slug;
            }
        }

        return firstSlug(cards);
    }

    function pickMovieSlug(cards, candidateTitles) {
        var normCandidates = truthy(candidateTitles.map(norm));
        var i;
        for (i = 0; i < cards.length; i++) {
            if (anyTitle(cards[i].titles, function (t) { return contains(normCandidates, norm(t)); })) return cards[i].slug;
        }
        for (i = 0; i < cards.length; i++) {
            var near = anyTitle(cards[i].titles, function (t) {
                var s = norm(t);
                return anyTitle(normCandidates, function (c) { return contains(s, c) || contains(c, s); });
            });
            if (near) return cards[i].slug;
        }
        return firstSlug(cards);
    }

    function extractVidstack(html, tags) {
        var m = html.match(/vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\)/);
        if (m) {
            try {
                var data = parseEmbedded(m[1]);
                var embeddedSrc = data.src ? data.src.replace(/\\/g, "") : null;
                var subtitles = data.subtitles || [];
                var embeddedTracks = [];
                for (var i = 0; i < subtitles.length; i++) {
                    var file = subtitles[i].file ? subtitles[i].file.replace(/\\/g, "") : "";
                    if (!file) continue;
                    embeddedTracks.push({
                        url: file,
                        name: subtitles[i].title || subtitles[i].language || "English",
                        language: subtitles[i].language || "en"
                    });
                }
                if (embeddedSrc) return { src: embeddedSrc, tracks: embeddedTracks };
            } catch (e) { }
        }

        var players = select(tags, "media-player", null);
        var src = players.length ? players[0].attrs.src : undefined;
        if (!src) {
            var um = html.match(/https:\/\/[^"']+\/master\.m3u8/);
            if (um) src = um[0];
        }

        var tracks = [];
        var trackTags = select(tags, "track", null);
        for (var j = 0; j < trackTags.length; j++) {
            var attrs = trackTags[j].attrs;
            var tsrc = attrs.src;
            var kind = attrs.kind;
            if (tsrc && (kind === "subtitles" || kind === "captions" || hasSuffix(tsrc, ".ass") || hasSuffix(tsrc, ".vtt"))) {
                tracks.push({ url: tsrc, name: attrs.label || "English", language: attrs.srclang || "en" });
            }
        }

        return { src: src, tracks: tracks };
    }

    function searchAnime(query) {
        if (!query) return Promise.resolve([]);
        return fetchText("/anime?search=" + encodeURIComponent(query) + "&sort=title-asc").then(function (html) {
            return html ? extractAnimeCards(html) : [];
        });
    }

    function searchQueries(found, searchQuery) {
        var queries = [searchQuery];
        var list = [];
        if (found.title !== searchQuery) list.push(found.title.split(":")[0].trim());
        for (var i = 0; i < found.fallbackTitles.length; i++) list.push(found.fallbackTitles[i].split(":")[0].trim());
        for (var j = 0; j < list.length; j++) {
            if (queries.indexOf(list[j]) === -1) queries.push(list[j]);
        }
        return queries;
    }

    function findCards(found, searchQuery) {
        var queries = searchQueries(found, searchQuery);
        return Promise.all(queries.map(searchAnime)).then(function (groups) {
            for (var i = 0; i < groups.length; i++) {
                if (groups[i].length > 0) return groups[i];
            }
            return [];
        });
    }

    function toStream(src, tracks) {
        return {
            name: "AniZone \u2022 Varyg",
            title: "AniZone \u2022 Varyg",
            url: src,
            quality: "1080p",
            headers: HEADERS,
            subtitles: tracks
        };
    }

    function fragmentOf(json) {
        var component = json && json.components && json.components[0];
        var effects = component && component.effects;
        return effects && effects.html ? effects.html : "";
    }

    function switchServer(button, csrf, snapshot, cookies, epPath, primary) {
        var idMatch = (button.attrs["wire:click"] || "").match(/setVideo\((\d+)\)/);
        if (!idMatch) return Promise.resolve(null);
        var videoId = parseInt(idMatch[1], 10);
        return fetchJson(BASE_URL + "/livewire/update", {
            method: "POST",
            headers: {
                "Accept": "*/*",
                "Content-Type": "application/json",
                "X-Livewire": "",
                "X-CSRF-TOKEN": csrf,
                "Origin": BASE_URL,
                "Referer": BASE_URL + epPath,
                "Cookie": cookies,
                "User-Agent": HEADERS["User-Agent"]
            },
            body: JSON.stringify({
                _token: csrf,
                components: [{ snapshot: snapshot, updates: {}, calls: [{ path: "", method: "setVideo", params: [videoId] }] }]
            })
        }).then(function (json) {
            var fragment = fragmentOf(json);
            if (!fragment) return null;
            var alt = extractVidstack(fragment, parseTags(fragment));
            if (!alt.src || alt.src === primary.src) return null;
            return toStream(alt.src, alt.tracks.length > 0 ? alt.tracks : primary.tracks);
        });
    }

    function gather(page, epPath) {
        var tags = parseTags(page.text);
        var primary = extractVidstack(page.text, tags);
        var buttons = [];
        var candidates = select(tags, "button", "wire:click");
        for (var i = 0; i < candidates.length; i++) {
            if (contains(candidates[i].attrs["wire:click"], "setVideo")) buttons.push(candidates[i]);
        }

        var streams = [];
        if (primary.src) streams.push(toStream(primary.src, primary.tracks));
        if (buttons.length <= 1) return Promise.resolve(streams);

        var csrfTags = select(tags, "script", "data-csrf");
        var snapshotTags = select(tags, null, "wire:snapshot");
        var csrf = csrfTags.length ? csrfTags[0].attrs["data-csrf"] : "";
        var snapshot = snapshotTags.length ? snapshotTags[0].attrs["wire:snapshot"] : "";
        if (!csrf || !snapshot || !page.cookies) return Promise.resolve(streams);

        var jobs = [];
        for (var j = 1; j < buttons.length; j++) {
            jobs.push(switchServer(buttons[j], csrf, snapshot, page.cookies, epPath, primary));
        }
        return Promise.all(jobs).then(function (alternates) {
            for (var k = 0; k < alternates.length; k++) {
                if (alternates[k]) streams.push(alternates[k]);
            }
            return streams;
        });
    }

    function resolveStreams(query, found) {
        var title = found.title;
        if (!title && found.mappedTitles.length === 0) return Promise.resolve([]);
        if (!title) title = found.mappedTitles[0];
        found.title = title;

        var candidateTitles = query.seasonNum === 1 || !query.isSeries
            ? found.mappedTitles.concat([title], found.fallbackTitles)
            : found.mappedTitles.slice();

        var searchQuery = title
            .split(":")[0]
            .replace(/season.*|\d+nd season|\d+rd season|\d+th season|saison.*/gi, "")
            .trim();

        return findCards(found, searchQuery).then(function (cards) {
            if (cards.length === 0) return [];
            var animeSlug = query.isSeries
                ? pickSeriesSlug(cards, candidateTitles, searchQuery, query.seasonNum, found.seasonName)
                : pickMovieSlug(cards, candidateTitles);
            if (!animeSlug) return [];

            var epPath = "/anime/" + animeSlug + "/" + found.targetEpisode;
            return fetchPage(epPath).then(function (page) {
                if (!page.ok || !page.text) return [];
                return gather(page, epPath);
            });
        });
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (!query) return Promise.resolve([]);

        var lookup = query.isSeries ? lookupTv(query) : lookupMovie(query);
        return lookup.then(function (found) {
            return resolveStreams(query, found);
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };