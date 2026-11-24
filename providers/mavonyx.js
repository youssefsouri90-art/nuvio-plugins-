function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "MovieBox";
    var ALWAYS_ENABLED_TRACKS = ["Original", "English Dub"];
    var DEFAULT_ENABLED_TRACKS = ["Hindi Dub"];
    var TMDB_BASE_URL = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var WEB_USER_AGENT =
        "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36";
    var MOBILE_USER_AGENT =
        "com.community.mbox.in/50020130 (Linux; B; Android 16; en_IN; Pixel 9; Build/UD1A.230803.041; Cronet/145.0.7582.0)";
    var REGIONAL_AUDIO_LABELS = {
        esla: "Español [Latino]",
        ptbr: "Português [Brasil]",
        es: "Español",
        spanish: "Español",
        pt: "Português",
        portuguese: "Português"
    };
    var LANGUAGE_NAMES = {
        en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam",
        kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
        ur: "Urdu", ar: "Arabic", es: "Spanish", pt: "Portuguese", fr: "French",
        de: "German", it: "Italian", ru: "Russian", ja: "Japanese", ko: "Korean",
        zh: "Chinese", th: "Thai", id: "Indonesian", "in": "Indonesian", ms: "Malay",
        tl: "Tagalog", fil: "Filipino", tr: "Turkish", vi: "Vietnamese", nl: "Dutch",
        pl: "Polish", sv: "Swedish", fa: "Persian", he: "Hebrew", el: "Greek",
        ro: "Romanian", hu: "Hungarian", cs: "Czech", uk: "Ukrainian", da: "Danish",
        fi: "Finnish", no: "Norwegian", bg: "Bulgarian", hr: "Croatian", sr: "Serbian",
        sk: "Slovak", si: "Sinhala", ne: "Nepali", my: "Burmese", km: "Khmer"
    };
    var RESOLUTION_OPTIONS = [
        { settingKey: "res_2160p", resolution: "2160p", enabledByDefault: true },
        { settingKey: "res_1080p", resolution: "1080p", enabledByDefault: true },
        { settingKey: "res_720p", resolution: "720p", enabledByDefault: false }
    ];
    var KNOWN_RESOLUTIONS = ["2160", "1440", "1080", "720", "480", "360", "240"];
    var RESOLUTION_RANK = { "2160p": 5, "1440p": 4, "1080p": 3, "720p": 2, "480p": 1 };
    var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var settings = typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};

    function audioTrackSettingKey(label) {
        return "dub_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function randomDeviceId() {
        var out = "";
        for (var i = 0; i < 16; i++) {
            out += ("0" + Math.floor(Math.random() * 256).toString(16)).slice(-2);
        }
        return out;
    }

    var DEVICE_ID = randomDeviceId();

    var CLIENT_INFO = JSON.stringify({
        package_name: "com.community.mbox.in",
        version_name: "4.0.03.0920.03",
        version_code: 50020130,
        os: "android",
        os_version: "14",
        device_id: DEVICE_ID,
        install_store: "official",
        brand: "Google",
        model: "Pixel 8",
        system_language: "en",
        net: "NETWORK_WIFI",
        region: "IN",
        timezone: "Asia/Calcutta",
        sp_code: ""
    });

    var authToken = "";
    var pendingTokenRequest = null;

    function buildQuery() {
        var isTv = mediaType === "tv";
        if (!isTv && mediaType !== "movie") return null;
        if (isTv && (season == null || episode == null)) return null;
        return { isTv: isTv, season: isTv ? Number(season) : 0, episode: isTv ? Number(episode) : 0 };
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) {
            for (var j = 0; j < lists[i].length; j++) out.push(lists[i][j]);
        }
        return out;
    }

    function copyObject(source) {
        var copy = {};
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
        }
        return copy;
    }

    function readToggle(key, fallback) {
        var value = settings[key];
        if (value == null || value === "") return fallback;
        return !(value === false || value === "false");
    }

    function isResolutionEnabled(resolution) {
        if (resolution === "Unknown") return true;
        for (var i = 0; i < RESOLUTION_OPTIONS.length; i++) {
            if (RESOLUTION_OPTIONS[i].resolution === resolution) {
                return readToggle(RESOLUTION_OPTIONS[i].settingKey, RESOLUTION_OPTIONS[i].enabledByDefault);
            }
        }
        return false;
    }

    function capitalize(text) {
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
    }

    function extractLanguageBase(rawName) {
        return String(rawName || "").split(/\sdub/i)[0].split(/\ssub/i)[0].trim();
    }

    function toAudioTrackLabel(rawName) {
        var raw = String(rawName || "");
        if (/original/i.test(raw)) return "Original";
        var isHardsub = /\ssub/i.test(raw);
        var base = extractLanguageBase(raw);
        if (!base) return capitalize(raw.trim());
        var regionalLabel = REGIONAL_AUDIO_LABELS[base.toLowerCase()];
        if (regionalLabel) return isHardsub ? regionalLabel + " Hardsub" : regionalLabel;
        return capitalize(base) + (isHardsub ? " Hardsub" : " Dub");
    }

    function toAudioDisplayName(rawName) {
        return REGIONAL_AUDIO_LABELS[extractLanguageBase(rawName).toLowerCase()] || String(rawName).replace(/dub/g, "Audio");
    }

    function toLanguageName(rawLanguage) {
        var raw = String(rawLanguage || "").trim();
        var code = raw.toLowerCase();
        return LANGUAGE_NAMES[code] || LANGUAGE_NAMES[code.split("-")[0]] || raw;
    }

    function isArabicLanguage(rawLanguage, languageName) {
        return /^(ar|ara|arabic)\b/i.test(String(rawLanguage || "").trim()) || languageName === "Arabic";
    }

    function isTrackEnabled(track) {
        var label = toAudioTrackLabel(track.language);
        if (label === "Arabic Hardsub") return false;
        return ALWAYS_ENABLED_TRACKS.indexOf(label) !== -1 ||
            readToggle(audioTrackSettingKey(label), DEFAULT_ENABLED_TRACKS.indexOf(label) !== -1);
    }

    function utf8Bytes(text) {
        var encoded = encodeURIComponent(text);
        var bytes = [];
        var i = 0;
        while (i < encoded.length) {
            if (encoded.charAt(i) === "%") {
                bytes.push(parseInt(encoded.substr(i + 1, 2), 16));
                i += 3;
            } else {
                bytes.push(encoded.charCodeAt(i));
                i += 1;
            }
        }
        return bytes;
    }

    function base64Encode(bytes) {
        var chunks = [];
        for (var i = 0; i < bytes.length; i += 3) {
            var hasB = i + 1 < bytes.length;
            var hasC = i + 2 < bytes.length;
            var a = bytes[i];
            var b = hasB ? bytes[i + 1] : 0;
            var c = hasC ? bytes[i + 2] : 0;
            chunks.push(
                BASE64_ALPHABET.charAt(a >> 2) +
                BASE64_ALPHABET.charAt(((a & 3) << 4) | (b >> 4)) +
                (hasB ? BASE64_ALPHABET.charAt(((b & 15) << 2) | (c >> 6)) : "=") +
                (hasC ? BASE64_ALPHABET.charAt(c & 63) : "=")
            );
        }
        return chunks.join("");
    }

    function decodeBase64(value) {
        var padded = String(value).replace(/\s/g, "");
        var remainder = padded.length % 4;
        while (remainder > 0 && remainder < 4) {
            padded += "=";
            remainder += 1;
        }
        if (!/^[A-Za-z0-9+\/]*={0,2}$/.test(padded)) throw new Error("invalid base64");
        var text = "";
        for (var i = 0; i < padded.length; i += 4) {
            var n0 = BASE64_ALPHABET.indexOf(padded.charAt(i));
            var n1 = BASE64_ALPHABET.indexOf(padded.charAt(i + 1));
            var n2 = padded.charAt(i + 2) === "=" ? -1 : BASE64_ALPHABET.indexOf(padded.charAt(i + 2));
            var n3 = padded.charAt(i + 3) === "=" ? -1 : BASE64_ALPHABET.indexOf(padded.charAt(i + 3));
            text += String.fromCharCode((n0 << 2) | (n1 >> 4));
            if (n2 !== -1) text += String.fromCharCode(((n1 & 15) << 4) | (n2 >> 2));
            if (n3 !== -1) text += String.fromCharCode(((n2 & 3) << 6) | n3);
        }
        return text;
    }

    function md5Bytes(input) {
        var shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
        var k = [];
        var s = [];
        var i;
        for (i = 0; i < 64; i++) {
            k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
            s[i] = shifts[i >> 4][i & 3];
        }

        var message = input.slice(0);
        message.push(128);
        while (message.length % 64 !== 56) message.push(0);
        var bits = input.length * 8;
        var low = bits % 4294967296;
        var high = Math.floor(bits / 4294967296);
        for (i = 0; i < 4; i++) message.push((low >>> (8 * i)) & 255);
        for (i = 0; i < 4; i++) message.push((high >>> (8 * i)) & 255);

        var a0 = 1732584193;
        var b0 = -271733879;
        var c0 = -1732584194;
        var d0 = 271733878;

        for (var offset = 0; offset < message.length; offset += 64) {
            var m = [];
            for (i = 0; i < 16; i++) {
                m[i] = message[offset + i * 4] | (message[offset + i * 4 + 1] << 8) |
                    (message[offset + i * 4 + 2] << 16) | (message[offset + i * 4 + 3] << 24);
            }
            var a = a0;
            var b = b0;
            var c = c0;
            var d = d0;
            for (i = 0; i < 64; i++) {
                var f;
                var g;
                if (i < 16) {
                    f = (b & c) | (~b & d);
                    g = i;
                } else if (i < 32) {
                    f = (d & b) | (~d & c);
                    g = (5 * i + 1) % 16;
                } else if (i < 48) {
                    f = b ^ c ^ d;
                    g = (3 * i + 5) % 16;
                } else {
                    f = c ^ (b | ~d);
                    g = (7 * i) % 16;
                }
                f = (f + a + k[i] + m[g]) | 0;
                a = d;
                d = c;
                c = b;
                b = (b + ((f << s[i]) | (f >>> (32 - s[i])))) | 0;
            }
            a0 = (a0 + a) | 0;
            b0 = (b0 + b) | 0;
            c0 = (c0 + c) | 0;
            d0 = (d0 + d) | 0;
        }

        var words = [a0, b0, c0, d0];
        var out = [];
        for (i = 0; i < 4; i++) {
            for (var j = 0; j < 4; j++) out.push((words[i] >>> (8 * j)) & 255);
        }
        return out;
    }

    function md5Hex(text) {
        var bytes = md5Bytes(utf8Bytes(text));
        var out = "";
        for (var i = 0; i < bytes.length; i++) out += ("0" + bytes[i].toString(16)).slice(-2);
        return out;
    }

    function hmacMd5Bytes(keyBytes, messageBytes) {
        var inner = [];
        var outer = [];
        for (var i = 0; i < 64; i++) {
            var keyByte = i < keyBytes.length ? keyBytes[i] : 0;
            inner.push(keyByte ^ 54);
            outer.push(keyByte ^ 92);
        }
        return md5Bytes(outer.concat(md5Bytes(inner.concat(messageBytes))));
    }

    function buildClientToken(timestamp) {
        var value = String(timestamp);
        return value + "," + md5Hex(value.split("").reverse().join(""));
    }

    function buildCanonicalString(request) {
        var match = /^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*([^?#]*)(?:\?([^#]*))?/i.exec(request.url);
        var path = match ? match[1] || "" : "";
        var rawQuery = match && match[2] ? match[2] : "";
        var canonicalUrl = path;
        if (rawQuery) {
            var pairs = rawQuery.split("&").map(function (part, index) {
                var pieces = part.split("=");
                return { key: pieces[0], value: pieces[1] === undefined ? "" : pieces[1], index: index };
            });
            pairs.sort(function (a, b) {
                return a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index;
            });
            canonicalUrl = path + "?" + pairs.map(function (pair) {
                return pair.key + "=" + pair.value;
            }).join("&");
        }
        var hasBody = request.body != null;
        var bodyHash = hasBody ? md5Hex(request.body) : "";
        var bodyLength = hasBody ? String(utf8Bytes(request.body).length) : "";
        return request.method.toUpperCase() + "\n" + request.accept + "\n" + request.contentType + "\n" +
            bodyLength + "\n" + request.timestamp + "\n" + bodyHash + "\n" + canonicalUrl;
    }

    function buildRequestSignature(request) {
        var keyText = decodeBase64(decodeBase64("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw=="));
        var keyBytes = [];
        for (var i = 0; i < keyText.length; i++) keyBytes.push(keyText.charCodeAt(i));
        var signature = base64Encode(hmacMd5Bytes(keyBytes, utf8Bytes(buildCanonicalString(request))));
        return request.timestamp + "|2|" + signature;
    }

    function parseTokenHeader(headerValue) {
        if (!headerValue) return "";
        try {
            var token = JSON.parse(headerValue).token;
            return typeof token === "string" && token.split(".").length === 3 ? token : "";
        } catch (error) {
            return "";
        }
    }

    function sendSignedRequest(method, url, body, withAuth) {
        var timestamp = Date.now();
        var accept = "application/json";
        var contentType = method === "POST" ? "application/json; charset=utf-8" : "application/json";
        var headers = {
            "User-Agent": MOBILE_USER_AGENT,
            "Accept": accept,
            "Content-Type": contentType,
            "x-client-token": buildClientToken(timestamp),
            "x-tr-signature": buildRequestSignature({
                method: method, accept: accept, contentType: contentType, url: url, body: body, timestamp: timestamp
            }),
            "x-client-info": CLIENT_INFO,
            "x-client-status": "0"
        };
        var ready = withAuth
            ? ensureToken(false).then(function (token) {
                if (token) headers["Authorization"] = "Bearer " + token;
            })
            : Promise.resolve();
        return ready.then(function () {
            var options = { method: method, headers: headers };
            if (body != null) options.body = body;
            return fetch(url, options);
        }).then(function (response) {
            var refreshedToken = parseTokenHeader(response.headers.get("x-user"));
            if (refreshedToken) {
                authToken = refreshedToken;
                pendingTokenRequest = Promise.resolve(refreshedToken);
            }
            return response;
        });
    }

    function requestToken() {
        return sendSignedRequest(
            "GET",
            "https://apig.inmoviebox.com/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=4516404531735022304&page=1&perPage=1",
            null,
            false
        ).then(function (response) {
            var token = parseTokenHeader(response.headers.get("x-user"));
            if (token) authToken = token;
        }).then(null, function () {
            return null;
        }).then(function () {
            return authToken;
        });
    }

    function ensureToken(forceRefresh) {
        if (forceRefresh || !pendingTokenRequest) pendingTokenRequest = requestToken();
        return pendingTokenRequest;
    }

    function callMobileApi(method, pathAndQuery, body) {
        var url = "https://api3.aoneroom.com" + pathAndQuery;
        var tokenBefore = authToken;
        return sendSignedRequest(method, url, body, true).then(function (response) {
            if (response.status === 401 || response.status === 441) {
                var refreshed = !authToken || authToken === tokenBefore ? ensureToken(true) : Promise.resolve(null);
                return refreshed.then(function () {
                    return sendSignedRequest(method, url, body, true);
                });
            }
            return response;
        }).then(function (response) {
            return response.status > 0 && response.status < 500 ? response : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchMobileJson(method, pathAndQuery, payload) {
        return callMobileApi(method, pathAndQuery, payload ? JSON.stringify(payload) : null).then(function (response) {
            if (!response || response.status !== 200) return null;
            return response.json();
        }).then(null, function () {
            return null;
        });
    }

    function fetchSubjectDetail(subjectId) {
        return fetchMobileJson("GET", "/wefeed-mobile-bff/subject-api/get?subjectId=" + subjectId, null).then(function (json) {
            return json && json.data ? json.data : null;
        });
    }

    function fetchTmdbMetadata() {
        if (!TMDB_KEY) return Promise.resolve(null);
        var isTv = mediaType === "tv";
        return fetch(TMDB_BASE_URL + "/" + (isTv ? "tv" : "movie") + "/" + encodeURIComponent(tmdbId) + "?api_key=" + TMDB_KEY).then(function (response) {
            if (!response.ok) return null;
            return response.json();
        }).then(function (details) {
            if (!details) return null;
            var titles = [];
            [details.title, details.name, details.original_title, details.original_name].forEach(function (candidate) {
                var title = candidate ? String(candidate).trim() : "";
                if (title && titles.indexOf(title) === -1) titles.push(title);
            });
            if (!titles.length) return null;

            var year = parseInt(String(details.release_date || details.first_air_date || "").slice(0, 4), 10);
            return {
                titles: titles,
                year: isNaN(year) ? null : year,
                rating: typeof details.vote_average === "number" && details.vote_average > 0 ? details.vote_average : null,
                isTv: isTv
            };
        }).then(null, function () {
            return null;
        });
    }

    function normalizeTitle(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[‘’‛′]/g, "'")
            .replace(/[^a-z0-9À-￿ ]/g, " ")
            .replace(/[ -⁯　-〿＀-／：-＠]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function stripTitleNoise(text) {
        return String(text || "")
            .replace(/\[.*?\]/g, " ")
            .replace(/\(.*?\)/g, " ")
            .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ");
    }

    function tokenSet(text) {
        var parts = text.split(" ");
        var map = Object.create(null);
        var list = [];
        for (var i = 0; i < parts.length; i++) {
            if (parts[i] && map[parts[i]] !== true) {
                map[parts[i]] = true;
                list.push(parts[i]);
            }
        }
        return { map: map, list: list };
    }

    function titlesOverlap(a, b) {
        var tokensA = tokenSet(a);
        var tokensB = tokenSet(b);
        if (!tokensA.list.length || !tokensB.list.length) return false;
        var shared = 0;
        for (var i = 0; i < tokensA.list.length; i++) {
            if (tokensB.map[tokensA.list[i]] === true) shared++;
        }
        return shared >= Math.max(1, Math.floor((Math.min(tokensA.list.length, tokensB.list.length) * 3) / 4));
    }

    function scoreTitleMatch(rawTitle, expectedTitles) {
        var variants = [
            normalizeTitle(rawTitle.split("[")[0].replace(/\(.*?\)/g, " ")),
            normalizeTitle(stripTitleNoise(rawTitle))
        ];
        var score = 0;
        for (var i = 0; i < expectedTitles.length; i++) {
            var normalizedExpected = normalizeTitle(expectedTitles[i]);
            if (!normalizedExpected) continue;
            for (var j = 0; j < variants.length; j++) {
                var variant = variants[j];
                if (!variant) continue;
                if (titlesOverlap(normalizedExpected, variant)) return 50;
                if (normalizedExpected.indexOf(variant) !== -1 || variant.indexOf(normalizedExpected) !== -1) {
                    score = Math.max(score, 20);
                }
            }
        }
        return score;
    }

    function scoreYearMatch(expectedYear, releaseDate) {
        var foundYear = parseInt(String(releaseDate || "").slice(0, 4), 10);
        if (expectedYear == null || isNaN(foundYear)) return 0;
        var difference = Math.abs(foundYear - expectedYear);
        if (difference === 0) return 40;
        if (difference === 1) return 20;
        if (difference >= 4) return -40;
        if (difference >= 2) return -15;
        return 0;
    }

    function scoreRatingMatch(expectedRating, ratingValue) {
        var foundRating = parseFloat(ratingValue);
        if (expectedRating == null || isNaN(foundRating)) return 0;
        var difference = Math.abs(foundRating - expectedRating);
        if (difference <= 0.5) return 10;
        if (difference <= 1.0) return 5;
        return 0;
    }

    function scoreSearchResult(result, metadata) {
        var rawTitle = String(result.title || "");
        var subjectType = parseInt(result.subjectType, 10);
        var resultIsTv = subjectType === 2 || subjectType === 7;
        return (
            scoreTitleMatch(rawTitle, metadata.titles) +
            scoreYearMatch(metadata.year, result.releaseDate) +
            scoreRatingMatch(metadata.rating, result.imdbRatingValue) +
            (metadata.isTv === resultIsTv ? 15 : -30) +
            (rawTitle.indexOf("[") !== -1 ? 0 : 2)
        );
    }

    function searchCatalog(keyword) {
        return fetchMobileJson("POST", "/wefeed-mobile-bff/subject-api/search/v2", {
            page: 1,
            perPage: 20,
            keyword: keyword,
            restrictKid: 0
        }).then(function (json) {
            var groups = json && json.data && json.data.results;
            if (!Array.isArray(groups)) return [];
            var subjects = [];
            groups.forEach(function (group) {
                if (!group || !Array.isArray(group.subjects)) return;
                group.subjects.forEach(function (subject) {
                    if (subject && subject.subjectId != null && subject.title) subjects.push(subject);
                });
            });
            return subjects;
        });
    }

    function findMatchingSubjectId(metadata) {
        var queries = [metadata.titles[0]];
        if (metadata.titles[1] && normalizeTitle(metadata.titles[1]) !== normalizeTitle(metadata.titles[0])) {
            queries.push(metadata.titles[1]);
        }
        return Promise.all(queries.map(searchCatalog)).then(function (lists) {
            for (var i = 0; i < lists.length; i++) {
                var bestResult = null;
                var bestScore = -Infinity;
                for (var j = 0; j < lists[i].length; j++) {
                    var score = scoreSearchResult(lists[i][j], metadata);
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = lists[i][j];
                    }
                }
                if (bestResult && bestScore >= 40) return String(bestResult.subjectId);
            }
            return null;
        });
    }

    function parseResolution(text) {
        var haystack = String(text || "").toLowerCase();
        for (var i = 0; i < KNOWN_RESOLUTIONS.length; i++) {
            if (haystack.indexOf(KNOWN_RESOLUTIONS[i]) !== -1) return KNOWN_RESOLUTIONS[i] + "p";
        }
        return "Unknown";
    }

    function resolutionRank(resolution) {
        return RESOLUTION_RANK[resolution] || 0;
    }

    function buildSortPrefix(position) {
        var prefix = "";
        for (var bit = 19; bit >= 0; bit--) {
            prefix += (position >> bit) & 1 ? "﻿" : "​";
        }
        return prefix;
    }

    function extractManifestUrlFromCookie(signCookie) {
        if (!signCookie) return null;

        var edgeMatch = /Edge-Cache-Cookie=urlprefix=([^:;\s]+)/.exec(signCookie);
        if (edgeMatch) {
            try {
                var prefix = decodeBase64(edgeMatch[1].replace(/_/g, "/").replace(/-/g, "+"));
                return prefix.replace(/\/+$/, "") + "/index.mpd";
            } catch (error) {
                return null;
            }
        }

        var policyMatch = /CloudFront-Policy=([^;]+)/.exec(signCookie);
        if (!policyMatch) return null;
        var encodedPolicy = policyMatch[1];
        var decodingAttempts = [
            encodedPolicy.replace(/-/g, "+").replace(/~/g, "/").replace(/_/g, "="),
            encodedPolicy.replace(/-/g, "+").replace(/_/g, "/")
        ];
        for (var i = 0; i < decodingAttempts.length; i++) {
            try {
                var policy = JSON.parse(decodeBase64(decodingAttempts[i]));
                var resource = policy && policy.Statement && policy.Statement[0] && policy.Statement[0].Resource;
                if (resource) {
                    var trimmed = String(resource).replace(/[*\/]+$/, "");
                    return /\.mpd$/i.test(trimmed) ? trimmed : trimmed + "/index.mpd";
                }
            } catch (error) {
                continue;
            }
        }
        return null;
    }

    function isPlaceholderStream(resolvedUrl, originalUrl) {
        return (
            resolvedUrl.indexOf("b164fbfb4347792950bdfbfb563d39d9") !== -1 ||
            (resolvedUrl === originalUrl && originalUrl.indexOf("/other/2026/09/") !== -1)
        );
    }

    function detectStreamFormat(declaredFormat, url) {
        var format = String(declaredFormat || "").toUpperCase();
        if (format === "DASH" || url.indexOf(".mpd") !== -1) return "DASH";
        if (format === "HLS" || url.indexOf(".m3u8") !== -1) return "HLS";
        return "MP4";
    }

    function parseDetailUrl(detailUrl) {
        var match = /^(https?):\/\/([^\/?#:@]+)(?::\d+)?/i.exec(String(detailUrl || ""));
        if (!match) return null;
        var cleaned = String(detailUrl).replace(/\/+$/, "").split("?")[0];
        return { origin: match[1] + "://" + match[2], path: cleaned.substring(cleaned.lastIndexOf("/") + 1) };
    }

    function buildSiteHeaders(origin, path, subjectId) {
        var siteOrigin = origin || "https://themoviebox.xyz";
        return {
            "Origin": siteOrigin,
            "Referer": path
                ? siteOrigin + "/movies/" + path + "?id=" + subjectId + "&type=/movie/detail&detailSe=&detailEp=&lang=en"
                : siteOrigin + "/",
            "User-Agent": WEB_USER_AGENT,
            "Accept": "*/*"
        };
    }

    function buildStreamCandidate(stream, baseHeaders, declaredFormat, playback) {
        var originalUrl = stream && stream.url ? String(stream.url) : "";
        if (!originalUrl) return null;

        var signCookie = stream.signCookie ? String(stream.signCookie) : "";
        var resolvedUrl = extractManifestUrlFromCookie(signCookie) || originalUrl;
        if (isPlaceholderStream(resolvedUrl, originalUrl)) return null;

        var headers = copyObject(baseHeaders);
        if (signCookie) {
            headers[stream.signHeaderKey ? String(stream.signHeaderKey) : "X-MB-Token"] = signCookie;
            headers["Cookie"] = signCookie;
        }
        return {
            url: resolvedUrl,
            format: detectStreamFormat(declaredFormat, resolvedUrl),
            resolution: parseResolution(stream.resolutions),
            headers: headers,
            streamId: stream.id != null ? String(stream.id) : playback.subjectId + "|" + playback.season + "|" + playback.episode
        };
    }

    function fetchSubtitles(streamId, trackLanguage, subjectId) {
        var encodedStreamId = encodeURIComponent(streamId);
        var endpoints = [
            "/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=" + subjectId + "&streamId=" + encodedStreamId,
            "/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=" + subjectId + "&resourceId=" + encodedStreamId + "&episode=0"
        ];
        return Promise.all(endpoints.map(function (endpoint) {
            return fetchMobileJson("GET", endpoint, null);
        })).then(function (responses) {
            var audioName = toAudioDisplayName(trackLanguage);
            var seenUrls = Object.create(null);
            var subtitles = [];
            responses.forEach(function (json) {
                var captions = json && json.data && json.data.extCaptions;
                if (!Array.isArray(captions)) return;
                captions.forEach(function (caption) {
                    var url = caption && caption.url;
                    if (!url || seenUrls[url] === true) return;
                    seenUrls[url] = true;
                    var rawLanguage = caption.lanName || caption.language || caption.lan || "Unknown";
                    var language = toLanguageName(rawLanguage);
                    if (isArabicLanguage(rawLanguage, language)) return;
                    subtitles.push({ url: url, language: language, name: language + " (" + audioName + ")" });
                });
            });
            return subtitles;
        });
    }

    function isDashStream(stream) {
        return String(stream.format || "").toUpperCase() === "DASH" || String(stream.url || "").indexOf(".mpd") !== -1;
    }

    function fetchMobileStreams(playback, site) {
        return fetchMobileJson(
            "GET",
            "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + playback.subjectId + "&se=" + playback.season + "&ep=" + playback.episode,
            null
        ).then(function (json) {
            var streams = json && json.data && json.data.streams;
            if (!Array.isArray(streams)) return [];

            var baseHeaders = buildSiteHeaders(site.origin, site.path, playback.subjectId);
            var dashFirst = streams.filter(isDashStream).concat(streams.filter(function (stream) {
                return !isDashStream(stream);
            }));

            var candidates = [];
            for (var i = 0; i < dashFirst.length; i++) {
                var candidate = buildStreamCandidate(dashFirst[i], baseHeaders, dashFirst[i].format, playback);
                if (candidate && candidate.format !== "MP4") candidates.push(candidate);
            }
            return candidates;
        });
    }

    function fetchWebStreamsFromOrigin(origin, path, playback) {
        var headers = {
            "User-Agent": WEB_USER_AGENT,
            "Referer": buildSiteHeaders(origin, path, playback.subjectId).Referer,
            "Accept": "application/json",
            "x-client-info": JSON.stringify({ timezone: "Asia/Calcutta" }),
            "x-request-lang": "en",
            "x-vip-restrict": "0",
            "x-no-high-risk-restrict": "0",
            "x-source": ""
        };
        var tokenPromise = authToken ? Promise.resolve(authToken) : ensureToken(false);
        return tokenPromise.then(function (token) {
            if (token) headers["Authorization"] = "Bearer " + token;
            return fetch(
                origin + "/wefeed-h5api-bff/subject/play?subjectId=" + playback.subjectId + "&se=" + playback.season +
                "&ep=" + playback.episode + "&detailPath=" + path +
                "&streamSignType=1&supportCodecs%5Bhevc%5D=1&supportCodecs%5Bh264%5D=1",
                { headers: headers }
            );
        }).then(function (response) {
            if (response.status !== 200) return null;
            return response.json();
        }).then(function (json) {
            var streams = json && json.data && json.data.streams;
            return Array.isArray(streams) && streams.length ? { origin: origin, streams: streams } : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchWebStreams(origins, path, playback) {
        return Promise.all(origins.map(function (origin) {
            return fetchWebStreamsFromOrigin(origin, path, playback);
        })).then(function (responses) {
            var firstHit = null;
            for (var i = 0; i < responses.length; i++) {
                if (responses[i]) {
                    firstHit = responses[i];
                    break;
                }
            }
            if (!firstHit) return [];
            var baseHeaders = buildSiteHeaders(firstHit.origin, path, playback.subjectId);
            return firstHit.streams.map(function (stream) {
                return buildStreamCandidate(stream, baseHeaders, "MP4", playback);
            }).filter(Boolean);
        });
    }

    function resolveMainSite(subject) {
        var parsed = subject.detailUrl ? parseDetailUrl(subject.detailUrl) : null;
        return {
            origin: parsed ? parsed.origin : null,
            path: (parsed && parsed.path) || subject.detailPath || null
        };
    }

    function resolveTrackSite(context, track) {
        if (track.subjectId === context.originalSubjectId) return Promise.resolve(context.mainSite);

        var detailPromise = track.detailUrl
            ? Promise.resolve({ detailUrl: track.detailUrl, detailPath: null })
            : fetchSubjectDetail(track.subjectId).then(function (detail) {
                if (!detail) return { detailUrl: null, detailPath: null };
                var detailUrl = detail.detailUrl || null;
                return { detailUrl: detailUrl, detailPath: detailUrl ? null : detail.detailPath || null };
            });
        return detailPromise.then(function (found) {
            var parsed = found.detailUrl ? parseDetailUrl(found.detailUrl) : null;
            if (parsed) return parsed;
            if (found.detailPath) return { origin: context.mainSite.origin, path: found.detailPath };
            return context.mainSite;
        });
    }

    function extractAudioTracks(subject, subjectId) {
        var originalLanguage = "Original";
        var seenIds = Object.create(null);
        var tracks = [];
        (Array.isArray(subject.dubs) ? subject.dubs : []).forEach(function (dub) {
            var dubSubjectId = dub && dub.subjectId != null ? String(dub.subjectId) : "";
            var language = dub && dub.lanName ? String(dub.lanName) : "";
            if (!dubSubjectId || !language) return;
            if (dubSubjectId === subjectId) {
                originalLanguage = language;
                return;
            }
            if (seenIds[dubSubjectId] === true) return;
            seenIds[dubSubjectId] = true;
            tracks.push({ subjectId: dubSubjectId, language: language, detailUrl: dub.detailUrl || null });
        });
        tracks.unshift({ subjectId: subjectId, language: originalLanguage, detailUrl: null });
        return tracks;
    }

    function resolveAudioTrack(context, track) {
        return resolveTrackSite(context, track).then(function (site) {
            var origins = [];
            if (site.origin) origins.push(String(site.origin).replace(/\/+$/, ""));
            if (origins.indexOf("https://h5-api.aoneroom.com") === -1) origins.push("https://h5-api.aoneroom.com");

            var playback = { subjectId: track.subjectId, season: context.season, episode: context.episode };
            return Promise.all([
                fetchMobileStreams(playback, site).then(null, function () {
                    return [];
                }),
                fetchWebStreams(origins, site.path || "", playback).then(null, function () {
                    return [];
                })
            ]);
        }).then(function (replies) {
            var candidates = replies[0].concat(replies[1]).filter(function (candidate) {
                return isResolutionEnabled(candidate.resolution);
            });
            if (!candidates.length) return [];

            var subtitlesPromise = readToggle("subtitles", true)
                ? fetchSubtitles(candidates[0].streamId, track.language, track.subjectId).then(null, function () {
                    return [];
                })
                : Promise.resolve([]);
            return subtitlesPromise.then(function (subtitles) {
                return candidates.map(function (candidate) {
                    var entry = copyObject(candidate);
                    entry.language = track.language;
                    entry.subtitles = subtitles;
                    return entry;
                });
            });
        }).then(null, function () {
            return [];
        });
    }

    function dedupeByUrl(candidates) {
        var seenUrls = Object.create(null);
        return candidates.filter(function (candidate) {
            if (seenUrls[candidate.url] === true) return false;
            seenUrls[candidate.url] = true;
            return true;
        });
    }

    function sortByResolution(candidates) {
        var entries = candidates.map(function (candidate, index) {
            return { candidate: candidate, index: index };
        });
        entries.sort(function (a, b) {
            return resolutionRank(b.candidate.resolution) - resolutionRank(a.candidate.resolution) || a.index - b.index;
        });
        return entries.map(function (entry) {
            return entry.candidate;
        });
    }

    function toStreamResult(candidate, position) {
        var audioName = toAudioDisplayName(candidate.language);
        var prefix = buildSortPrefix(position);
        var label = prefix + PROVIDER + " • " + audioName + " • " + candidate.resolution;
        var result = {
            name: label,
            title: label,
            url: candidate.url,
            quality: candidate.resolution + " • " + candidate.format,
            headers: candidate.headers
        };
        if (candidate.subtitles.length) result.subtitles = candidate.subtitles;
        return result;
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return Promise.all([fetchTmdbMetadata(), ensureToken(false)]).then(function (replies) {
        var metadata = replies[0];
        if (!metadata) return null;
        return findMatchingSubjectId(metadata);
    }).then(function (subjectId) {
        if (!subjectId) return [];
        return fetchSubjectDetail(subjectId).then(function (subject) {
            if (!subject) return [];
            var enabledTracks = extractAudioTracks(subject, subjectId).filter(isTrackEnabled);
            if (!enabledTracks.length) return [];

            var context = {
                originalSubjectId: subjectId,
                mainSite: resolveMainSite(subject),
                season: query.season,
                episode: query.episode
            };
            return Promise.all(enabledTracks.map(function (track) {
                return resolveAudioTrack(context, track);
            })).then(function (trackResults) {
                return sortByResolution(dedupeByUrl(flatten(trackResults))).map(toStreamResult);
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        var always = ["Original", "English Dub"];
        var enabledByDefault = ["Hindi Dub"];
        var labels = [
            "Original",
            "Arabic Dub", "Bengali Dub", "English Dub", "Español [Latino]", "French Dub",
            "German Dub", "Hindi Dub", "Indonesian Dub", "Italian Dub", "Japanese Dub",
            "Kannada Dub", "Korean Dub", "Malay Dub", "Malayalam Dub", "Português",
            "Português [Brasil]", "Punjabi Dub", "Russian Dub", "Español", "Tagalog Dub",
            "Tamil Dub", "Telugu Dub", "Thai Dub", "Turkish Dub", "Urdu Dub"
        ];
        var layout = [
            { type: "header", label: "MovieBox" },
            {
                type: "toggle",
                key: "subtitles",
                label: "Subtitles",
                defaultValue: false,
                description: "Subtitles for each audio track [Default & Recommended: Disabled]"
            },
            { type: "header", label: "Resolutions" },
            { type: "info", label: "Only the enabled resolutions are returned. Anything below 720p is always removed." },
            { type: "toggle", key: "res_2160p", label: "2160p (4K)", defaultValue: true },
            { type: "toggle", key: "res_1080p", label: "1080p", defaultValue: true },
            { type: "toggle", key: "res_720p", label: "720p", defaultValue: false },
            { type: "header", label: "Audio tracks" },
            { type: "info", label: "Original and English Dub are always on. Turned-off tracks are skipped entirely and never requested." }
        ];
        labels.forEach(function (label) {
            if (always.indexOf(label) !== -1) return;
            layout.push({
                type: "toggle",
                key: "dub_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
                label: label,
                defaultValue: enabledByDefault.indexOf(label) !== -1
            });
        });
        return Promise.resolve(layout);
    }
};