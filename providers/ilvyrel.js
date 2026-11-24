function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://toonworld4all.me";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var ARCV_BASE = "https://archive.toonworld4all.me";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    var PROVIDER = "ToonWorld4All";
    var runtimeMinutes = null;

    function buildQuery() {
        var id = String(tmdbId == null ? "" : tmdbId);
        if (!/^\d+$/.test(id)) return null;
        var isSeries = mediaType === "tv";
        if (isSeries && (season == null || episode == null)) return null;
        return {
            id: id,
            isSeries: isSeries,
            seasonNumber: isSeries ? Number(season) : null,
            episodeNumber: isSeries ? Number(episode) : null
        };
    }

    function fetchText(url, extra) {
        var headers = { "User-Agent": USER_AGENT };
        if (extra) {
            var keys = Object.keys(extra);
            for (var i = 0; i < keys.length; i++) headers[keys[i]] = extra[keys[i]];
        }
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headers });
        }).then(function (response) {
            if (!response || !response.ok) return null;
            return response.text();
        }).then(null, function () {
            return null;
        });
    }

    function flatten(lists) {
        return lists.reduce(function (accumulator, list) {
            return accumulator.concat(list);
        }, []);
    }

    function pad2(value) {
        var text = String(value);
        return text.length < 2 ? "0" + text : text;
    }

    function decodeEntities(value) {
        return String(value).replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g, function (whole, decimal, hex, named) {
            if (decimal) return String.fromCharCode(parseInt(decimal, 10));
            if (hex) return String.fromCharCode(parseInt(hex, 16));
            return { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" }[named];
        });
    }

    function textOf(html) {
        return decodeEntities(html.replace(/<[^>]*>/g, ""));
    }

    function attributeOf(attrs, name) {
        var match = attrs.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))", "i"));
        if (!match) return null;
        if (match[1] !== undefined) return decodeEntities(match[1]);
        if (match[2] !== undefined) return decodeEntities(match[2]);
        return decodeEntities(match[3]);
    }

    function hasClass(attrs, name) {
        var value = attributeOf(attrs, "class");
        return value !== null && (" " + value.replace(/\s+/g, " ") + " ").indexOf(" " + name + " ") !== -1;
    }

    function innerOf(source, name, offset) {
        var scan = new RegExp("<(/?)" + name + "\\b[^>]*>", "gi");
        var depth = 1;
        var match;
        scan.lastIndex = offset;
        while ((match = scan.exec(source)) !== null) {
            if (match[1]) depth--;
            else if (!/\/>$/.test(match[0])) depth++;
            if (depth === 0) return source.slice(offset, match.index);
        }
        return source.slice(offset);
    }

    function elements(html, test) {
        var source = html
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<script\b[\s\S]*?<\/script>/gi, "")
            .replace(/<style\b[\s\S]*?<\/style>/gi, "");
        var pattern = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
        var found = [];
        var match;
        while ((match = pattern.exec(source)) !== null) {
            var name = match[1].toLowerCase();
            if (!test(name, match[2])) continue;
            found.push({ attrs: match[2], inner: innerOf(source, name, pattern.lastIndex) });
        }
        return found;
    }

    function hrefOf(element) {
        return (attributeOf(element.attrs, "href") || "").trim();
    }

    function hexToBytes(hex) {
        var bytes = [];
        for (var i = 0; i + 1 < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }
        return bytes;
    }

    function bytesToUtf8(bytes) {
        try {
            var encoded = "";
            for (var i = 0; i < bytes.length; i++) {
                encoded += "%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
            }
            return decodeURIComponent(encoded);
        } catch (error) {
            return String.fromCharCode.apply(null, bytes);
        }
    }

    function aesTables() {
        var sbox = [];
        var p = 1;
        var q = 1;
        do {
            p = (p ^ (p << 1) ^ ((p & 128) ? 27 : 0)) & 255;
            q = (q ^ (q << 1)) & 255;
            q = (q ^ (q << 2)) & 255;
            q = (q ^ (q << 4)) & 255;
            if (q & 128) q ^= 9;
            var value = q;
            for (var shift = 1; shift <= 4; shift++) {
                value ^= ((q << shift) | (q >> (8 - shift))) & 255;
            }
            sbox[p] = (value ^ 99) & 255;
        } while (p !== 1);
        sbox[0] = 99;
        return sbox;
    }

    function xtime(value) {
        return ((value << 1) ^ ((value & 128) ? 27 : 0)) & 255;
    }

    function expandKey(key, sbox) {
        var words = key.slice();
        var rcon = 1;
        for (var i = 32; i < 240; i += 4) {
            var temp = words.slice(i - 4, i);
            if (i % 32 === 0) {
                temp = [sbox[temp[1]] ^ rcon, sbox[temp[2]], sbox[temp[3]], sbox[temp[0]]];
                rcon = xtime(rcon);
            } else if (i % 32 === 16) {
                temp = [sbox[temp[0]], sbox[temp[1]], sbox[temp[2]], sbox[temp[3]]];
            }
            for (var j = 0; j < 4; j++) words[i + j] = words[i - 32 + j] ^ temp[j];
        }
        return words;
    }

    function encryptBlock(block, roundKeys, sbox) {
        var state = block.slice();
        var round;
        var i;
        var c;
        for (i = 0; i < 16; i++) state[i] ^= roundKeys[i];
        for (round = 1; round <= 14; round++) {
            var shifted = [];
            for (i = 0; i < 16; i++) state[i] = sbox[state[i]];
            for (c = 0; c < 4; c++) {
                for (var r = 0; r < 4; r++) shifted[r + 4 * c] = state[r + 4 * ((c + r) % 4)];
            }
            state = shifted;
            if (round < 14) {
                for (c = 0; c < 4; c++) {
                    var a0 = state[4 * c];
                    var a1 = state[4 * c + 1];
                    var a2 = state[4 * c + 2];
                    var a3 = state[4 * c + 3];
                    state[4 * c] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3;
                    state[4 * c + 1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3;
                    state[4 * c + 2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3;
                    state[4 * c + 3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3);
                }
            }
            for (i = 0; i < 16; i++) state[i] ^= roundKeys[round * 16 + i];
        }
        return state;
    }

    function decryptRedirectToken(tokenHex) {
        try {
            if (!tokenHex || tokenHex.length < 34) return null;

            var rawBytes = hexToBytes(tokenHex);
            var counter = rawBytes.slice(0, 16);
            var cipherBytes = rawBytes.slice(16);
            var blockCount = Math.ceil(cipherBytes.length / 16);
            var sbox = aesTables();
            var roundKeys = expandKey(hexToBytes("556151c9cefdee6ea51aec956e6b8682312bb609c0167d4adc71f365a928920f"), sbox);

            var keystream = [];
            for (var block = 0; block < blockCount; block++) {
                keystream = keystream.concat(encryptBlock(counter, roundKeys, sbox));
                for (var i = 15; i >= 0; i--) {
                    counter[i] = (counter[i] + 1) & 255;
                    if (counter[i] !== 0) break;
                }
            }

            var plainBytes = new Array(cipherBytes.length);
            for (var k = 0; k < cipherBytes.length; k++) {
                plainBytes[k] = cipherBytes[k] ^ keystream[k];
            }

            var payload = JSON.parse(bytesToUtf8(plainBytes));
            return (payload && payload.url) || null;
        } catch (error) {
            return null;
        }
    }

    function extractEmbeddedProps(html) {
        var markerIndex = html.indexOf("__PROPS__");
        if (markerIndex === -1) return null;

        var jsonStart = html.indexOf("{", markerIndex);
        if (jsonStart === -1) return null;
        var jsonEnd = html.indexOf("</script>", jsonStart);
        if (jsonEnd === -1) return null;

        try {
            return JSON.parse(html.slice(jsonStart, jsonEnd).trim().replace(/;\s*$/, ""));
        } catch (error) {
            return null;
        }
    }

    function resolveRedirectTarget(redirectPath) {
        var rawPath = String(redirectPath || "");
        var tokenMatch = rawPath.match(/\/redirect\/([0-9a-fA-F]{32,})/);

        if (tokenMatch) {
            var decryptedUrl = decryptRedirectToken(tokenMatch[1]);
            if (decryptedUrl && decryptedUrl.indexOf("http") === 0) return Promise.resolve(decryptedUrl);
        }

        var absoluteUrl = rawPath.indexOf("http") === 0
            ? rawPath
            : ARCV_BASE + (rawPath.charAt(0) === "/" ? "" : "/") + rawPath;

        return fetchText(absoluteUrl).then(function (html) {
            if (html === null) return null;

            var props = extractEmbeddedProps(html);
            if (props) {
                if (props.link && props.link.domain && props.link.hidden) {
                    return props.link.domain + props.link.hidden;
                }
                if (props.destination && props.destination.indexOf("http") === 0) {
                    return props.destination;
                }
            }

            var obfuscatedMatch = html.match(/<code>(https?:\/\/[^<]+)<span[^>]*>([^<]+)<\/span><\/code>/i);
            if (obfuscatedMatch) return obfuscatedMatch[1] + obfuscatedMatch[2];

            var hostMatch = html.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:hubcloud\.[a-z]+|pixeldrain\.[a-z]+)\/[^\s"<>']+/i);
            if (hostMatch) return hostMatch[0];
            return null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchMetadata(query) {
        var url = TMDB_API + "/" + (query.isSeries ? "tv" : "movie") + "/" + query.id + "?api_key=" + TMDB_KEY;
        return fetchText(url).then(function (text) {
            if (text === null) return null;
            var data = JSON.parse(text);
            if (!data) return null;

            var title = query.isSeries ? (data.name || data.original_name) : (data.title || data.original_title);
            var releaseDate = query.isSeries ? data.first_air_date : data.release_date;
            if (!title) return null;
            runtimeMinutes = query.isSeries
                ? ((data.episode_run_time && data.episode_run_time[0]) ||
                    (data.last_episode_to_air && data.last_episode_to_air.runtime) || null)
                : (data.runtime || null);
            return {
                title: title,
                year: releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null
            };
        }).then(null, function () {
            return null;
        });
    }

    function normalizeTitle(value) {
        if (!value) return "";
        return value
            .toLowerCase()
            .replace(/^download\s+/i, "")
            .replace(/\b(the|a|an)\b/g, "")
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function scoreSearchResult(resultTitle, targetTitle, targetYear, isSeries, seasonNumber) {
        var normalizedTarget = normalizeTitle(targetTitle);
        var normalizedResult = normalizeTitle(resultTitle);
        var targetWords = normalizedTarget.split(" ").filter(Boolean);
        var matchedWords = targetWords.filter(function (word) {
            return normalizedResult.indexOf(word) !== -1;
        });

        if (targetWords.length > 0 && matchedWords.length === 0) return -1;

        var score = targetWords.length > 0 ? matchedWords.length / targetWords.length : 0;

        if (normalizedResult.indexOf(normalizedTarget) === 0) score += 0.35;
        else if (normalizedResult.indexOf(normalizedTarget) !== -1) score += 0.15;

        if (targetYear && resultTitle.indexOf(String(targetYear)) !== -1) score += 0.25;

        if (isSeries) {
            var seasonPattern = new RegExp(
                "\\b(?:Season\\s*0*" + seasonNumber + "|S" + pad2(seasonNumber) + "|S0*" + seasonNumber + ")\\b",
                "i"
            );

            if (seasonPattern.test(resultTitle)) score += 0.4;
            else if (/\b(?:Season\s*\d+|S\d{1,2})\b/i.test(resultTitle)) score -= 0.45;
        } else if (/\b(?:Season\s*\d+|S\d{1,2}|Episodes)\b/i.test(resultTitle)) {
            score -= 0.4;
        }

        return score;
    }

    function qualityOf(fileName, fallbackLabel) {
        var qualityPattern = /\b(2160p|4K|UHD|1440p|2K|1080p|720p|540p|480p|360p)\b/i;
        var match = String(fileName || "").match(qualityPattern) || String(fallbackLabel || "").match(qualityPattern);

        if (!match) return "1080p";

        var quality = match[1].toUpperCase();
        if (quality === "2160P" || quality === "4K" || quality === "UHD") return "4K";
        if (quality === "1080P") return "1080p";
        return "other";
    }

    function cleanSize(rawSize) {
        var text = String(rawSize || "");
        var match = text.match(/(\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB))/i);
        return match ? match[1].replace(/\s+/g, " ").trim() : text.split("|")[0].trim();
    }

    function formatBitrate(bytes, minutes) {
        if (!bytes || !minutes) return "";
        return ((bytes * 8) / (minutes * 60) / 1000000).toFixed(1) + " Mbps";
    }

    function enrichMetadata(src, qualityStr, serverLabel, sizeStr, sizeBytes) {
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
        var audioChannels = "";
        if (/\bmulti[\s-]?audio\b/i.test(src) || langParts.length > 2) audioChannels = "Multi Audio";
        else if (/\bdual[\s-]?audio\b/i.test(src) || langParts.length === 2) audioChannels = "Dual Audio";

        var source = "WEB-DL";
        var isRemux = false;
        if (/\bremux\b/i.test(src)) {
            source = "Blu-ray";
            isRemux = true;
        } else if (/\bblu[-\s]?ray\b|\bbdrip\b|\bbrrip\b/i.test(src)) {
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

        var title = [PROVIDER, qualityStr, sizeStr].filter(Boolean).join(bullet);

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
        var techLine = [bit10Tag, dvTag, hdrTag, codec, audio, audioChannels].filter(Boolean).join(bullet);

        return {
            title: title,
            quality: [langLine, sourceLine, techLine].filter(Boolean).join("\n")
        };
    }

    function toStream(serverLabel, url, fileName, fallbackLabel, fileSize) {
        var resolution = qualityOf(fileName, fallbackLabel);
        var sizeStr = cleanSize(fileSize);
        var sizeBytes = Math.round(sizeInMegabytes(sizeStr) * 1024 * 1024);
        var meta = enrichMetadata(
            (String(fileName || "") + " " + String(fallbackLabel || "")).toLowerCase(),
            resolution === "4K" ? "2160p" : resolution,
            serverLabel,
            sizeStr,
            sizeBytes
        );
        return {
            name: meta.title,
            title: meta.title,
            url: url,
            quality: meta.quality,
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/" },
            _bytes: sizeBytes,
            _resolution: resolution
        };
    }

    function toPixeldrainStream(link, fileName, label, fileSize) {
        var match = link.match(/\/u\/([A-Za-z0-9_-]+)/);
        if (!match) return null;
        return toStream("PixelDrain", "https://pixeldrain.com/api/file/" + match[1] + "?download", fileName, label, fileSize);
    }

    function textOfFirst(html, test) {
        var found = elements(html, test)[0];
        return found ? textOf(found.inner).trim() : "";
    }

    function isCardHeader(name, attrs) {
        return name === "div" && hasClass(attrs, "card-header");
    }

    function extractHubCloudStreams(pageUrl, label, fallbackSize) {
        return fetchText(pageUrl).then(function (html) {
            if (html === null) return [];

            var fileName = textOfFirst(html, isCardHeader);
            var sizeText = textOfFirst(html, function (name, attrs) {
                return name === "i" && attributeOf(attrs, "id") === "size";
            });
            var sizeMatch = sizeText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
            var fileSize = (sizeMatch ? sizeMatch[1] : "") || fallbackSize || "";

            var download = elements(html, function (name, attrs) {
                return name === "a" && attributeOf(attrs, "id") === "download" && attributeOf(attrs, "href") !== null;
            })[0];
            var primary = elements(html, function (name, attrs) {
                var href = attributeOf(attrs, "href");
                return name === "a" && hasClass(attrs, "btn-primary") && href !== null && href.indexOf("hubcloud.php") !== -1;
            })[0];
            var generatorUrl = (download && attributeOf(download.attrs, "href")) || (primary && attributeOf(primary.attrs, "href")) || "";
            if (!generatorUrl) {
                var fallbackMatch = html.match(/https?:\/\/[^"'\s>]+hubcloud\.php\?[^"'\s>]+/i);
                if (fallbackMatch) generatorUrl = fallbackMatch[0];
            }
            if (!generatorUrl) return [];

            return fetchText(generatorUrl, { "Referer": pageUrl }).then(function (generatorHtml) {
                if (generatorHtml === null) return [];

                var streams = [];
                var name = fileName || textOfFirst(generatorHtml, isCardHeader);
                var anchors = elements(generatorHtml, function (tag, attrs) {
                    return tag === "a" && attributeOf(attrs, "href") !== null;
                });

                for (var i = 0; i < anchors.length; i++) {
                    var text = textOf(anchors[i].inner).trim();
                    var link = hrefOf(anchors[i]);
                    if (link.indexOf("http") !== 0) continue;

                    if (/FSLv2/i.test(text)) {
                        streams.push(toStream("FSL-v2", link, name, label, fileSize));
                    } else if (/FSL\s*Server/i.test(text)) {
                        streams.push(toStream("FSL", link, name, label, fileSize));
                    } else if (/pixeldrain|pixelserver/i.test(text) || link.indexOf("pixeldrain.") !== -1) {
                        var pixeldrainStream = toPixeldrainStream(link, name, label, fileSize);
                        if (pixeldrainStream) streams.push(pixeldrainStream);
                    }
                }
                return streams;
            });
        }).then(null, function () {
            return [];
        });
    }

    function streamsFromRedirect(redirectLink, label, size) {
        return resolveRedirectTarget(redirectLink).then(function (destinationUrl) {
            if (!destinationUrl) return [];

            if (destinationUrl.indexOf("hubcloud.") !== -1) {
                return extractHubCloudStreams(destinationUrl, label, size);
            }

            if (destinationUrl.indexOf("pixeldrain.") !== -1) {
                var pixeldrainStream = toPixeldrainStream(destinationUrl, "", label, size);
                return pixeldrainStream ? [pixeldrainStream] : [];
            }
            return [];
        }).then(null, function () {
            return [];
        });
    }

    function streamsFromArchive(archiveUrl, postTitle) {
        return fetchText(archiveUrl).then(function (html) {
            if (html === null) return [];

            var pending = [];
            var props = extractEmbeddedProps(html);
            var encodes = (props && props.data && props.data.data && props.data.data.encodes) || [];

            for (var i = 0; i < encodes.length; i++) {
                var encode = encodes[i];
                var codec = (encode.readable && encode.readable.codec) || encode.resolution || "";
                var size = (encode.readable && encode.readable.size) || "";
                var label = [codec, postTitle].filter(Boolean).join(" ");
                var files = encode.files || [];

                for (var j = 0; j < files.length; j++) {
                    if (files[j] && files[j].link) pending.push(streamsFromRedirect(files[j].link, label, size));
                }
            }

            if (pending.length === 0) {
                var seen = Object.create(null);
                var anchors = elements(html, function (name, attrs) {
                    var href = attributeOf(attrs, "href");
                    return name === "a" && href !== null && href.indexOf("/redirect/") !== -1;
                });
                for (var k = 0; k < anchors.length; k++) {
                    var href = hrefOf(anchors[k]);
                    if (!href || seen[href]) continue;
                    seen[href] = true;
                    pending.push(streamsFromRedirect(href, postTitle, ""));
                }
            }

            return Promise.all(pending).then(flatten);
        }).then(null, function () {
            return [];
        });
    }

    function buildEpisodePattern(seasonNumber, episodeNumber) {
        var pattern = "(?:-" + seasonNumber + "x0*" + episodeNumber +
            "|-" + pad2(seasonNumber) + "x0*" + episodeNumber +
            "|-(?:ep|episode)-?0*" + episodeNumber;

        if (seasonNumber === 1) pattern += "|-[xX]0*" + episodeNumber;

        return new RegExp(pattern + ")(?:/|\\?|$)", "i");
    }

    function searchPosts(searchQuery, metadata, query) {
        return fetchText(BASE_URL + "/?s=" + encodeURIComponent(searchQuery)).then(function (html) {
            if (html === null) return [];

            var candidates = [];
            var articles = elements(html, function (name) {
                return name === "article";
            });

            for (var i = 0; i < articles.length; i++) {
                var inner = articles[i].inner;
                var anchor = elements(inner, function (name, attrs) {
                    return name === "a" && attributeOf(attrs, "href") !== null;
                })[0];
                var heading = elements(inner, function (name, attrs) {
                    return name === "h2" || hasClass(attrs, "entry-title");
                })[0];
                var url = anchor ? hrefOf(anchor) : "";
                var title = ((heading ? textOf(heading.inner) : "") || (anchor ? textOf(anchor.inner) : "")).trim();

                if (!url || !title || /shows-list|movies-list/i.test(url)) continue;

                var score = scoreSearchResult(title, metadata.title, metadata.year, query.isSeries, query.seasonNumber);
                if (score >= 0.35) candidates.push({ url: url, score: score, title: title });
            }
            return candidates;
        }).then(null, function () {
            return [];
        });
    }

    function findBestMatchingPost(metadata, query) {
        var normalizedQuery = metadata.title
            .toLowerCase()
            .replace(/[()[\]!?&'",:._-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        var shortQuery = normalizedQuery.split(" ").slice(0, 3).join(" ");

        var queries = [normalizedQuery];
        if (shortQuery && shortQuery !== normalizedQuery) queries.push(shortQuery);

        return Promise.all(queries.map(function (searchQuery) {
            return searchPosts(searchQuery, metadata, query);
        })).then(function (results) {
            var seenUrls = Object.create(null);
            var best = null;

            for (var i = 0; i < results.length; i++) {
                for (var j = 0; j < results[i].length; j++) {
                    var candidate = results[i][j];
                    if (seenUrls[candidate.url]) continue;
                    seenUrls[candidate.url] = true;
                    if (!best || candidate.score > best.score) best = candidate;
                }
            }
            return best;
        });
    }

    function sizeInMegabytes(sizeText) {
        var match = String(sizeText || "").match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)/i);
        if (!match) return 0;

        var multipliers = { TB: 1024 * 1024, GB: 1024, MB: 1, KB: 1 / 1024 };
        return parseFloat(match[1]) * multipliers[match[2].toUpperCase()];
    }

    function getSortTag(rank) {
        var binary = Math.max(0, 1000000 - rank).toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (bit) {
            return bit === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function sortAndTag(streams) {
        var rows = streams.map(function (stream, index) {
            return { stream: stream, index: index };
        });
        rows.sort(function (a, b) {
            return ((b.stream._bytes || 0) - (a.stream._bytes || 0)) || (a.index - b.index);
        });
        return rows.map(function (entry, position) {
            var sortTag = getSortTag(1000000 - position);
            return {
                name: sortTag + entry.stream.name,
                title: sortTag + entry.stream.title,
                url: entry.stream.url,
                quality: entry.stream.quality,
                headers: entry.stream.headers
            };
        });
    }

    function archiveLinks(html, query) {
        var episodePattern = query.isSeries ? buildEpisodePattern(query.seasonNumber, query.episodeNumber) : null;
        var seen = Object.create(null);
        var urls = [];
        var anchors = elements(html, function (name, attrs) {
            var href = attributeOf(attrs, "href");
            return name === "a" && href !== null && href.indexOf("archive.toonworld4all") !== -1;
        });

        for (var i = 0; i < anchors.length; i++) {
            var href = hrefOf(anchors[i]);
            if (!href || seen[href]) continue;
            var wanted = query.isSeries
                ? href.indexOf("/episode/") !== -1 && episodePattern.test(href)
                : href.indexOf("/movie/") !== -1;
            if (!wanted) continue;
            seen[href] = true;
            urls.push(href);
        }
        return urls;
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchMetadata(query).then(function (metadata) {
        if (!metadata) return [];

        return findBestMatchingPost(metadata, query).then(function (post) {
            if (!post) return [];

            return fetchText(post.url).then(function (html) {
                if (html === null) return [];

                return Promise.all(archiveLinks(html, query).map(function (url) {
                    return streamsFromArchive(url, post.title);
                })).then(function (results) {
                    var seenUrls = Object.create(null);
                    var unique = flatten(results).filter(function (stream) {
                        if (!stream || !stream.url) return false;
                        if (stream._resolution !== "4K" && stream._resolution !== "1080p") return false;
                        if (seenUrls[stream.url]) return false;
                        seenUrls[stream.url] = true;
                        return true;
                    });
                    return sortAndTag(unique);
                });
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };