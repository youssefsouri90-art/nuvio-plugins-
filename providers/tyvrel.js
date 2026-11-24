function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = 'https://nxsha.space';
    var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
    var SERVERS = [
        { id: 'nitro', label: 'Nitro' },
        { id: 'streamflix', label: 'StremFx' },
        { id: 'castle', label: 'CastVid' },
        { id: 'rive-citadel', label: 'Citadel' }
    ];
    var LANGUAGES = [
        'english', 'hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'bangla', 'punjabi',
        'marathi', 'gujarati', 'urdu', 'korean', 'japanese', 'chinese', 'spanish', 'french', 'german',
        'russian', 'arabic', 'turkish', 'thai', 'indonesian', 'portuguese', 'italian'
    ];
    var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var HEADERS = {
        'User-Agent': USER_AGENT,
        'Referer': BASE_URL + '/',
        'Accept-Language': 'en-US,en;q=0.9'
    };
    var SBOX = [];
    var INV_SBOX = [];
    var passphrase = '38c8cd65d781936f4b9fe1fd985234fd7335699855051abf76ea3493bcfc0120';
    var refreshing = null;
    var lastRefresh = 0;

    function clean(value) {
        return value == null ? '' : String(value);
    }

    function merge(first, second) {
        var out = {};
        Object.keys(first).forEach(function (key) { out[key] = first[key]; });
        Object.keys(second).forEach(function (key) { out[key] = second[key]; });
        return out;
    }

    function capitalize(word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    function labelOf(id) {
        for (var i = 0; i < SERVERS.length; i++) {
            if (SERVERS[i].id === id) return SERVERS[i].label;
        }
        return null;
    }

    function allMatches(text, pattern) {
        var out = [];
        var found = pattern.exec(text);
        while (found !== null) {
            out.push(found[1]);
            found = pattern.exec(text);
        }
        return out;
    }

    function utf8Bytes(text) {
        var out = [];
        var str = String(text);
        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            if (code >= 0xd800 && code < 0xdc00 && i + 1 < str.length) {
                var next = str.charCodeAt(i + 1);
                if (next >= 0xdc00 && next < 0xe000) {
                    code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                    i++;
                }
            }
            if (code < 0x80) out.push(code);
            else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
            else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
            else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
        return out;
    }

    function utf8String(bytes) {
        var out = '';
        var i = 0;
        while (i < bytes.length) {
            var b = bytes[i++];
            var code;
            if (b < 0x80) code = b;
            else if (b < 0xe0) code = ((b & 31) << 6) | (bytes[i++] & 63);
            else if (b < 0xf0) code = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            else code = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            if (code > 0xffff) {
                code -= 0x10000;
                out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023));
            } else {
                out += String.fromCharCode(code);
            }
        }
        return out;
    }

    function bytesToBase64(bytes) {
        var out = '';
        for (var i = 0; i < bytes.length; i += 3) {
            var a = bytes[i];
            var b = i + 1 < bytes.length ? bytes[i + 1] : 0;
            var c = i + 2 < bytes.length ? bytes[i + 2] : 0;
            out += ALPHABET.charAt(a >> 2) + ALPHABET.charAt(((a & 3) << 4) | (b >> 4));
            out += i + 1 < bytes.length ? ALPHABET.charAt(((b & 15) << 2) | (c >> 6)) : '=';
            out += i + 2 < bytes.length ? ALPHABET.charAt(c & 63) : '=';
        }
        return out;
    }

    function base64ToBytes(text) {
        var str = String(text).replace(/[^A-Za-z0-9+/]/g, '');
        var out = [];
        var bits = 0;
        var acc = 0;
        for (var i = 0; i < str.length; i++) {
            acc = (acc << 6) | ALPHABET.indexOf(str.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((acc >> bits) & 255);
            }
        }
        return out;
    }

    function md5(input) {
        var shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        var K = [];
        var i;
        for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

        var bytes = input.slice();
        var bitLen = input.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        for (i = 0; i < 8; i++) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 255 : 0);

        var a0 = 0x67452301;
        var b0 = 0xefcdab89;
        var c0 = 0x98badcfe;
        var d0 = 0x10325476;

        for (var offset = 0; offset < bytes.length; offset += 64) {
            var M = [];
            for (i = 0; i < 16; i++) {
                var p = offset + i * 4;
                M[i] = (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0;
            }
            var A = a0;
            var B = b0;
            var C = c0;
            var D = d0;
            for (i = 0; i < 64; i++) {
                var F;
                var g;
                if (i < 16) { F = (B & C) | (~B & D); g = i; }
                else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
                else { F = C ^ (B | ~D); g = (7 * i) % 16; }
                F = (F + A + K[i] + M[g]) >>> 0;
                A = D;
                D = C;
                C = B;
                var s = shifts[(i >> 4) * 4 + (i % 4)];
                B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
            }
            a0 = (a0 + A) >>> 0;
            b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0;
            d0 = (d0 + D) >>> 0;
        }

        var out = [];
        var words = [a0, b0, c0, d0];
        for (var w = 0; w < 4; w++) {
            for (i = 0; i < 4; i++) out.push((words[w] >>> (8 * i)) & 255);
        }
        return out;
    }

    function rotateLeft(x, n) {
        return ((x << n) | (x >> (8 - n))) & 255;
    }

    function buildSboxes() {
        var p = 1;
        var q = 1;
        do {
            p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
            q ^= q << 1;
            q ^= q << 2;
            q ^= q << 4;
            q &= 255;
            if (q & 0x80) q ^= 0x09;
            var x = q ^ rotateLeft(q, 1) ^ rotateLeft(q, 2) ^ rotateLeft(q, 3) ^ rotateLeft(q, 4);
            SBOX[p] = (x ^ 0x63) & 255;
        } while (p !== 1);
        SBOX[0] = 0x63;
        for (var i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
    }

    function gmul(a, b) {
        var result = 0;
        for (var i = 0; i < 8; i++) {
            if (b & 1) result ^= a;
            var hi = a & 0x80;
            a = (a << 1) & 255;
            if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return result;
    }

    function expandKey(key) {
        var words = [];
        var i;
        for (i = 0; i < 8; i++) words.push(key.slice(i * 4, i * 4 + 4));
        var rcon = 1;
        for (i = 8; i < 60; i++) {
            var temp = words[i - 1].slice();
            if (i % 8 === 0) {
                temp = [SBOX[temp[1]] ^ rcon, SBOX[temp[2]], SBOX[temp[3]], SBOX[temp[0]]];
                rcon = gmul(rcon, 2);
            } else if (i % 8 === 4) {
                temp = temp.map(function (b) { return SBOX[b]; });
            }
            words.push(words[i - 8].map(function (b, j) { return b ^ temp[j]; }));
        }
        var rounds = [];
        for (var r = 0; r < 15; r++) {
            rounds.push([].concat(words[r * 4], words[r * 4 + 1], words[r * 4 + 2], words[r * 4 + 3]));
        }
        return rounds;
    }

    function addRoundKey(state, key) {
        for (var i = 0; i < 16; i++) state[i] ^= key[i];
    }

    function encryptBlock(block, rounds) {
        var s = block.slice();
        addRoundKey(s, rounds[0]);
        for (var r = 1; r <= 14; r++) {
            var i;
            var c;
            for (i = 0; i < 16; i++) s[i] = SBOX[s[i]];
            var t = s.slice();
            for (c = 0; c < 4; c++) {
                for (var row = 0; row < 4; row++) s[c * 4 + row] = t[((c + row) % 4) * 4 + row];
            }
            if (r < 14) {
                for (c = 0; c < 4; c++) {
                    var a = s.slice(c * 4, c * 4 + 4);
                    s[c * 4] = gmul(a[0], 2) ^ gmul(a[1], 3) ^ a[2] ^ a[3];
                    s[c * 4 + 1] = a[0] ^ gmul(a[1], 2) ^ gmul(a[2], 3) ^ a[3];
                    s[c * 4 + 2] = a[0] ^ a[1] ^ gmul(a[2], 2) ^ gmul(a[3], 3);
                    s[c * 4 + 3] = gmul(a[0], 3) ^ a[1] ^ a[2] ^ gmul(a[3], 2);
                }
            }
            addRoundKey(s, rounds[r]);
        }
        return s;
    }

    function decryptBlock(block, rounds) {
        var s = block.slice();
        addRoundKey(s, rounds[14]);
        for (var r = 13; r >= 0; r--) {
            var i;
            var c;
            var t = s.slice();
            for (c = 0; c < 4; c++) {
                for (var row = 0; row < 4; row++) s[((c + row) % 4) * 4 + row] = t[c * 4 + row];
            }
            for (i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
            addRoundKey(s, rounds[r]);
            if (r > 0) {
                for (c = 0; c < 4; c++) {
                    var a = s.slice(c * 4, c * 4 + 4);
                    s[c * 4] = gmul(a[0], 14) ^ gmul(a[1], 11) ^ gmul(a[2], 13) ^ gmul(a[3], 9);
                    s[c * 4 + 1] = gmul(a[0], 9) ^ gmul(a[1], 14) ^ gmul(a[2], 11) ^ gmul(a[3], 13);
                    s[c * 4 + 2] = gmul(a[0], 13) ^ gmul(a[1], 9) ^ gmul(a[2], 14) ^ gmul(a[3], 11);
                    s[c * 4 + 3] = gmul(a[0], 11) ^ gmul(a[1], 13) ^ gmul(a[2], 9) ^ gmul(a[3], 14);
                }
            }
        }
        return s;
    }

    function deriveKeyIv(secret, salt) {
        var pass = utf8Bytes(secret);
        var block = [];
        var derived = [];
        while (derived.length < 48) {
            block = md5(block.concat(pass, salt));
            derived = derived.concat(block);
        }
        return { key: derived.slice(0, 32), iv: derived.slice(32, 48) };
    }

    function randomBytes(length) {
        var out = [];
        for (var i = 0; i < length; i++) out.push(Math.floor(Math.random() * 256));
        return out;
    }

    function aesEncrypt(plaintext, secret) {
        var salt = randomBytes(8);
        var derived = deriveKeyIv(secret, salt);
        var rounds = expandKey(derived.key);
        var data = utf8Bytes(plaintext);
        var pad = 16 - (data.length % 16);
        var i;
        for (i = 0; i < pad; i++) data.push(pad);

        var out = [];
        var prev = derived.iv;
        for (var offset = 0; offset < data.length; offset += 16) {
            var block = data.slice(offset, offset + 16).map(function (b, j) { return b ^ prev[j]; });
            prev = encryptBlock(block, rounds);
            for (i = 0; i < 16; i++) out.push(prev[i]);
        }
        return bytesToBase64(utf8Bytes('Salted__').concat(salt, out));
    }

    function aesDecrypt(base64, secret) {
        var raw = base64ToBytes(base64);
        var salt = raw.slice(8, 16);
        var data = raw.slice(16);
        var derived = deriveKeyIv(secret, salt);
        var rounds = expandKey(derived.key);

        var out = [];
        var prev = derived.iv;
        for (var offset = 0; offset + 16 <= data.length; offset += 16) {
            var block = data.slice(offset, offset + 16);
            var plain = decryptBlock(block, rounds);
            for (var i = 0; i < 16; i++) out.push(plain[i] ^ prev[i]);
            prev = block;
        }
        var pad = out[out.length - 1];
        return utf8String(out.slice(0, out.length - pad));
    }

    function toBase64Url(base64) {
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function fromBase64Url(token) {
        var base64 = String(token).replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        return base64;
    }

    function encryptPayload(payload) {
        var stamped = merge(payload, {
            _req_ts: Date.now(),
            _req_salt: Math.random().toString(36).slice(2, 10)
        });
        return toBase64Url(aesEncrypt(JSON.stringify(stamped), passphrase));
    }

    function tryDecrypt(token) {
        try {
            var parsed = JSON.parse(aesDecrypt(fromBase64Url(token), passphrase));
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function send(url, headers) {
        return new Promise(function (resolve) {
            resolve(fetch(url, { headers: headers }));
        });
    }

    function fetchText(url) {
        return send(url, HEADERS).then(function (response) {
            return response.ok ? response.text() : '';
        }).then(null, function () {
            return '';
        });
    }

    function fetchJson(url) {
        return send(url, HEADERS).then(function (response) {
            return response.ok ? response.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function scanChunks(paths, seen, candidates) {
        var todo = paths.filter(function (path) { return seen.indexOf(path) === -1; }).slice(0, 16);
        todo.forEach(function (path) { seen.push(path); });
        return Promise.all(todo.map(function (path) {
            return fetchText(BASE_URL + '/_next/' + path);
        })).then(function (bodies) {
            var next = [];
            bodies.forEach(function (body) {
                allMatches(body, /"([0-9a-f]{64})"/g).forEach(function (key) {
                    if (candidates.indexOf(key) === -1) candidates.push(key);
                });
                next = next.concat(allMatches(body, /"(static\/chunks\/[A-Za-z0-9_.-]+\.js)"/g));
            });
            return next;
        });
    }

    function findPassphrase(sample) {
        var seen = [];
        var candidates = [];
        return fetchText(BASE_URL + '/embed/movie/27205').then(function (page) {
            return scanChunks(allMatches(page, /\/_next\/(static\/chunks\/[A-Za-z0-9_.-]+\.js)/g), seen, candidates);
        }).then(function (more) {
            if (candidates.length) return null;
            return scanChunks(more, seen, candidates);
        }).then(function () {
            var previous = passphrase;
            for (var i = 0; i < candidates.length; i++) {
                if (candidates[i] === previous) continue;
                passphrase = candidates[i];
                if (tryDecrypt(sample)) return true;
            }
            passphrase = previous;
            return false;
        });
    }

    function refreshPassphrase(sample) {
        if (refreshing) return refreshing;
        if (Date.now() - lastRefresh < 10 * 60 * 1000) return Promise.resolve(false);
        lastRefresh = Date.now();
        refreshing = findPassphrase(sample).then(function (found) {
            refreshing = null;
            return found;
        }, function () {
            refreshing = null;
            return false;
        });
        return refreshing;
    }

    function decryptPayload(token) {
        var result = tryDecrypt(token);
        if (result || !token) return Promise.resolve(result || {});
        return refreshPassphrase(token).then(function (refreshed) {
            if (refreshed) result = tryDecrypt(token);
            return result || {};
        });
    }

    function callApi(endpoint, payload) {
        return fetchJson(BASE_URL + '/api/' + endpoint + '?q=' + encryptPayload(payload)).then(function (response) {
            return response ? decryptPayload(response._hash) : {};
        });
    }

    function normalizeEpisode(value) {
        var number = parseInt(value, 10);
        return number >= 800 ? (number % 100) + 1 + (Math.floor(number / 100) - 8) * 2 : number;
    }

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        var text = clean(id);
        if (!/^\d+$/.test(text)) return null;
        if (type !== 'tv') return { tmdbId: text, imdb_id: '', type: 'movie', season: 0, episode: 0 };
        if (seasonNumber == null || episodeNumber == null) return null;
        var parsedSeason = Number(seasonNumber);
        var parsedEpisode = normalizeEpisode(episodeNumber);
        if (isNaN(parsedSeason) || isNaN(parsedEpisode)) return null;
        return { tmdbId: text, imdb_id: '', type: 'tv', season: parsedSeason, episode: parsedEpisode };
    }

    function audioTracks(label) {
        return LANGUAGES.filter(function (language) {
            return new RegExp('\\b' + language + '\\b', 'i').test(label);
        });
    }

    function isNoiseWord(word) {
        return LANGUAGES.indexOf(word.toLowerCase()) !== -1
            || /^(nitro|multi|dual|audio|org|original|dubbed|subbed|subs?|hin|eng|web-?dl|web-?rip|blu-?ray|brrip|hdrip|hdtv|dvdrip|hdcam|cam|hq|hd|uhd)$/i.test(word);
    }

    function isQualityOnly(token) {
        return /^(?:\d{3,4}p?|4k|auto|[,\s])+$/i.test(token);
    }

    function isAudioOnly(token) {
        return token.split(/[\s,&+\/]+/).filter(Boolean).every(isNoiseWord);
    }

    function nitroTag(label) {
        var tokens = label
            .replace(/^\[[^\]]+\]\s*-?\s*/, '')
            .split(/[|:]/)
            .map(function (token) { return token.trim(); })
            .filter(Boolean);
        for (var i = 0; i < tokens.length; i++) {
            if (isQualityOnly(tokens[i]) || isAudioOnly(tokens[i])) continue;
            var lower = tokens[i].toLowerCase();
            if (lower === 'hevc') return 'HEVC';
            if (lower === 'atmos') return 'Atmos';
            return tokens[i];
        }
        return '';
    }

    function qualityOf(text) {
        if (/2160|4k/i.test(text)) return '2160p';
        if (/1080/i.test(text)) return '1080p';
        if (/720/i.test(text)) return '720p';
        if (/\b(480|360|240)p?\b/i.test(text)) return null;
        return 'Auto';
    }

    function streamName(serverLabel, tag, languages) {
        var suffix = languages.map(capitalize).join(' \u2022 ');
        return ['Nxsha', serverLabel, tag || suffix].filter(Boolean).join(' \u2022 ');
    }

    function isHindi(source) {
        return /hindi/i.test(clean(source.label));
    }

    function isUsable(source) {
        return Boolean(source && source.url)
            && !/embed/i.test(clean(source.type))
            && !/\bsub\b/i.test(clean(source.label));
    }

    function sourcesOf(server, query) {
        var payload = merge({ ex_lang: true, provider: server.scraper }, query);
        return callApi('sources', payload).then(function (result) {
            return (result.sources || []).map(function (source) {
                return { server: server, source: source };
            });
        });
    }

    function collect(query) {
        return callApi('servers', query).then(function (result) {
            var servers = (result.servers || []).filter(function (server) {
                return server && labelOf(server.scraper) !== null;
            });
            return Promise.all(servers.map(function (server) {
                return sourcesOf(server, query);
            }));
        }).then(function (lists) {
            return lists.reduce(function (all, list) { return all.concat(list); }, []);
        });
    }

    function dedupe(entries) {
        var paths = [];
        var kept = [];
        entries.forEach(function (entry) {
            if (!isUsable(entry.source)) return;
            var path = String(entry.source.url).split('?')[0];
            var index = paths.indexOf(path);
            if (index === -1) {
                paths.push(path);
                kept.push(entry);
            } else if (!isHindi(kept[index].source) && isHindi(entry.source)) {
                kept[index] = entry;
            }
        });
        return kept;
    }

    function buildCandidates(entries) {
        var regular = [];
        var nitroKeys = [];
        var nitroBest = [];
        var counts = {};

        entries.forEach(function (entry) {
            var server = entry.server;
            var source = entry.source;
            var label = clean(source.label || source.quality);
            if (/hguide/i.test(label + ' ' + (source.provider || '') + ' ' + (source.url || ''))) return;
            var quality = qualityOf(label + ' ' + (source.quality || ''));
            if (!quality) return;

            var id = labelOf(source.provider) !== null ? source.provider : server.scraper;
            var base = { server: id, url: source.url, quality: quality, headers: HEADERS };
            var languages = audioTracks(label);

            if (id !== 'nitro') {
                var count = counts[id] || 0;
                if (count >= 3) return;
                counts[id] = count + 1;
                base.name = streamName(labelOf(id), '', languages);
                regular.push(base);
                return;
            }

            var tag = nitroTag(label);
            base.name = streamName(labelOf(id), tag, languages);
            var key = tag ? tag.toLowerCase() : '~' + languages.join('+');
            var rank = (parseInt(quality, 10) || 0) * 10 + Math.min(languages.length, 9);
            var index = nitroKeys.indexOf(key);
            if (index === -1) {
                nitroKeys.push(key);
                nitroBest.push({ stream: base, rank: rank });
            } else if (rank > nitroBest[index].rank) {
                nitroBest[index] = { stream: base, rank: rank };
            }
        });

        return regular.concat(nitroBest.map(function (best) { return best.stream; }));
    }

    function probe(stream) {
        return send(stream.url, merge(stream.headers, { Range: 'bytes=0-2047' })).then(function (response) {
            if (response.status !== 200 && response.status !== 206) {
                return [0, 401, 403, 429].indexOf(response.status) !== -1 ? 'unknown' : 'dead';
            }
            if (/html/i.test(response.headers.get('content-type') || '')) return 'dead';
            if (!/\.(m3u8|mpd)/i.test(stream.url)) return 'ok';
            return response.text().then(function (text) {
                var body = clean(text).replace(/^\uFEFF/, '').trim().slice(0, 600);
                return /^<(!doctype|html|head|body)/i.test(body) ? 'dead' : 'ok';
            });
        }).then(null, function () {
            return 'unknown';
        });
    }

    function select(streams) {
        return Promise.all(streams.map(probe)).then(function (verdicts) {
            function withVerdict(verdict) {
                return streams.filter(function (stream, index) { return verdicts[index] === verdict; });
            }
            var playable = withVerdict('ok');
            var uncertain = withVerdict('unknown').slice(0, 6 - Math.min(playable.length, 2));
            return playable.concat(uncertain);
        });
    }

    function singleStremFx(streams) {
        var taken = false;
        return streams.filter(function (stream) {
            if (stream.server !== 'streamflix') return true;
            if (taken) return false;
            taken = true;
            return true;
        });
    }

    function toStream(candidate, suffix) {
        var name = candidate.name + suffix;
        return { name: name, title: name, quality: candidate.quality, url: candidate.url, headers: candidate.headers };
    }

    function gather(query) {
        return collect(query).then(function (entries) {
            var candidates = buildCandidates(dedupe(entries));
            if (!candidates.length) return [];
            return select(candidates).then(function (verified) {
                var playable = singleStremFx(verified);
                if (playable.length) return playable.map(function (stream) { return toStream(stream, ''); });
                return singleStremFx(candidates).slice(0, 12).map(function (stream) {
                    return toStream(stream, ' (unverified)');
                });
            });
        });
    }

    buildSboxes();

    return Promise.resolve().then(function () {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        return query ? gather(query) : [];
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };