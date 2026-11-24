function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "CTGMovies";
    var BASE_URL = "https://ctgmovies.com";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var API_BASE = "https://cockpit.103.109.92.178.nip.io/api/v1";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var WEB_HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Accept-Language": "en",
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
    };
    var STREAM_HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": BASE_URL + "/"
    };

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return null;
        return {
            isTv: isTv,
            mediaType: isTv ? "tv" : "movie",
            tmdbUrl: TMDB_API + "/" + (isTv ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids"
        };
    }

    function encodeUrl(s) {
        return encodeURIComponent(s || "");
    }

    function yearFromDate(date) {
        if (!date) return null;
        var m = date.match(/\d{4}/);
        return m ? parseInt(m[0], 10) : null;
    }

    function cleanDisplayTitle(title) {
        if (!title) return "";
        return title
            .replace(/\b(1080p|720p|480p|2160p|4k|web[- ]?dl|webrip|bluray|hdrip|x264|x265|hevc|10bit|dual[- ]?audio|hindi[- ]?dubbed|dubbed|esub)\b/gi, " ")
            .replace(/\[[^\]]*\]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizedTitle(title) {
        return cleanDisplayTitle(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    function optString(obj, key) {
        if (!obj || obj[key] == null) return null;
        var v = obj[key];
        if (typeof v !== "string") v = String(v);
        v = v.trim();
        return v && v !== "null" ? v : null;
    }

    function optInt(obj, key) {
        if (!obj || obj[key] == null) return null;
        var v = obj[key];
        if (typeof v === "number") return v;
        var parsed = parseInt(String(v), 10);
        return isNaN(parsed) ? null : parsed;
    }

    function splitCsv(s) {
        if (!s) return [];
        return s.split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    }

    function resolveMediaUrl(url) {
        if (!url) return "";
        if (url.indexOf("//") === 0) return "https:" + url;
        if (/^https?:\/\//i.test(url)) return url;
        if (url.charAt(0) === "/") return BASE_URL + url;
        return url;
    }

    function qualityFromUrl(url) {
        if (!url) return "Unknown";
        var m = url.match(/(2160p|1440p|1080p|720p|480p|360p|4k|uhd)/i);
        if (!m) return "Unknown";
        var v = m[1].toLowerCase();
        if (v === "4k" || v === "uhd") return "2160p";
        return v;
    }

    function resWeight(quality) {
        var q = (quality || "").toLowerCase();
        if (q === "2160p") return 5;
        if (q === "1440p") return 4;
        if (q === "1080p") return 3;
        if (q === "720p") return 2;
        if (q === "480p") return 1;
        if (q === "360p") return 0;
        return -1;
    }

    function isValidLanguage(lang) {
        if (!lang) return false;
        var lower = lang.toLowerCase().trim();
        return lower !== "" && lower !== "unknown" && lower !== "null" && lower !== "none";
    }

    function collectLanguages(link) {
        var langs = [];
        var keys = ["subtitle_tracks", "subtitles", "captions", "tracks"];
        var i;
        var j;

        function addLang(value) {
            if (!value) return;
            var parts = splitCsv(value);
            var k;
            for (k = 0; k < parts.length; k++) {
                if (isValidLanguage(parts[k]) && langs.indexOf(parts[k]) === -1) langs.push(parts[k]);
            }
        }

        if (Array.isArray(link.languages)) {
            for (i = 0; i < link.languages.length; i++) addLang(String(link.languages[i]).trim());
        }
        addLang(optString(link, "language") || optString(link, "lang"));
        for (i = 0; i < keys.length; i++) {
            var subs = link[keys[i]];
            if (!Array.isArray(subs)) continue;
            for (j = 0; j < subs.length; j++) {
                addLang(optString(subs[j], "label") || optString(subs[j], "language") || optString(subs[j], "srclang"));
            }
        }
        return langs.length > 0 ? langs.join(" \u2022 ") : "English";
    }

    function queryString(query) {
        query = query || {};
        var params = Object.keys(query)
            .filter(function (k) { return query[k] != null; })
            .map(function (k) { return encodeUrl(k) + "=" + encodeUrl(String(query[k])); });
        return params.length ? "?" + params.join("&") : "";
    }

    function buildApiUrl(path, query) {
        var p = path.charAt(0) === "/" ? path : "/" + path;
        return API_BASE + p + queryString(query);
    }

    function buildSameOriginUrl(path, query) {
        var p = path.charAt(0) === "/" ? path : "/" + path;
        return BASE_URL + "/api/v1" + p + queryString(query);
    }

    function fetchText(url, headers) {
        return Promise.resolve()
            .then(function () { return fetch(url, { headers: headers }); })
            .then(function (res) { return res && res.ok ? res.text() : null; })
            .then(null, function () { return null; });
    }

    function fetchJson(url, headers) {
        return fetchText(url, headers).then(function (raw) {
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        });
    }

    function apiGet(path, query) {
        return fetchText(buildApiUrl(path, query), WEB_HEADERS).then(function (primary) {
            if (primary !== null) return primary;
            return fetchText(buildSameOriginUrl(path, query), WEB_HEADERS);
        });
    }

    function getTMDBDetails(url) {
        return fetchJson(url, { Accept: "application/json" }).then(function (data) {
            if (!data) return null;
            var title = mediaType === "tv" ? data.name : data.title;
            var releaseDate = mediaType === "tv" ? data.first_air_date : data.release_date;
            return {
                title: title || null,
                year: releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null
            };
        });
    }

    function toSearchItem(obj, kind) {
        var isMovie = kind === "movies";
        var isAnime = kind === "anime" || (obj.is_anime === true && kind !== "tv");

        var title = optString(obj, "title") || optString(obj, "name") || optString(obj, "english_title");
        if (!title) return null;

        var id = optString(obj, "slug") || optString(obj, "id") || optString(obj, "_id");
        if (!id) return null;

        var year = optInt(obj, "year")
            || yearFromDate(optString(obj, "release_date"))
            || yearFromDate(optString(obj, "first_air_date"));

        var type;
        if (isMovie) type = "movie";
        else if (isAnime) type = "anime";
        else type = "tv";

        return { title: cleanDisplayTitle(title), id: id, kind: kind, type: type, year: year };
    }

    function parseSearchItems(raw, kind) {
        if (!raw) return [];
        try {
            var parsed = JSON.parse(raw.trim());
            var arr = [];
            if (Array.isArray(parsed)) arr = parsed;
            else if (parsed && typeof parsed === "object") arr = parsed.movies || parsed.results || parsed.data || [];
            return arr.map(function (obj) { return toSearchItem(obj, kind); }).filter(function (x) { return x; });
        } catch (e) {
            return [];
        }
    }

    function searchCtg(query) {
        var params = { search: query };
        return Promise.all([
            apiGet("/movies", params).then(function (raw) { return parseSearchItems(raw, "movies"); }),
            apiGet("/tv", params).then(function (raw) { return parseSearchItems(raw, "tv"); }),
            apiGet("/anime", params).then(function (raw) { return parseSearchItems(raw, "anime"); })
        ]).then(function (lists) {
            return lists[0].concat(lists[1]).concat(lists[2]);
        });
    }

    function findBestMatch(mediaInfo, items) {
        if (!items.length) return null;

        var targetNorm = normalizedTitle(mediaInfo.title);
        var targetYear = mediaInfo.year;
        var best = null;
        var bestScore = -1;
        var i;

        for (i = 0; i < items.length; i++) {
            var item = items[i];
            var itemNorm = normalizedTitle(item.title);
            var score = -1;

            if (itemNorm === targetNorm) {
                score = 100;
                if (targetYear && item.year === targetYear) score += 50;
            } else if (itemNorm.indexOf(targetNorm) !== -1 && targetNorm.length >= 4) {
                score = 60;
                if (targetYear && item.year === targetYear) score += 30;
            } else if (targetNorm.indexOf(itemNorm) !== -1 && itemNorm.length >= 4) {
                score = 40;
            }

            if (mediaType === "tv" && (item.type === "tv" || item.type === "anime")) score += 10;
            if (mediaType === "movie" && (item.type === "movie" || item.type === "anime")) score += 10;

            if (score > bestScore) {
                bestScore = score;
                best = item;
            }
        }

        return bestScore >= 30 ? best : null;
    }

    function getDetail(item) {
        return apiGet("/" + item.kind + "/" + encodeUrl(item.id)).then(function (raw) {
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        });
    }

    function qualityOf(link, finalUrl) {
        var quality = qualityFromUrl(finalUrl);
        if (quality !== "Unknown") return quality;
        var qMatch = (optString(link, "quality") || "").match(/(2160|1440|1080|720|480|360)p?/i);
        if (!qMatch) return quality;
        var v = parseInt(qMatch[1], 10);
        if (v >= 2160) return "2160p";
        if (v >= 1440) return "1440p";
        if (v >= 1080) return "1080p";
        if (v >= 720) return "720p";
        if (v >= 480) return "480p";
        return "360p";
    }

    function buildStreams(links) {
        var seen = Object.create(null);
        var out = [];
        var i;

        for (i = 0; i < links.length; i++) {
            var link = links[i];
            if (!link || link.broken === true) continue;

            var rawUrl = optString(link, "url") || optString(link, "file")
                || optString(link, "src") || optString(link, "link");
            if (!rawUrl) continue;

            var finalUrl = resolveMediaUrl(rawUrl);
            if (!finalUrl || seen[finalUrl]) continue;
            seen[finalUrl] = true;

            out.push({
                name: PROVIDER,
                title: PROVIDER,
                url: finalUrl,
                quality: qualityOf(link, finalUrl),
                language: collectLanguages(link),
                headers: STREAM_HEADERS
            });
        }

        return out.sort(function (a, b) { return resWeight(b.quality) - resWeight(a.quality); });
    }

    function getMovieStreams(item) {
        return getDetail(item).then(function (obj) {
            if (!obj || !obj.links || !obj.links.length) return [];
            return buildStreams(obj.links);
        });
    }

    function getEpisodeStreams(item) {
        return getDetail(item).then(function (obj) {
            if (!obj || !obj.episodes || !obj.episodes.length) return [];

            var links = [];
            var i;
            var j;
            for (i = 0; i < obj.episodes.length; i++) {
                var ep = obj.episodes[i];
                var epNum = optInt(ep, "episode_number") || optInt(ep, "absolute_number");
                var seasonNum = optInt(ep, "season_number") || 1;
                if (seasonNum !== season || epNum !== episode) continue;
                var epLinks = ep.links || [];
                for (j = 0; j < epLinks.length; j++) {
                    if (epLinks[j] && epLinks[j].broken !== true) links.push(epLinks[j]);
                }
            }

            return links.length ? buildStreams(links) : [];
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return getTMDBDetails(query.tmdbUrl)
        .then(function (mediaInfo) {
            if (!mediaInfo || !mediaInfo.title) return [];
            return searchCtg(mediaInfo.title).then(function (items) {
                var match = findBestMatch(mediaInfo, items);
                if (!match) return [];
                return query.isTv ? getEpisodeStreams(match) : getMovieStreams(match);
            });
        })
        .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };