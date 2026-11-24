function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://2y7gpg.movielinkbd.at";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var HEADERS = { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" };

    function parseNumber(value) {
        var number = parseInt(value, 10);
        return isNaN(number) ? 1 : number;
    }

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        return {
            id: String(tmdbId),
            type: mediaType === "movie" ? "movie" : "tv",
            season: parseNumber(season),
            episode: parseNumber(episode)
        };
    }

    function httpGet(url, headers) {
        return Promise.resolve().then(function () {
            return fetch(url, { method: "GET", headers: headers });
        }).then(function (response) {
            return response.text().then(function (body) {
                return { status: response.status, body: body };
            });
        }).then(null, function () {
            return null;
        });
    }

    function buildHeaders(referer, accept) {
        return { "User-Agent": USER_AGENT, "Accept": accept, "Referer": referer };
    }

    function normalizeTitle(value) {
        return String(value == null ? "" : value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
    }

    function stripHtmlTags(html) {
        return html
            .replace(/<[^>]+>/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#039;/g, "'")
            .replace(/&quot;/g, "\"")
            .replace(/\s+/g, " ")
            .trim();
    }

    function parseSearchCard(text) {
        var yearMatch = text.match(/\(((?:19|20)\d{2})\)/);
        var seasonMatch = text.match(/\bS(\d{1,2})\b/i) || text.match(/Season\s*(\d{1,2})/i);
        return {
            normalizedTitle: normalizeTitle(text.replace(/\[[^\]]*\]|\(\d{4}\)|\bS\d{1,2}\b|Season\s*\d{1,2}|\bCompleted\b/gi, " ")),
            year: yearMatch ? parseInt(yearMatch[1], 10) : null,
            season: seasonMatch ? parseInt(seasonMatch[1], 10) : null
        };
    }

    function parseSearchResults(html, type) {
        var cards = [];
        var visitedPaths = Object.create(null);
        var linkPattern = /<a[^>]*href="(\/(?:movie|series|anime|drama)\/[^"]+)"[^>]*>([\s\S]{0,800}?)<\/a>/g;
        var match;
        while ((match = linkPattern.exec(html)) !== null) {
            var path = match[1];
            if (visitedPaths[path] || (type === "movie") !== (path.indexOf("/movie/") === 0)) continue;
            var text = stripHtmlTags(match[2]);
            if (!text) continue;
            visitedPaths[path] = true;
            var card = parseSearchCard(text);
            card.path = path;
            cards.push(card);
        }
        return cards;
    }

    function isYearCompatible(cardYear, tmdbYear) {
        return cardYear == null || tmdbYear == null || Math.abs(cardYear - tmdbYear) <= 1;
    }

    function multiply32(a, b) {
        var ah = (a >>> 16) & 65535;
        var al = a & 65535;
        var bh = (b >>> 16) & 65535;
        var bl = b & 65535;
        return (al * bl + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
    }

    function decodeBase64(text) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var clean = text.replace(/=+$/, "");
        var bytes = [];
        var buffer = 0;
        var bits = 0;
        for (var i = 0; i < clean.length; i++) {
            var index = alphabet.indexOf(clean.charAt(i));
            if (index === -1) throw new Error("base64");
            buffer = (buffer << 6) | index;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                bytes.push((buffer >> bits) & 255);
                buffer &= (1 << bits) - 1;
            }
        }
        return bytes;
    }

    function decodeUtf8(bytes) {
        var encoded = "";
        for (var i = 0; i < bytes.length; i++) {
            encoded += "%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
        }
        return decodeURIComponent(encoded);
    }

    function decodeObfuscatedText(encodedPayload, seedHex, roundCount) {
        try {
            var state = parseInt(seedHex, 16) >>> 0;
            var next = function () {
                state = (multiply32(state, 1103515245) + 12345) >>> 0;
                return state;
            };
            for (var round = parseInt(roundCount, 10) || 0; round > 0; round--) next();
            var binary = decodeBase64(encodedPayload.replace(/\s+/g, ""));
            if (!binary.length) return null;
            var bytes = [];
            for (var position = 0; position < binary.length; position++) {
                bytes.push(binary[position] ^ ((next() >>> 16) & 255));
            }
            return decodeUtf8(bytes);
        } catch (error) {
            return null;
        }
    }

    function decodeButtonPath(encodedPayload, seedHex, roundCount) {
        var text = decodeObfuscatedText(encodedPayload, seedHex, roundCount);
        return text && text.indexOf("/file/") === 0 ? text : null;
    }

    function fetchPageHtml(url, referer) {
        return httpGet(url, buildHeaders(referer, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).then(function (response) {
            return response && response.status === 200 ? response.body : null;
        });
    }

    function parseDownloadButtons(html, type, seasonNumber, episodeNumber) {
        var episodeCards = [];
        var match;
        if (type !== "movie") {
            var cardPattern = /data-season-number="(\d+)"[^>]*data-episode-number="(\d+)"/g;
            while ((match = cardPattern.exec(html)) !== null) {
                episodeCards.push({ position: match.index, season: parseInt(match[1], 10), episode: parseInt(match[2], 10) });
            }
        }
        var buttons = [];
        var anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/g;
        while ((match = anchorPattern.exec(html)) !== null) {
            var tag = match[0];
            var dataMatch = tag.match(/data-dl="([^"]+)"/);
            var seedMatch = tag.match(/data-ds="([0-9a-fA-F]+)"/);
            var roundsMatch = tag.match(/data-dr="(\d+)"/);
            var labelMatch = stripHtmlTags(tag).match(/Download\s*\[\s*([0-9]+p)\s*\u2022\s*([^\]]+)\]/);
            if (!dataMatch || !seedMatch || !roundsMatch || !labelMatch) continue;
            if (type !== "movie") {
                var owner = null;
                for (var i = 0; i < episodeCards.length; i++) {
                    if (episodeCards[i].position < match.index) owner = episodeCards[i];
                    else break;
                }
                if (!owner || owner.season !== seasonNumber || owner.episode !== episodeNumber) continue;
            }
            buttons.push({ quality: labelMatch[1], size: labelMatch[2].trim(), data: dataMatch[1], seed: seedMatch[1], rounds: roundsMatch[1] });
        }
        return buttons;
    }

    function findHostEntryHref(html, host) {
        var anchorPattern = /<a\b[^>]*>/g;
        var match;
        while ((match = anchorPattern.exec(html)) !== null) {
            if (match[0].indexOf("data-host=\"" + host + "\"") === -1) continue;
            var hrefMatch = match[0].match(/href="([^"]+)"/);
            if (hrefMatch && hrefMatch[1].indexOf("/file/") === 0) return hrefMatch[1];
        }
        return null;
    }

    function findFslDirectUrl(html) {
        var match = html.match(/href="(https:\/\/fsl\.movielink\.tv\/d\/[^"]+)"/);
        return match ? match[1].replace(/&amp;/g, "&") : null;
    }

    function fetchFileName(url, referer) {
        return Promise.resolve().then(function () {
            return fetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT, "Accept": "*/*", "Referer": referer, "Range": "bytes=0-0" } });
        }).then(function (response) {
            var disposition = response.headers && response.headers.get ? response.headers.get("content-disposition") : null;
            if (disposition) {
                var encoded = disposition.match(/filename\*\s*=\s*utf-8''([^;]+)/i);
                if (encoded) {
                    try {
                        return decodeURIComponent(encoded[1].trim());
                    } catch (error) {
                        return encoded[1].trim();
                    }
                }
                var quoted = disposition.match(/filename\s*=\s*"([^"]+)"/i) || disposition.match(/filename\s*=\s*([^;]+)/i);
                if (quoted) return quoted[1].trim();
            }
            var segment = url.split("?")[0].split("/").pop();
            try {
                return decodeURIComponent(segment) || null;
            } catch (error) {
                return segment || null;
            }
        }).then(null, function () {
            return null;
        });
    }

    function resolveButtonSource(button, pageUrl) {
        var filePath = decodeButtonPath(button.data, button.seed, button.rounds);
        if (!filePath) return Promise.resolve(null);
        var hubUrl = BASE_URL + filePath;
        return httpGet(hubUrl, buildHeaders(pageUrl, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).then(function (hubResponse) {
            if (!hubResponse || hubResponse.status !== 200) return null;
            var fslEntry = findHostEntryHref(hubResponse.body, "fsl");
            if (!fslEntry) return null;
            var fslPageUrl = BASE_URL + fslEntry;
            return httpGet(fslPageUrl, buildHeaders(hubUrl, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).then(function (fslResponse) {
                var fslUrl = fslResponse && fslResponse.status === 200 ? findFslDirectUrl(fslResponse.body) : null;
                if (!fslUrl) return null;
                return fetchFileName(fslUrl, fslPageUrl).then(function (fileName) {
                    return { url: fslUrl, quality: button.quality, size: button.size, fileName: fileName };
                });
            });
        });
    }

    function fetchButtonSources(html, pageUrl, type, seasonNumber, episodeNumber) {
        var buttons = parseDownloadButtons(html, type, seasonNumber, episodeNumber);
        return Promise.all(buttons.map(function (button) {
            return resolveButtonSource(button, pageUrl);
        })).then(function (sources) {
            return sources.filter(function (source) {
                return source;
            });
        });
    }

    function fetchTmdbDetails(type, id) {
        var url = TMDB_API + "/" + type + "/" + id + "?api_key=" + TMDB_KEY;
        return httpGet(url, buildHeaders("", "application/json, text/plain, */*")).then(function (response) {
            if (!response || response.status !== 200) return null;
            try {
                return JSON.parse(response.body);
            } catch (error) {
                return null;
            }
        });
    }

    function parseSizeToBytes(text) {
        var match = String(text == null ? "" : text).match(/([\d.]+)\s*(gb|mb|kb)/i);
        if (!match) return 0;
        var value = parseFloat(match[1]);
        if (isNaN(value)) return 0;
        var unit = match[2].toLowerCase();
        var factor = unit === "gb" ? 1073741824 : unit === "mb" ? 1048576 : 1024;
        return Math.round(value * factor);
    }

    function formatBitrate(bytes, minutes) {
        if (!bytes || !minutes) return "";
        return ((bytes * 8) / (minutes * 60) / 1000000).toFixed(1) + " Mbps";
    }

    function enrichMetadata(src, qualityStr, serverLabel, sizeStr, sizeBytes, runtimeMinutes) {
        var bullet = " \u2022 ";

        var R51 = "5[.\\s]?1";
        var R71 = "7[.\\s]?1";
        var AUDIO_TABLE = [
            [new RegExp("ddp.?" + R51 + ".*truehd.*" + R71 + "|truehd.*" + R71 + ".*ddp.?" + R51, "i"), "DDP 5.1 + TrueHD 7.1"],
            [new RegExp("ddp.?" + R51 + ".*ddp.?" + R71 + "|ddp.?" + R71 + ".*ddp.?" + R51, "i"), "DDP 5.1 + DDP 7.1"],
            [new RegExp("ddp.?" + R51 + ".*aac.?" + R71 + "|aac.?" + R71 + ".*ddp.?" + R51, "i"), "DDP 5.1 + AAC 7.1"],
            [new RegExp("ddp.?" + R51, "i"), "DDP 5.1"],
            [/truehd/i, "TrueHD 7.1"],
            [new RegExp("aac.*" + R71 + "|" + R71 + ".*aac", "i"), "AAC 7.1"],
            [/aac/i, "AAC 5.1"]
        ];
        var LANGUAGE_PATTERNS = [
            [/\b(?:english|eng)\b/i, "English"],
            [/\bhindi\b/i, "Hindi"],
            [/\btamil\b/i, "Tamil"],
            [/\btelugu\b/i, "Telugu"],
            [/\bmalayalam\b/i, "Malayalam"],
            [/\bkannada\b/i, "Kannada"],
            [/\b(?:bengali|bangla)\b/i, "Bengali"],
            [/\bpunjabi\b/i, "Punjabi"],
            [/\bmarathi\b/i, "Marathi"]
        ];

        var langParts = [];
        for (var i = 0; i < LANGUAGE_PATTERNS.length; i++) {
            if (LANGUAGE_PATTERNS[i][0].test(src)) langParts.push(LANGUAGE_PATTERNS[i][1]);
        }

        var source = "WEB-DL";
        var isRemux = false;
        if (/\bremux\b/i.test(src)) {
            source = "Blu-ray";
            isRemux = true;
        } else if (/\bblu[-\s]?ray\b/i.test(src)) {
            source = "Blu-ray";
        } else if (/\b(?:webrip|hdrip)\b/i.test(src)) {
            source = "WEB-Rip";
        }

        var isImax = /\bimax\b/i.test(src);
        var bit10Tag = /\b10[\s-]?bit\b/i.test(src) ? "10Bit" : "";
        var dvTag = /\b(?:dv|dolby[\s-]?vision)\b/i.test(src) ? "DV" : "";

        var hdrTag = "";
        if (/\b(?:hdr10\+|hdr10p)\b/i.test(src)) hdrTag = "HDR10+";
        else if (/\bhdr10\b/i.test(src)) hdrTag = "HDR10";
        else if (/\bhdr\b/i.test(src)) hdrTag = "HDR";
        else if (/\bsdr\b/i.test(src)) hdrTag = "SDR";

        var codec = /\b(?:hevc|x265|h\.?265)\b/i.test(src) ? "H.265" : "H.264";

        var audio = "";
        for (var j = 0; j < AUDIO_TABLE.length; j++) {
            if (AUDIO_TABLE[j][0].test(src)) {
                audio = AUDIO_TABLE[j][1];
                break;
            }
        }
        if (/\batmos\b/i.test(src)) audio = audio ? audio + " Atmos" : "Atmos";

        var title = ["MovieLinkBD", qualityStr, sizeStr].filter(Boolean).join(bullet);

        var langLine = langParts.length
            ? [String(qualityStr || "").toUpperCase()].concat(langParts).filter(Boolean).join(bullet)
            : "";
        var sourceLine = [
            source,
            isRemux && "REMUX",
            isImax && "IMAX",
            serverLabel,
            formatBitrate(sizeBytes, runtimeMinutes)
        ].filter(Boolean).join(bullet);
        var techLine = [bit10Tag, dvTag, hdrTag, codec, audio, sizeStr].filter(Boolean).join(bullet);

        return {
            title: title,
            quality: [langLine, sourceLine, techLine].filter(Boolean).join("\n")
        };
    }

    function getSortTag(position) {
        var inverted = position.toString(2);
        while (inverted.length < 20) inverted = "0" + inverted;
        return inverted.replace(/1/g, "\uFEFF").replace(/0/g, "\u200B");
    }

    function toStreams(sources, runtimeMinutes) {
        var seenUrls = Object.create(null);
        var kept = [];
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            if (!source || typeof source.url !== "string" || !source.url || seenUrls[source.url]) continue;
            var rawQuality = String(source.quality == null ? "" : source.quality).toLowerCase();
            if (!/2160|1080|4k/.test(rawQuality)) continue;
            seenUrls[source.url] = true;
            var quality = /1080/.test(rawQuality) ? "1080p" : "2160p";
            var sizeBytes = parseSizeToBytes(source.size);
            kept.push({
                index: kept.length,
                url: source.url,
                quality: quality,
                bytes: sizeBytes,
                meta: enrichMetadata(((source.fileName || "") + " " + quality).toLowerCase(), quality, "FSL", source.size || "", sizeBytes, runtimeMinutes)
            });
        }
        kept.sort(function (a, b) {
            return ((b.quality === "2160p" ? 2 : 1) - (a.quality === "2160p" ? 2 : 1)) || (b.bytes - a.bytes) || (a.index - b.index);
        });
        return kept.map(function (entry, position) {
            var sortTag = getSortTag(position);
            return {
                name: sortTag + entry.meta.title,
                title: sortTag + entry.meta.title,
                url: entry.url,
                quality: entry.meta.quality,
                headers: { "User-Agent": HEADERS["User-Agent"], "Referer": HEADERS["Referer"] }
            };
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchTmdbDetails(query.type, query.id).then(function (details) {
        var title = details && (details.title || details.name);
        if (!title) return [];

        var runtimeMinutes = query.type === "tv"
            ? ((details.episode_run_time && details.episode_run_time[0]) || (details.last_episode_to_air && details.last_episode_to_air.runtime) || null)
            : (details.runtime || null);

        var tmdbYear = parseInt((details.release_date || details.first_air_date || "").slice(0, 4), 10) || null;
        var normalizedTitle = normalizeTitle(title);
        var searchUrl = BASE_URL + "/search?q=" + encodeURIComponent(title);

        return httpGet(searchUrl, buildHeaders(BASE_URL + "/", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).then(function (searchResponse) {
            if (!searchResponse || searchResponse.status !== 200) return [];

            var cards = parseSearchResults(searchResponse.body, query.type).filter(function (card) {
                return card.normalizedTitle === normalizedTitle &&
                    isYearCompatible(card.year, tmdbYear) &&
                    (query.type === "movie" || card.season === query.season);
            });

            return Promise.all(cards.map(function (card) {
                var pageUrl = BASE_URL + card.path;
                return fetchPageHtml(pageUrl, searchUrl).then(function (html) {
                    return html ? fetchButtonSources(html, pageUrl, query.type, query.season, query.episode) : [];
                });
            })).then(function (sourceLists) {
                for (var i = 0; i < sourceLists.length; i++) {
                    var streams = toStreams(sourceLists[i], runtimeMinutes);
                    if (streams.length) return streams;
                }
                return [];
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };