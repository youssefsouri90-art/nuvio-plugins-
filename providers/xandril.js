function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "AniChan";
    var BASE_URL = "https://anichan.to";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Linux; Android 17; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36";
    var HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
    var SERVER_NAMES = Object.create(null);
    SERVER_NAMES.echovideo = "EchoVideo";
    SERVER_NAMES.vidstream = "VidStream";
    SERVER_NAMES.zoko = "Zoko";
    SERVER_NAMES.kaa = "Kaa";
    var SERVER_ORDER = ["anichan", "vidstream", "echovideo", "hd-1", "hd-2", "kaa", "zoko"];

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!TMDB_KEY) return null;
        if (mediaType === "movie") {
            return { tmdbId: tmdbId, mediaType: "movie", season: null, episode: null };
        }
        if (season == null || episode == null || season < 1) return null;
        return { tmdbId: tmdbId, mediaType: "tv", season: Number(season), episode: Number(episode) };
    }

    function request(url, headers, type) {
        return fetch(url, { headers: headers }).then(function (res) {
            return res.ok ? res[type]() : null;
        }).then(null, function () {
            return null;
        });
    }

    function getJson(url, headers) {
        return request(url, headers, "json");
    }

    function getText(url, headers) {
        return request(url, headers, "text");
    }

    function api(path) {
        return getJson(BASE_URL + path, HEADERS);
    }

    function isHttp(u) {
        return String(u).indexOf("http") === 0;
    }

    function merge(a, b) {
        var out = {};
        var ka = Object.keys(a);
        var kb = Object.keys(b);
        var i;
        for (i = 0; i < ka.length; i++) out[ka[i]] = a[ka[i]];
        for (i = 0; i < kb.length; i++) out[kb[i]] = b[kb[i]];
        return out;
    }

    function b64ToBytes(text) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var s = String(text).replace(/[^A-Za-z0-9+\/]/g, "");
        var out = new Uint8Array(Math.floor((s.length * 3) / 4));
        var acc = 0;
        var bits = 0;
        var n = 0;
        for (var i = 0; i < s.length; i++) {
            acc = (acc << 6) | alphabet.indexOf(s.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out[n++] = (acc >> bits) & 0xff;
                acc &= (1 << bits) - 1;
            }
        }
        return out;
    }

    function asciiBytes(s) {
        var out = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
        return out;
    }

    function xorBytes(a, b) {
        var out = new Uint8Array(a.length);
        for (var i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
        return out;
    }

    function utf8Decode(bytes) {
        var hex = "0123456789ABCDEF";
        var encoded = "";
        var raw = "";
        for (var i = 0; i < bytes.length; i++) {
            encoded += "%" + hex.charAt(bytes[i] >> 4) + hex.charAt(bytes[i] & 15);
            raw += String.fromCharCode(bytes[i]);
        }
        try {
            return decodeURIComponent(encoded);
        } catch (e) {
            return raw;
        }
    }

    function getU32(buf, off) {
        return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
    }

    function putU32(buf, off, value) {
        buf[off] = (value >>> 24) & 0xff;
        buf[off + 1] = (value >>> 16) & 0xff;
        buf[off + 2] = (value >>> 8) & 0xff;
        buf[off + 3] = value & 0xff;
    }

    function rotr(x, n) {
        return (x >>> n) | (x << (32 - n));
    }

    function sha256(data) {
        var K = new Uint32Array([
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ]);
        var h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        var len = data.length;
        var total = ((len + 9 + 63) >> 6) << 6;
        var buf = new Uint8Array(total);
        buf.set(data);
        buf[len] = 0x80;
        putU32(buf, total - 8, Math.floor(len / 0x20000000));
        putU32(buf, total - 4, (len << 3) >>> 0);
        var w = new Uint32Array(64);
        var off;
        var i;
        for (off = 0; off < total; off += 64) {
            for (i = 0; i < 16; i++) w[i] = getU32(buf, off + i * 4);
            for (i = 16; i < 64; i++) {
                var x = w[i - 15];
                var y = w[i - 2];
                var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
                var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
            for (i = 0; i < 64; i++) {
                var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                var ch = (e & f) ^ (~e & g);
                var t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
                var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var t2 = (S0 + maj) | 0;
                hh = g; g = f; f = e; e = (d + t1) | 0;
                d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            h[0] += a; h[1] += b; h[2] += c; h[3] += d;
            h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
        }
        var out = new Uint8Array(32);
        for (i = 0; i < 8; i++) putU32(out, i * 4, h[i]);
        return out;
    }

    function hmacSha256(key, msg) {
        var k = key.length > 64 ? sha256(key) : key;
        var ipad = new Uint8Array(64 + msg.length);
        var opad = new Uint8Array(96);
        for (var i = 0; i < 64; i++) {
            var kb = i < k.length ? k[i] : 0;
            ipad[i] = kb ^ 0x36;
            opad[i] = kb ^ 0x5c;
        }
        ipad.set(msg, 64);
        opad.set(sha256(ipad), 64);
        return sha256(opad);
    }

    function rotl8(x, s) {
        return ((x << s) | (x >> (8 - s))) & 0xff;
    }

    function buildSbox() {
        var sbox = new Uint8Array(256);
        var p = 1;
        var q = 1;
        do {
            p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
            q ^= (q << 1) & 0xff;
            q ^= (q << 2) & 0xff;
            q ^= (q << 4) & 0xff;
            if (q & 0x80) q ^= 0x09;
            sbox[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
        } while (p !== 1);
        sbox[0] = 0x63;
        return sbox;
    }

    var AES_SBOX = buildSbox();

    function xtime(x) {
        return ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;
    }

    function aesExpandKey(key) {
        var w = new Uint8Array(240);
        w.set(key);
        var rcon = 1;
        for (var i = 8; i < 60; i++) {
            var t0 = w[i * 4 - 4], t1 = w[i * 4 - 3], t2 = w[i * 4 - 2], t3 = w[i * 4 - 1];
            if (i % 8 === 0) {
                var r = t0;
                t0 = AES_SBOX[t1] ^ rcon;
                t1 = AES_SBOX[t2];
                t2 = AES_SBOX[t3];
                t3 = AES_SBOX[r];
                rcon = xtime(rcon);
            } else if (i % 8 === 4) {
                t0 = AES_SBOX[t0]; t1 = AES_SBOX[t1]; t2 = AES_SBOX[t2]; t3 = AES_SBOX[t3];
            }
            w[i * 4] = w[i * 4 - 32] ^ t0;
            w[i * 4 + 1] = w[i * 4 - 31] ^ t1;
            w[i * 4 + 2] = w[i * 4 - 30] ^ t2;
            w[i * 4 + 3] = w[i * 4 - 29] ^ t3;
        }
        return w;
    }

    function aesEncryptBlock(w, input) {
        var s = new Uint8Array(16);
        var t = new Uint8Array(16);
        var i, c, r, round;
        for (i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
        for (round = 1; round <= 14; round++) {
            for (c = 0; c < 4; c++) {
                for (r = 0; r < 4; r++) t[r + 4 * c] = AES_SBOX[s[r + 4 * ((c + r) & 3)]];
            }
            if (round < 14) {
                for (c = 0; c < 4; c++) {
                    var a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
                    var x0 = xtime(a0), x1 = xtime(a1), x2 = xtime(a2), x3 = xtime(a3);
                    t[c * 4] = x0 ^ x1 ^ a1 ^ a2 ^ a3;
                    t[c * 4 + 1] = a0 ^ x1 ^ x2 ^ a2 ^ a3;
                    t[c * 4 + 2] = a0 ^ a1 ^ x2 ^ x3 ^ a3;
                    t[c * 4 + 3] = x0 ^ a0 ^ a1 ^ a2 ^ x3;
                }
            }
            for (i = 0; i < 16; i++) s[i] = t[i] ^ w[round * 16 + i];
        }
        return s;
    }

    function aesGcmDecrypt(key, iv, data) {
        if (key.length !== 32 || iv.length !== 12 || data.length < 16) return null;
        var w = aesExpandKey(key);
        var n = data.length - 16;
        var out = new Uint8Array(n);
        var ctr = new Uint8Array(16);
        ctr.set(iv);
        var counter = 2;
        for (var off = 0; off < n; off += 16) {
            ctr[12] = (counter >>> 24) & 0xff;
            ctr[13] = (counter >>> 16) & 0xff;
            ctr[14] = (counter >>> 8) & 0xff;
            ctr[15] = counter & 0xff;
            counter = (counter + 1) >>> 0;
            var ks = aesEncryptBlock(w, ctr);
            var end = Math.min(16, n - off);
            for (var i = 0; i < end; i++) out[off + i] = data[off + i] ^ ks[i];
        }
        return out;
    }

    function qualityFrom(label) {
        var m = /(2160|1440|1080|720|480|360)/.exec(label);
        return m ? m[1] + "p" : "Auto";
    }

    function norm(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    function tokenSet(text) {
        var set = Object.create(null);
        var size = 0;
        var parts = text.split(" ");
        for (var i = 0; i < parts.length; i++) {
            if (!set[parts[i]]) {
                set[parts[i]] = true;
                size++;
            }
        }
        return { set: set, size: size };
    }

    function tokenOverlap(a, b) {
        var A = tokenSet(a);
        var B = tokenSet(b);
        var hit = 0;
        for (var t in A.set) {
            if (B.set[t]) hit++;
        }
        return hit / Math.max(A.size, B.size);
    }

    function hasSeasonMark(text) {
        return /\b(season|2nd|3rd|4th|5th|6th|part|cour|final|ii|iii|iv)\b/.test(text);
    }

    function scoreCandidate(c, opts) {
        var best = 0;
        var titles = [c.title, c.titleRomaji].filter(Boolean);
        var i, j;
        for (i = 0; i < titles.length; i++) {
            for (j = 0; j < opts.names.length; j++) {
                var a = norm(titles[i]);
                var b = norm(opts.names[j]);
                if (!a || !b) continue;
                var contains = a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
                var s = a === b ? 100 : Math.max(tokenOverlap(a, b) * 80, contains ? 60 : 0);
                if (s > best) best = s;
            }
        }
        if (opts.year && c.startDate && c.startDate.year) {
            var d = Math.abs(c.startDate.year - opts.year);
            if (d === 0) best += 30;
            else if (d === 1) best += 15;
        }
        if (opts.epCount && c.episodes && c.episodes === opts.epCount) best += 25;
        var marked = titles.some(function (t) {
            return hasSeasonMark(norm(t));
        });
        if (opts.movie) {
            best += c.format === "MOVIE" ? 20 : -30;
        } else {
            if (c.format === "MOVIE") best -= 30;
            if (opts.season > 1) {
                if (marked) best += 10;
            } else if (marked) {
                best -= 15;
            }
        }
        return best;
    }

    function pickBest(queries, opts) {
        var uniq = [];
        for (var i = 0; i < queries.length; i++) {
            if (queries[i] && uniq.indexOf(queries[i]) === -1) uniq.push(queries[i]);
        }
        uniq = uniq.slice(0, 5);
        return Promise.all(uniq.map(function (q) {
            return api("/api/suggest?q=" + encodeURIComponent(q)).then(function (reply) {
                return reply && Array.isArray(reply.results) ? reply.results : [];
            });
        })).then(function (lists) {
            var seen = Object.create(null);
            var best = null;
            var bestScore = -1;
            for (var li = 0; li < lists.length; li++) {
                for (var ci = 0; ci < lists[li].length; ci++) {
                    var c = lists[li][ci];
                    if (!c || !c.id || seen[c.id]) continue;
                    seen[c.id] = true;
                    var s = scoreCandidate(c, opts);
                    if (s > bestScore) {
                        bestScore = s;
                        best = c;
                    }
                }
            }
            return bestScore >= 70 ? best : null;
        });
    }

    function yearOf(d) {
        return d ? parseInt(String(d).slice(0, 4), 10) || 0 : 0;
    }

    function findSeason(seasons, number) {
        for (var i = 0; i < seasons.length; i++) {
            if (seasons[i].season_number === number) return seasons[i];
        }
        return null;
    }

    function mapMovie(d) {
        var names = [d.title, d.original_title].filter(Boolean);
        return pickBest(names, { names: names, year: yearOf(d.release_date), movie: true }).then(function (m) {
            return m ? { id: m.id, ep: 1 } : null;
        });
    }

    function mapSeries(d, query) {
        var base = [d.name, d.original_name].filter(Boolean);
        var seasons = d.seasons || [];
        var sInfo = findSeason(seasons, query.season) || {};

        if (query.season === 1) {
            return pickBest(base, {
                names: base, year: yearOf(d.first_air_date), epCount: sInfo.episode_count, season: 1
            }).then(function (m) {
                return m ? { id: m.id, ep: query.episode } : null;
            });
        }

        var generic = !sInfo.name || /^season \d+$/i.test(sInfo.name) || /^specials$/i.test(sInfo.name);
        var specific = [];
        for (var i = 0; i < base.length; i++) {
            specific.push(base[i] + " season " + query.season, base[i] + " " + query.season);
            if (!generic) specific.push(base[i] + " " + sInfo.name);
        }
        if (!generic) specific.push(sInfo.name);

        return pickBest(specific.concat(base), {
            names: specific, year: yearOf(sInfo.air_date), epCount: sInfo.episode_count, season: query.season
        }).then(function (m) {
            if (m) return { id: m.id, ep: query.episode };
            var abs = query.episode;
            for (var k = 0; k < seasons.length; k++) {
                if (seasons[k].season_number > 0 && seasons[k].season_number < query.season) abs += seasons[k].episode_count || 0;
            }
            return pickBest(base, { names: base, year: yearOf(d.first_air_date), season: 1 }).then(function (first) {
                return first ? { id: first.id, ep: abs } : null;
            });
        });
    }

    function mapToAniChan(query) {
        var url = TMDB_API + "/" + query.mediaType + "/" + query.tmdbId + "?api_key=" + TMDB_KEY + "&language=en-US";
        return getJson(url, { Accept: "application/json" }).then(function (d) {
            if (!d) return null;
            return query.mediaType === "movie" ? mapMovie(d) : mapSeries(d, query);
        });
    }

    function createWatchClient() {
        var keys = ["6be19f72", "wuEoOR48/o2oD14z71nB9MG2eC3T5q+uayZj5fb3Xsk=", "0Avpb+a3t0ihtp6DLmBkfB3wStHog0zOAhKALhnfeC4="];
        var cookies = Object.create(null);
        var sessionPromise = null;
        var keysPromise = null;

        function headers(extra) {
            var h = { "User-Agent": USER_AGENT, Accept: "application/json", Referer: BASE_URL + "/", Origin: BASE_URL };
            var cookie = Object.keys(cookies).map(function (n) {
                return n + "=" + cookies[n];
            }).join("; ");
            if (cookie) h.Cookie = cookie;
            return merge(h, extra || {});
        }

        function storeCookies(res) {
            try {
                var sc = res.headers.get("set-cookie");
                if (!sc) return;
                var parts = sc.split(/,(?=\s*[A-Za-z0-9_\-.%]+=)/);
                for (var i = 0; i < parts.length; i++) {
                    var kv = parts[i].split(";")[0].trim();
                    var at = kv.indexOf("=");
                    if (at > 0) cookies[kv.slice(0, at)] = kv.slice(at + 1);
                }
            } catch (e) { }
        }

        function session() {
            if (sessionPromise) return sessionPromise;
            sessionPromise = fetch(BASE_URL + "/api/watch/session", {
                method: "POST",
                headers: headers({ "Content-Type": "application/json" }),
                body: JSON.stringify({ token: "" })
            }).then(function (r) {
                storeCookies(r);
                return r.ok ? r.json() : null;
            }).then(function (j) {
                return j && j.n ? j : null;
            }).then(null, function () {
                return null;
            });
            return sessionPromise;
        }

        function keyBytes(list) {
            return xorBytes(b64ToBytes(list[1]), b64ToBytes(list[2]));
        }

        function findBundleKeys() {
            if (keysPromise) return keysPromise;
            keysPromise = getText(BASE_URL + "/", headers()).then(function (html) {
                if (!html) return null;
                var urls = [];
                var re = /src="(\/_next\/static\/chunks\/[^"]+\.js)"/g;
                var m;
                while ((m = re.exec(html)) !== null) urls.push(BASE_URL + m[1]);
                return Promise.all(urls.map(function (u) {
                    return getText(u, headers());
                }));
            }).then(function (texts) {
                if (!texts) return null;
                for (var i = 0; i < texts.length; i++) {
                    if (!texts[i]) continue;
                    var mm = /["']([0-9a-f]{8})["'],[A-Za-z_$][\w$]*=["']([A-Za-z0-9+\/=]{44})["'],[A-Za-z_$][\w$]*=["']([A-Za-z0-9+\/=]{44})["']/.exec(texts[i]);
                    if (mm && b64ToBytes(mm[2]).length === 32 && b64ToBytes(mm[3]).length === 32) {
                        var found = [mm[1], mm[2], mm[3]];
                        return found.join() === keys.join() ? null : found;
                    }
                }
                return null;
            }).then(null, function () {
                return null;
            });
            return keysPromise;
        }

        function openSealed(j, nonce, key) {
            try {
                var aesKey = hmacSha256(key, asciiBytes(nonce));
                var plain = aesGcmDecrypt(aesKey, b64ToBytes(j.i), b64ToBytes(j.d));
                return plain ? JSON.parse(utf8Decode(plain)) : null;
            } catch (e) {
                return null;
            }
        }

        function unseal(j, nonce) {
            if (j && j.v === 1) {
                var opened = openSealed(j, nonce, keyBytes(keys));
                if (opened) return opened;
                return findBundleKeys().then(function (found) {
                    var again = found ? openSealed(j, nonce, keyBytes(found)) : null;
                    return again || { servers: [] };
                });
            }
            return j && j.servers && j.servers.length ? j : { servers: [] };
        }

        function load(anilistId, ep, cat, tier) {
            var url = BASE_URL + "/api/watch/servers?anilistId=" + anilistId + "&ep=" + ep + "&category=" + cat + "&tier=" + tier;
            return session().then(function (s) {
                if (!s) return { servers: [] };
                return fetch(url, { headers: headers({ "X-Wk": keys[0] }) }).then(function (r) {
                    if (!r.ok) return { servers: [] };
                    return r.json().then(function (j) {
                        return unseal(j, s.n);
                    });
                });
            }).then(null, function () {
                return { servers: [] };
            });
        }

        function downloads(anilistId, ep, firstCat) {
            var url = BASE_URL + "/api/watch/ext-downloads?anilistId=" + anilistId + "&ep=" + ep;
            return session().then(function () {
                return fetch(url, { headers: headers() });
            }).then(function (r) {
                if (!r.ok) return [];
                return r.json().then(function (dj) {
                    var bucket = dj && dj.kiwi ? (firstCat === "dub" ? dj.kiwi.dub : dj.kiwi.sub) : null;
                    var out = [];
                    for (var q in bucket || {}) {
                        var u = bucket[q];
                        if (typeof u === "string" && isHttp(u)) {
                            out.push({ name: "kiwi", label: "Kiwi " + q, type: "embed", embed: u, subType: "soft" });
                        }
                    }
                    return out;
                });
            }).then(null, function () {
                return [];
            });
        }

        function serverKey(sv) {
            return sv.type === "embed" ? [sv.name, sv.label, sv.embed].join("|") : [sv.name, sv.label, sv.subType].join("|");
        }

        function fetchServers(anilistId, ep, cats) {
            var jobs = [];
            var i;
            for (i = 0; i < cats.length; i++) {
                jobs.push(load(anilistId, ep, cats[i], "fast"));
                jobs.push(load(anilistId, ep, cats[i], "rest"));
            }
            jobs.push(downloads(anilistId, ep, cats[0]));
            return Promise.all(jobs).then(function (replies) {
                var merged = [];
                var seen = Object.create(null);
                for (var slot = 0; slot < replies.length - 1; slot++) {
                    var cat = cats[Math.floor(slot / 2)];
                    var list = (replies[slot] && replies[slot].servers) || [];
                    for (var k = 0; k < list.length; k++) {
                        var sv = list[k];
                        if (cat === "hsub" && !sv.subType && sv.type === "hls") sv.subType = "hard";
                        var key = serverKey(sv);
                        if (seen[key]) continue;
                        seen[key] = true;
                        merged.push(sv);
                    }
                }
                return merged.concat(replies[replies.length - 1]);
            });
        }

        return { fetchServers: fetchServers };
    }

    function unpackPacked(src) {
        var m = /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(src);
        if (!m) return null;
        var payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        var radix = parseInt(m[2], 10);
        var count = parseInt(m[3], 10);
        var dict = m[4].split("|");
        var lookup = Object.create(null);

        function toBase(n) {
            return (n < radix ? "" : toBase(Math.floor(n / radix))) +
                (n % radix > 35 ? String.fromCharCode((n % radix) + 29) : (n % radix).toString(36));
        }

        while (count--) lookup[toBase(count)] = dict[count] || toBase(count);
        return payload.replace(/\b\w+\b/g, function (w) {
            return lookup[w] !== undefined ? lookup[w] : w;
        });
    }

    function locationOf(r) {
        var loc = r && r.headers.get("location");
        return loc && isHttp(loc) ? loc : null;
    }

    function unpackKwik(html) {
        var at = html.indexOf("eval(function(p,a,c,k,e,");
        if (at < 0) return null;
        var end = html.indexOf("</script>", at);
        try {
            return unpackPacked(end > 0 ? html.slice(at, end) : html.slice(at));
        } catch (e) {
            return null;
        }
    }

    function kwikForm(act, tok, pageUrl, ph) {
        return fetch(act, {
            method: "POST",
            headers: merge({ Referer: pageUrl, "Content-Type": "application/x-www-form-urlencoded" }, ph),
            body: "_token=" + encodeURIComponent(tok),
            redirect: "manual"
        }).then(function (r) {
            return (r && r.status === 302 && locationOf(r)) || null;
        }, function () {
            return null;
        });
    }

    function kwikPlain(html, pageUrl) {
        var s = /source\s*=\s*["']([^"']+)["']/.exec(html);
        if (s && isHttp(s[1]) && (s[1].indexOf(".m3u8") !== -1 || s[1].indexOf(".mp4") !== -1)) {
            return { file: s[1], referer: pageUrl };
        }
        return null;
    }

    function kwikSolve(html, pageUrl, ph) {
        var unpacked = unpackKwik(html);
        if (!unpacked) return kwikPlain(html, pageUrl);
        var s = /source\s*=\s*["']([^"']+)["']/.exec(unpacked);
        if (s && isHttp(s[1])) return { file: s[1], referer: pageUrl };
        var act = /action="([^"]+)"/.exec(unpacked);
        var tok = /value="([^"]+)"/.exec(unpacked);
        if (!act || !tok) return kwikPlain(html, pageUrl);
        return kwikForm(act[1], tok[1], pageUrl, ph).then(function (loc) {
            return loc ? { file: loc, referer: pageUrl } : kwikPlain(html, pageUrl);
        });
    }

    function kwikFetch(kwikUrl, paheUrl, ph) {
        return fetch(kwikUrl, { headers: merge({ Referer: paheUrl }, ph) }).then(function (res) {
            if (!res || !res.ok) return null;
            return res.text().then(function (html) {
                return kwikSolve(html, res.url || kwikUrl, ph);
            });
        });
    }

    function kiwiResolve(paheUrl) {
        var ph = { "User-Agent": USER_AGENT };
        return getText(paheUrl, ph).then(function (page) {
            if (!page) return null;
            var m = /const\s+url\s*=\s*"(https?:\/\/[^"]+)"/.exec(page) || /"(https?:\/\/[^"]*workers\.dev[^"]*)"/.exec(page);
            if (!m) return null;
            var redirector = m[1].replace(/\/+$/, "") + "/" + String(paheUrl).replace(/\/+$/, "").split("/").pop();
            return fetch(redirector, { headers: ph, redirect: "manual" }).then(function (r) {
                return locationOf(r);
            }, function () {
                return null;
            }).then(function (kwikUrl) {
                return kwikUrl ? kwikFetch(kwikUrl, paheUrl, ph) : null;
            });
        }).then(null, function () {
            return null;
        });
    }

    function rawLabel(sv) {
        return String(sv.label || sv.name || PROVIDER)
            .replace(/\u2605/g, "")
            .replace(/\s*\u29C9\s*\(ads\)/g, "")
            .trim();
    }

    function prettyServer(label) {
        var m = /^(\S+)(.*)$/.exec(label);
        if (!m) return label;
        var mapped = SERVER_NAMES[m[1].toLowerCase()];
        return mapped ? mapped + m[2] : label;
    }

    function sortTag(server) {
        var idx = SERVER_ORDER.indexOf(server.toLowerCase().split(/\s+/)[0]);
        var bin = (idx < 0 ? SERVER_ORDER.length : idx).toString(2);
        var out = "";
        while (bin.length < 20) bin = "0" + bin;
        for (var i = 0; i < bin.length; i++) {
            out += bin.charAt(i) === "1" ? "\uFEFF" : "\u200B";
        }
        return out;
    }

    function mkStream(language, hard, label, url, headers, subtitles) {
        var server = prettyServer(label);
        var lang = language + (hard ? " [Hard Sub]" : "");
        var display = sortTag(server) + (server.toLowerCase() === "anichan"
            ? PROVIDER + " \u2022 " + lang
            : PROVIDER + " \u2022 " + server + " \u2022 " + lang);
        var s = { name: display, title: display, url: url, quality: qualityFrom(label), headers: headers };
        if (url.toLowerCase().indexOf(".m3u8") !== -1) s.type = "hls";
        if (subtitles && subtitles.length) s.subtitles = subtitles;
        return s;
    }

    function subtitlesOf(sv) {
        var subs = [];
        var seenLang = Object.create(null);
        var list = sv.subtitles || [];
        for (var i = 0; i < list.length; i++) {
            var sub = list[i];
            if (!sub || !isHttp(sub.url)) continue;
            var lang = sub.lang || "English";
            if (seenLang[lang]) continue;
            seenLang[lang] = true;
            subs.push({ url: sub.url, language: lang });
        }
        return subs;
    }

    function streamUrlOf(sv) {
        var st = sv.stream ? String(sv.stream) : "";
        if (isHttp(st)) return sv.stream;
        return st.charAt(0) === "/" ? BASE_URL + sv.stream : null;
    }

    function convertServers(servers, category) {
        var language = category === "dub" ? "English" : "Japanese";
        var linkHeaders = { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" };
        var streams = [];
        var kiwis = [];

        function isHard(sv) {
            return String(sv.subType || "").toLowerCase() === "hard";
        }

        for (var i = 0; i < servers.length; i++) {
            var sv = servers[i];
            if (String(sv.type || "").toLowerCase() === "embed" && sv.embed) {
                if (sv.name === "kiwi") kiwis.push(sv);
                continue;
            }
            var stream = streamUrlOf(sv);
            if (!stream) continue;
            streams.push(mkStream(language, isHard(sv), rawLabel(sv), stream, linkHeaders, subtitlesOf(sv)));
        }

        return Promise.all(kiwis.map(function (sv) {
            return kiwiResolve(sv.embed).then(function (k) {
                return k ? [mkStream(language, isHard(sv), rawLabel(sv), k.file, { "User-Agent": USER_AGENT, Referer: k.referer })] : [];
            }, function () {
                return [];
            });
        })).then(function (resolved) {
            var all = streams;
            for (var r = 0; r < resolved.length; r++) all = all.concat(resolved[r]);
            return all;
        });
    }

    function gather(client, target, cats, category) {
        return client.fetchServers(target.id, target.ep, cats).then(function (servers) {
            return servers.length ? convertServers(servers, category) : [];
        });
    }

    function dedupe(streams) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < streams.length; i++) {
            var url = streams[i].url;
            if (!url || seen[url]) continue;
            seen[url] = true;
            out.push(streams[i]);
        }
        return out;
    }

    function hasDub(detail, info) {
        if (info && info.dubAvailable === true) return true;
        return !!(detail && detail.selfhost && detail.selfhost.cachedDub && detail.selfhost.cachedDub.length);
    }

    function run() {
        var query = buildQuery();
        if (!query) return [];
        return mapToAniChan(query).then(function (target) {
            if (!target) return [];
            var client = createWatchClient();
            var subStreams = gather(client, target, ["sub", "hsub"], "sub");
            var dubStreams = Promise.all([
                api("/api/catalog/anime/" + target.id),
                api("/api/watch/episodes?anilistId=" + target.id)
            ]).then(function (pair) {
                return hasDub(pair[0], pair[1]) ? gather(client, target, ["dub"], "dub") : [];
            });
            return Promise.all([subStreams, dubStreams]).then(function (lists) {
                return dedupe(lists[0].concat(lists[1]));
            });
        });
    }

    return Promise.resolve().then(run).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };
