function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_API = "https://api.hlowb.com";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var PKG = "com.external.castle";
    var CHANNEL = "2";
    var CLIENT = "1";
    var LANG = "en-US";
    var API_HEADERS = {
        "User-Agent": "okhttp/4.11.0",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": BASE_API
    };
    var PLAYBACK_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "video",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
    };
    var RES = [3, 2];
    var Q_MAP = { "3": "1080p", "2": "720p", "1": "480p" };
    var SUFFIX = "T!BgJB";
    var ALWD_LANGS = ["english", "hindi", "bangla", "bengali"];
    var AES_SBOX = new Uint8Array([
        0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
        0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
        0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
        0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
        0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
        0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
        0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
        0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
        0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
        0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
        0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
        0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
        0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
        0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
        0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
        0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
    ]);

    function buildQuery(type, seasonValue, episodeValue) {
        if (type === "tv" && (seasonValue == null || episodeValue == null)) return null;
        return { isTv: type === "tv", season: seasonValue, episode: episodeValue };
    }

    function decodeBase64(encoded) {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var text = String(encoded || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
        if (text.length % 4 === 0) text = text.replace(/==?$/, "");
        if (text.length % 4 === 1) throw new Error("base64");
        var out = [];
        var buffer = 0;
        var bits = 0;
        for (var i = 0; i < text.length; i++) {
            var value = chars.indexOf(text.charAt(i));
            if (value < 0) throw new Error("base64");
            buffer = (buffer << 6) | value;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((buffer >> bits) & 255);
                buffer &= (1 << bits) - 1;
            }
        }
        return new Uint8Array(out);
    }

    function bytesToText(bytes) {
        var parts = [];
        for (var i = 0; i < bytes.length; i++) {
            parts.push("%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16));
        }
        return decodeURIComponent(parts.join(""));
    }

    function formEncode(value) {
        return encodeURIComponent(value).replace(/%20/g, "+").replace(/[!'()~]/g, function (c) {
            return "%" + c.charCodeAt(0).toString(16).toUpperCase();
        });
    }

    function toQueryString(params) {
        var keys = Object.keys(params);
        var pairs = [];
        for (var i = 0; i < keys.length; i++) {
            pairs.push(formEncode(keys[i]) + "=" + formEncode(params[keys[i]]));
        }
        return pairs.join("&");
    }

    function xtime(value) {
        return ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff;
    }

    function multiply(a, b) {
        var product = 0;
        for (var i = 0; i < 8; i++) {
            if (b & 1) product ^= a;
            a = xtime(a);
            b >>= 1;
        }
        return product;
    }

    function expandKey(key) {
        var total = 44;
        var words = new Uint8Array(total * 4);
        var rcon = 1;
        var i;
        var t0;
        var t1;
        var t2;
        var t3;
        var swap;
        for (i = 0; i < 16; i++) words[i] = key[i];
        for (i = 4; i < total; i++) {
            t0 = words[i * 4 - 4];
            t1 = words[i * 4 - 3];
            t2 = words[i * 4 - 2];
            t3 = words[i * 4 - 1];
            if (i % 4 === 0) {
                swap = t0;
                t0 = AES_SBOX[t1] ^ rcon;
                t1 = AES_SBOX[t2];
                t2 = AES_SBOX[t3];
                t3 = AES_SBOX[swap];
                rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x11b : 0)) & 0xff;
            }
            words[i * 4] = words[(i - 4) * 4] ^ t0;
            words[i * 4 + 1] = words[(i - 4) * 4 + 1] ^ t1;
            words[i * 4 + 2] = words[(i - 4) * 4 + 2] ^ t2;
            words[i * 4 + 3] = words[(i - 4) * 4 + 3] ^ t3;
        }
        return words;
    }

    function addRoundKey(state, keys, round) {
        for (var i = 0; i < 16; i++) state[i] ^= keys[round * 16 + i];
    }

    function invShiftSub(state, inverse) {
        var next = new Uint8Array(16);
        for (var column = 0; column < 4; column++) {
            for (var row = 0; row < 4; row++) {
                next[((column + row) & 3) * 4 + row] = inverse[state[column * 4 + row]];
            }
        }
        for (var i = 0; i < 16; i++) state[i] = next[i];
    }

    function invMixColumns(state) {
        for (var c = 0; c < 16; c += 4) {
            var a = state[c];
            var b = state[c + 1];
            var d = state[c + 2];
            var e = state[c + 3];
            state[c] = multiply(a, 14) ^ multiply(b, 11) ^ multiply(d, 13) ^ multiply(e, 9);
            state[c + 1] = multiply(a, 9) ^ multiply(b, 14) ^ multiply(d, 11) ^ multiply(e, 13);
            state[c + 2] = multiply(a, 13) ^ multiply(b, 9) ^ multiply(d, 14) ^ multiply(e, 11);
            state[c + 3] = multiply(a, 11) ^ multiply(b, 13) ^ multiply(d, 9) ^ multiply(e, 14);
        }
    }

    function decryptAesCbc(cipher, key) {
        if (!cipher.length || cipher.length % 16 !== 0) throw new Error("bad length");
        var keys = expandKey(key);
        var inverse = new Uint8Array(256);
        var i;
        for (i = 0; i < 256; i++) inverse[AES_SBOX[i]] = i;
        var plain = new Uint8Array(cipher.length);
        for (var offset = 0; offset < cipher.length; offset += 16) {
            var state = new Uint8Array(16);
            for (i = 0; i < 16; i++) state[i] = cipher[offset + i];
            addRoundKey(state, keys, 10);
            for (var round = 9; round >= 1; round--) {
                invShiftSub(state, inverse);
                addRoundKey(state, keys, round);
                invMixColumns(state);
            }
            invShiftSub(state, inverse);
            addRoundKey(state, keys, 0);
            for (i = 0; i < 16; i++) {
                plain[offset + i] = state[i] ^ (offset === 0 ? key[i] : cipher[offset - 16 + i]);
            }
        }
        var pad = plain[plain.length - 1];
        if (pad < 1 || pad > 16) throw new Error("bad padding");
        var out = new Uint8Array(plain.length - pad);
        for (i = 0; i < out.length; i++) out[i] = plain[i];
        return out;
    }

    function decryptKarnis(encryptedB64, securityKeyB64) {
        var material = decodeBase64(securityKeyB64);
        var key = new Uint8Array(16);
        var i;
        for (i = 0; i < 16; i++) {
            if (i < material.length) key[i] = material[i];
            else if (i - material.length < SUFFIX.length) key[i] = SUFFIX.charCodeAt(i - material.length);
        }
        var result = bytesToText(decryptAesCbc(decodeBase64(encryptedB64), key));
        if (!result) throw new Error("Decryption failed");
        return result;
    }

    function mergeHeaders(base, extra) {
        var merged = {};
        var keys = Object.keys(base);
        var i;
        for (i = 0; i < keys.length; i++) merged[keys[i]] = base[keys[i]];
        keys = Object.keys(extra || {});
        for (i = 0; i < keys.length; i++) merged[keys[i]] = extra[keys[i]];
        return merged;
    }

    function apiFetch(url, options) {
        try {
            return fetch(url, {
                method: options.method || "GET",
                headers: mergeHeaders(API_HEADERS, options.headers),
                body: options.body
            }).then(function (res) {
                return res.ok ? res : null;
            }, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url) {
        try {
            return fetch(url).then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function karnisRequest(url, securityKey, options) {
        return apiFetch(url, options).then(function (res) {
            if (!res) return null;
            return res.text().then(function (raw) {
                var text = raw.trim();
                if (!text) return null;
                var cipher = text;
                try {
                    var json = JSON.parse(text);
                    if (json && json.data && typeof json.data === "string") cipher = json.data.trim();
                } catch (e) {
                    cipher = text;
                }
                return JSON.parse(decryptKarnis(cipher, securityKey));
            });
        }).then(null, function () {
            return null;
        });
    }

    function extractData(obj) {
        return (obj && obj.data && typeof obj.data === "object") ? obj.data : (obj || {});
    }

    function qualityValue(quality) {
        if (!quality) return 0;
        var clean = quality.toString().toLowerCase()
            .replace(/^(sd|hd|fhd|uhd|4k)\s*/i, "")
            .replace(/p$/, "")
            .trim();
        return parseInt(clean, 10) || 0;
    }

    function formatSize(value) {
        if (typeof value !== "number" || value <= 0) return undefined;
        return value > 1e9 ? (value / 1e9).toFixed(2) + " GB" : (value / 1e6).toFixed(0) + " MB";
    }

    function sortTag(value) {
        var rank;
        if (value >= 2160) rank = 5;
        else if (value >= 1080) rank = 4;
        else if (value >= 720) rank = 3;
        else if (value >= 480) rank = 2;
        else if (value >= 360) rank = 1;
        else rank = 0;
        var binary = (5 - rank).toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (b) {
            return b === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function isAllowedLang(name) {
        if (!name) return false;
        var lower = name.toLowerCase();
        for (var i = 0; i < ALWD_LANGS.length; i++) {
            if (lower.indexOf(ALWD_LANGS[i]) !== -1) return true;
        }
        return false;
    }

    function fetchTmdbInfo(query) {
        var endpoint = query.isTv ? "tv" : "movie";
        return fetchJson(TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_KEY).then(function (data) {
            if (!data) return null;
            var title = query.isTv ? data.name : data.title;
            var date = query.isTv ? data.first_air_date : data.release_date;
            if (typeof title !== "string") return null;
            return { title: title, year: date ? parseInt(date, 10) : null };
        });
    }

    function fetchSecurityKey() {
        var url = BASE_API + "/v0.1/system/getSecurityKey/1?channel=" + CHANNEL + "&clientType=" + CLIENT + "&lang=" + LANG;
        return apiFetch(url, {}).then(function (res) {
            if (!res) return null;
            return res.json().then(function (data) {
                if (data.code !== 200 || !data.data) return null;
                return data.data;
            });
        }).then(null, function () {
            return null;
        });
    }

    function searchKarnis(securityKey, keyword) {
        var params = toQueryString({
            channel: CHANNEL,
            clientType: CLIENT,
            keyword: keyword,
            lang: LANG,
            mode: "1",
            packageName: PKG,
            page: "1",
            size: "30"
        });
        return karnisRequest(BASE_API + "/film-api/v2.1.2/movie/searchByKeyword?" + params, securityKey, {});
    }

    function getDetails(securityKey, movieId) {
        var url = BASE_API + "/film-api/v2.1.2/movie?channel=" + CHANNEL + "&clientType=" + CLIENT + "&lang=" + LANG + "&movieId=" + movieId + "&packageName=" + PKG;
        return karnisRequest(url, securityKey, {});
    }

    function getVideo(securityKey, movieId, episodeId, resolution, languageId) {
        var body = {
            mode: "1",
            appMarket: "IndiaAGuanWang",
            clientType: CLIENT,
            woolUser: "false",
            apkSignKey: "ED0955EB04E67A1D9F3305B95454FED485261475",
            androidVersion: "13",
            isNewUser: "true",
            packageName: PKG,
            movieId: String(movieId),
            episodeId: String(episodeId),
            resolution: String(resolution)
        };
        if (languageId != null) body.languageId = String(languageId);
        var url = BASE_API + "/film-api/v2.0.7/movie/getVideo2?clientType=" + CLIENT + "&packageName=" + PKG + "&channel=" + CHANNEL + "&lang=" + LANG;
        return karnisRequest(url, securityKey, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    }

    function pickRow(rows, title) {
        var searchTitle = title.toLowerCase();
        for (var i = 0; i < rows.length; i++) {
            var name = (rows[i].title || rows[i].name || "").toLowerCase();
            if (name.indexOf(searchTitle) !== -1 || searchTitle.indexOf(name) !== -1) return rows[i];
        }
        return rows[0];
    }

    function seasonMovieId(data, seasonValue, movieId) {
        var seasons = data.seasons || [];
        if (seasons.length <= 1) return movieId;
        for (var i = 0; i < seasons.length; i++) {
            if (seasons[i].number !== seasonValue) continue;
            if (seasons[i].movieId && String(seasons[i].movieId) !== movieId) return String(seasons[i].movieId);
            return movieId;
        }
        return movieId;
    }

    function pickEpisode(data, query) {
        var episodes = data.episodes || [];
        if (!query.isTv) return episodes[0] || null;
        for (var i = 0; i < episodes.length; i++) {
            if (episodes[i].number === query.episode) return episodes[i];
        }
        return null;
    }

    function toStream(url, rawQuality, size, label, qualityFallback, subtitles) {
        var quality = (rawQuality || qualityFallback || "").replace(/^(SD|HD|FHD)\s+/i, "");
        var value = qualityValue(quality);
        if (value < 720) return null;
        var tag = sortTag(value);
        var streamName = "Castle" + (label ? " \u2022 " + label : "") + (/preview/i.test(url) ? " (preview)" : "");
        return {
            url: url,
            name: tag + streamName,
            title: tag + streamName,
            quality: quality,
            size: formatSize(size),
            headers: PLAYBACK_HEADERS,
            subtitles: subtitles
        };
    }

    function processVideo(videoData, label, qualityFallback) {
        var data = extractData(videoData);
        if (!data.videoUrl) return [];
        var subtitles = [];
        var raw = data.subtitles || [];
        var i;
        for (i = 0; i < raw.length; i++) {
            if (!raw[i].url) continue;
            subtitles.push({
                url: raw[i].url,
                language: raw[i].abbreviate || "Unknown",
                name: raw[i].title || raw[i].abbreviate || "Unknown",
                headers: PLAYBACK_HEADERS
            });
        }
        var streams = [];
        var stream;
        if (data.videos && data.videos.length) {
            for (i = 0; i < data.videos.length; i++) {
                var video = data.videos[i];
                stream = toStream(video.url || data.videoUrl, video.resolutionDescription || video.resolution, video.size, label, qualityFallback, subtitles);
                if (stream) streams.push(stream);
            }
            return streams;
        }
        stream = toStream(data.videoUrl, qualityFallback, data.size, label, qualityFallback, subtitles);
        return stream ? [stream] : [];
    }

    function fetchStreams(securityKey, movieId, episodeId, resolution, languageId, label) {
        return getVideo(securityKey, movieId, episodeId, resolution, languageId).then(function (videoData) {
            if (!videoData) return [];
            try {
                return processVideo(videoData, label, Q_MAP[String(resolution)]);
            } catch (e) {
                return [];
            }
        });
    }

    function firstResolution(securityKey, movieId, episodeId) {
        var requests = [];
        for (var i = 0; i < RES.length; i++) {
            requests.push(fetchStreams(securityKey, movieId, episodeId, RES[i], null, null));
        }
        return Promise.all(requests).then(function (groups) {
            for (var j = 0; j < groups.length; j++) {
                if (groups[j].length) return groups[j];
            }
            return [];
        });
    }

    function loadStreams(securityKey, movieId, episodeObj) {
        var episodeId = String(episodeObj.id);
        var tracks = [];
        var hasIndividual = false;
        var list = episodeObj.tracks || [];
        var i;
        for (i = 0; i < list.length; i++) {
            if (isAllowedLang(list[i].languageName || list[i].abbreviate)) tracks.push(list[i]);
        }
        for (i = 0; i < tracks.length; i++) {
            if (tracks[i].existIndividualVideo === true) hasIndividual = true;
        }
        if (!hasIndividual) return firstResolution(securityKey, movieId, episodeId);
        var requests = [];
        for (i = 0; i < tracks.length; i++) {
            if (tracks[i].languageId == null) continue;
            var label = tracks[i].languageName || tracks[i].abbreviate || "Unknown";
            for (var j = 0; j < RES.length; j++) {
                requests.push(fetchStreams(securityKey, movieId, episodeId, RES[j], tracks[i].languageId, label));
            }
        }
        return Promise.all(requests).then(function (groups) {
            var all = [];
            for (var g = 0; g < groups.length; g++) all = all.concat(groups[g]);
            if (all.length) return all;
            return firstResolution(securityKey, movieId, episodeId);
        });
    }

    function rank(allStreams) {
        var decorated = [];
        var i;
        for (i = 0; i < allStreams.length; i++) {
            decorated.push({ stream: allStreams[i], index: i, value: qualityValue(allStreams[i].quality) });
        }
        decorated.sort(function (a, b) {
            return (b.value - a.value) || (a.index - b.index);
        });
        var seen = Object.create(null);
        var streams = [];
        for (i = 0; i < decorated.length; i++) {
            var url = decorated[i].stream.url;
            if (!url || seen[url]) continue;
            seen[url] = true;
            streams.push(decorated[i].stream);
        }
        return streams;
    }

    function finish(securityKey, query, movieId, details) {
        var episodeObj = pickEpisode(extractData(details), query);
        if (!episodeObj || !episodeObj.id) return Promise.resolve([]);
        return loadStreams(securityKey, movieId, episodeObj).then(rank);
    }

    function resolveEpisode(securityKey, query, movieId, details) {
        if (query.isTv) {
            var seasonId = seasonMovieId(extractData(details), query.season, movieId);
            if (seasonId !== movieId) {
                return getDetails(securityKey, seasonId).then(function (seasonDetails) {
                    if (!seasonDetails) return [];
                    return finish(securityKey, query, seasonId, seasonDetails);
                });
            }
        }
        return finish(securityKey, query, movieId, details);
    }

    var query = buildQuery(mediaType, season, episode);
    if (query === null) return Promise.resolve([]);
    try {
        return Promise.all([fetchTmdbInfo(query), fetchSecurityKey()]).then(function (ready) {
            var info = ready[0];
            var securityKey = ready[1];
            if (!info || !securityKey) return [];
            var term = info.year ? info.title + " " + info.year : info.title;
            return searchKarnis(securityKey, term).then(function (result) {
                if (!result) return [];
                var rows = extractData(result).rows || [];
                if (!rows.length) return [];
                var match = pickRow(rows, info.title);
                var movieId = String(match.id || match.redirectId || match.redirectIdStr || "");
                if (!movieId) return [];
                return getDetails(securityKey, movieId).then(function (details) {
                    if (!details) return [];
                    return resolveEpisode(securityKey, query, movieId, details);
                });
            });
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };