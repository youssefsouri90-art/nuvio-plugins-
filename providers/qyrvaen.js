function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "HdHub4u";
    var BASE_URL = "https://new15.hdhub4u.cl";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var SRCH_URL = "https://search.pingora.fyi";
    var HBC_BASE = "https://hubcloud.ist";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
    };
    var runtimeMinutes = null;
    function request(url, options) {
        return Promise.resolve().then(function () {
            return fetch(url, options);
        }).then(null, function () {
            return null;
        });
    }

    function getText(url, headers) {
        var options = { skipSizeCheck: true, redirect: "follow" };
        if (headers) options.headers = headers;
        return request(url, options).then(function (res) {
            return res ? res.text() : null;
        }).then(null, function () {
            return null;
        });
    }

    function attempt(task) {
        return Promise.resolve().then(task).then(null, function () {
            return [];
        });
    }

    function extend(target, source) {
        var keys = Object.keys(source || {});
        for (var i = 0; i < keys.length; i++) target[keys[i]] = source[keys[i]];
        return target;
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) out = out.concat(lists[i] || []);
        return out;
    }

    function unique(list) {
        var seen = Object.create(null);
        return list.filter(function (item) {
            if (seen[item]) return false;
            seen[item] = true;
            return true;
        });
    }

    function sortStable(list, compare) {
        var slots = list.map(function (item, index) {
            return { item: item, index: index };
        });
        slots.sort(function (a, b) {
            return compare(a.item, b.item) || a.index - b.index;
        });
        return slots.map(function (slot) {
            return slot.item;
        });
    }

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        if (mediaType === "tv" && (season == null || episode == null)) return null;
        return { tmdbId: tmdbId, mediaType: mediaType, season: season, episode: episode };
    }

    function resolveSettings() {
        var s = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};

        function cap(key, def) {
            var raw = s[key];
            if (raw === undefined || raw === null || raw === "") return def;
            if (raw === "unlimited") return Infinity;
            var n = parseInt(raw, 10);
            return (isNaN(n) || n <= 0) ? def : n;
        }

        return {
            sortBySize: s.sortBySize === true,
            enable4K: s.enable4K !== false,
            enable1080p: s.enable1080p !== false,
            max4K: cap("max4K", Infinity),
            max1080p: cap("max1080p", Infinity)
        };
    }

    function resWeight(quality) {
        var q = (quality || "").toUpperCase();
        if (q === "4K" || q === "2160P") return 5;
        if (q === "1440P") return 4;
        if (q === "1080P") return 3;
        if (q === "720P") return 2;
        if (q === "480P") return 1;
        return 0;
    }

    function getInvertedSortTag(score, maxScore) {
        var val = Math.max(0, parseInt(score, 10) || 0);
        var bin = Math.max(0, maxScore - val).toString(2);
        while (bin.length < 20) bin = "0" + bin;
        var chars = [];
        for (var i = 0; i < bin.length; i++) {
            chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
        }
        return chars.join("");
    }

    function applySettings(streams, settings) {
        streams = streams.filter(function (s) {
            if (s._resolution === "2160p" && !settings.enable4K) return false;
            if (s._resolution === "1080p" && !settings.enable1080p) return false;
            return true;
        });

        streams = sortStable(streams, function (a, b) {
            var d = 0;
            if (!settings.sortBySize) d = resWeight(b._resolution) - resWeight(a._resolution);
            if (d === 0) d = (b._bytes || 0) - (a._bytes || 0);
            return d;
        });

        var resCounts = {};
        streams = streams.filter(function (s) {
            var res = s._resolution || "";
            var limit = res === "2160p" ? settings.max4K : res === "1080p" ? settings.max1080p : Infinity;
            if (limit === Infinity) return true;
            resCounts[res] = (resCounts[res] || 0) + 1;
            return resCounts[res] <= limit;
        });

        var seen = Object.create(null);
        streams = streams.filter(function (s) {
            if (!s.url || seen[s.url]) return false;
            seen[s.url] = true;
            return true;
        });

        var total = streams.length;
        return streams.map(function (s, i) {
            var tag = getInvertedSortTag(total - i, total + 1);
            return {
                name: tag + s.name,
                title: tag + s.title,
                url: s.url,
                quality: s.quality,
                headers: s.headers
            };
        });
    }

    function originOf(url) {
        var m = /^(https?:\/\/[^\/]+)/.exec(url || "");
        return m ? m[1] : "";
    }

    function hostnameOf(url) {
        var m = /^https?:\/\/([^\/:?#]+)/i.exec(url || "");
        return m ? m[1].toLowerCase() : "";
    }

    function parseResolutionValue(str) {
        var m = /(\d{3,4})[pP]/.exec(str || "");
        return m ? parseInt(m[1], 10) : 2160;
    }

    function resolutionLabel(pixels) {
        return pixels >= 2160 ? "2160p" : "1080p";
    }

    function parseSizeToBytes(sizeStr) {
        var m = /([\d.]+)\s*(GB|MB|KB)/i.exec(sizeStr || "");
        if (!m) return 0;
        var val = parseFloat(m[1]);
        var unit = m[2].toUpperCase();
        if (unit === "GB") return val * Math.pow(1024, 3);
        if (unit === "MB") return val * Math.pow(1024, 2);
        return val * 1024;
    }

    function formatFileSize(bytes) {
        if (!bytes) return "";
        var k = 1024;
        var units = ["Bytes", "KB", "MB", "GB", "TB"];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + units[i];
    }

    function formatBitrate(bytes, minutes) {
        if (!bytes || !minutes) return "";
        return ((bytes * 8) / (minutes * 60) / 1000000).toFixed(1) + " Mbps";
    }

    function passesMinSizeCheck(bytes) {
        if (!bytes) return true;
        return bytes >= 1024 * 1024 * 1024;
    }

    function composeStreamMeta(displayTitle, qualityStr, headerText, serverLabel, sizeStr, sizeBytes) {
        var src = (headerText + " " + (displayTitle || "")).toLowerCase();
        return enrichMetadata(src, qualityStr, serverLabel, sizeStr, sizeBytes);
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
        var LANG_PATTERNS = [
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
        for (var i = 0; i < LANG_PATTERNS.length; i++) {
            if (LANG_PATTERNS[i][0].test(src)) langParts.push(LANG_PATTERNS[i][1]);
        }
        var audioChannels = langParts.length > 2 ? "Multi Audio" : langParts.length === 2 ? "Dual Audio" : "";

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

    function decodeBase64(value) {
        var input = (value || "").replace(/[^A-Za-z0-9+\/=]/g, "");
        if (input.length % 4 === 0) input = input.replace(/==?$/, "");
        if (input.length % 4 === 1 || /[^A-Za-z0-9+\/]/.test(input)) throw new Error("base64");
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var out = "";
        var buffer = 0;
        var bits = 0;
        for (var i = 0; i < input.length; i++) {
            buffer = (buffer << 6) | alphabet.indexOf(input.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out += String.fromCharCode((buffer >> bits) & 255);
                buffer &= (1 << bits) - 1;
            }
        }
        return out;
    }

    function applyRot13(value) {
        return (value || "").replace(/[a-zA-Z]/g, function (c) {
            var base = c <= "Z" ? 65 : 97;
            return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
        });
    }

    function decodeEntities(text) {
        return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g, function (all, dec, hex, name) {
            if (name) {
                return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0" }[name];
            }
            var code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
            return code > 0 && code < 65536 ? String.fromCharCode(code) : all;
        });
    }

    function parseAttributes(source) {
        var attrs = Object.create(null);
        var re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
        var m;
        while ((m = re.exec(source)) !== null) {
            var name = m[1].toLowerCase();
            if (name in attrs) continue;
            var value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
            attrs[name] = decodeEntities(value);
        }
        return attrs;
    }

    function parseHtml(html) {
        var root = { tag: "#root", attrs: Object.create(null), parent: null, parts: [] };
        var all = [];
        var stack = [root];
        var voids = " area base br col embed hr img input link meta param source track wbr ";
        var re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<[^>]*>|[^<]+|</g;
        var m;
        while ((m = re.exec(String(html || ""))) !== null) {
            var top = stack[stack.length - 1];
            if (m[2] === undefined) {
                if (m[0].charAt(0) !== "<" || m[0] === "<") top.parts.push(decodeEntities(m[0]));
                continue;
            }
            var tag = m[2].toLowerCase();
            if (m[1] === "/") {
                for (var i = stack.length - 1; i > 0; i--) {
                    if (stack[i].tag === tag) {
                        stack.length = i;
                        break;
                    }
                }
                continue;
            }
            var el = { tag: tag, attrs: parseAttributes(m[3]), parent: top, parts: [] };
            top.parts.push(el);
            all.push(el);
            if (voids.indexOf(" " + tag + " ") >= 0) continue;
            if (tag === "script" || tag === "style") {
                var close = String(html).toLowerCase().indexOf("</" + tag, re.lastIndex);
                if (close < 0) {
                    re.lastIndex = String(html).length;
                } else {
                    var end = String(html).indexOf(">", close);
                    re.lastIndex = end < 0 ? String(html).length : end + 1;
                }
                continue;
            }
            stack.push(el);
        }
        return { root: root, all: all };
    }

    function textOf(node) {
        var out = "";
        for (var i = 0; i < node.parts.length; i++) {
            var part = node.parts[i];
            out += typeof part === "string" ? part : textOf(part);
        }
        return out;
    }

    function hasClass(el, name) {
        return (" " + (el.attrs["class"] || "").replace(/\s+/g, " ") + " ").indexOf(" " + name + " ") >= 0;
    }

    function inside(el, test) {
        for (var p = el.parent; p; p = p.parent) {
            if (test(p)) return true;
        }
        return false;
    }

    function select(doc, test) {
        return doc.all.filter(test);
    }

    function isTag(name) {
        return function (el) {
            return el.tag === name;
        };
    }

    function anchorsUnder(doc, test) {
        return select(doc, function (el) {
            return el.tag === "a" && inside(el, test);
        });
    }

    function hrefOf(el) {
        return el.attrs.href || "";
    }

    function bodyText(text) {
        var doc = parseHtml(text);
        var bodies = select(doc, isTag("body"));
        if (bodies.length) return textOf(bodies[0]).trim();
        var out = "";
        for (var i = 0; i < doc.root.parts.length; i++) {
            var part = doc.root.parts[i];
            if (typeof part === "string") out += part;
            else if (part.tag !== "head") out += textOf(part);
        }
        return out.trim();
    }

    function parseRedirect(html) {
        try {
            var regex = /s\('o','([A-Za-z0-9+\/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
            var combined = "";
            var m;
            while ((m = regex.exec(html)) !== null) combined += m[1] || m[2] || "";

            var payload = JSON.parse(decodeBase64(applyRot13(decodeBase64(decodeBase64(combined)))));
            return {
                encodedUrl: decodeBase64(payload.o || "").trim(),
                data: (payload.data || "").trim(),
                wpHttp: (payload.blog_url || payload.l || "").trim()
            };
        } catch (error) {
            return null;
        }
    }

    function resolveRedirectTarget(url) {
        return getText(url, HEADERS).then(function (html) {
            if (html === null) return url;
            var info = parseRedirect(html);
            if (!info) return url;
            if (!info.wpHttp || !info.data) return info.encodedUrl || url;

            var follow = getText(info.wpHttp + "?re=" + info.data);
            if (info.encodedUrl.length) return info.encodedUrl;
            return follow.then(function (text) {
                return text === null ? url : bodyText(text);
            });
        });
    }

    function hubCloudHref(currentUrl, baseUrl) {
        if (currentUrl.indexOf("hubcloud.php") >= 0) return Promise.resolve(currentUrl);
        return getText(currentUrl, HEADERS).then(function (html) {
            if (html === null) return "";
            var found = select(parseHtml(html), function (el) {
                return el.attrs.id === "download";
            });
            var raw = found.length ? hrefOf(found[0]) : "";
            if (!raw) return "";
            return raw.toLowerCase().indexOf("http") === 0
                ? raw
                : baseUrl.replace(/\/+$/, "") + "/" + raw.replace(/^\/+/, "");
        });
    }

    function hubCloudStreams(doc, href, displayTitle) {
        var sizeEls = select(doc, function (el) {
            return el.tag === "i" && el.attrs.id === "size";
        });
        var headerEls = select(doc, function (el) {
            return el.tag === "div" && hasClass(el, "card-header");
        });
        var rawSize = sizeEls.length ? textOf(sizeEls[0]) : "";
        var headerTxt = headerEls.length ? textOf(headerEls[0]) : "";
        var qualityStr = resolutionLabel(parseResolutionValue(headerTxt));
        var sizeBytes = parseSizeToBytes(rawSize);
        var sizeStr = formatFileSize(sizeBytes);

        var buttons = select(doc, function (el) {
            return el.tag === "a" && hasClass(el, "btn");
        });
        var out = [];
        for (var i = 0; i < buttons.length; i++) {
            var link = hrefOf(buttons[i]);
            var label = textOf(buttons[i]).toLowerCase();
            if (!link) continue;
            if (
                label.indexOf("fsl server") < 0 &&
                label.indexOf("fslv2") < 0 &&
                label.indexOf("s3 server") < 0 &&
                label.indexOf("mega server") < 0 &&
                label.indexOf("download file") < 0
            ) continue;
            var meta = composeStreamMeta(displayTitle, qualityStr, headerTxt, "FSL", sizeStr, sizeBytes);
            out.push({
                url: link,
                quality: meta.quality,
                title: meta.title,
                name: meta.title,
                _bytes: sizeBytes,
                _resolution: qualityStr,
                headers: { "Referer": href, "User-Agent": HEADERS["User-Agent"] }
            });
        }
        return out;
    }

    function extractHubCloud(url, displayTitle) {
        return attempt(function () {
            var currentUrl = url.indexOf("hubcloud.ink") >= 0
                ? url.replace("hubcloud.ink", hostnameOf(HBC_BASE))
                : url;
            var baseUrl = originOf(currentUrl);
            if (!baseUrl) return [];

            return hubCloudHref(currentUrl, baseUrl).then(function (href) {
                if (!href || !href.trim()) return [];
                return getText(href, HEADERS).then(function (pageHtml) {
                    if (pageHtml === null) return [];
                    return hubCloudStreams(parseHtml(pageHtml), href, displayTitle);
                });
            });
        });
    }

    function extractHubDrive(url, displayTitle) {
        return attempt(function () {
            return getText(url, HEADERS).then(function (html) {
                if (html === null) return [];
                var buttons = select(parseHtml(html), function (el) {
                    return hasClass(el, "btn") && hasClass(el, "btn-primary") && hasClass(el, "btn-user") &&
                        hasClass(el, "btn-success1") && hasClass(el, "m-1");
                });
                var href = buttons.length ? buttons[0].attrs.href : "";
                if (!href || href.toLowerCase().indexOf("hubcloud") < 0) return [];
                return extractHubCloud(href, displayTitle);
            });
        });
    }

    function extractHbLinks(url, displayTitle) {
        return attempt(function () {
            return getText(url, HEADERS).then(function (html) {
                if (html === null) return [];
                var anchors = anchorsUnder(parseHtml(html), function (p) {
                    if (p.tag === "h3" || p.tag === "h5") return true;
                    return p.tag === "p" && inside(p, function (d) {
                        return d.tag === "div" && hasClass(d, "entry-content");
                    });
                });
                return Promise.all(anchors.map(function (el) {
                    var href = hrefOf(el);
                    if (!href) return [];
                    var lower = href.toLowerCase();
                    if (lower.indexOf("hubdrive") >= 0) return extractHubDrive(href, displayTitle);
                    if (lower.indexOf("hubcloud") >= 0) return extractHubCloud(href, displayTitle);
                    return [];
                })).then(flatten);
            });
        });
    }

    function dispatchExtractor(url, displayTitle) {
        if (!url || url.indexOf("http") !== 0) return Promise.resolve([]);
        var host = (originOf(url) || "").toLowerCase();
        if (host.indexOf("hubdrive") >= 0) return extractHubDrive(url, displayTitle);
        if (host.indexOf("hubcloud") >= 0) return extractHubCloud(url, displayTitle);
        if (host.indexOf("hblinks") >= 0) return extractHbLinks(url, displayTitle);
        return Promise.resolve([]);
    }

    function resolveAndDispatch(link, displayTitle) {
        return attempt(function () {
            var target = link.indexOf("?id=") >= 0 ? resolveRedirectTarget(link) : Promise.resolve(link);
            return target.then(function (finalLink) {
                if (!finalLink) return [];
                if (finalLink.toLowerCase().indexOf("hubdrive") >= 0) return extractHubDrive(finalLink, displayTitle);
                return dispatchExtractor(finalLink, displayTitle);
            });
        });
    }

    function fetchPostByImdbId(imdbId) {
        return request(BASE_URL + "/wp-json/wp/v2/posts?search=" + encodeURIComponent(imdbId), {
            headers: HEADERS,
            skipSizeCheck: true,
            redirect: "follow"
        }).then(function (resp) {
            if (!resp || !resp.ok) return null;
            return resp.json().then(function (posts) {
                if (!Array.isArray(posts) || !posts.length) return null;
                var post = posts[0];
                var link = post.link || "";
                if (!link) return null;
                return { url: link, title: (post.title && post.title.rendered) || "" };
            });
        }).then(null, function () {
            return null;
        });
    }

    function normalizeSearchTitle(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\b(the|a|an)\b/g, " ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function computeTitleScore(expected, candidate, expectedYear, candidateYear) {
        var expTokens = normalizeSearchTitle(expected).split(" ").filter(Boolean);
        var canTokens = normalizeSearchTitle(candidate).split(" ").filter(Boolean);
        if (!expTokens.length || !canTokens.length) return 0;

        var canSet = Object.create(null);
        canTokens.forEach(function (t) {
            canSet[t] = true;
        });
        var hits = expTokens.filter(function (t) {
            return canSet[t];
        }).length;
        var score = hits / expTokens.length;

        if (expTokens.every(function (t) {
            return canSet[t];
        })) score += 0.25;
        if (expectedYear && candidateYear === expectedYear) score += 0.25;
        else if (expectedYear && candidateYear && Math.abs(candidateYear - expectedYear) > 1) score -= 0.5;

        return score;
    }

    function selectBestMatch(expectedTitle, expectedYear, candidates, mediaType, season) {
        var best = null;
        var bestScore = 0;
        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            var ym = /\b(19|20)\d{2}\b/.exec(candidate.title);
            var cYear = ym ? Number(ym[0]) : null;
            var score = computeTitleScore(expectedTitle, candidate.title, expectedYear, cYear);

            if (mediaType === "tv" && season) {
                var sm = candidate.title.match(/(?:season\s*|s)0?(\d+)/i);
                if (sm && Number(sm[1]) === Number(season)) score += 0.5;
                else if (sm) score -= 0.75;
            }

            if (!best || score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        return best && bestScore >= 0.6 ? best : null;
    }

    function searchPost(title, year) {
        var url = SRCH_URL + "/collections/post/documents/search"
            + "?q=" + encodeURIComponent(title)
            + "&query_by=post_title,category&query_by_weights=4,2"
            + "&sort_by=sort_by_date:desc&limit=15&highlight_fields=none&use_cache=true&page=1";
        var headers = extend(extend({}, HEADERS), {
            "Accept": "application/json, text/plain, */*",
            "Referer": BASE_URL + "/",
            "Origin": BASE_URL
        });
        return request(url, { headers: headers, skipSizeCheck: true, redirect: "follow" }).then(function (res) {
            return res ? res.json() : null;
        }).then(function (searchJson) {
            var hits = (searchJson && searchJson.hits) ? searchJson.hits : [];
            if (!hits.length) return null;
            var results = hits.map(function (h) {
                return { title: h.document.post_title, url: h.document.permalink };
            });
            return selectBestMatch(title, year, results, mediaType, season) || results[0];
        }).then(null, function () {
            return null;
        });
    }

    function findMatch(title, year, imdbId) {
        var byImdb = imdbId && mediaType === "movie" ? fetchPostByImdbId(imdbId) : Promise.resolve(null);
        return Promise.all([byImdb, searchPost(title, year)]).then(function (found) {
            return found[0] || found[1];
        });
    }

    function textMatches(el, pattern) {
        return pattern.test(textOf(el));
    }

    function episodeLinks(doc) {
        var anchors = anchorsUnder(doc, function (p) {
            return p.tag === "h5";
        });
        var epPattern = new RegExp("Episode\\s*0?" + episode + "\\b", "i");
        var links = [];
        var i;
        for (i = 0; i < anchors.length; i++) {
            if (epPattern.test(textOf(anchors[i])) && hrefOf(anchors[i])) links.push(hrefOf(anchors[i]));
        }
        if (links.length) return links;

        for (i = 0; i < anchors.length; i++) {
            var m = /Episode\s*0?(\d+)/i.exec(textOf(anchors[i]));
            if (m && parseInt(m[1], 10) === parseInt(episode, 10) && hrefOf(anchors[i])) links.push(hrefOf(anchors[i]));
        }
        if (links.length) return links;

        var epNumPattern = new RegExp("^E0*" + episode + "\\b", "i");
        var headings = select(doc, isTag("h4"));
        for (i = 0; i < headings.length; i++) {
            if (!epNumPattern.test(textOf(headings[i]).trim())) continue;
            var inner = select(doc, function (el) {
                return el.tag === "a" && inside(el, function (p) {
                    return p === headings[i];
                });
            });
            for (var j = 0; j < inner.length; j++) {
                if (hrefOf(inner[j])) links.push(hrefOf(inner[j]));
            }
        }
        return links;
    }

    function movieLinks(doc) {
        var links = [];
        var labelled = anchorsUnder(doc, function (p) {
            return p.tag === "h3" || p.tag === "h4";
        });
        for (var i = 0; i < labelled.length; i++) {
            if (textMatches(labelled[i], /480|720|1080|2160|4K/i) && hrefOf(labelled[i])) links.push(hrefOf(labelled[i]));
        }
        var streamAnchors = anchorsUnder(doc, function (p) {
            return p.tag === "div" && p.parent && hasClass(p.parent, "page-body");
        });
        for (var j = 0; j < streamAnchors.length; j++) {
            if (/https?:\/\/.*?(hdstream4u|hubstream)\./i.test(hrefOf(streamAnchors[j]))) links.push(hrefOf(streamAnchors[j]));
        }
        return links;
    }

    function collectLinks(pageHtml) {
        var doc = parseHtml(pageHtml);
        return unique((mediaType === "tv" ? episodeLinks(doc) : movieLinks(doc)).filter(Boolean));
    }

    function pageUrlOf(match) {
        var matchPath = match.url.indexOf("http") === 0
            ? match.url.replace(/^https?:\/\/[^\/]+/, "")
            : match.url;
        return BASE_URL + (matchPath.charAt(0) === "/" ? "" : "/") + matchPath;
    }

    function streamsFromMatch(match, title) {
        return getText(pageUrlOf(match), HEADERS).then(function (pageHtml) {
            if (pageHtml === null) return [];
            var links = collectLinks(pageHtml);
            if (!links.length) return [];
            var displayTitle = mediaType === "tv" ? "S" + season + "E" + episode : title;
            return Promise.all(links.map(function (link) {
                return resolveAndDispatch(link, displayTitle);
            })).then(function (perLink) {
                var streams = flatten(perLink).filter(function (s) {
                    return s && s.url && passesMinSizeCheck(s._bytes);
                });
                return applySettings(streams, resolveSettings());
            });
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    var endpoint = mediaType === "tv" ? "tv" : "movie";
    return request(TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids", {
        skipSizeCheck: true,
        redirect: "follow"
    }).then(function (res) {
        return res ? res.json() : null;
    }).then(null, function () {
        return null;
    }).then(function (mediaInfo) {
        if (!mediaInfo) return [];
        var title = mediaInfo.title || mediaInfo.name;
        if (!title) return [];

        runtimeMinutes = mediaType === "tv"
            ? ((mediaInfo.episode_run_time && mediaInfo.episode_run_time[0]) ||
                (mediaInfo.last_episode_to_air && mediaInfo.last_episode_to_air.runtime) || null)
            : (mediaInfo.runtime || null);

        var imdbId = (mediaInfo.external_ids && mediaInfo.external_ids.imdb_id) || mediaInfo.imdb_id || null;
        var releaseDate = mediaType === "tv" ? mediaInfo.first_air_date : mediaInfo.release_date;
        var year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : null;

        return findMatch(title, year, imdbId).then(function (match) {
            if (!match) return [];
            return streamsFromMatch(match, title);
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        var COUNT_OPTIONS = [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "unlimited", label: "Unlimited" }
        ];
        return [
            { type: "header", label: "Sort Order" },
            {
                type: "toggle",
                key: "sortBySize",
                label: "Sort by Size",
                defaultValue: false,
                description: "ON \u2014 Largest Size first\nOFF \u2014 Highest Resolution first, then Largest Size"
            },
            { type: "header", label: "Resolution" },
            { type: "toggle", key: "enable4K", label: "4K / 2160p", defaultValue: true },
            { type: "toggle", key: "enable1080p", label: "FHD / 1080p", defaultValue: true },

            { type: "header", label: "Limit Streams by Resolution" },
            { type: "info", label: "Max streams shown per resolution\nDefault: Unlimited" },
            { type: "select", key: "max4K", label: "4K / 2160p", defaultValue: "unlimited", options: COUNT_OPTIONS },
            { type: "select", key: "max1080p", label: "FHD / 1080p", defaultValue: "unlimited", options: COUNT_OPTIONS }
        ];
    }
};