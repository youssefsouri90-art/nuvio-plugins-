function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://anikoto.cz";
    var TMDB_API_URL = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Referer": BASE_URL + "/"
    };
    var AJAX_HEADERS = copy(HEADERS, { "X-Requested-With": "XMLHttpRequest" });
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var SBOX = [];
    var INV_SBOX = [];
    var FOLD = [
        ["a", "àáâãäåāăą"],
        ["c", "çćĉċč"],
        ["d", "ď"],
        ["e", "èéêëēĕėęě"],
        ["g", "ĝğġģ"],
        ["h", "ĥ"],
        ["i", "ìíîïĩīĭį"],
        ["j", "ĵ"],
        ["k", "ķ"],
        ["l", "ĺļľ"],
        ["n", "ñńņň"],
        ["o", "òóôõöōŏő"],
        ["r", "ŕŗř"],
        ["s", "śŝşš"],
        ["t", "ţť"],
        ["u", "ùúûüũūŭůűų"],
        ["w", "ŵ"],
        ["y", "ýÿŷ"],
        ["z", "źżž"]
    ];
    var FOLDED = Object.create(null);

    function copy(source, target) {
        var key;
        for (key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
        }
        return target;
    }

    function settings() {
        var raw = typeof SCRAPER_SETTINGS === "object" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
        return {
            enableSub: raw.enableSub !== false,
            enableDub: raw.enableDub !== false,
            enable1080: raw.enable1080p !== false,
            enable720: raw.enable720p === true
        };
    }

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        if (!id) return null;
        return {
            id: id,
            mediaType: type,
            season: typeof seasonNumber === "number" ? seasonNumber : 1,
            episode: typeof episodeNumber === "number" ? episodeNumber : 1
        };
    }

    function sorted(list, compare) {
        var slots = [];
        var i;
        for (i = 0; i < list.length; i++) slots.push({ index: i, value: list[i] });
        slots.sort(function (a, b) {
            var diff = compare(a.value, b.value);
            return diff !== 0 ? diff : a.index - b.index;
        });
        return slots.map(function (slot) {
            return slot.value;
        });
    }

    function allMatches(text, re) {
        var out = [];
        var m;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
            out.push(m);
            if (m[0].length === 0) re.lastIndex++;
        }
        return out;
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

    function fetchJson(url, headers) {
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headers });
        }).then(function (res) {
            return res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function foldAccents(text) {
        return text.replace(/[à-ž]/g, function (c) {
            return FOLDED[c] || c;
        });
    }

    function decodeHtmlEntities(str) {
        if (!str) return "";
        return str
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
    }

    function normalizeTitle(str) {
        if (!str) return "";
        return foldAccents(decodeHtmlEntities(str).toLowerCase())
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function uniqueWords(text) {
        var parts = text.split(" ");
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < parts.length; i++) {
            if (!parts[i] || seen[parts[i]] === true) continue;
            seen[parts[i]] = true;
            out.push(parts[i]);
        }
        return out;
    }

    function diceCoefficient(a, b) {
        var na = normalizeTitle(a);
        var nb = normalizeTitle(b);
        var wordsA, wordsB, setA, setB, inB, intersection, i;
        if (!na || !nb) return 0;
        if (na === nb) return 1;
        wordsA = na.split(" ").filter(Boolean);
        wordsB = nb.split(" ").filter(Boolean);
        if (!wordsA.length || !wordsB.length) return 0;
        setA = uniqueWords(na);
        setB = uniqueWords(nb);
        inB = Object.create(null);
        for (i = 0; i < setB.length; i++) inB[setB[i]] = true;
        intersection = 0;
        for (i = 0; i < setA.length; i++) {
            if (inB[setA[i]] === true) intersection++;
        }
        return (2 * intersection) / (wordsA.length + wordsB.length);
    }

    function parseSeasonNumber(title) {
        var match, num;
        if (!title) return null;
        match = title.match(/\b(?:season\s*(\d+)|(\d+)(?:nd|rd|th|st)\s*season|part\s*(\d+))\b/i);
        if (!match) return null;
        num = match[1] || match[2] || match[3];
        return num ? parseInt(num, 10) : null;
    }

    function dedupeStreamsByUrl(streams) {
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < streams.length; i++) {
            if (!streams[i].url || seen[streams[i].url] === true) continue;
            seen[streams[i].url] = true;
            out.push(streams[i]);
        }
        return out;
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

    function utf8Decode(bytes) {
        var escaped = "";
        var i, hex;
        for (i = 0; i < bytes.length; i++) {
            hex = bytes[i].toString(16);
            escaped += "%" + (hex.length < 2 ? "0" + hex : hex);
        }
        return decodeURIComponent(escaped);
    }

    function padBytes(str, length) {
        var bytes = utf8Bytes(str);
        var out = [];
        var i;
        for (i = 0; i < length; i++) out.push(i < bytes.length ? bytes[i] : 0);
        return out;
    }

    function base64ToBytes(str) {
        var text = String(str).replace(/[^A-Za-z0-9+/]/g, "");
        var out = [];
        var bits = 0;
        var acc = 0;
        var i;
        for (i = 0; i < text.length; i++) {
            acc = (acc << 6) | B64.indexOf(text.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push((acc >> bits) & 255);
                acc &= (1 << bits) - 1;
            }
        }
        return out;
    }

    function buildSboxes() {
        var p = 1;
        var q = 1;
        var i, x;
        function rotl(value, n) {
            return ((value << n) | (value >> (8 - n))) & 255;
        }
        do {
            p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
            q ^= q << 1;
            q ^= q << 2;
            q ^= q << 4;
            q &= 255;
            if (q & 0x80) q ^= 0x09;
            x = q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4);
            SBOX[p] = (x ^ 0x63) & 255;
        } while (p !== 1);
        SBOX[0] = 0x63;
        for (i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
    }

    function buildFold() {
        var i, j, chars;
        for (i = 0; i < FOLD.length; i++) {
            chars = FOLD[i][1];
            for (j = 0; j < chars.length; j++) FOLDED[chars.charAt(j)] = FOLD[i][0];
        }
    }

    buildSboxes();
    buildFold();

    function gmul(a, b) {
        var result = 0;
        var i, hi;
        for (i = 0; i < 8; i++) {
            if (b & 1) result ^= a;
            hi = a & 0x80;
            a = (a << 1) & 255;
            if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return result;
    }

    function expandKey(key) {
        var words = [];
        var rounds = [];
        var rcon = 1;
        var i, r, temp, prior;
        for (i = 0; i < 8; i++) words.push(key.slice(i * 4, i * 4 + 4));
        for (i = 8; i < 60; i++) {
            temp = words[i - 1].slice();
            if (i % 8 === 0) {
                temp = [SBOX[temp[1]] ^ rcon, SBOX[temp[2]], SBOX[temp[3]], SBOX[temp[0]]];
                rcon = gmul(rcon, 2);
            } else if (i % 8 === 4) {
                temp = temp.map(function (b) {
                    return SBOX[b];
                });
            }
            prior = words[i - 8];
            words.push(prior.map(function (b, j) {
                return b ^ temp[j];
            }));
        }
        for (r = 0; r < 15; r++) rounds.push([].concat(words[r * 4], words[r * 4 + 1], words[r * 4 + 2], words[r * 4 + 3]));
        return rounds;
    }

    function addRoundKey(state, key) {
        var i;
        for (i = 0; i < 16; i++) state[i] ^= key[i];
    }

    function decryptBlock(block, rounds) {
        var s = block.slice();
        var r, i, c, row, t, a;
        addRoundKey(s, rounds[14]);
        for (r = 13; r >= 0; r--) {
            t = s.slice();
            for (c = 0; c < 4; c++) {
                for (row = 0; row < 4; row++) s[((c + row) % 4) * 4 + row] = t[c * 4 + row];
            }
            for (i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
            addRoundKey(s, rounds[r]);
            if (r > 0) {
                for (c = 0; c < 4; c++) {
                    a = s.slice(c * 4, c * 4 + 4);
                    s[c * 4] = gmul(a[0], 14) ^ gmul(a[1], 11) ^ gmul(a[2], 13) ^ gmul(a[3], 9);
                    s[c * 4 + 1] = gmul(a[0], 9) ^ gmul(a[1], 14) ^ gmul(a[2], 11) ^ gmul(a[3], 13);
                    s[c * 4 + 2] = gmul(a[0], 13) ^ gmul(a[1], 9) ^ gmul(a[2], 14) ^ gmul(a[3], 11);
                    s[c * 4 + 3] = gmul(a[0], 11) ^ gmul(a[1], 13) ^ gmul(a[2], 9) ^ gmul(a[3], 14);
                }
            }
        }
        return s;
    }

    function decryptAesCbc(encryptedBase64) {
        var rounds, data, out, prev, offset, i, block, plain, pad;
        try {
            rounds = expandKey(padBytes("i?LMTAx0Q6,:}50U", 32));
            data = base64ToBytes(encryptedBase64.replace(/-/g, "+").replace(/_/g, "/"));
            out = [];
            prev = padBytes("W0;27ToaUpl_P%'c", 16);
            for (offset = 0; offset + 16 <= data.length; offset += 16) {
                block = data.slice(offset, offset + 16);
                plain = decryptBlock(block, rounds);
                for (i = 0; i < 16; i++) out.push(plain[i] ^ prev[i]);
                prev = block;
            }
            pad = out[out.length - 1];
            return JSON.parse(utf8Decode(out.slice(0, out.length - pad)));
        } catch (e) {
            return null;
        }
    }

    function originOf(url) {
        var m = /^(https?:\/\/[^\/?#]+)/i.exec(url);
        return m ? m[1].toLowerCase() : null;
    }

    function queryParam(url, key) {
        var qi = url.indexOf("?");
        var hash, pairs, i, kv;
        if (qi < 0) return null;
        hash = url.indexOf("#", qi);
        pairs = url.slice(qi + 1, hash < 0 ? url.length : hash).split("&");
        for (i = 0; i < pairs.length; i++) {
            kv = pairs[i].split("=");
            try {
                if (decodeURIComponent(kv[0].replace(/\+/g, " ")) === key) return decodeURIComponent(kv.slice(1).join("=").replace(/\+/g, " "));
            } catch (e) { }
        }
        return null;
    }

    function fetchTmdbMetadata(id, type, targetSeason) {
        var endpoint = type === "movie" ? "movie" : "tv";
        var url = TMDB_API_URL + "/" + endpoint + "/" + id + "?api_key=" + TMDB_KEY + "&append_to_response=alternative_titles,external_ids";
        return fetchJson(url, HEADERS).then(function (data) {
            var genreIds, originCountries, alt, list, altTitles, absoluteOffset, seasonName, title, origTitle, i, s;
            if (!data) return null;
            genreIds = (data.genres || []).map(function (g) {
                return g.id;
            });
            originCountries = data.origin_country || [];
            if (genreIds.indexOf(16) === -1 && originCountries.indexOf("JP") === -1) return null;
            title = endpoint === "tv" ? data.name : data.title;
            origTitle = endpoint === "tv" ? data.original_name : data.original_title;
            alt = data.alternative_titles;
            list = (alt && alt.results) || (alt && alt.titles) || [];
            altTitles = list.map(function (t) {
                return decodeHtmlEntities(t.title);
            });
            absoluteOffset = 0;
            if (endpoint === "tv" && targetSeason && data.seasons) {
                for (i = 0; i < data.seasons.length; i++) {
                    s = data.seasons[i];
                    if (s.season_number > 0 && s.season_number < targetSeason) absoluteOffset += s.episode_count || 0;
                    if (s.season_number === targetSeason) seasonName = s.name;
                }
            }
            return {
                kind: endpoint,
                title: decodeHtmlEntities(title || ""),
                originalTitle: origTitle ? decodeHtmlEntities(origTitle) : undefined,
                alternateTitles: altTitles,
                seasonName: seasonName,
                absoluteOffset: absoluteOffset
            };
        });
    }

    function searchAnikoto(query) {
        var term;
        if (!query || !query.trim()) return Promise.resolve([]);
        term = encodeURIComponent(query.trim());
        return fetchText(BASE_URL + "/filter?keyword=" + term, HEADERS).then(function (html) {
            var matches;
            if (html) {
                matches = allMatches(html, /<div class="item [\s\S]*?<div class="ani poster tip" data-tip="(\d+)"[\s\S]*?<a class="name d-title" href="([^"]+)"(?:\s+data-jp="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi);
                if (matches.length > 0) {
                    return matches.map(function (m) {
                        return {
                            id: m[1],
                            url: m[2],
                            jpTitle: m[3] ? decodeHtmlEntities(m[3].trim()) : undefined,
                            title: decodeHtmlEntities(m[4].replace(/<[^>]+>/g, "").trim())
                        };
                    });
                }
            }
            return fetchJson(BASE_URL + "/ajax/anime/search?keyword=" + term, AJAX_HEADERS).then(function (json) {
                var result = (json && json.result && json.result.html) || "";
                return allMatches(result, /<a class="item" href="([^"]+)"[\s\S]*?<div class="name d-title"[^>]*>([\s\S]*?)<\/div>/gi).map(function (m) {
                    return {
                        id: "",
                        url: m[1],
                        title: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").trim())
                    };
                });
            });
        }).then(null, function () {
            return [];
        });
    }

    function resolveAnimeIdFromUrl(pageUrl) {
        return fetchText(pageUrl, HEADERS).then(function (html) {
            var match = html && html.match(/data-id="(\d+)"/);
            return match ? match[1] : null;
        });
    }

    function fetchAnimeSeasons(animeId) {
        return fetchJson(BASE_URL + "/api/seasons/" + encodeURIComponent(animeId), AJAX_HEADERS).then(function (json) {
            var html = (json && json.result) || "";
            return allMatches(html, /<div class="swiper-slide season (active)?">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<div class="name"[^>]*>([\s\S]*?)<\/div>/gi).map(function (m) {
                return { active: !!m[1], url: m[2], name: decodeHtmlEntities(m[3].trim()) };
            });
        }).then(null, function () {
            return [];
        });
    }

    function fetchEpisodeList(animeId) {
        return fetchJson(BASE_URL + "/ajax/episode/list/" + encodeURIComponent(animeId), AJAX_HEADERS).then(function (json) {
            var html = (json && json.result) || "";
            return allMatches(html, /<a[^>]+data-id="(\d+)"[^>]+data-num="(\d+)"[^>]+data-ids="([^"]+)"(?:[^>]*data-mal="(\d+)")?[^>]*>(?:<b>(\d+)<\/b>)?(?:\s*<span[^>]*class="d-title"[^>]*>([^<]*)<\/span>)?/gi).map(function (m) {
                return { id: m[1], num: parseInt(m[2], 10), dataIds: m[3] };
            });
        }).then(null, function () {
            return [];
        });
    }

    function fetchServerList(dataIds) {
        return fetchJson(BASE_URL + "/ajax/server/list?servers=" + encodeURIComponent(dataIds), AJAX_HEADERS).then(function (json) {
            var html = (json && json.result) || "";
            var blocks = allMatches(html, /<div class="type" data-type="(sub|dub)">([\s\S]*?)<\/div>/gi);
            var servers = [];
            var i, j, items;
            for (i = 0; i < blocks.length; i++) {
                items = allMatches(blocks[i][2], /<li[^>]*data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi);
                for (j = 0; j < items.length; j++) {
                    servers.push({
                        type: blocks[i][1],
                        linkId: items[j][1],
                        serverName: decodeHtmlEntities(items[j][2].replace(/<[^>]+>/g, "").trim())
                    });
                }
            }
            return servers;
        }).then(null, function () {
            return [];
        });
    }

    function fetchPlayerUrl(linkId) {
        return fetchJson(BASE_URL + "/ajax/server?get=" + encodeURIComponent(linkId), AJAX_HEADERS).then(function (json) {
            return (json && json.result && json.result.url) || null;
        }).then(null, function () {
            return null;
        });
    }

    function extractStreamFromServer(server) {
        return fetchPlayerUrl(server.linkId).then(function (playerUrl) {
            if (!playerUrl) return null;
            return fetchText(playerUrl, copy(HEADERS, { "Referer": BASE_URL + "/" })).then(function (playerHtml) {
                var dataIdMatch, playerOrigin, sParam, sourcesUrl;
                if (!playerHtml) return null;
                dataIdMatch = playerHtml.match(/data-id="(\d+)"/);
                if (!dataIdMatch) return null;
                playerOrigin = originOf(playerUrl);
                if (!playerOrigin) return null;
                sParam = queryParam(playerUrl, "s") || "tcdn";
                sourcesUrl = playerOrigin + "/stream/getSourcesNew?id=" + dataIdMatch[1] + "&s=" + encodeURIComponent(sParam);
                return fetchJson(sourcesUrl, copy(HEADERS, { "Referer": playerUrl, "X-Requested-With": "XMLHttpRequest" })).then(function (sourcesJson) {
                    var masterUrl, decrypted, subtitles, tracks, langName, i, stream;
                    if (!sourcesJson) return null;
                    masterUrl = sourcesJson.sources && sourcesJson.sources.file;
                    if (!masterUrl && sourcesJson.enc) {
                        decrypted = decryptAesCbc(sourcesJson.enc);
                        masterUrl = decrypted && decrypted.file;
                    }
                    if (!masterUrl || typeof masterUrl !== "string") return null;
                    if (masterUrl.indexOf("fetch.nexabloom.top") !== -1) {
                        masterUrl = masterUrl.replace("fetch.nexabloom.top", "ncdn.imgnex.top");
                    }
                    subtitles = [];
                    tracks = sourcesJson.tracks || [];
                    for (i = 0; i < tracks.length; i++) {
                        if (!tracks[i].file) continue;
                        subtitles.push({
                            url: tracks[i].file,
                            language: tracks[i].label || "Unknown",
                            name: tracks[i].label || "Subtitles"
                        });
                    }
                    langName = server.type === "dub" ? "English" : "Japanese";
                    stream = {
                        title: "Anikoto • " + langName + " • " + server.serverName,
                        name: "Anikoto • " + langName + " • " + server.serverName,
                        quality: "1080p",
                        url: masterUrl,
                        headers: { "Referer": playerOrigin + "/", "Origin": playerOrigin }
                    };
                    if (subtitles.length > 0) stream.subtitles = subtitles;
                    return stream;
                });
            });
        }).then(null, function () {
            return null;
        });
    }

    function scoreTitleMatch(candidateTitle, candidateJp, targetTitle, targetSeason) {
        var cn = normalizeTitle(candidateTitle);
        var jn = candidateJp ? normalizeTitle(candidateJp) : "";
        var tn = normalizeTitle(targetTitle);
        var pair = [cn, jn];
        var best = 0;
        var i, candidate, ratio, candidateSeason;
        if ((!cn && !jn) || !tn) return 0;
        if (cn === tn || jn === tn) return 1;
        for (i = 0; i < pair.length; i++) {
            candidate = pair[i];
            if (!candidate) continue;
            if (candidate === tn) {
                best = 1;
                break;
            }
            ratio = Math.min(candidate.length, tn.length) / Math.max(candidate.length, tn.length);
            if (candidate.indexOf(tn) === 0 || tn.indexOf(candidate) === 0) {
                best = Math.max(best, 0.8 * ratio);
            } else if (candidate.indexOf(tn) !== -1 || tn.indexOf(candidate) !== -1) {
                best = Math.max(best, 0.65 * ratio);
            } else {
                best = Math.max(best, diceCoefficient(candidate, tn));
            }
        }
        if (targetSeason && targetSeason > 1) {
            candidateSeason = parseSeasonNumber(candidateTitle) || (candidateJp ? parseSeasonNumber(candidateJp) : null);
            if (candidateSeason === targetSeason) best += 0.35;
            else if (candidateSeason !== null) best -= 0.4;
        }
        return Math.max(0, best);
    }

    function pickBestCandidate(candidates, meta, targetSeason) {
        var titlesToScore, isMovie, best, highScore, i, j, candidate, candidateScore, s, isItemMovie, isItemOva;
        if (!candidates || !candidates.length) return null;
        titlesToScore = [meta.title, meta.originalTitle].concat(meta.alternateTitles || []).filter(function (t) {
            return t && t.trim();
        });
        isMovie = meta.kind === "movie";
        best = null;
        highScore = -1;
        for (i = 0; i < candidates.length; i++) {
            candidate = candidates[i];
            candidateScore = 0;
            for (j = 0; j < titlesToScore.length; j++) {
                s = scoreTitleMatch(candidate.title, candidate.jpTitle, titlesToScore[j], targetSeason);
                if (s > candidateScore) candidateScore = s;
            }
            isItemMovie = /\bmovie\b/i.test(candidate.title) || /\/movie\b/i.test(candidate.url);
            isItemOva = /\b(?:ova|ona|special)\b/i.test(candidate.title) || /\b(?:ova|ona|special)\b/i.test(candidate.url);
            if (isMovie && !isItemMovie) candidateScore *= 0.5;
            else if (!isMovie && isItemMovie) candidateScore *= 0.6;
            else if (!isMovie && isItemOva) candidateScore *= 0.7;
            if (candidateScore > highScore) {
                highScore = candidateScore;
                best = candidate;
            }
        }
        return highScore >= 0.25 ? best : null;
    }

    function resolveTargetSeasonId(baseAnimeId, seasonNumber, seasonName) {
        if (!seasonNumber || seasonNumber <= 1) return Promise.resolve(baseAnimeId);
        return fetchAnimeSeasons(baseAnimeId).then(function (seasons) {
            var matched = null;
            var normalizedTarget, i, sn;
            if (!seasons.length) return baseAnimeId;
            for (i = 0; i < seasons.length && !matched; i++) {
                if (parseSeasonNumber(seasons[i].name) === seasonNumber) matched = seasons[i];
            }
            if (!matched && seasonName) {
                normalizedTarget = normalizeTitle(seasonName);
                for (i = 0; i < seasons.length && !matched; i++) {
                    sn = normalizeTitle(seasons[i].name);
                    if (sn.indexOf(normalizedTarget) !== -1 || normalizedTarget.indexOf(sn) !== -1) matched = seasons[i];
                }
            }
            if (!matched) return baseAnimeId;
            return resolveAnimeIdFromUrl(matched.url).then(function (resolvedId) {
                return resolvedId || baseAnimeId;
            });
        });
    }

    function resolveTargetEpisode(episodes, episodeNumber, absoluteOffset) {
        var target, i, found;
        if (!episodes || !episodes.length) return null;
        target = episodeNumber > 0 ? episodeNumber : 1;
        for (i = 0; i < episodes.length; i++) {
            if (episodes[i].num === target) return episodes[i];
        }
        if (absoluteOffset > 0) {
            for (i = 0; i < episodes.length; i++) {
                if (episodes[i].num === absoluteOffset + target) return episodes[i];
            }
        }
        if (target > episodes.length) return null;
        found = episodes[target - 1];
        return found === undefined ? null : found;
    }

    function searchQueriesOf(meta) {
        var title = meta.title;
        var original = meta.originalTitle;
        return [
            title,
            original,
            title.indexOf(":") !== -1 ? title.split(":")[0].trim() : null,
            title.indexOf("-") !== -1 ? title.split("-")[0].trim() : null,
            original && original.indexOf(":") !== -1 ? original.split(":")[0].trim() : null
        ].concat(meta.alternateTitles || []).filter(function (t) {
            return t && t.trim();
        }).slice(0, 8);
    }

    function findCandidates(meta) {
        return Promise.all(searchQueriesOf(meta).map(searchAnikoto)).then(function (lists) {
            var i;
            for (i = 0; i < lists.length; i++) {
                if (lists[i].length) return lists[i];
            }
            return [];
        });
    }

    function isHd(server) {
        return server.serverName.toLowerCase().indexOf("hd") !== -1;
    }

    function eligibleServersOf(servers, set) {
        var allowed = servers.filter(function (s) {
            if (s.type === "sub" && !set.enableSub) return false;
            if (s.type === "dub" && !set.enableDub) return false;
            return true;
        });
        return sorted(allowed, function (a, b) {
            var aHd = isHd(a);
            var bHd = isHd(b);
            return aHd === bHd ? 0 : aHd ? -1 : 1;
        });
    }

    function loadStreams(episodes, meta, targetEpisode, seasonAnimeId, set) {
        var matchedEpisode = resolveTargetEpisode(episodes, targetEpisode, meta.absoluteOffset);
        if (!matchedEpisode || !matchedEpisode.dataIds) return Promise.resolve([]);
        return fetchServerList(matchedEpisode.dataIds).then(function (allServers) {
            if (!allServers.length) return [];
            return Promise.all(eligibleServersOf(allServers, set).map(extractStreamFromServer)).then(function (results) {
                var streams = results.filter(function (r) {
                    if (!r || !r.url) return false;
                    if (r.quality === "1080p" && !set.enable1080) return false;
                    if (r.quality === "720p" && !set.enable720) return false;
                    return true;
                });
                return dedupeStreamsByUrl(streams);
            });
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return Promise.resolve().then(function () {
        var set = settings();
        return fetchTmdbMetadata(query.id, query.mediaType, query.season).then(function (meta) {
            if (!meta || !meta.title) return [];
            return findCandidates(meta).then(function (candidates) {
                var matchedAnime;
                if (!candidates.length) return [];
                matchedAnime = pickBestCandidate(candidates, meta, query.season);
                if (!matchedAnime || !matchedAnime.id) return [];
                return resolveTargetSeasonId(matchedAnime.id, query.season, meta.seasonName).then(function (seasonAnimeId) {
                    return fetchEpisodeList(seasonAnimeId).then(function (episodes) {
                        if (!episodes.length) return [];
                        return loadStreams(episodes, meta, query.episode, seasonAnimeId, set);
                    });
                });
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        return Promise.resolve([
            { type: "header", label: "Anikoto" },
            { type: "header", label: "Audio" },
            {
                type: "toggle",
                key: "enableSub",
                label: "Japanese (Sub)",
                defaultValue: true,
                description: "Include Subtitled streams (Japanese audio) streams."
            },
            {
                type: "toggle",
                key: "enableDub",
                label: "English (Dub)",
                defaultValue: true,
                description: "Include Dubbed streams (English audio) streams."
            },
            { type: "header", label: "Quality" },
            {
                type: "toggle",
                key: "enable1080p",
                label: "1080p",
                defaultValue: true,
                description: "Include 1080p streams."
            },
            {
                type: "toggle",
                key: "enable720p",
                label: "720p",
                defaultValue: false,
                description: "Include 720p streams."
            }
        ]);
    }
};