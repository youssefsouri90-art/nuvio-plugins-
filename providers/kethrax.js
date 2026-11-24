function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://vixsrc.to";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Referer": BASE_URL + "/"
    };

    function buildQuery(id, type, seasonValue, episodeValue) {
        var clean = String(id || "").trim();
        if (!/^\d+$/.test(clean)) return null;
        return {
            id: clean,
            type: type === "tv" || type === "series" ? "tv" : "movie",
            season: parseInt(seasonValue, 10) || 1,
            episode: parseInt(episodeValue, 10) || 1
        };
    }

    function fetchText(url) {
        return fetch(url, { headers: HEADERS }).then(function (res) {
            return res && res.ok ? res.text() : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchJson(url) {
        return fetch(url).then(function (res) {
            return res && res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function parseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function parseAttrs(line) {
        var out = {};
        var regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
        var match;
        while ((match = regex.exec(line)) !== null) {
            var value = match[2] || "";
            if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') value = value.slice(1, -1);
            out[match[1]] = value;
        }
        return out;
    }

    function parseMaster(text) {
        var lines = String(text || "").split(/\r?\n/);
        var variants = [];
        var subtitles = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf("#EXT-X-MEDIA:") === 0) {
                var attrs = parseAttrs(line);
                if (attrs.TYPE === "SUBTITLES" && attrs.URI) {
                    subtitles.push({
                        url: attrs.URI,
                        language: String(attrs.LANGUAGE || "und").toLowerCase(),
                        name: attrs.NAME || attrs.LANGUAGE || "Subtitle"
                    });
                }
            } else if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
                var info = parseAttrs(line);
                var resolution = String(info.RESOLUTION || "");
                var height = resolution.indexOf("x") !== -1 ? resolution.split("x")[1] : "0";
                variants.push({ height: parseInt(height, 10) || 0 });
            }
        }
        return { variants: variants, subtitles: subtitles };
    }

    function bestQuality(variants) {
        var height = 0;
        for (var i = 0; i < variants.length; i++) {
            if (variants[i].height > height) height = variants[i].height;
        }
        if (height >= 2160) return "2160p";
        if (height >= 1440) return "1440p";
        if (height >= 1080) return "1080p";
        if (height >= 720) return "720p";
        if (height >= 480) return "480p";
        if (height >= 360) return "360p";
        return "1080p";
    }

    function buildUrl(base, params) {
        var separator = base.indexOf("?") === -1 ? "?" : "&";
        var keys = Object.keys(params);
        var query = [];
        for (var i = 0; i < keys.length; i++) {
            var value = params[keys[i]];
            if (value === "" || value == null) continue;
            query.push(encodeURIComponent(keys[i]) + "=" + encodeURIComponent(value));
        }
        return base + separator + query.join("&");
    }

    function subtitleSegment(url) {
        return fetchText(url).then(function (text) {
            var match = text ? text.match(/(https?:\/\/[^\s#]+\.vtt[^\s#]*)/i) : null;
            return match ? match[1] : "";
        });
    }

    function resolveSubtitles(subtitles) {
        var preferred = [];
        for (var i = 0; i < subtitles.length && preferred.length < 12; i++) {
            var s = subtitles[i];
            if (/^(eng|en|spa|es|fre|fra|fr|ger|deu|de|ita|it|por|pt|tur|tr|hin|hi|ara|ar|rus|ru|jpn|ja|kor|ko|chi|zho|zh)/i.test(s.language) ||
                /english|spanish|french|german|italian|portuguese|turkish|hindi|arabic|russian|japanese|korean|chinese/i.test(s.name)) {
                preferred.push(s);
            }
        }
        return Promise.all(preferred.map(function (s) {
            return subtitleSegment(s.url);
        })).then(function (urls) {
            var rows = [];
            for (var j = 0; j < urls.length; j++) {
                if (!urls[j]) continue;
                rows.push({ url: urls[j], language: preferred[j].language, name: preferred[j].name, headers: HEADERS });
            }
            return rows;
        });
    }

    function fetchDuration(query) {
        var movieUrl = TMDB_API + "/movie/" + query.id + "?api_key=" + TMDB_KEY + "&language=en-US";
        if (query.type !== "tv") {
            return fetchJson(movieUrl).then(function (data) {
                return data && data.runtime ? String(data.runtime) : "Variable";
            });
        }
        var showUrl = TMDB_API + "/tv/" + query.id + "?api_key=" + TMDB_KEY + "&language=en-US";
        var episodeUrl = TMDB_API + "/tv/" + query.id + "/season/" + query.season + "/episode/" + query.episode + "?api_key=" + TMDB_KEY + "&language=en-US";
        return Promise.all([fetchJson(showUrl), fetchJson(episodeUrl)]).then(function (pair) {
            var show = pair[0];
            var ep = pair[1];
            if (ep && ep.runtime) return String(ep.runtime);
            if (show && show.episode_run_time && show.episode_run_time.length) return String(show.episode_run_time[0]);
            return "Variable";
        });
    }

    function readPlayer(html) {
        var paramsMatch = html.match(/params:\s*\{([\s\S]*?)\},\s*url:\s*'([^']+)'/);
        if (!paramsMatch) return null;

        var params = {};
        var pairRegex = /'([^']+)'\s*:\s*'([^']*)'/g;
        var pair;
        while ((pair = pairRegex.exec(paramsMatch[1])) !== null) params[pair[1]] = pair[2];
        params.h = "1";
        params.lang = "en";

        var servers = [];
        var streamsMatch = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
        if (streamsMatch) servers = parseJson(streamsMatch[1]);
        if (!Array.isArray(servers) || !servers.length) servers = [{ url: paramsMatch[2] + "?ub=1" }];

        var seen = Object.create(null);
        var unique = [];
        for (var i = 0; i < servers.length; i++) {
            var server = servers[i];
            if (!server || !server.url) continue;
            var key = server.url.split("?")[0];
            if (seen[key]) continue;
            seen[key] = true;
            unique.push(server);
        }
        return { params: params, servers: unique };
    }

    function probe(server, params) {
        var masterUrl = buildUrl(server.url, params);
        return fetchText(masterUrl).then(function (master) {
            if (master === null) return null;
            var parsed = parseMaster(master);
            var row = { url: masterUrl, quality: bestQuality(parsed.variants), hasSubtitles: parsed.subtitles.length > 0, subtitles: [] };
            if (!row.hasSubtitles) return row;
            return resolveSubtitles(parsed.subtitles).then(function (subtitles) {
                row.subtitles = subtitles;
                return row;
            });
        });
    }

    function toStream(row, duration, subtitles) {
        var isHq = row.quality === "2160p" || row.url.indexOf("hevc") !== -1;
        var codec = isHq ? "HEVC" : "H.264";
        var audio = isHq ? "DD5.1" : "Stereo";
        return {
            name: "VixSrc",
            title: "VixSrc",
            url: row.url,
            quality: row.quality + " \u2022 " + duration + " min\n" + codec + " \u2022 " + audio,
            type: "hls",
            headers: HEADERS,
            subtitles: subtitles
        };
    }

    function gather(html, duration) {
        var player = readPlayer(html);
        if (!player) return Promise.resolve([]);
        return Promise.all(player.servers.map(function (server) {
            return probe(server, player.params);
        })).then(function (rows) {
            var valid = [];
            var subtitles = [];
            var chosen = false;
            for (var i = 0; i < rows.length; i++) {
                if (!rows[i]) continue;
                valid.push(rows[i]);
                if (!chosen && rows[i].hasSubtitles) {
                    subtitles = rows[i].subtitles;
                    chosen = true;
                }
            }
            var streams = [];
            for (var j = 0; j < valid.length; j++) streams.push(toStream(valid[j], duration, subtitles));
            return streams;
        });
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (!query) return Promise.resolve([]);

        var apiUrl = query.type === "tv"
            ? BASE_URL + "/api/tv/" + encodeURIComponent(query.id) + "/" + query.season + "/" + query.episode
            : BASE_URL + "/api/movie/" + encodeURIComponent(query.id);

        return Promise.all([fetchDuration(query), fetchText(apiUrl)]).then(function (pair) {
            var duration = pair[0];
            var data = parseJson(pair[1]);
            var src = data && data.src;
            if (!src) return [];
            return fetchText(BASE_URL + src).then(function (html) {
                if (!html) return [];
                return gather(html, duration);
            });
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };