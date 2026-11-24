function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://ani.pm";
    var API_BASE = "https://embed.settlar.io";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var HEADERS = { "User-Agent": USER_AGENT, Referer: API_BASE + "/" };

    function fetchJson(url, referer) {
        return fetch(url, {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: referer || BASE_URL + "/" }
        }).then(function (response) {
            return response.ok ? response.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function tokenize(value) {
        var parts = String(value || "").toLowerCase().split(/[^a-z0-9]+/);
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i]) out.push(parts[i]);
        }
        return out;
    }

    function normalize(value) {
        return tokenize(value).join("");
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

    function ordinalOf(number) {
        return ["", "", "2nd", "3rd", "4th", "5th", "6th"][number] || null;
    }

    function romanOf(number) {
        return ["", "", "ii", "iii", "iv", "v", "vi"][number] || null;
    }

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return null;
        var episodeNumber = isTv ? Number(episode) : 1;
        if (!(episodeNumber >= 1)) return null;
        return { isTv: isTv, season: isTv ? season : 0, episodeNumber: episodeNumber };
    }

    function tmdbJson(path) {
        var separator = path.indexOf("?") !== -1 ? "&" : "?";
        return fetchJson(TMDB_API + path + separator + "api_key=" + TMDB_KEY, "https://www.themoviedb.org/");
    }

    function seasonDateOf(data, id, number) {
        var seasons = data.seasons || [];
        var date = null;
        for (var i = 0; i < seasons.length; i++) {
            if (seasons[i].season_number === number) {
                date = seasons[i].air_date;
                break;
            }
        }
        if (date) return Promise.resolve(date);
        return tmdbJson("/tv/" + id + "/season/" + number).then(function (seasonData) {
            return seasonData && seasonData.air_date;
        });
    }

    function fetchTmdbDetails(id, type, number) {
        var isTv = type === "tv";
        return tmdbJson("/" + (isTv ? "tv" : "movie") + "/" + id + "?append_to_response=alternative_titles").then(function (data) {
            if (!data) return null;
            var alternatives = (data.alternative_titles && (data.alternative_titles.results || data.alternative_titles.titles)) || [];
            var alternativeTitles = alternatives.map(function (entry) {
                return entry.title;
            }).filter(Boolean).slice(0, 6);
            var primary = (isTv ? [data.name, data.original_name] : [data.title, data.original_title]).filter(Boolean);
            var titles = unique(primary.concat(alternativeTitles));
            var date = isTv ? data.first_air_date : data.release_date;
            var dated = isTv && number > 1 ? seasonDateOf(data, id, number) : Promise.resolve(null);
            return dated.then(function (seasonDate) {
                if (seasonDate) date = seasonDate;
                return {
                    name: primary[0] || titles[0] || "",
                    primaryTitles: primary,
                    titles: titles,
                    year: parseInt(String(date || "").slice(0, 4), 10) || null
                };
            });
        });
    }

    function searchAnime(query) {
        if (!query || query.length < 2) return Promise.resolve([]);
        return fetchJson(BASE_URL + "/api/anime/search?q=" + encodeURIComponent(query), BASE_URL + "/").then(function (data) {
            var items = (data && data.items) || [];
            return items.filter(function (item) {
                return item && item.id != null;
            });
        });
    }

    function usableId(id, anilistId) {
        if (id == null) return null;
        if (id >= 1000000) {
            var parsed = parseInt(anilistId, 10);
            return isNaN(parsed) ? id : parsed;
        }
        return id;
    }

    function hasSeasonMarker(title, number) {
        if (number < 2) return false;
        var padded = " " + tokenize(title).join(" ") + " ";
        var ordinal = ordinalOf(number);
        var roman = romanOf(number);
        var forms = ["season " + number];
        if (ordinal) forms.push(ordinal + " season");
        if (roman) forms.push(roman);
        forms.push(String(number));
        for (var i = 0; i < forms.length; i++) {
            if (padded.indexOf(" " + forms[i] + " ") !== -1) return true;
        }
        return false;
    }

    function nameScore(name, normalizedCandidate, candidateTokens) {
        var normalizedName = normalize(name);
        if (!normalizedName) return 0;
        if (normalizedCandidate === normalizedName) return 100;
        if (normalizedCandidate.indexOf(normalizedName) === 0 || normalizedName.indexOf(normalizedCandidate) === 0) return 60;
        var nameTokens = tokenize(name);
        var shared = 0;
        for (var i = 0; i < nameTokens.length; i++) {
            if (candidateTokens.indexOf(nameTokens[i]) !== -1) shared++;
        }
        return Math.round((shared / Math.max(nameTokens.length, candidateTokens.length, 1)) * 50);
    }

    function scoreCandidate(candidate, details, isTv, number) {
        var title = candidate.title || "";
        var normalizedCandidate = normalize(title);
        var candidateTokens = tokenize(title);
        var score = 0;
        for (var i = 0; i < details.titles.length; i++) {
            var value = nameScore(details.titles[i], normalizedCandidate, candidateTokens);
            if (value > score) score = value;
        }

        if (details.year && candidate.year) {
            var difference = Math.abs(details.year - candidate.year);
            score += difference === 0 ? 30 : difference === 1 ? 10 : -30;
        }

        var isMovie = String(candidate.type || "").toLowerCase() === "movie";
        if (isTv && isMovie) score -= 50;
        if (!isTv && isMovie) score += 20;

        if (isTv) {
            var match = title.toLowerCase().match(/season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/);
            var candidateSeason = match ? parseInt(match[1] || match[2], 10) : null;
            if (number > 1) {
                if (hasSeasonMarker(title, number)) score += 40;
                else if (candidateSeason != null && candidateSeason !== number) score -= 40;
            } else if (candidateSeason > 1) {
                score -= 40;
            }
        }
        return score;
    }

    function copyItem(item, id) {
        var copy = {};
        for (var key in item) {
            if (Object.prototype.hasOwnProperty.call(item, key)) copy[key] = item[key];
        }
        copy.id = id;
        return copy;
    }

    function findAnime(details, isTv, number) {
        var queries = [];
        var later = isTv && number > 1;
        var ordinal = ordinalOf(number);
        var i;
        if (later) {
            queries.push(details.name + " season " + number);
            if (ordinal) queries.push(details.name + " " + ordinal + " season");
        }
        for (i = 0; i < details.primaryTitles.length; i++) {
            queries.push(details.primaryTitles[i]);
            if (later) queries.push(details.primaryTitles[i] + " season " + number);
        }
        var firstTitles = details.titles.slice(0, 3);
        for (i = 0; i < firstTitles.length; i++) queries.push(firstTitles[i]);
        var uniqueQueries = unique(queries.filter(Boolean));

        return Promise.all(uniqueQueries.map(function (query) {
            return searchAnime(query);
        })).then(function (lists) {
            var candidates = flatten(lists);
            var order = [];
            var byId = Object.create(null);
            for (var j = 0; j < candidates.length; j++) {
                var id = usableId(candidates[j].id, candidates[j].anilistId);
                if (id != null && byId[id] === undefined) {
                    byId[id] = copyItem(candidates[j], id);
                    order.push(id);
                }
            }
            var bestMatch = null;
            var bestScore = 49;
            for (var k = 0; k < order.length; k++) {
                var score = scoreCandidate(byId[order[k]], details, isTv, number);
                if (score > bestScore) {
                    bestMatch = byId[order[k]];
                    bestScore = score;
                }
            }
            return bestMatch;
        });
    }

    function fetchSeries(id) {
        return fetchJson(BASE_URL + "/api/anime/series/" + id + "?routes=e3", BASE_URL + "/").then(function (series) {
            if (!series && id >= 1000000) {
                return fetchJson(BASE_URL + "/api/anime/series/" + (id - 1000000) + "?routes=e3", BASE_URL + "/");
            }
            return series;
        });
    }

    function buildSubtitles(rawSubtitles, seen) {
        var subtitles = [];
        for (var i = 0; i < rawSubtitles.length; i++) {
            var entry = rawSubtitles[i];
            if (!entry) continue;
            var url = entry.url;
            var name = String(entry.label || "Subtitle");
            var urlKey = "url:" + url;
            var labelKey = "label:" + name.trim().toLowerCase();
            if (!/^https?:/i.test(url) || seen[urlKey] === true || seen[labelKey] === true) continue;
            seen[urlKey] = true;
            seen[labelKey] = true;
            subtitles.push({ url: url, language: name, name: name, headers: HEADERS });
        }
        return subtitles;
    }

    function resolveSettlarStream(selection, episodeNumber, language, label, wantSubtitles) {
        return fetchJson(
            BASE_URL + "/api/anime/settlar/session?selection=" + encodeURIComponent(selection) +
            "&provider=anipm&ep=" + episodeNumber + "&channel=" + language + "&telemetry=0",
            BASE_URL + "/"
        ).then(function (session) {
            var token = session && session.embedUrl && /t=([^&]+)/.exec(session.embedUrl);
            if (!token) return null;
            return fetchJson(API_BASE + "/api/embed/session?t=" + token[1], API_BASE + "/embed/v1").then(function (embed) {
                if (!embed || typeof embed.source !== "string" || !/^https?:/i.test(embed.source)) return null;
                return {
                    name: label,
                    title: label,
                    url: embed.source,
                    type: "hls",
                    quality: "1080p",
                    headers: HEADERS,
                    raw: wantSubtitles && Array.isArray(embed.subtitles) ? embed.subtitles : [],
                    subtitles: []
                };
            });
        }).then(null, function () {
            return null;
        });
    }

    function fetchLanguageStreams(seriesId, episodeNumber, language, packagesPromise) {
        var query = "?ep=" + episodeNumber + "&lang=" + language + "&backup=1";
        return Promise.all([
            fetchJson(BASE_URL + "/api/anime/playback-bootstrap/settlar/" + seriesId + query, BASE_URL + "/"),
            fetchJson(BASE_URL + "/api/anime/playback-bootstrap/anilist/" + seriesId + query, BASE_URL + "/"),
            packagesPromise
        ]).then(function (replies) {
            var bootstrap = replies[0] || replies[1];
            var selection = bootstrap && typeof bootstrap.settlarSelection === "string" ? bootstrap.settlarSelection.trim() : "";
            if (!selection) return [];

            var packages = replies[2];
            var packageEntry = packages && packages.episodes && packages.episodes[episodeNumber];
            var hasHardsub = packageEntry && packageEntry[language + "hard"] === true;
            var label = "Ani.Pm \u2022 " + (language === "dub" ? "English" : "Japanese");

            var variants = [resolveSettlarStream(selection, episodeNumber, language, label, true)];
            if (hasHardsub) {
                variants.push(resolveSettlarStream(selection, episodeNumber, language + "hard", label + " \u2022 Hard Sub", false));
            }
            return Promise.all(variants).then(function (streams) {
                return streams.filter(Boolean);
            });
        }).then(null, function () {
            return [];
        });
    }

    function verifyMaster(masterUrl, referer) {
        return fetch(masterUrl, {
            headers: { "User-Agent": USER_AGENT, Accept: "*/*", Referer: referer }
        }).then(function (response) {
            if (!response.ok) return null;
            return response.text().then(function (text) {
                return text.indexOf("#EXTM3U") === 0 ? masterUrl : null;
            });
        }).then(null, function () {
            return null;
        });
    }

    function pad4(number) {
        var text = String(number);
        while (text.length < 4) text = "0" + text;
        return text;
    }

    function fetchBetaStreams(anilistId, episodeNumber, wantSub, wantDub) {
        return fetchJson(BASE_URL + "/api/anime/beta-server/" + anilistId, BASE_URL + "/").then(function (info) {
            if (!info || info.available !== true) return [];
            if (!Array.isArray(info.episodes) || info.episodes.indexOf(episodeNumber) === -1) return [];
            if (!((wantSub && info.sub === true) || (wantDub && info.dub === true))) return [];
            if (!info.path || !info.origin) return [];

            var watchPath = String(info.path).replace(/^\/watch\//, "");
            var split = watchPath.lastIndexOf("-");
            if (split <= 0) return [];

            var origin = String(info.origin).replace(/\/+$/, "");
            var slug = watchPath.substring(0, split);
            var betaId = watchPath.substring(split + 1);
            var masterUrl = origin + "/hls/" + betaId + "-" + slug + "/E" + pad4(episodeNumber) + "/master.m3u8";

            return verifyMaster(masterUrl, origin + "/").then(function (master) {
                if (!master) return [];
                return [{
                    name: "Ani.Pm \u2022 Multi-Dub",
                    title: "Ani.Pm \u2022 Multi-Dub",
                    url: master,
                    type: "hls",
                    quality: "Auto",
                    headers: { "User-Agent": USER_AGENT, Referer: origin + "/" },
                    subtitles: []
                }];
            });
        }).then(null, function () {
            return [];
        });
    }

    function languagesOf(entry, anime) {
        var all = ["sub", "dub"];
        var out = [];
        var i;
        if (entry) {
            for (i = 0; i < all.length; i++) {
                if (entry[all[i]] === true) out.push(all[i]);
            }
            return out;
        }
        for (i = 0; i < all.length; i++) {
            if ((anime[all[i] + "Count"] || 0) > 0) out.push(all[i]);
        }
        return out.length ? out : all;
    }

    function gather(lists) {
        var seenSubtitles = Object.create(null);
        var seenUrls = Object.create(null);
        var streams = flatten(lists);
        var out = [];
        for (var i = 0; i < streams.length; i++) {
            var stream = streams[i];
            if (stream.raw) {
                stream.subtitles = buildSubtitles(stream.raw, seenSubtitles);
                delete stream.raw;
            }
            if (seenUrls[stream.url] === true) continue;
            seenUrls[stream.url] = true;
            out.push(stream);
        }
        return out;
    }

    function collect(anime, query) {
        return fetchSeries(anime.id).then(function (series) {
            var seriesId = series && series.id != null ? series.id : anime.id;
            var anilistIdRaw = (series && series.anilistId) || anime.anilistId;
            var anilistId = anilistIdRaw != null ? String(anilistIdRaw).trim() : "";

            var episodes = (series && series.episodes) || [];
            var entry = null;
            for (var i = 0; i < episodes.length; i++) {
                if (episodes[i] && episodes[i].number === query.episodeNumber) {
                    entry = episodes[i];
                    break;
                }
            }
            if (episodes.length && !entry) return [];

            var languages = languagesOf(entry, anime);
            if (!languages.length) return [];

            var packagesPromise = anilistId
                ? fetchJson(BASE_URL + "/api/anime/anipm-server/_packages?anilistId=" + encodeURIComponent(anilistId), BASE_URL + "/")
                : Promise.resolve(null);

            var tasks = languages.map(function (language) {
                return fetchLanguageStreams(seriesId, query.episodeNumber, language, packagesPromise);
            });
            if (anilistId) {
                tasks.push(fetchBetaStreams(anilistId, query.episodeNumber, languages.indexOf("sub") !== -1, languages.indexOf("dub") !== -1));
            }
            return Promise.all(tasks).then(gather);
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchTmdbDetails(tmdbId, mediaType, query.season).then(function (details) {
        if (!details || !details.titles.length) return null;
        return findAnime(details, query.isTv, query.season);
    }).then(function (anime) {
        if (!anime) return [];
        return collect(anime, query);
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };
