function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = 'https://bingebang.st';
    var TMDB_API = 'https://api.themoviedb.org/3';
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var K256 = new Int32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        var isTv = type === 'tv';
        if (isTv && (seasonNumber == null || episodeNumber == null)) return null;
        return { id: id, isTv: isTv, season: seasonNumber, episode: episodeNumber };
    }

    function pageHeaders() {
        return {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: BASE_URL + '/'
        };
    }

    function apiHeaders() {
        return {
            'User-Agent': USER_AGENT,
            Accept: 'application/json, text/plain, */*',
            Referer: BASE_URL + '/'
        };
    }

    function playerHeaders(playUrl, ticket) {
        return {
            'User-Agent': USER_AGENT,
            Accept: 'application/json, text/plain, */*',
            Referer: playUrl,
            Origin: BASE_URL,
            'X-BB-Player': '1',
            'X-BB-Ticket': ticket
        };
    }

    function fetchText(url, headers) {
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headers });
        }).then(function (res) {
            return res.ok ? res.text() : null;
        }).then(null, function () {
            return null;
        });
    }

    function parseJson(text) {
        if (text === null || text === undefined) return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function fetchJson(url, headers) {
        return fetchText(url, headers).then(parseJson);
    }

    function absUrl(p) {
        if (!p || /^https?:/i.test(p)) return p;
        return p.charAt(0) === '/' ? BASE_URL + p : BASE_URL + '/' + p;
    }

    function utf8Bytes(str) {
        var out = [];
        var text = String(str);
        var i, code, next;
        for (i = 0; i < text.length; i++) {
            code = text.charCodeAt(i);
            if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
                next = text.charCodeAt(i + 1);
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
        var escaped = '';
        var raw = '';
        var i, hex;
        for (i = 0; i < bytes.length; i++) {
            hex = bytes[i].toString(16);
            escaped += '%' + (hex.length < 2 ? '0' + hex : hex);
            raw += String.fromCharCode(bytes[i]);
        }
        try {
            return decodeURIComponent(escaped).replace(/^﻿/, '');
        } catch (e) {
            return raw;
        }
    }

    function rotr(x, n) {
        return (x >>> n) | (x << (32 - n));
    }

    function putWord(bytes, offset, value) {
        bytes[offset] = (value >>> 24) & 255;
        bytes[offset + 1] = (value >>> 16) & 255;
        bytes[offset + 2] = (value >>> 8) & 255;
        bytes[offset + 3] = value & 255;
    }

    function sha256(bytes) {
        var len = bytes.length;
        var padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
        var H = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        var w = new Int32Array(64);
        var out = new Uint8Array(32);
        var off, i, p, s0, s1, a, b, c, d, e, f, g, h, t1, t2;

        padded.set(bytes);
        padded[len] = 0x80;
        putWord(padded, padded.length - 8, Math.floor((len * 8) / 4294967296));
        putWord(padded, padded.length - 4, (len * 8) >>> 0);

        for (off = 0; off < padded.length; off += 64) {
            for (i = 0; i < 16; i++) {
                p = off + i * 4;
                w[i] = (padded[p] << 24) | (padded[p + 1] << 16) | (padded[p + 2] << 8) | padded[p + 3];
            }
            for (i = 16; i < 64; i++) {
                s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            a = H[0];
            b = H[1];
            c = H[2];
            d = H[3];
            e = H[4];
            f = H[5];
            g = H[6];
            h = H[7];
            for (i = 0; i < 64; i++) {
                t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
                t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
                h = g;
                g = f;
                f = e;
                e = (d + t1) | 0;
                d = c;
                c = b;
                b = a;
                a = (t1 + t2) | 0;
            }
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        }

        for (i = 0; i < 8; i++) putWord(out, i * 4, H[i]);
        return out;
    }

    function base64UrlDecode(value) {
        var text = value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
        var bytes = [];
        var buffer = 0;
        var bits = 0;
        var i, index;
        if (text.length % 4 === 1) throw new Error('base64');
        for (i = 0; i < text.length; i++) {
            index = B64.indexOf(text.charAt(i));
            if (index < 0) throw new Error('base64');
            buffer = (buffer << 6) | index;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                bytes.push((buffer >> bits) & 255);
                buffer &= (1 << bits) - 1;
            }
        }
        return new Uint8Array(bytes);
    }

    function parseNumList(s) {
        return s.split(',').map(function (x) {
            return parseInt(x, 10);
        }).filter(function (x) {
            return !isNaN(x);
        });
    }

    function decryptXorBlock(html) {
        var km, dm, key, data, bytes, i;
        if (!html) return null;
        km = /k\s*=\s*\[([0-9,\s]+)\]/.exec(html);
        dm = /d\s*=\s*\[([0-9,\s]+)\]/.exec(html);
        if (!km || !dm) return null;
        key = parseNumList(km[1]);
        data = parseNumList(dm[1]);
        if (!key.length || !data.length) return null;
        bytes = [];
        for (i = 0; i < data.length; i++) bytes.push((data[i] ^ key[i % key.length]) & 255);
        return utf8String(bytes);
    }

    function decryptPayload(body, ticket) {
        var m = /"enc":"([^"]+)"/.exec(body);
        var raw, payload, k, v, seed, block, out, pos, counter, stream, n, i;
        if (!m) return body;
        try {
            raw = base64UrlDecode(m[1]);
        } catch (e) {
            return body;
        }
        if (raw.length <= 48) return body;

        payload = raw.subarray(16);
        k = [199, 71, 13, 231, 255, 68, 237];
        v = [254, 34, 63, 133, 200, 39, 217, 246, 38, 61, 129, 201, 32, 213, 242, 37, 62, 132, 206, 33, 218, 166, 126, 57, 129, 205, 113, 137, 247, 37, 53, 209];
        seed = '';
        for (i = 0; i < v.length; i++) seed += String.fromCharCode(v[i] ^ k[i % k.length]);
        block = new Uint8Array(52);
        block.set(sha256(utf8Bytes(seed + ticket)));
        block.set(raw.subarray(0, 16), 32);
        out = [];

        for (pos = 0, counter = 0; pos < payload.length; pos += 32, counter++) {
            putWord(block, 48, counter);
            stream = sha256(block);
            n = Math.min(32, payload.length - pos);
            for (i = 0; i < n; i++) out.push(payload[pos + i] ^ stream[i]);
        }
        return utf8String(out);
    }

    function norm(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function normalizeQuality(raw) {
        var s = String(raw || '').toLowerCase();
        if (s.indexOf('2160') !== -1 || s.indexOf('4k') !== -1) return { label: '2160p', rank: 4 };
        if (s.indexOf('1080') !== -1 || s.indexOf('full hd') !== -1) return { label: '1080p', rank: 3 };
        return null;
    }

    function sortTag(rank) {
        var bin = (5 - rank).toString(2);
        var out = '';
        var i;
        while (bin.length < 20) bin = '0' + bin;
        for (i = 0; i < bin.length; i++) out += bin.charAt(i) === '1' ? '﻿' : '​';
        return out;
    }

    function tmdbInfo(id, isTv) {
        var url = TMDB_API + '/' + (isTv ? 'tv' : 'movie') + '/' + id + '?api_key=' + TMDB_KEY;
        return fetchJson(url, { Accept: 'application/json' }).then(function (d) {
            var date, raw, names, i;
            if (!d) return null;
            date = d.release_date || d.first_air_date || '';
            raw = [d.title || d.name, d.original_title || d.original_name];
            names = [];
            for (i = 0; i < raw.length; i++) {
                if (raw[i] && names.indexOf(raw[i]) === -1) names.push(raw[i]);
            }
            return { names: names, year: parseInt(date.slice(0, 4), 10) || null };
        });
    }

    function searchWatchUrl(name, info, id, isTv) {
        return fetchJson(BASE_URL + '/api/search/multi?query=' + encodeURIComponent(name), apiHeaders()).then(function (d) {
            var res, wanted, best, bestScore, i, r, t, score;
            if (!d) return null;
            res = (d.results || []).filter(function (item) {
                return item && item.url && (item.media_type === 'tv') === isTv;
            });
            for (i = 0; i < res.length; i++) {
                if (String(res[i].id) === String(id) || String(res[i].tmdb_id) === String(id)) return res[i].url;
            }
            wanted = norm(name);
            best = null;
            bestScore = 0;
            for (i = 0; i < res.length; i++) {
                r = res[i];
                t = norm(r.title || r.name);
                score = 0;
                if (t === wanted) score = 100;
                else if (t.indexOf(wanted) === 0 || wanted.indexOf(t) === 0) score = 60;
                if (score && info.year && r.year && Math.abs(r.year - info.year) <= 1) score += 20;
                if (score > bestScore) {
                    bestScore = score;
                    best = r;
                }
            }
            return bestScore >= 60 ? best.url : null;
        }).then(null, function () {
            return null;
        });
    }

    function findWatchUrl(info, id, isTv) {
        return Promise.all(info.names.map(function (name) {
            return searchWatchUrl(name, info, id, isTv);
        })).then(function (results) {
            var i;
            for (i = 0; i < results.length; i++) {
                if (results[i]) return results[i];
            }
            return null;
        });
    }

    function isArabicSub(s) {
        var code = String(s.lang || '').toLowerCase();
        var label = String(s.label || '');
        return code === 'ar' || code === 'ara' || /arab/i.test(label) || label.indexOf('عرب') !== -1;
    }

    function resolveRaw(src, headers, ticket) {
        return fetchText(BASE_URL + '/api/player/resolve?src=' + encodeURIComponent(src), headers).then(function (body) {
            var r;
            if (body === null) return null;
            r = parseJson(decryptPayload(body, ticket));
            return r && r.url ? r : null;
        });
    }

    function resolveServer(server, index, headers, ticket) {
        var src = server && server.source_url;
        if (!src) return Promise.resolve(null);
        return resolveRaw(src, headers, ticket).then(function (r) {
            var subtitles = [];
            var list, i, s, label, quality, tag;
            if (!r) return null;
            list = r.subtitles || [];
            for (i = 0; i < list.length; i++) {
                s = list[i];
                if (!s || !s.url || !isArabicSub(s)) continue;
                subtitles.push({ url: s.url, language: 'Arabic', name: 'Arabic' });
            }
            label = server.label || 'Server ' + (index + 1);
            quality = normalizeQuality(server.quality || r.quality);
            if (!quality) return null;
            tag = sortTag(quality.rank);
            return {
                name: tag + 'BingeBang • ' + label,
                title: tag + 'BingeBang • ' + label,
                url: r.url,
                quality: quality.label,
                headers: { Referer: BASE_URL + '/', 'User-Agent': USER_AGENT },
                subtitles: subtitles
            };
        }).then(null, function () {
            return null;
        });
    }

    function unique(list) {
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < list.length; i++) {
            if (!list[i] || seen[list[i].url] === true) continue;
            seen[list[i].url] = true;
            out.push(list[i]);
        }
        return out;
    }

    function loadServers(playUrl) {
        return fetchText(playUrl, pageHeaders()).then(function (html) {
            var cfg = decryptXorBlock(html);
            var tm = cfg && /ticket:\s*"([^"]+)"/.exec(cfg);
            var ticket, headers;
            if (!tm) return [];
            ticket = tm[1];
            headers = playerHeaders(playUrl, ticket);
            return fetchText(BASE_URL + '/api/player/sources', headers).then(function (body) {
                var payload, servers;
                if (body === null) return [];
                payload = parseJson(decryptPayload(body, ticket));
                servers = (payload && payload.servers) || [];
                return Promise.all(servers.map(function (sv, i) {
                    return resolveServer(sv, i, headers, ticket);
                })).then(unique);
            });
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return Promise.resolve().then(function () {
        return tmdbInfo(query.id, query.isTv);
    }).then(function (info) {
        if (!info) return null;
        return findWatchUrl(info, query.id, query.isTv);
    }).then(function (watch) {
        var playBase, playUrl;
        if (!watch) return [];
        playBase = absUrl(watch).replace('/watch/', '/play/');
        playUrl = query.isTv ? playBase + '/' + query.season + '/' + query.episode : playBase;
        return loadServers(playUrl);
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };