function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://vidnest.fun";
    var API_BASE = BASE_URL.replace("://", "://new.");
    var REFERER = BASE_URL + "/";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var WORKERS = [
        "https://long-night-d802.streamed-5.workers.dev",
        "https://blue-bush-5977.streamed-7.workers.dev",
        "https://rapid-heart-03c8.streamed-4.workers.dev",
        "https://super-flower-9c85.streamed-2.workers.dev",
        "https://flat-sky-cf20.streamed-850.workers.dev",
        "https://vidrift-cf.streamed-8.workers.dev"
    ];
    var SERVERS = [
        { path: "onehd", displayName: "Alfa" },
        { path: "flixhq", displayName: "Beta" },
        { path: "yflix", displayName: "Catflix" },
        { path: "allmovies", displayName: "Delta" },
        { path: "rogflix", displayName: "Filxer" },
        { path: "vidzee", displayName: "Gama" },
        { path: "ophim", displayName: "Lamda" },
        { path: "rpmvid", displayName: "Prime" },
        { path: "nextgencloudfabric", displayName: "Zeta" }
    ];
    var LANG_LABELS = {
        "original": "Original Audio",
        "latin american spanish": "Espa\u00f1ol [Latino]",
        "brazilian portuguese": "Portugu\u00eas [Brasil]"
    };
    var PRIMES = [];
    for (var n = 2; PRIMES.length < 64; n++) {
        if (PRIMES.every(function (prime) { return n % prime; })) PRIMES.push(n);
    }
    var SHA256_K = PRIMES.map(function (prime) { return (Math.pow(prime, 1 / 3) * 4294967296) | 0; });
    var SHA256_INIT = PRIMES.slice(0, 8).map(function (prime) { return (Math.pow(prime, 0.5) * 4294967296) | 0; });
    var aesSboxCache = null;

    function buildQuery(id, type, seasonValue, episodeValue) {
        if (!/^\d+$/.test(String(id))) return null;
        if (type !== "movie" && type !== "tv") return null;
        if (type === "tv" && (seasonValue == null || episodeValue == null)) return null;
        return { id: id, isMovie: type === "movie", type: type, season: seasonValue, episode: episodeValue };
    }

    function fetchText(url, headers) {
        try {
            return fetch(url, { headers: headers }).then(function (response) {
                return response.text().then(function (text) {
                    return {
                        status: response.status,
                        statusText: response.statusText || "",
                        ok: response.ok,
                        getHeader: function (name) {
                            return (response.headers && typeof response.headers.get === "function" && response.headers.get(name)) || "";
                        },
                        text: text
                    };
                });
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url, headers) {
        return fetchText(url, headers).then(function (response) {
            if (!response || !response.ok) return null;
            try {
                return JSON.parse(response.text);
            } catch (e) {
                return null;
            }
        });
    }

    function sanitizeHeaders(rawHeaders) {
        var headers = {};
        var source = rawHeaders || {};
        Object.keys(source).forEach(function (rawName) {
            var name = String(rawName).trim();
            var value = source[rawName];
            if (!name || value == null || typeof value === "object") return;
            if (/^(connection|accept|accept-encoding|host|content-length|range)$/i.test(name)) return;
            var normalizedValue = String(value).trim();
            if (normalizedValue) headers[name] = normalizedValue;
        });
        if (headers.Origin) headers.Origin = headers.Origin.replace(/\/+$/, "");
        if (!headers["User-Agent"]) headers["User-Agent"] = USER_AGENT;
        return headers;
    }

    function fromCodePoint(codePoint) {
        if (codePoint > 0x10FFFF) throw new RangeError("code point");
        if (codePoint <= 0xFFFF) return String.fromCharCode(codePoint);
        var offset = codePoint - 0x10000;
        return String.fromCharCode(0xD800 + (offset >> 10), 0xDC00 + (offset & 0x3FF));
    }

    function decodeUtf8(bytes) {
        var parts = [];
        for (var index = 0; index < bytes.length;) {
            var first = bytes[index++];
            var extra = first < 0x80 ? 0 : first < 0xE0 ? 1 : first < 0xF0 ? 2 : 3;
            var codePoint = extra ? first & (0x3F >> extra) : first;
            for (var k = 0; k < extra; k++) codePoint = (codePoint << 6) | (bytes[index++] & 0x3F);
            parts.push(fromCodePoint(codePoint));
        }
        return parts.join("");
    }

    function decodeBase64(encoded, alphabet) {
        var bytes = [];
        var bitBuffer = 0;
        var bitCount = 0;
        for (var index = 0; index < encoded.length; index++) {
            var value = alphabet.indexOf(encoded.charAt(index));
            if (value < 0) continue;
            bitBuffer = ((bitBuffer << 6) | value) & 0xFFFFFF;
            bitCount += 6;
            if (bitCount >= 8) {
                bitCount -= 8;
                bytes.push((bitBuffer >> bitCount) & 255);
            }
        }
        return bytes;
    }

    function sha256(input) {
        var message = input.concat([0x80]);
        while (message.length % 64 !== 56) message.push(0);
        var bitLength = input.length * 8;
        message.push(0, 0, 0, 0, (bitLength >>> 24) & 255, (bitLength >>> 16) & 255, (bitLength >>> 8) & 255, bitLength & 255);

        var rotateRight = function (value, count) { return (value >>> count) | (value << (32 - count)); };
        var schedule = new Array(64);
        var hash = SHA256_INIT;

        for (var offset = 0; offset < message.length; offset += 64) {
            var i;
            for (i = 0; i < 64; i++) {
                if (i < 16) {
                    schedule[i] = (message[offset + 4 * i] << 24) | (message[offset + 4 * i + 1] << 16) | (message[offset + 4 * i + 2] << 8) | message[offset + 4 * i + 3];
                } else {
                    var sigma0 = rotateRight(schedule[i - 15], 7) ^ rotateRight(schedule[i - 15], 18) ^ (schedule[i - 15] >>> 3);
                    var sigma1 = rotateRight(schedule[i - 2], 17) ^ rotateRight(schedule[i - 2], 19) ^ (schedule[i - 2] >>> 10);
                    schedule[i] = (schedule[i - 16] + sigma0 + schedule[i - 7] + sigma1) | 0;
                }
            }
            var state = hash;
            for (i = 0; i < 64; i++) {
                var a = state[0];
                var b = state[1];
                var c = state[2];
                var d = state[3];
                var e = state[4];
                var f = state[5];
                var g = state[6];
                var h = state[7];
                var temp1 = (h + (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + schedule[i]) | 0;
                var temp2 = ((rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
                state = [(temp1 + temp2) | 0, a, b, c, (d + temp1) | 0, e, f, g];
            }
            var previous = state;
            hash = hash.map(function (value, index) { return (value + previous[index]) | 0; });
        }
        return hash.reduce(function (digest, value) {
            return digest.concat([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
        }, []);
    }

    function xtime(value) {
        return ((value << 1) ^ (value & 0x80 ? 0x11b : 0)) & 255;
    }

    function getAesSbox() {
        if (aesSboxCache) return aesSboxCache;
        var exponents = [];
        var logarithms = [];
        for (var i = 0, value = 1; i < 256; i++) {
            exponents[i] = value;
            logarithms[value] = i;
            value ^= xtime(value);
        }
        aesSboxCache = exponents.map(function (unused, index) {
            var inverse = index === 0 ? 0 : exponents[255 - logarithms[index]];
            var result = inverse;
            for (var rotation = 0; rotation < 4; rotation++) {
                inverse = ((inverse << 1) | (inverse >> 7)) & 255;
                result ^= inverse;
            }
            return result ^ 0x63;
        });
        return aesSboxCache;
    }

    function expandAesKey(key) {
        var sbox = getAesSbox();
        var substitute = function (byte) { return sbox[byte]; };
        var roundKeys = key.slice();
        var roundConstant = 1;
        for (var i = 32; i < 240; i += 4) {
            var word = roundKeys.slice(i - 4, i);
            if (i % 32 === 0) {
                word = [word[1], word[2], word[3], word[0]].map(substitute);
                word[0] ^= roundConstant;
                roundConstant = xtime(roundConstant);
            } else if (i % 32 === 16) {
                word = word.map(substitute);
            }
            for (var k = 0; k < 4; k++) roundKeys.push(roundKeys[i - 32 + k] ^ word[k]);
        }
        return roundKeys;
    }

    function encryptAesBlock(roundKeys, input) {
        var sbox = getAesSbox();
        var state = input.map(function (byte, i) { return byte ^ roundKeys[i]; });
        for (var round = 1; round <= 14; round++) {
            var next = [];
            for (var column = 0; column < 4; column++) {
                for (var row = 0; row < 4; row++) {
                    next[column * 4 + row] = sbox[state[((column + row) % 4) * 4 + row]];
                }
            }
            if (round < 14) {
                var shifted = next;
                next = shifted.map(function (unused, i) {
                    var base = i - (i % 4);
                    var at = function (offset) { return shifted[base + ((i % 4) + offset) % 4]; };
                    return xtime(at(0)) ^ xtime(at(1)) ^ at(1) ^ at(2) ^ at(3);
                });
            }
            var roundOffset = round * 16;
            state = next.map(function (byte, i) { return byte ^ roundKeys[roundOffset + i]; });
        }
        return state;
    }

    function decryptResponse(encodedPayload, nonce) {
        var payload = decodeBase64(String(encodedPayload).replace(/-/g, "+").replace(/_/g, "/"), "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
        var iv = payload.slice(0, 12);
        var ciphertext = payload.slice(12, payload.length - 16);
        var keyBytes = (nonce + "|K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2").split("").map(function (char) { return char.charCodeAt(0); });
        var roundKeys = expandAesKey(sha256(keyBytes));
        var plaintext = [];
        for (var offset = 0; offset < ciphertext.length; offset += 16) {
            var counter = offset / 16 + 2;
            var keystream = encryptAesBlock(roundKeys, iv.concat([(counter >>> 24) & 255, (counter >>> 16) & 255, (counter >>> 8) & 255, counter & 255]));
            ciphertext.slice(offset, offset + 16).forEach(function (byte, i) { plaintext.push(byte ^ keystream[i]); });
        }
        return decodeUtf8(plaintext);
    }

    function generateNonce() {
        var nonce = "";
        for (var i = 0; i < 22; i++) nonce += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(Math.floor(Math.random() * 62));
        return nonce;
    }

    function fetchServerResponse(server, query) {
        var resourcePath = query.isMovie
            ? "/" + server.path + "/movie/" + query.id
            : "/" + server.path + "/tv/" + query.id + "/" + query.season + "/" + query.episode;
        return fetchJson(API_BASE + resourcePath + "?_n=" + generateNonce(), {
            "User-Agent": USER_AGENT,
            "Referer": REFERER,
            "Origin": BASE_URL
        }).then(function (payload) {
            try {
                if (payload && Number(payload.v) === 2 && typeof payload.d === "string") {
                    payload = JSON.parse(decryptResponse(payload.d, payload.n));
                } else if (payload && payload.encrypted && typeof payload.data === "string") {
                    payload = JSON.parse(decodeUtf8(decodeBase64(payload.data, "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/")));
                }
            } catch (e) {
                return null;
            }
            return payload && typeof payload === "object" ? payload : null;
        });
    }

    function extractStreamEntries(payload) {
        var sharedHeaders = payload.headers && typeof payload.headers === "object" ? payload.headers : {};
        var asArray = function (value) { return Array.isArray(value) ? value : []; };
        var sources = [payload.url ? { url: payload.url, quality: payload.quality } : null]
            .concat(asArray(payload.streams), asArray(payload.sources), [payload.data && payload.data.stream && { url: payload.data.stream.playlist }]);
        return sources.filter(function (source) { return source && source.url; }).map(function (source) {
            return {
                url: String(source.url),
                language: String(source.language || ""),
                qualityHint: String(source.quality || ""),
                headers: source.headers && typeof source.headers === "object" ? source.headers : sharedHeaders
            };
        });
    }

    function resolveRelayedPlaylist(relativePath, startIndex) {
        var requests = [];
        for (var attempt = 0; attempt < 3; attempt++) {
            var playlistUrl = WORKERS[(startIndex + attempt) % WORKERS.length] + relativePath;
            requests.push(fetchText(playlistUrl, { "User-Agent": USER_AGENT }));
        }
        return Promise.all(requests).then(function (responses) {
            for (var i = 0; i < responses.length; i++) {
                var response = responses[i];
                if (response && (response.status === 200 || response.status === 206) && /^\s*#EXTM3U/.test(response.text)) {
                    return { url: WORKERS[(startIndex + i) % WORKERS.length] + relativePath, text: response.text };
                }
            }
            return null;
        });
    }

    function detectQuality(text) {
        var value = String(text || "");
        if (/\b(4k|2160p?)\b/i.test(value)) return "2160p";
        var match = value.match(/\b(1080|720|480|360)p?\b/i);
        return match ? match[1] + "p" : "Auto";
    }

    function rankOf(quality) {
        if (quality === "2160p") return 3;
        if (quality === "1080p") return 2;
        if (quality === "Auto") return 1;
        return 0;
    }

    function buildSortPrefix(position) {
        var binary = position.toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (bit) { return bit === "1" ? "\uFEFF" : "\u200B"; }).join("");
    }

    function checkStreamAvailability(candidate) {
        var headers = {};
        Object.keys(candidate.headers).forEach(function (name) { headers[name] = candidate.headers[name]; });
        if (!/\.m3u8(\?|$)/i.test(candidate.url)) headers.Range = "bytes=0-2047";

        return fetchText(candidate.url, headers).then(function (response) {
            if (!response) return { verdict: "unknown" };

            var status = response.status;
            var bodyStart = response.text.replace(/^\uFEFF/, "").replace(/^\s+/, "").slice(0, 600);

            if (status === 200 || status === 206) {
                if (/^#EXTM3U/.test(bodyStart)) return { verdict: "ok", playlistText: response.text };
                if (/<MPD[\s>]/i.test(bodyStart)) return { verdict: "ok" };
                if (/^<(!doctype|html|head|body)/i.test(bodyStart)) return { verdict: "dead" };
                var rangeMatch = response.getHeader("content-range").match(/\/(\d+)\s*$/);
                var contentLength = response.getHeader("content-length");
                return {
                    verdict: "ok",
                    totalBytes: rangeMatch ? Number(rangeMatch[1]) : status === 200 && /^\d+$/.test(contentLength) ? Number(contentLength) : 0
                };
            }
            if (status === 0) {
                return { verdict: /host lookup|ENOTFOUND|getaddrinfo|No address|unreachable/i.test(response.statusText) ? "dead" : "unknown" };
            }
            return { verdict: [401, 403, 426, 427, 429].indexOf(status) !== -1 ? "unknown" : "dead" };
        });
    }

    function labelCodec(codecs, labels) {
        for (var i = 0; i < codecs.length; i++) {
            var codec = codecs[i].trim().toLowerCase();
            for (var j = 0; j < labels.length; j++) {
                if (codec.indexOf(labels[j][0]) === 0) return labels[j][1];
            }
        }
        return "";
    }

    function pickBestVariant(playlistText) {
        var best = { bandwidth: 0, videoCodec: "", audioCodec: "" };
        var pattern = /#EXT-X-STREAM-INF:([^\r\n]*)/g;
        var match;
        while ((match = pattern.exec(playlistText || "")) !== null) {
            var bandwidthMatch = match[1].match(/BANDWIDTH=(\d+)/);
            var bandwidth = bandwidthMatch ? Number(bandwidthMatch[1]) : 0;
            if (bandwidth <= best.bandwidth) continue;
            var codecsMatch = match[1].match(/CODECS="([^"]*)"/);
            var codecs = codecsMatch ? codecsMatch[1].split(",") : [];
            best.bandwidth = bandwidth;
            best.videoCodec = labelCodec(codecs, [["hvc1", "H.265"], ["hev1", "H.265"], ["avc1", "H.264"], ["avc3", "H.264"], ["av01", "AV1"], ["vp09", "VP9"]]);
            best.audioCodec = labelCodec(codecs, [["mp4a", "AAC"], ["ac-3", "AC3"], ["ec-3", "EAC3"], ["opus", "Opus"]]);
        }
        return best;
    }

    function formatBytes(bytes) {
        var gigabytes = bytes / 1073741824;
        return gigabytes >= 1 ? gigabytes.toFixed(2) + " GB" : Math.round(bytes / 1048576) + " MB";
    }

    function describeStream(candidate) {
        var lines = [];
        if (candidate.sizeBytes) lines.push((candidate.totalBytes ? "" : "~") + formatBytes(candidate.sizeBytes));
        var codecs = [candidate.variant.videoCodec, candidate.variant.audioCodec].filter(Boolean);
        if (codecs.length) lines.push(codecs.join(" \u2022 "));
        return lines.join("\n");
    }

    function fetchRuntimeMinutes(query) {
        var apiKey = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "439c478a771f35c05022f9feabcca01c";
        var fetchTmdb = function (path) {
            return fetchJson("https://api.themoviedb.org/3" + path + "?api_key=" + apiKey + "&language=en-US", { "User-Agent": USER_AGENT });
        };
        if (query.isMovie) {
            return fetchTmdb("/movie/" + query.id).then(function (movie) {
                return (movie && movie.runtime) || 0;
            });
        }
        return Promise.all([
            fetchTmdb("/tv/" + query.id + "/season/" + query.season + "/episode/" + query.episode),
            fetchTmdb("/tv/" + query.id)
        ]).then(function (replies) {
            var episodeData = replies[0];
            var show = replies[1];
            return (episodeData && episodeData.runtime) || (show && show.episode_run_time && show.episode_run_time[0]) || 0;
        });
    }

    function flag(value) {
        return value ? 1 : 0;
    }

    function sortStable(items, compare) {
        var decorated = items.map(function (item, index) { return { item: item, index: index }; });
        decorated.sort(function (first, second) {
            return compare(first.item, second.item) || (first.index - second.index);
        });
        return decorated.map(function (entry) { return entry.item; });
    }

    function collectSubtitles(serverResults) {
        var subtitles = [];
        var seen = Object.create(null);
        serverResults.forEach(function (result) {
            if (!result.payload) return;
            (Array.isArray(result.payload.subtitles) ? result.payload.subtitles : []).forEach(function (subtitle) {
                if (!subtitle || !subtitle.url) return;
                var language = String(subtitle.lang || subtitle.label || "Subtitle").replace(/\s+\d+$/, "").trim();
                if (seen[language]) return;
                seen[language] = true;
                var url = String(subtitle.url);
                subtitles.push({
                    url: /^https?:/i.test(url) ? url : WORKERS[0] + (url.charAt(0) === "/" ? "" : "/") + url,
                    language: language,
                    name: language
                });
            });
        });
        var order = ["English", "Hindi", "Urdu", "Arabic", "Bengali", "Tamil", "Telugu", "Malayalam", "Indonesian", "Malay", "Spanish", "French", "Portuguese", "Brazilian", "Turkish"];
        var subtitleRank = function (language) {
            var index = order.indexOf(language);
            return index < 0 ? 99 : index;
        };
        return sortStable(subtitles, function (first, second) {
            return subtitleRank(first.language) - subtitleRank(second.language);
        }).slice(0, 15);
    }

    function toCandidate(entry, server) {
        var quality = detectQuality(entry.qualityHint + " " + entry.url);
        var rank = rankOf(quality);
        var language = entry.language.trim();
        var languageKey = language.toLowerCase();
        if (!rank || (quality === "Auto" && !language)) return null;
        return {
            url: entry.url,
            label: ["VidNest", server.displayName, LANG_LABELS[languageKey] || language].filter(Boolean).join(" \u2022 "),
            groupKey: language ? server.displayName + "|" + languageKey : server.displayName + "||" + entry.url,
            quality: quality,
            headers: sanitizeHeaders(entry.headers),
            isOriginalAudio: !language || languageKey === "original",
            rank: rank,
            isRelayed: false,
            isUnverified: false,
            playlistText: "",
            totalBytes: 0
        };
    }

    function relay(candidate, startIndex) {
        var relativePath = candidate.url.charAt(0) === "/" ? candidate.url : "/" + candidate.url;
        return resolveRelayedPlaylist(relativePath, startIndex).then(function (playlist) {
            if (!playlist) return null;
            candidate.url = playlist.url;
            candidate.playlistText = playlist.text;
            candidate.headers = { "User-Agent": USER_AGENT };
            candidate.isRelayed = true;
            return candidate;
        });
    }

    function gather(serverResults) {
        var direct = [];
        var relays = [];
        var nextRelayIndex = Math.floor(Math.random() * WORKERS.length);
        serverResults.forEach(function (result) {
            if (!result.payload) return;
            extractStreamEntries(result.payload).slice(0, 6).forEach(function (entry) {
                if (/\/embed[\/.]|embed\.php/i.test(entry.url)) return;
                var candidate = toCandidate(entry, result.server);
                if (!candidate) return;
                if (/^https?:/i.test(entry.url)) {
                    direct.push(candidate);
                    return;
                }
                relays.push(relay(candidate, nextRelayIndex++));
            });
        });
        return Promise.all(relays).then(function (relayed) {
            return direct.concat(relayed.filter(Boolean));
        });
    }

    function select(candidates, checks, runtimeMinutes) {
        var bestPerGroup = Object.create(null);
        candidates.forEach(function (candidate, index) {
            var check = checks[index];
            if (check.verdict === "dead") return;
            if (check.playlistText) candidate.playlistText = check.playlistText;
            if (check.totalBytes) candidate.totalBytes = check.totalBytes;
            candidate.isUnverified = check.verdict === "unknown";
            candidate.variant = pickBestVariant(candidate.playlistText);
            candidate.sizeBytes = candidate.totalBytes || (candidate.variant.bandwidth && runtimeMinutes ? (candidate.variant.bandwidth * runtimeMinutes * 60) / 8 : 0);

            var current = bestPerGroup[candidate.groupKey];
            if (!current
                || (current.isUnverified && !candidate.isUnverified)
                || (current.isUnverified === candidate.isUnverified && candidate.sizeBytes > current.sizeBytes)) {
                bestPerGroup[candidate.groupKey] = candidate;
            }
        });

        var winners = Object.keys(bestPerGroup).map(function (key) { return bestPerGroup[key]; });
        var verified = winners.filter(function (candidate) { return !candidate.isUnverified; });
        var keptUncertain = winners.filter(function (candidate) { return candidate.isUnverified; })
            .slice(0, Math.max(0, 3 - Math.min(verified.length, 2)));

        return sortStable(verified.concat(keptUncertain), function (first, second) {
            return (flag(first.isUnverified) - flag(second.isUnverified))
                || (flag(first.quality === "Auto") - flag(second.quality === "Auto"))
                || (flag(second.isOriginalAudio) - flag(first.isOriginalAudio))
                || (second.rank - first.rank);
        });
    }

    function toStreams(ordered, subtitles) {
        var seenUrls = Object.create(null);
        var streams = [];
        ordered.forEach(function (candidate) {
            if (seenUrls[candidate.url]) return;
            seenUrls[candidate.url] = true;

            var sortPrefix = buildSortPrefix(streams.length);
            var stream = {
                name: sortPrefix + candidate.label,
                title: sortPrefix + candidate.label,
                url: candidate.url,
                quality: candidate.quality,
                headers: candidate.headers
            };
            var details = describeStream(candidate);
            if (details) stream.size = details;
            if (subtitles.length) stream.subtitles = subtitles;
            streams.push(stream);
        });
        return streams;
    }

    function makeLookup(server, query) {
        return fetchServerResponse(server, query).then(function (payload) {
            return { server: server, payload: payload };
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (query === null) return Promise.resolve([]);
    try {
        var lookups = [];
        for (var i = 0; i < SERVERS.length; i++) lookups.push(makeLookup(SERVERS[i], query));
        return Promise.all([Promise.all(lookups), fetchRuntimeMinutes(query)]).then(function (replies) {
            var serverResults = replies[0];
            var runtimeMinutes = replies[1];
            return gather(serverResults).then(function (candidates) {
                if (!candidates.length) return [];
                var subtitles = collectSubtitles(serverResults);
                return Promise.all(candidates.map(function (candidate) {
                    return candidate.isRelayed ? Promise.resolve({ verdict: "ok" }) : checkStreamAvailability(candidate);
                })).then(function (checks) {
                    return toStreams(select(candidates, checks, runtimeMinutes), subtitles);
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