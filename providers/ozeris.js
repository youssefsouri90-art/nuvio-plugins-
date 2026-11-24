function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://anv.to";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    };
    var J_HEADERS = merge(HEADERS, {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: BASE_URL + "/"
    });

    function merge(base, extra) {
        var out = {};
        var key;
        for (key in base) {
            if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
        }
        for (key in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
        }
        return out;
    }

    function fetchJson(url, options) {
        return fetch(url, options).then(function (response) {
            return response.json();
        }).then(null, function () {
            return null;
        });
    }

    function toAbsoluteUrl(url) {
        return url ? (url.indexOf("http") === 0 ? url : BASE_URL + url) : null;
    }

    function normalizeText(text) {
        return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    function unique(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (out.indexOf(list[i]) === -1) out.push(list[i]);
        }
        return out;
    }

    function uniqueById(items) {
        var order = [];
        var byId = Object.create(null);
        for (var i = 0; i < items.length; i++) {
            var key = String(items[i].id);
            if (byId[key] === undefined) order.push(key);
            byId[key] = items[i];
        }
        return order.map(function (key) {
            return byId[key];
        });
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) {
            for (var j = 0; j < lists[i].length; j++) out.push(lists[i][j]);
        }
        return out;
    }

    function buildQuery() {
        var isTv = mediaType === "tv";
        if (!/^\d+$/.test(String(tmdbId)) || (isTv && (season == null || episode == null))) return null;
        return { isTv: isTv, season: isTv ? season : 1, episode: isTv ? episode : 1 };
    }

    function getTitles(media) {
        var title = media.title || {};
        var all = [title.english, title.romaji, title.native].concat(media.synonyms || []);
        return all.filter(Boolean).map(function (value) {
            return normalizeText(value);
        });
    }

    function getPartNumber(titles) {
        for (var i = 0; i < titles.length; i++) {
            var match = titles[i].match(/\b(?:part|cour)\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+(?:part|cour)\b/);
            if (match) return parseInt(match[1] || match[2], 10);
        }
        return null;
    }

    function hasSeasonMarker(titles, number) {
        var marker = new RegExp("(season " + number + "\\b|\\b" + number + "(st|nd|rd|th) season| " + number + "$)");
        for (var i = 0; i < titles.length; i++) {
            var stripped = titles[i].replace(/\b(?:part|cour)\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+(?:part|cour)\b/g, " ").trim();
            if (marker.test(stripped)) return true;
        }
        return false;
    }

    function fetchSessionCookie(pageUrl) {
        return fetch(pageUrl, { headers: HEADERS }).then(function (response) {
            var match = (response.headers.get("set-cookie") || "").match(/shiro_watch=([^;,\s]+)/);
            return match ? "shiro_watch=" + match[1].trim() : null;
        }).then(null, function () {
            return null;
        });
    }

    function searchAnime(query) {
        return fetchJson(BASE_URL + "/api/catalog", {
            method: "POST",
            headers: J_HEADERS,
            body: JSON.stringify({
                operation: "BrowseAnime",
                variables: { page: 1, perPage: 20, sort: ["POPULARITY_DESC"], search: query }
            })
        }).then(function (data) {
            var results = (data && data.data && data.data.Page && data.data.Page.media) || [];
            return results.filter(function (media) {
                return media && media.id && media.slug && !media.isAdult;
            });
        });
    }

    function requestEpisode(media, episodeNumber, pageUrl) {
        var body = JSON.stringify({ anilistId: media.id, malId: media.idMal || null, episode: episodeNumber });
        return fetchSessionCookie(pageUrl).then(function (cookie) {
            if (!cookie) return null;
            return fetchJson(BASE_URL + "/api/episode", {
                method: "POST",
                headers: merge(J_HEADERS, { Cookie: cookie, Referer: pageUrl }),
                body: body
            }).then(function (episodeData) {
                return episodeData ? { episode: episodeData, cookie: cookie } : null;
            });
        });
    }

    function detectStreamHeight(streamUrl, headers) {
        return fetch(streamUrl, { headers: headers }).then(function (response) {
            return response.text();
        }).then(function (playlist) {
            var pattern = /RESOLUTION=\d+x(\d+)/g;
            var best = 0;
            var match = pattern.exec(playlist);
            while (match) {
                var height = parseInt(match[1], 10);
                if (height > best) best = height;
                match = pattern.exec(playlist);
            }
            return best;
        }).then(null, function () {
            return 0;
        });
    }

    function yearOf(value) {
        return value ? parseInt(value.slice(0, 4), 10) : null;
    }

    function fetchTmdbDetails(id, type, number) {
        if (!TMDB_KEY) return Promise.resolve(null);
        var isTv = type === "tv";
        var query = "api_key=" + TMDB_KEY;
        var needSeason = isTv && number > 1;

        return Promise.all([
            fetchJson(TMDB_API + "/" + (isTv ? "tv" : "movie") + "/" + id + "?" + query),
            needSeason ? fetchJson(TMDB_API + "/tv/" + id + "/season/" + number + "?" + query) : Promise.resolve(null)
        ]).then(function (replies) {
            var show = replies[0];
            var seasonDetails = replies[1];
            if (!show || (needSeason && !seasonDetails)) return null;

            var releaseDate = show.release_date || show.first_air_date || "";
            var seasonName = seasonDetails && seasonDetails.name;
            return {
                titles: unique([show.name, show.title, show.original_name, show.original_title].filter(Boolean)),
                year: yearOf(releaseDate),
                seasonYear: seasonDetails && seasonDetails.air_date ? yearOf(seasonDetails.air_date) : null,
                seasonName: seasonName && !/^season\s*\d+$/i.test(seasonName.trim()) ? seasonName : null
            };
        });
    }

    function anyTitle(titles, test) {
        for (var i = 0; i < titles.length; i++) {
            if (test(titles[i])) return true;
        }
        return false;
    }

    function scoreCandidate(candidate, tmdb, number) {
        var titles = getTitles(candidate);
        var score = 0;
        var tmdbTitles = tmdb.titles.map(function (value) {
            return normalizeText(value);
        }).filter(Boolean);

        tmdbTitles.forEach(function (tmdbTitle) {
            if (titles.indexOf(tmdbTitle) !== -1) {
                score += 10;
            } else if (anyTitle(titles, function (title) {
                return title.indexOf(tmdbTitle) !== -1 || tmdbTitle.indexOf(title) !== -1;
            })) {
                score += 3;
            }
        });

        if (number > 1) {
            var seasonName = normalizeText(tmdb.seasonName);
            var bonus = 0;
            if (hasSeasonMarker(titles, number)) bonus += 10;
            if (seasonName && anyTitle(titles, function (title) {
                return title.indexOf(seasonName) !== -1;
            })) bonus += 10;
            if (tmdb.seasonYear && candidate.seasonYear === tmdb.seasonYear && tmdb.seasonYear !== tmdb.year) bonus += 8;
            if (!bonus) return -1;
            score += bonus;
        } else {
            if (tmdb.year && candidate.seasonYear === tmdb.year) score += 4;
            if (hasSeasonMarker(titles, 2) || hasSeasonMarker(titles, 3)) score -= 8;
        }

        return getPartNumber(titles) !== null ? score - 4 : score;
    }

    function findBestMatch(tmdb, type, number) {
        var isLaterSeason = type === "tv" && number > 1;
        var queries = [];
        tmdb.titles.forEach(function (title) {
            if (!isLaterSeason) {
                queries.push(title);
                return;
            }
            if (tmdb.seasonName) queries.push(title + " " + tmdb.seasonName);
            queries.push(title + " season " + number);
            queries.push(title + " " + number);
            queries.push(title);
        });

        return Promise.all(unique(queries).slice(0, 6).map(function (query) {
            return searchAnime(query);
        })).then(function (lists) {
            var candidates = uniqueById(flatten(lists));
            var best = null;
            var bestScore = 0;
            for (var i = 0; i < candidates.length; i++) {
                var score = scoreCandidate(candidates[i], tmdb, number);
                if (score > bestScore) {
                    best = candidates[i];
                    bestScore = score;
                }
            }
            return bestScore >= 10 ? { media: best, candidates: candidates } : null;
        });
    }

    function seasonsOf(titles) {
        var found = [];
        for (var number = 2; number <= 9; number++) {
            if (hasSeasonMarker(titles, number)) found.push(number);
        }
        return found;
    }

    function isPartOf(candidate, base, baseTitles, baseSeasons) {
        var titles = getTitles(candidate);
        if (candidate.id === base.id || getPartNumber(titles) === null) return false;
        if (base.seasonYear && candidate.seasonYear && candidate.seasonYear < base.seasonYear) return false;
        var seasons = seasonsOf(titles);
        for (var i = 0; i < seasons.length; i++) {
            if (baseSeasons.indexOf(seasons[i]) === -1) return false;
        }
        return anyTitle(titles, function (title) {
            return anyTitle(baseTitles, function (baseTitle) {
                return title.indexOf(baseTitle) === 0;
            });
        });
    }

    function resolveEpisodeEntry(base, knownCandidates, episodeNumber) {
        if (!base.episodes || episodeNumber <= base.episodes) {
            return Promise.resolve({ media: base, episodeNumber: episodeNumber });
        }

        var baseName = (base.title && (base.title.english || base.title.romaji)) || null;
        var partSearches = baseName ? [baseName + " part 2", baseName + " cour 2", baseName + " part 3"] : [];

        return Promise.all(partSearches.map(function (query) {
            return searchAnime(query);
        })).then(function (lists) {
            var baseTitles = getTitles(base);
            var baseSeasons = seasonsOf(baseTitles);
            var candidates = uniqueById(knownCandidates.concat(flatten(lists)));
            var parts = [];
            for (var i = 0; i < candidates.length; i++) {
                if (isPartOf(candidates[i], base, baseTitles, baseSeasons)) {
                    parts.push({ media: candidates[i], order: i, number: getPartNumber(getTitles(candidates[i])) });
                }
            }
            parts.sort(function (a, b) {
                return a.number - b.number || a.order - b.order;
            });

            var remaining = episodeNumber - base.episodes;
            for (var j = 0; j < parts.length; j++) {
                var part = parts[j].media;
                if (!part.episodes || remaining <= part.episodes) return { media: part, episodeNumber: remaining };
                remaining -= part.episodes;
            }
            return null;
        });
    }

    function languageOf(id) {
        if (id === "sub") return "Japanese";
        if (id === "dub") return "English";
        return null;
    }

    function subtitlesOf(source, headers) {
        var seen = Object.create(null);
        var tracks = source.tracks || [];
        var subtitles = [];
        for (var i = 0; i < tracks.length; i++) {
            var url = toAbsoluteUrl(tracks[i].src);
            if (!url || seen[url] === true) continue;
            seen[url] = true;
            var name = (tracks[i].label ? tracks[i].label.replace(/\s+/g, " ").trim() : "") || tracks[i].language || "Unknown";
            subtitles.push({ url: url, language: tracks[i].language || name, name: name, headers: headers });
        }
        return subtitles;
    }

    function collectStreams(episodeData, cookie, pageUrl) {
        var headers = merge(HEADERS, { Cookie: cookie, Referer: pageUrl });
        var urlUses = Object.create(null);
        var streams = [];
        var variants = episodeData.variants || [];

        variants.forEach(function (variant) {
            var language = languageOf(variant.id);
            if (!language) return;
            (variant.sources || []).forEach(function (source) {
                var streamUrl = toAbsoluteUrl(source.url);
                var label = source.label && source.label.trim();
                if (!streamUrl || !label) return;

                var uses = urlUses[streamUrl] || 0;
                urlUses[streamUrl] = uses + 1;

                var subtitles = subtitlesOf(source, headers);
                var name = "Anv \u2022 " + language + " \u2022 " + label;
                var stream = {
                    name: name,
                    title: name,
                    url: uses === 0 ? streamUrl : streamUrl + (streamUrl.indexOf("?") !== -1 ? "&" : "?") + "f=" + uses,
                    type: "hls",
                    headers: headers
                };
                if (subtitles.length) stream.subtitles = subtitles;
                streams.push(stream);
            });
        });
        return streams;
    }

    function buildStreams(episodeData, cookie, pageUrl) {
        var streams = collectStreams(episodeData, cookie, pageUrl);
        return Promise.all(streams.map(function (stream) {
            return detectStreamHeight(stream.url, stream.headers);
        })).then(function (heights) {
            var out = [];
            for (var i = 0; i < streams.length; i++) {
                if (heights[i] === 1080 || heights[i] === 720) {
                    streams[i].quality = heights[i] + "p";
                    out.push(streams[i]);
                }
            }
            return out;
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchTmdbDetails(tmdbId, mediaType, query.season).then(function (tmdb) {
        if (!tmdb) return null;
        return findBestMatch(tmdb, mediaType, query.season);
    }).then(function (match) {
        if (!match) return null;
        return resolveEpisodeEntry(match.media, match.candidates, query.episode);
    }).then(function (entry) {
        if (!entry) return [];
        var pageUrl = BASE_URL + "/anime/" + entry.media.slug + "-episode-" + entry.episodeNumber;
        return requestEpisode(entry.media, entry.episodeNumber, pageUrl).then(function (response) {
            if (!response || response.episode.status !== "ready") return [];
            return buildStreams(response.episode, response.cookie, pageUrl);
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };
