function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "BanglaPlex";
    var BASE_URL = "https://banglaplex.biz";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0 Safari/537.36";

    function buildQuery() {
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var isSeries = mediaType === "tv";
        var wantSeason = parseInt(season, 10);
        var wantEpisode = parseInt(episode, 10);
        if (isSeries && (season == null || episode == null || isNaN(wantSeason) || isNaN(wantEpisode))) return null;
        return {
            isSeries: isSeries,
            season: wantSeason,
            episode: wantEpisode,
            tmdbUrl: TMDB_API + "/" + (isSeries ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY
        };
    }

    function merge(a, b) {
        var out = {};
        var k;
        for (k in a) {
            if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
        }
        for (k in b) {
            if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
        }
        return out;
    }

    function flatten(arrays) {
        var out = [];
        var i;
        for (i = 0; i < arrays.length; i++) out = out.concat(arrays[i]);
        return out;
    }

    function unique(list) {
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < list.length; i++) {
            if (seen[list[i]]) continue;
            seen[list[i]] = true;
            out.push(list[i]);
        }
        return out;
    }

    function attempt(task, fallback) {
        return Promise.resolve()
            .then(task)
            .then(null, function () { return fallback; });
    }

    function matchAll(text, pattern) {
        var out = [];
        var match;
        while ((match = pattern.exec(text)) !== null) out.push(match);
        return out;
    }

    function endsWith(text, suffix) {
        var start = text.length - suffix.length;
        return start >= 0 && text.indexOf(suffix, start) === start;
    }

    function httpRequest(url, options) {
        var settings = options || {};
        var init = {
            method: settings.method || "GET",
            headers: merge({ "User-Agent": USER_AGENT }, settings.headers)
        };
        if (settings.body !== undefined) init.body = settings.body;
        return Promise.resolve()
            .then(function () { return fetch(url, init); })
            .then(function (response) { return response && response.ok ? response : null; })
            .then(null, function () { return null; });
    }

    function fetchText(url, headers) {
        return httpRequest(url, { headers: headers })
            .then(function (response) { return response ? response.text() : null; })
            .then(null, function () { return null; });
    }

    function fetchJson(url, headers) {
        return httpRequest(url, { headers: headers })
            .then(function (response) { return response ? response.json() : null; })
            .then(null, function () { return null; });
    }

    function escapeUrl(part) {
        return part
            .replace(/[\u0080-\uffff]+/g, function (run) {
                try {
                    return encodeURIComponent(run);
                } catch (e) {
                    return run;
                }
            })
            .replace(/[\u0000-\u0020"<>`{}]/g, function (c) {
                return "%" + (c.charCodeAt(0) < 16 ? "0" : "") + c.charCodeAt(0).toString(16).toUpperCase();
            });
    }

    function parseUrl(url) {
        var m = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/.exec(url);
        if (!m) return null;
        return { scheme: m[1].toLowerCase(), authority: m[2], path: m[3], query: m[4] || "", hash: m[5] || "" };
    }

    function hostAndPort(parts) {
        var host = parts.authority.replace(/^.*@/, "").toLowerCase();
        if ((parts.scheme === "http" && /:80$/.test(host)) || (parts.scheme === "https" && /:443$/.test(host))) {
            host = host.replace(/:\d+$/, "");
        }
        return host;
    }

    function normalizePath(path) {
        var segments = (path.charAt(0) === "/" ? path : "/" + path).split("/");
        var out = [];
        var i;
        for (i = 0; i < segments.length; i++) {
            var last = i === segments.length - 1;
            if (segments[i] === "..") {
                if (out.length > 1) out.pop();
                if (last) out.push("");
            } else if (segments[i] === ".") {
                if (last) out.push("");
            } else {
                out.push(segments[i]);
            }
        }
        return out.join("/") || "/";
    }

    function serializeUrl(parts) {
        return parts.scheme + "://" + hostAndPort(parts) + escapeUrl(normalizePath(parts.path)) + escapeUrl(parts.query) + parts.hash;
    }

    function resolveUrl(href, base) {
        var ref = String(href).replace(/^\s+|\s+$/g, "").replace(/[\t\n\r]/g, "");
        var baseParts = parseUrl(base || BASE_URL);
        if (!baseParts) return null;
        var target;
        if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(ref)) {
            target = parseUrl(ref);
            return target ? serializeUrl(target) : ref;
        }
        if (ref.indexOf("//") === 0) {
            target = parseUrl(baseParts.scheme + ":" + ref);
            return target ? serializeUrl(target) : null;
        }
        var split = /^([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/.exec(ref);
        var path = split[1];
        target = {
            scheme: baseParts.scheme,
            authority: baseParts.authority,
            path: baseParts.path,
            query: baseParts.query,
            hash: split[3] || ""
        };
        if (path.charAt(0) === "/") {
            target.path = path;
            target.query = split[2] || "";
        } else if (path) {
            target.path = baseParts.path.slice(0, baseParts.path.lastIndexOf("/") + 1) + path;
            target.query = split[2] || "";
        } else if (split[2] !== undefined) {
            target.query = split[2];
        }
        return serializeUrl(target);
    }

    function hostnameOf(url) {
        var parts = parseUrl(url);
        if (!parts) return "";
        return parts.authority.replace(/^.*@/, "").replace(/:\d*$/, "").toLowerCase();
    }

    function originOf(url) {
        var parts = parseUrl(url);
        if (!parts) return BASE_URL;
        return parts.scheme + "://" + hostAndPort(parts);
    }

    function isPixeldrainUrl(value) {
        return /pixeldra(?:in\.com|\.in)/i.test(value);
    }

    function decodeEntities(s) {
        if (s.indexOf("&") === -1) return s;
        return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (all, body) {
            var lower = body.toLowerCase();
            if (lower.charAt(0) === "#") {
                var code = lower.charAt(1) === "x" ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
                return code > 0 && code < 65536 ? String.fromCharCode(code) : all;
            }
            switch (lower) {
                case "amp": return "&";
                case "lt": return "<";
                case "gt": return ">";
                case "quot": return "\"";
                case "apos": return "'";
                case "nbsp": return "\u00a0";
                default: return all;
            }
        });
    }

    function parseAttrs(source) {
        var attrs = Object.create(null);
        var pattern = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        var m;
        while ((m = pattern.exec(source)) !== null) {
            var name = m[1].toLowerCase();
            if (name in attrs) continue;
            var value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ""));
            attrs[name] = decodeEntities(value);
        }
        return attrs;
    }

    function makeNode(tag, attrs, parent) {
        return { tag: tag, attrs: attrs, children: [], parent: parent, text: "" };
    }

    function parseHtml(html) {
        var root = makeNode("#root", Object.create(null), null);
        var voids = " area base br col embed hr img input link meta param source track wbr ";
        var pattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
        var current = root;
        var last = 0;
        var m;

        function addText(raw) {
            if (!raw) return;
            var textNode = makeNode("#text", Object.create(null), current);
            textNode.text = decodeEntities(raw);
            current.children.push(textNode);
        }

        while ((m = pattern.exec(html)) !== null) {
            if (m.index > last) addText(html.slice(last, m.index));
            last = pattern.lastIndex;
            if (m[2] === undefined) continue;

            var name = m[2].toLowerCase();
            if (m[1] === "/") {
                var up = current;
                while (up && up.tag !== name) up = up.parent;
                if (up) current = up.parent;
                continue;
            }

            var node = makeNode(name, parseAttrs(m[3]), current);
            current.children.push(node);
            if (voids.indexOf(" " + name + " ") !== -1 || /\/\s*$/.test(m[3])) continue;
            current = node;

            if (name === "script" || name === "style") {
                var closer = name === "script" ? /<\/script/ig : /<\/style/ig;
                closer.lastIndex = last;
                var found = closer.exec(html);
                var end = found ? found.index : html.length;
                pattern.lastIndex = end;
                last = end;
            }
        }
        if (last < html.length) addText(html.slice(last));
        return root;
    }

    function walk(node, visit) {
        var stack = [];
        var i;
        for (i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
        while (stack.length) {
            var n = stack.pop();
            if (n.tag === "#text") continue;
            if (visit(n)) return;
            for (i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
        }
    }

    function find(node, test) {
        var out = [];
        walk(node, function (n) {
            if (test(n)) out.push(n);
            return false;
        });
        return out;
    }

    function findFirst(node, test) {
        var hit = null;
        walk(node, function (n) {
            if (!test(n)) return false;
            hit = n;
            return true;
        });
        return hit;
    }

    function textOf(node) {
        var out = "";
        var stack = [node];
        var i;
        while (stack.length) {
            var n = stack.pop();
            if (n.tag === "#text") {
                out += n.text;
                continue;
            }
            for (i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
        }
        return out;
    }

    function hasClass(node, name) {
        var c = " " + (node.attrs["class"] || "").replace(/\s+/g, " ") + " ";
        return c.indexOf(" " + name + " ") !== -1;
    }

    function hasAncestor(node, test) {
        var p = node.parent;
        while (p) {
            if (test(p)) return true;
            p = p.parent;
        }
        return false;
    }

    function normalizeTitle(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/&amp;/g, "and")
            .replace(/[^a-z0-9\u00c0-\u1fff\u2c00-\ud7ff\uf900-\ufffd]+/g, " ")
            .trim();
    }

    function tokenize(value) {
        return normalizeTitle(value).split(" ").filter(Boolean);
    }

    function normalizeQuality(value) {
        var text = String(value || "").toLowerCase();
        if (text.indexOf("2160") !== -1 || text.indexOf("4k") !== -1) return "2160p";
        if (text.indexOf("1080") !== -1) return "1080p";
        if (text.indexOf("720") !== -1) return "720p";
        if (text.indexOf("480") !== -1) return "480p";
        if (text.indexOf("360") !== -1) return "360p";
        return "Unknown";
    }

    function qualityRank(quality) {
        switch (quality) {
            case "2160p": return 5;
            case "1080p": return 4;
            case "720p": return 3;
            case "480p": return 2;
            default: return 1;
        }
    }

    function buildSortPrefix(rank) {
        var bits = Math.max(0, 5 - rank).toString(2);
        while (bits.length < 20) bits = "0" + bits;
        return bits.replace(/1/g, "\uFEFF").replace(/0/g, "\u200B");
    }

    function formatFileSize(bytes) {
        var value = Number(bytes);
        if (!value || value <= 0) return "";
        var gigabytes = value / 1073741824;
        return gigabytes >= 1 ? gigabytes.toFixed(2) + " GB" : Math.round(value / 1048576) + " MB";
    }

    function formEncode(value) {
        return encodeURIComponent(value)
            .replace(/%20/g, "+")
            .replace(/[!'()~]/g, function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase(); });
    }

    function buildBody(fields) {
        return Object.keys(fields).map(function (key) {
            return formEncode(key) + "=" + formEncode(fields[key]);
        }).join("&");
    }

    function fetchTmdbMetadata(url, isSeries) {
        return fetchJson(url).then(function (data) {
            if (!data) return null;
            var releaseDate = data.release_date || data.first_air_date || "";
            return {
                title: (isSeries ? data.name : data.title) || "",
                originalTitle: (isSeries ? data.original_name : data.original_title) || "",
                year: parseInt(releaseDate.slice(0, 4), 10) || null
            };
        });
    }

    function parseSearchResults(html) {
        var root = parseHtml(html);
        var results = [];
        var seenUrls = Object.create(null);

        function addResult(href, title) {
            var url = resolveUrl(href);
            if (!url || !title || seenUrls[url]) return;
            seenUrls[url] = true;
            results.push({ url: url, title: title });
        }

        function isWatchLink(n) {
            return n.tag === "a" && (n.attrs.href || "").indexOf("/watch/") !== -1;
        }

        function isHeading(n) {
            return hasClass(n, "movie-title") || n.tag === "h3" || n.tag === "h2" || n.tag === "h1";
        }

        function isImage(n) {
            return n.tag === "img";
        }

        function isBlock(n) {
            return hasClass(n, "latest-movie-img-container") ||
                hasClass(n, "movie-img") ||
                n.tag === "article" ||
                (n.tag === "div" && (hasClass(n, "movie") || hasClass(n, "latest-movie"))) ||
                (n.tag === "div" && (n.attrs["class"] || "").indexOf("col") !== -1);
        }

        find(root, isBlock).forEach(function (block) {
            var anchor = findFirst(block, isWatchLink);
            var href = anchor && anchor.attrs.href;
            if (!href) return;
            var heading = findFirst(block, isHeading);
            var image = findFirst(block, isImage);
            var title = (heading ? textOf(heading) : "").trim() ||
                (anchor.attrs.title || "").trim() ||
                textOf(anchor).trim() ||
                ((image && image.attrs.alt) || "").trim();
            addResult(href, title);
        });

        if (results.length === 0) {
            find(root, isWatchLink).forEach(function (anchor) {
                var image = findFirst(anchor, isImage);
                var title = (anchor.attrs.title || "").trim() ||
                    textOf(anchor).trim() ||
                    ((image && image.attrs.alt) || "").trim();
                addResult(anchor.attrs.href, title);
            });
        }

        return results;
    }

    function parseDownloadPage(html) {
        var root = parseHtml(html);
        var year = null;

        find(root, function (n) {
            return n.tag === "a" && (n.attrs.href || "").indexOf("/year/") !== -1;
        }).forEach(function (anchor) {
            if (!year) year = parseInt(textOf(anchor).trim(), 10) || null;
        });

        function isSection(n) {
            return n.attrs.id === "download" ||
                hasClass(n, "download") ||
                (n.tag === "div" && (n.attrs.id || "").indexOf("download") !== -1);
        }

        var hasSection = findFirst(root, isSection) !== null;
        var anchors = find(root, function (n) {
            return n.tag === "a" && n.attrs.href !== undefined && (!hasSection || hasAncestor(n, isSection));
        });

        var pasteLinks = [];
        var seenUrls = Object.create(null);
        anchors.forEach(function (anchor) {
            var url = resolveUrl(anchor.attrs.href || "");
            if (!url || seenUrls[url] || !/pasteurl|pastetot|\/view\//.test(url)) return;
            seenUrls[url] = true;
            pasteLinks.push({ url: url, label: textOf(anchor).trim() });
        });

        return { year: year, pasteLinks: pasteLinks };
    }

    function collectAnchors(html, containerClass) {
        var root = parseHtml(html);
        var anchors = [];
        find(root, function (n) {
            if (n.tag !== "a" || n.attrs.href === undefined) return false;
            if (!containerClass) return true;
            return hasAncestor(n, function (p) { return p.tag === "div" && hasClass(p, containerClass); });
        }).forEach(function (anchor) {
            var href = anchor.attrs.href.trim();
            if (href) anchors.push({ href: href, text: textOf(anchor).trim() });
        });
        return anchors;
    }

    function collectFormFields(html) {
        var root = parseHtml(html);
        var fields = Object.create(null);
        var count = 0;
        find(root, function (n) {
            return n.tag === "input" && n.attrs.name !== undefined && hasAncestor(n, function (p) { return p.tag === "form"; });
        }).forEach(function (input) {
            fields[input.attrs.name] = input.attrs.value || "";
            count += 1;
        });
        return count > 0 ? fields : null;
    }

    function findDirectDownloadHref(html) {
        var anchor = findFirst(parseHtml(html), function (n) {
            return n.tag === "a" && (
                hasClass(n, "btn-success") ||
                hasClass(n, "btn-primary") ||
                (n.attrs.href || "").indexOf("download") !== -1 ||
                hasClass(n, "btn")
            );
        });
        return anchor ? (anchor.attrs.href || "").trim() : "";
    }

    function searchCatalog(query) {
        return fetchText(BASE_URL + "/search?q=" + encodeURIComponent(query), { Referer: BASE_URL + "/" }).then(function (html) {
            return html ? parseSearchResults(html) : [];
        });
    }

    function scoreTitleMatch(candidate, queries, year) {
        var candidateTitle = normalizeTitle(candidate.title);
        var candidateTokens = tokenize(candidate.title);
        var bestScore = 0;
        var i;

        for (i = 0; i < queries.length; i++) {
            var queryTitle = normalizeTitle(queries[i]);
            var queryTokens = tokenize(queries[i]);
            if (queryTokens.length === 0) continue;

            var matched = queryTokens.filter(function (token) { return candidateTokens.indexOf(token) !== -1; }).length;
            var score = matched / queryTokens.length;
            if (score < 0.8) continue;

            if (candidateTitle.indexOf(queryTitle) === 0) score += 0.3;
            score -= Math.min(0.3, Math.max(0, candidateTokens.length - queryTokens.length) * 0.01);
            bestScore = Math.max(bestScore, score);
        }

        if (bestScore === 0) return 0;
        return year && candidateTitle.indexOf(String(year)) !== -1 ? bestScore + 0.5 : bestScore;
    }

    function isYearCompatible(pageYear, expectedYear) {
        return !pageYear || !expectedYear || Math.abs(pageYear - expectedYear) <= 1;
    }

    function locateDownloadPage(metadata, isSeries) {
        var queries = [metadata.title];
        if (metadata.originalTitle && normalizeTitle(metadata.originalTitle) !== normalizeTitle(metadata.title)) {
            queries.push(metadata.originalTitle);
        }

        return Promise.all(queries.map(function (query) { return searchCatalog(query); })).then(function (resultLists) {
            var seen = Object.create(null);
            var ranked = [];
            flatten(resultLists).forEach(function (candidate) {
                if (seen[candidate.url]) return;
                seen[candidate.url] = true;
                ranked.push({ candidate: candidate, score: scoreTitleMatch(candidate, queries, metadata.year), order: ranked.length });
            });

            var shortlist = ranked
                .filter(function (entry) { return entry.score > 0; })
                .sort(function (a, b) { return (b.score - a.score) || (a.order - b.order); })
                .slice(0, 3);

            return Promise.all(shortlist.map(function (entry) {
                return attempt(function () {
                    return fetchText(entry.candidate.url, { Referer: BASE_URL + "/" }).then(function (html) {
                        return html ? parseDownloadPage(html) : null;
                    });
                }, null);
            }));
        }).then(function (pages) {
            var i;
            for (i = 0; i < pages.length; i++) {
                var page = pages[i];
                if (!page || page.pasteLinks.length === 0) continue;
                if (isSeries || isYearCompatible(page.year, metadata.year)) return page;
            }
            return null;
        });
    }

    function parseSeasonEpisode(label) {
        var seasonMatch = /(?:^|[^a-z])s(?:eason)?[\s._-]*0*(\d+)/i.exec(label);
        var episodeMatch = /(?:^|[^a-z])e(?:p(?:isode)?)?[\s._-]*0*(\d+)/i.exec(label);
        return {
            season: seasonMatch ? parseInt(seasonMatch[1], 10) : null,
            episode: episodeMatch ? parseInt(episodeMatch[1], 10) : null
        };
    }

    function filterEpisodeLinks(pasteLinks, wantSeason, wantEpisode) {
        return pasteLinks.filter(function (link, index) {
            var parsed = parseSeasonEpisode(link.label);
            if (parsed.season == null && parsed.episode == null) return wantSeason === 1 && wantEpisode === index + 1;
            if (parsed.episode !== wantEpisode) return false;
            return parsed.season == null || parsed.season === wantSeason;
        });
    }

    function encodeIndex(value, radix) {
        var prefix = value < radix ? "" : encodeIndex(Math.floor(value / radix), radix);
        var digit = value % radix;
        return prefix + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
    }

    function unpackPackedScripts(source) {
        var pattern = /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/g;
        var unpacked = "";
        var match;

        while ((match = pattern.exec(source)) !== null) {
            try {
                var payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
                var radix = parseInt(match[2], 10);
                var symbols = match[4].split("|");
                var dictionary = Object.create(null);
                var index;
                for (index = parseInt(match[3], 10) - 1; index >= 0; index -= 1) {
                    dictionary[encodeIndex(index, radix)] = symbols[index] || encodeIndex(index, radix);
                }
                unpacked += "\n" + payload.replace(/\b\w+\b/g, function (word) { return dictionary[word] || word; });
            } catch (e) {
                continue;
            }
        }

        return unpacked;
    }

    function buildStream(label, url, quality, options) {
        var settings = options || {};
        var name = PROVIDER + " \u2022 " + label;
        var stream = {
            name: name,
            title: name,
            url: url,
            size: settings.size === undefined ? "" : settings.size,
            quality: quality,
            headers: merge({ "User-Agent": USER_AGENT }, settings.headers)
        };
        if (settings.subtitles && settings.subtitles.length > 0) stream.subtitles = settings.subtitles;
        return stream;
    }

    function extractPixeldrainId(url) {
        var match = /\/(?:u|api\/file)\/([A-Za-z0-9_-]+)/.exec(url);
        return match ? match[1] : null;
    }

    function resolvePixeldrain(url, fallbackQuality) {
        var fileId = extractPixeldrainId(url);
        if (!fileId) return Promise.resolve([]);

        return fetchJson("https://pixeldrain.com/api/file/" + fileId + "/info").then(function (info) {
            var fileName = info && info.name ? String(info.name) : "";
            var fileQuality = normalizeQuality(fileName);
            var quality = fileQuality !== "Unknown" ? fileQuality : fallbackQuality;
            return [
                buildStream("Pixeldrain", "https://pixeldrain.com/api/file/" + fileId + "?download", quality, {
                    size: info ? formatFileSize(info.size) : ""
                })
            ];
        });
    }

    function firstPixeldrainHref(anchors) {
        var i;
        for (i = 0; i < anchors.length; i++) {
            if (isPixeldrainUrl(anchors[i].href)) return anchors[i].href;
        }
        return "";
    }

    function resolveGdflixButton(button, pageUrl, fallbackQuality) {
        var targetUrl = resolveUrl(button.href, pageUrl);
        if (!targetUrl) return Promise.resolve([]);

        var isPixeldrainButton = isPixeldrainUrl(button.href) || /pixel/i.test(button.text);
        var isCloudR2Button = /cloud/i.test(button.text) && /r2/i.test(button.text);

        if (isPixeldrainButton) {
            if (isPixeldrainUrl(hostnameOf(targetUrl)) && extractPixeldrainId(targetUrl)) {
                return resolvePixeldrain(targetUrl, fallbackQuality);
            }
            return httpRequest(targetUrl, { headers: { Referer: pageUrl } }).then(function (response) {
                if (!response) return [];
                return response.text().then(function (linkedPage) {
                    var pixeldrainLink = firstPixeldrainHref(collectAnchors(linkedPage));
                    return resolvePixeldrain(pixeldrainLink || response.url || "", fallbackQuality);
                });
            });
        }

        if (isCloudR2Button) {
            return httpRequest(targetUrl, { headers: { Referer: pageUrl } }).then(function (response) {
                if (!response) return [];
                return response.text().then(function (linkedPage) {
                    var href = findDirectDownloadHref(linkedPage);
                    var directUrl = href ? resolveUrl(href, targetUrl) : response.url || "";
                    if (!directUrl || directUrl.indexOf("http") !== 0) return [];
                    if (isPixeldrainUrl(directUrl)) return resolvePixeldrain(directUrl, fallbackQuality);
                    return [buildStream("GDFlix [Cloud R2]", directUrl, fallbackQuality)];
                });
            });
        }

        return Promise.resolve([]);
    }

    function resolveGdflix(url, referer, fallbackQuality) {
        return fetchText(url, { Referer: referer || url }).then(function (html) {
            if (!html) return [];
            var buttons = collectAnchors(html, "text-center");
            return Promise.all(buttons.map(function (button) {
                return attempt(function () { return resolveGdflixButton(button, url, fallbackQuality); }, []);
            })).then(flatten);
        });
    }

    function collectSubtitles(text) {
        var subtitles = [];
        var seenUrls = Object.create(null);
        matchAll(text, /https?:\/\/[^\s"'<>]+\.vtt[^\s"'<>]*/g).forEach(function (match) {
            var url = match[0];
            if (seenUrls[url]) return;
            seenUrls[url] = true;
            var language = /_eng/i.test(url) ? "English" : "Subtitle";
            subtitles.push({ url: url, language: language, name: language });
        });
        return subtitles;
    }

    function collectMediaUrls(text, origin) {
        var urls = matchAll(text, /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*/g).map(function (match) {
            return match[0];
        });
        if (urls.length === 0) {
            matchAll(text, /["'](\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)["']/g).forEach(function (match) {
                var url = resolveUrl(match[1], origin);
                if (url) urls.push(url);
            });
        }
        return unique(urls);
    }

    function resolveStreamHost(url, fallbackQuality) {
        var pageUrl = url.replace(/hgcloud\.to|streamhg\.(?:com|to)/i, "vibuxer.com");
        var origin = originOf(pageUrl);

        return fetchText(pageUrl, { Referer: origin + "/" }).then(function (html) {
            if (!html) return [];
            var searchableText = (unpackPackedScripts(html) + "\n" + html).replace(/\\\//g, "/");
            var subtitles = collectSubtitles(searchableText);
            var headers = { Referer: origin + "/", Origin: origin, "User-Agent": USER_AGENT };

            return collectMediaUrls(searchableText, origin).map(function (mediaUrl) {
                return buildStream("StreamHG", mediaUrl, fallbackQuality, { headers: headers, subtitles: subtitles });
            });
        });
    }

    function resolveXcloud(url, referer, fallbackQuality) {
        return fetchText(url, { Referer: referer || url }).then(function (html) {
            if (!html) return [];

            var buttons = find(parseHtml(html), function (n) {
                return n.tag === "a" && hasClass(n, "btn-primary") && hasAncestor(n, function (p) {
                    return p.tag === "div" && hasClass(p, "vd");
                });
            });
            var directHref = "";
            var i;
            for (i = 0; i < buttons.length; i++) {
                if (/Generate Direct/i.test(textOf(buttons[i])) && buttons[i].attrs.href) {
                    directHref = buttons[i].attrs.href;
                    break;
                }
            }
            if (!directHref) return [];

            var directUrl = resolveUrl(directHref, url);
            if (!directUrl) return [];

            return fetchText(directUrl, { Referer: url }).then(function (linksHtml) {
                if (!linksHtml) return [];

                var linksRoot = parseHtml(linksHtml);
                var headers = { Referer: directUrl };
                var streams = [];

                var iframe = findFirst(linksRoot, function (n) { return n.tag === "iframe"; });
                var iframeUrl = iframe && iframe.attrs.src ? resolveUrl(iframe.attrs.src, directUrl) : null;
                if (iframeUrl) {
                    var iframeQuality = normalizeQuality(iframeUrl);
                    streams.push(
                        buildStream("xCloud", iframeUrl, iframeQuality !== "Unknown" ? iframeQuality : fallbackQuality, { headers: headers })
                    );
                }

                find(linksRoot, function (n) {
                    return n.tag === "a" && hasClass(n, "btn") && hasAncestor(n, function (p) { return p.tag === "h2"; });
                }).forEach(function (anchor) {
                    var buttonUrl = anchor.attrs.href ? resolveUrl(anchor.attrs.href, directUrl) : null;
                    if (buttonUrl) streams.push(buildStream("xCloud", buttonUrl, fallbackQuality, { headers: headers }));
                });

                return streams;
            });
        });
    }

    function resolveHostLink(url, referer, fallbackQuality) {
        var hostname = hostnameOf(url);
        return attempt(function () {
            if (hostname.indexOf("gdflix") !== -1) return resolveGdflix(url, referer, fallbackQuality);
            if (hostname.indexOf("xcloud") !== -1) return resolveXcloud(url, referer, fallbackQuality);
            if (/(?:^|\.)(?:hgcloud|streamhg|vibuxer)\./.test(hostname)) return resolveStreamHost(url, fallbackQuality);
            if (isPixeldrainUrl(hostname)) return resolvePixeldrain(url, fallbackQuality);
            return [];
        }, []);
    }

    function resolvePasteLinks(pasteUrl, label) {
        var fallbackQuality = normalizeQuality(label);

        return fetchText(pasteUrl, { Referer: BASE_URL + "/" }).then(function (html) {
            if (!html) return [];

            var formFields = collectFormFields(html);
            var pageTask = Promise.resolve(html);
            if (formFields) {
                pageTask = httpRequest(pasteUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: pasteUrl },
                    body: buildBody(formFields)
                }).then(function (response) {
                    if (!response) return html;
                    return response.text().then(null, function () { return html; });
                });
            }

            return pageTask.then(function (pageHtml) {
                var hostLinks = unique(
                    collectAnchors(pageHtml)
                        .map(function (anchor) { return anchor.href; })
                        .filter(function (href) { return href.indexOf("http") === 0 && !/pasteurl|pastetot/.test(href); })
                );
                return Promise.all(hostLinks.map(function (link) {
                    return resolveHostLink(link, pasteUrl, fallbackQuality);
                })).then(flatten);
            });
        });
    }

    function dedupeStreams(streams) {
        var seenUrls = Object.create(null);
        return streams.filter(function (stream) {
            if (!stream.url || seenUrls[stream.url]) return false;
            seenUrls[stream.url] = true;
            return true;
        });
    }

    function pickSecondXcloud(streams) {
        function isXcloud(stream) {
            return endsWith(stream.name, "\u2022 xCloud");
        }
        var xcloudStreams = streams.filter(isXcloud);
        if (xcloudStreams.length < 2) return streams;
        var second = xcloudStreams[1];
        return streams.filter(function (stream) { return !isXcloud(stream) || stream === second; });
    }

    function sortByQuality(streams) {
        return streams
            .map(function (stream, index) { return { stream: stream, index: index }; })
            .sort(function (a, b) {
                return (qualityRank(b.stream.quality) - qualityRank(a.stream.quality)) || (a.index - b.index);
            })
            .map(function (entry) {
                var prefix = buildSortPrefix(qualityRank(entry.stream.quality));
                return merge(entry.stream, { name: prefix + entry.stream.name, title: prefix + entry.stream.title });
            });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchTmdbMetadata(query.tmdbUrl, query.isSeries)
        .then(function (metadata) {
            if (!metadata || !metadata.title) return [];
            return locateDownloadPage(metadata, query.isSeries).then(function (page) {
                if (!page) return [];
                var pasteLinks = (query.isSeries ? filterEpisodeLinks(page.pasteLinks, query.season, query.episode) : page.pasteLinks).slice(0, 8);
                if (pasteLinks.length === 0) return [];
                return Promise.all(pasteLinks.map(function (link) {
                    return attempt(function () { return resolvePasteLinks(link.url, link.label); }, []);
                })).then(function (groups) {
                    return sortByQuality(pickSecondXcloud(dedupeStreams(flatten(groups))));
                });
            });
        })
        .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };