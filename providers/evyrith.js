function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://vidrock.net";
    var CONCURRENCY = 4;
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
    };
    var STREAM_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";
    var AES_RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);
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

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        if (type === "tv" && (seasonNumber == null || episodeNumber == null)) return null;
        var numeric = parseInt(id, 10);
        if (!numeric) return null;
        if (type === "tv") return "tv/" + numeric + "/" + seasonNumber + "/" + episodeNumber;
        return "movie/" + numeric;
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

    function decodeHex(hex) {
        var out = new Uint8Array(hex.length >> 1);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }

    function bytesToText(bytes) {
        var parts = [];
        for (var i = 0; i < bytes.length; i++) {
            parts.push("%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16));
        }
        return decodeURIComponent(parts.join(""));
    }

    function sliceBytes(bytes, from, to) {
        var out = new Uint8Array(to - from);
        for (var i = from; i < to; i++) out[i - from] = bytes[i];
        return out;
    }

    function resolveUrl(path, base) {
        if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(path)) return path;
        var parts = /^([a-zA-Z][a-zA-Z0-9+.\-]*:)\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?/.exec(base);
        if (!parts) return null;
        var origin = parts[1] + "//" + parts[2];
        var basePath = parts[3] || "/";
        var baseQuery = parts[4] || "";
        if (path.indexOf("//") === 0) return parts[1] + path;
        if (path === "") return origin + basePath + baseQuery;
        if (path.charAt(0) === "?") return origin + basePath + path;
        if (path.charAt(0) === "#") return origin + basePath + baseQuery + path;
        var tail = /^[^?#]*/.exec(path)[0];
        var rest = path.slice(tail.length);
        var joined = tail.charAt(0) === "/" ? tail : basePath.slice(0, basePath.lastIndexOf("/") + 1) + tail;
        var segments = joined.split("/");
        var out = [];
        for (var i = 1; i < segments.length; i++) {
            var segment = segments[i];
            var last = i === segments.length - 1;
            if (segment === "..") {
                if (out.length) out.pop();
                if (last) out.push("");
            } else if (segment === ".") {
                if (last) out.push("");
            } else {
                out.push(segment);
            }
        }
        return origin + "/" + out.join("/") + rest;
    }

    function xtime(value) {
        return ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff;
    }

    function expandKey(key) {
        var nk = key.length >> 2;
        var total = (nk + 7) * 4;
        var words = new Uint8Array(total * 4);
        var i;
        var t0;
        var t1;
        var t2;
        var t3;
        var swap;
        for (i = 0; i < key.length; i++) words[i] = key[i];
        for (i = nk; i < total; i++) {
            t0 = words[i * 4 - 4];
            t1 = words[i * 4 - 3];
            t2 = words[i * 4 - 2];
            t3 = words[i * 4 - 1];
            if (i % nk === 0) {
                swap = t0;
                t0 = AES_SBOX[t1] ^ AES_RCON[i / nk - 1];
                t1 = AES_SBOX[t2];
                t2 = AES_SBOX[t3];
                t3 = AES_SBOX[swap];
            } else if (nk > 6 && i % nk === 4) {
                t0 = AES_SBOX[t0];
                t1 = AES_SBOX[t1];
                t2 = AES_SBOX[t2];
                t3 = AES_SBOX[t3];
            }
            words[i * 4] = words[(i - nk) * 4] ^ t0;
            words[i * 4 + 1] = words[(i - nk) * 4 + 1] ^ t1;
            words[i * 4 + 2] = words[(i - nk) * 4 + 2] ^ t2;
            words[i * 4 + 3] = words[(i - nk) * 4 + 3] ^ t3;
        }
        return words;
    }

    function addRoundKey(state, keys, round) {
        for (var i = 0; i < 16; i++) state[i] ^= keys[round * 16 + i];
    }

    function subShift(state) {
        var next = new Uint8Array(16);
        for (var column = 0; column < 4; column++) {
            for (var row = 0; row < 4; row++) {
                next[column * 4 + row] = AES_SBOX[state[((column + row) & 3) * 4 + row]];
            }
        }
        for (var i = 0; i < 16; i++) state[i] = next[i];
    }

    function mixColumns(state) {
        for (var c = 0; c < 16; c += 4) {
            var a = state[c];
            var b = state[c + 1];
            var d = state[c + 2];
            var e = state[c + 3];
            state[c] = xtime(a) ^ xtime(b) ^ b ^ d ^ e;
            state[c + 1] = a ^ xtime(b) ^ xtime(d) ^ d ^ e;
            state[c + 2] = a ^ b ^ xtime(d) ^ xtime(e) ^ e;
            state[c + 3] = xtime(a) ^ a ^ b ^ d ^ xtime(e);
        }
    }

    function encryptBlock(block, keys) {
        var rounds = keys.length / 16 - 1;
        var state = new Uint8Array(16);
        for (var i = 0; i < 16; i++) state[i] = block[i];
        addRoundKey(state, keys, 0);
        for (var round = 1; round < rounds; round++) {
            subShift(state);
            mixColumns(state);
            addRoundKey(state, keys, round);
        }
        subShift(state);
        addRoundKey(state, keys, rounds);
        return state;
    }

    function incrementCounter(counter) {
        for (var i = 15; i >= 12; i--) {
            counter[i] = (counter[i] + 1) & 0xff;
            if (counter[i]) break;
        }
    }

    function wordsAt(bytes, offset) {
        var words = [0, 0, 0, 0];
        for (var i = 0; i < 16; i++) {
            var value = offset + i < bytes.length ? bytes[offset + i] : 0;
            words[i >> 2] = (words[i >> 2] << 8) | value;
        }
        return words;
    }

    function multiply(x, h) {
        var z0 = 0;
        var z1 = 0;
        var z2 = 0;
        var z3 = 0;
        var v0 = h[0];
        var v1 = h[1];
        var v2 = h[2];
        var v3 = h[3];
        for (var i = 0; i < 128; i++) {
            if ((x[i >> 5] >>> (31 - (i & 31))) & 1) {
                z0 ^= v0;
                z1 ^= v1;
                z2 ^= v2;
                z3 ^= v3;
            }
            var lsb = v3 & 1;
            v3 = (v3 >>> 1) | (v2 << 31);
            v2 = (v2 >>> 1) | (v1 << 31);
            v1 = (v1 >>> 1) | (v0 << 31);
            v0 = v0 >>> 1;
            if (lsb) v0 ^= 0xe1000000;
        }
        return [z0, z1, z2, z3];
    }

    function absorb(acc, h, block) {
        return multiply([acc[0] ^ block[0], acc[1] ^ block[1], acc[2] ^ block[2], acc[3] ^ block[3]], h);
    }

    function ghash(h, data) {
        var acc = [0, 0, 0, 0];
        for (var offset = 0; offset < data.length; offset += 16) {
            acc = absorb(acc, h, wordsAt(data, offset));
        }
        var bits = data.length * 8;
        return absorb(acc, h, [0, 0, Math.floor(bits / 4294967296), bits >>> 0]);
    }

    function decryptStreamUrl(encoded) {
        var raw = decodeBase64(encoded);
        var iv = sliceBytes(raw, 0, 12);
        if (raw.length - 12 < 16) throw new Error("input too short");
        var ciphertext = sliceBytes(raw, 12, raw.length - 16);
        var tag = sliceBytes(raw, raw.length - 16, raw.length);
        var keys = expandKey(decodeHex(STREAM_KEY));
        var h = wordsAt(encryptBlock(new Uint8Array(16), keys), 0);
        var counter = new Uint8Array(16);
        for (var i = 0; i < 12; i++) counter[i] = iv[i];
        counter[15] = 1;
        var mask = encryptBlock(counter, keys);
        var digest = ghash(h, ciphertext);
        var mismatch = 0;
        for (i = 0; i < 16; i++) {
            mismatch |= (mask[i] ^ ((digest[i >> 2] >>> (24 - 8 * (i & 3))) & 255)) ^ tag[i];
        }
        if (mismatch !== 0) throw new Error("auth tag mismatch");
        var plain = new Uint8Array(ciphertext.length);
        incrementCounter(counter);
        for (var offset = 0; offset < ciphertext.length; offset += 16) {
            var keystream = encryptBlock(counter, keys);
            var end = Math.min(16, ciphertext.length - offset);
            for (var j = 0; j < end; j++) plain[offset + j] = ciphertext[offset + j] ^ keystream[j];
            incrementCounter(counter);
        }
        return bytesToText(plain);
    }

    function resolutionLabel(width, height) {
        if (width >= 3840 || height >= 2160) return "2160p";
        if (width >= 1920 || height >= 1080) return "1080p";
        return null;
    }

    function resWeight(quality) {
        if (quality === "2160p") return 2;
        if (quality === "1080p") return 1;
        return 0;
    }

    function invertedSortTag(rank, total) {
        var inverted = Math.max(0, total - rank);
        var binary = inverted.toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (c) {
            return c === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function extractTopVariant(text, base) {
        var lines = text.split("\n").map(function (line) {
            return line.trim();
        });
        var best = null;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
            var segLine = lines[i + 1];
            if (!segLine || segLine.charAt(0) === "#") continue;
            var url = resolveUrl(segLine, base);
            if (!url) continue;
            var bandwidth = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1] || "0", 10);
            var size = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
            var width = size ? parseInt(size[1], 10) : 0;
            var height = size ? parseInt(size[2], 10) : 0;
            if (!resolutionLabel(width, height)) continue;
            if (!best || bandwidth > best.bandwidth) {
                best = { url: url, bandwidth: bandwidth, width: width, height: height };
            }
        }
        return best;
    }

    function safeFetch(url) {
        try {
            return fetch(url, { headers: HEADERS }).then(function (res) {
                return res.ok ? res : null;
            }, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url) {
        return safeFetch(url).then(function (res) {
            if (!res) return null;
            return res.json().then(null, function () {
                return null;
            });
        });
    }

    function toStream(serverName, masterUrl, quality) {
        var label = String(serverName).replace(/\s*(1080p\s+)?server\s*2\s*$/gi, "").trim();
        var displayName = "Vidrock \u2022 " + label;
        return {
            name: displayName,
            title: displayName,
            url: masterUrl,
            quality: quality,
            headers: HEADERS
        };
    }

    function resolveServer(serverName, entry) {
        var masterUrl;
        try {
            masterUrl = decryptStreamUrl(entry.url);
        } catch (e) {
            return Promise.resolve(null);
        }
        if (!masterUrl || !/^https?:\/\//i.test(masterUrl)) return Promise.resolve(null);
        return safeFetch(masterUrl).then(function (res) {
            if (!res) return null;
            return res.text().then(function (text) {
                var variant = extractTopVariant(text, masterUrl);
                if (!variant) return null;
                return toStream(serverName, masterUrl, resolutionLabel(variant.width, variant.height));
            });
        }).then(null, function () {
            return null;
        });
    }

    function runPool(tasks) {
        var results = new Array(tasks.length);
        var cursor = 0;
        function next() {
            if (cursor >= tasks.length) return Promise.resolve();
            var index = cursor;
            cursor += 1;
            return tasks[index]().then(function (value) {
                results[index] = value;
                return next();
            });
        }
        var workers = [];
        for (var i = 0; i < Math.min(CONCURRENCY, tasks.length); i++) workers.push(next());
        return Promise.all(workers).then(function () {
            return results;
        });
    }

    function makeTask(name, entry) {
        return function () {
            return resolveServer(name, entry);
        };
    }

    function collect(data) {
        var tasks = [];
        var names = Object.keys(data);
        for (var i = 0; i < names.length; i++) {
            var entry = data[names[i]];
            if (entry && typeof entry === "object" && entry.url) tasks.push(makeTask(names[i], entry));
        }
        return runPool(tasks);
    }

    function rank(resolved) {
        var seen = Object.create(null);
        var unique = [];
        var i;
        for (i = 0; i < resolved.length; i++) {
            var stream = resolved[i];
            if (!stream || !stream.url || seen[stream.url]) continue;
            seen[stream.url] = true;
            unique.push(stream);
        }
        var sorted = [];
        for (var weight = 2; weight >= 0; weight--) {
            for (i = 0; i < unique.length; i++) {
                if (resWeight(unique[i].quality) === weight) sorted.push(unique[i]);
            }
        }
        var total = sorted.length;
        var tagged = [];
        for (i = 0; i < total; i++) {
            tagged.push({
                name: invertedSortTag(total - i, total + 1) + sorted[i].name,
                title: sorted[i].title,
                url: sorted[i].url,
                quality: sorted[i].quality,
                headers: sorted[i].headers
            });
        }
        return tagged;
    }

    var path = buildQuery(tmdbId, mediaType, season, episode);
    if (path === null) return Promise.resolve([]);
    try {
        return fetchJson(BASE_URL + "/api/" + path).then(function (data) {
            if (!data || typeof data !== "object" || data.error) return [];
            return collect(data).then(rank);
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };