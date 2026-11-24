function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "MoviesDrive";
    var BASE_URL = "https://new1.moviesdrive.cyou";
    var QUALITY_FILTER = Object.create(null);
    QUALITY_FILTER["1080p"] = true;
    QUALITY_FILTER["2160p"] = true;
    var QUALITY_RANK_MAX = 2;
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    };
    var PLAY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var query = {
            tmdbUrl: TMDB_API + "/" + mediaType + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids",
            season: null,
            episode: null
        };
        if (mediaType === "movie") return query;
        if (season == null || episode == null) return null;
        if (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode))) return null;
        query.season = parseInt(season, 10);
        query.episode = parseInt(episode, 10);
        return query;
    }

    function pad2(value) {
        return value < 10 ? "0" + value : String(value);
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i += 1) {
            for (var j = 0; j < lists[i].length; j += 1) out.push(lists[i][j]);
        }
        return out;
    }

    function unique(list) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < list.length; i += 1) {
            if (seen[list[i]] === true) continue;
            seen[list[i]] = true;
            out.push(list[i]);
        }
        return out;
    }

    function dedupe(streams) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < streams.length; i += 1) {
            var url = streams[i].url;
            if (!url || seen[url] === true) continue;
            seen[url] = true;
            out.push(streams[i]);
        }
        return out;
    }

    function sortBy(list, compare) {
        var slots = [];
        for (var i = 0; i < list.length; i += 1) slots.push({ item: list[i], index: i });
        slots.sort(function (a, b) {
            return compare(a.item, b.item) || (a.index - b.index);
        });
        var out = [];
        for (var j = 0; j < slots.length; j += 1) out.push(slots[j].item);
        return out;
    }

    function formEncode(value) {
        return encodeURIComponent(value).replace(/[!'()~]/g, function (c) {
            return "%" + c.charCodeAt(0).toString(16).toUpperCase();
        }).replace(/%20/g, "+");
    }

    function splitUrl(address) {
        var match = /^([a-zA-Z][a-zA-Z0-9+.\-]*:)\/\/(?:[^\/?#@]*@)?(\[[^\]]*\]|[^\/?#:]+)/.exec(address);
        return match ? { protocol: match[1], host: match[2].toLowerCase() } : null;
    }

    function withReferer(referer) {
        return { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Accept": DEFAULT_HEADERS["Accept"], "Referer": referer };
    }

    function load(url, headers) {
        try {
            return fetch(url, { headers: headers }).then(function (res) {
                return res.text().then(function (text) {
                    return { ok: res.ok, text: text };
                });
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url, headers, strict) {
        return load(url, headers).then(function (reply) {
            if (!reply) return null;
            if (strict && !reply.ok) return null;
            try {
                return JSON.parse(reply.text);
            } catch (e) {
                return null;
            }
        });
    }

    function resolveQuality(raw) {
        if (!raw) return null;
        var match = /(\d{3,4})[pP]/.exec(raw);
        if (match) return match[1] + "p";
        var upper = raw.toUpperCase();
        if (upper.indexOf("4K") !== -1 || upper.indexOf("2160") !== -1 || upper.indexOf("UHD") !== -1) return "2160p";
        return null;
    }

    function toGB(sizeStr) {
        if (!sizeStr) return 0;
        var match = /([\d.]+)\s*(GB|MB)/i.exec(sizeStr);
        if (!match) return 0;
        var value = parseFloat(match[1]);
        return match[2].toUpperCase() === "GB" ? value : value / 1024;
    }

    function qualityRank(quality) {
        var q = (quality || "").toUpperCase();
        if (q === "4K" || q === "2160P") return 2;
        if (q === "1080P") return 1;
        return 0;
    }

    function providerRank(name) {
        var n = (name || "").toLowerCase();
        if (n.indexOf("fsl") !== -1) return 2;
        if (n.indexOf("pixeldrain") !== -1) return 1;
        return 0;
    }

    function getSortTag(rank) {
        var bin = Math.max(0, QUALITY_RANK_MAX - rank).toString(2);
        while (bin.length < 20) bin = "0" + bin;
        var tag = "";
        for (var i = 0; i < bin.length; i += 1) {
            tag += bin.charAt(i) === "1" ? "\uFEFF" : "\u200B";
        }
        return tag;
    }

    function rankAndTrim(streams) {
        var ordered = sortBy(streams, function (a, b) {
            return (qualityRank(b.quality) - qualityRank(a.quality))
                || (providerRank(b.name) - providerRank(a.name))
                || (toGB(b.size) - toGB(a.size));
        });
        var tally = Object.create(null);
        var out = [];
        for (var i = 0; i < ordered.length; i += 1) {
            var s = ordered[i];
            var bucket = s.name + "|" + s.quality;
            tally[bucket] = (tally[bucket] || 0) + 1;
            if (tally[bucket] > 3) continue;
            var tag = getSortTag(qualityRank(s.quality));
            out.push({
                name: tag + s.name,
                title: tag + s.name,
                url: s.url,
                quality: s.quality,
                size: s.size,
                headers: s.headers
            });
        }
        return out;
    }

    function decode(text) {
        if (text.indexOf("&") === -1) return text;
        var named = Object.create(null);
        named.amp = "&";
        named.lt = "<";
        named.gt = ">";
        named.quot = '"';
        named.apos = "'";
        named.nbsp = "\u00A0";
        return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (whole, body) {
            if (body.charAt(0) !== "#") return named[body] === undefined ? whole : named[body];
            var hex = body.charAt(1) === "x" || body.charAt(1) === "X";
            var code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            if (!(code > 0) || code > 1114111) return whole;
            if (code < 65536) return String.fromCharCode(code);
            code -= 65536;
            return String.fromCharCode(55296 + (code >> 10), 56320 + (code & 1023));
        });
    }

    function parseHtml(html) {
        var root = { tag: "#root", attrs: Object.create(null), children: [], parent: null };
        var voids = Object.create(null);
        var voidNames = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
        for (var v = 0; v < voidNames.length; v += 1) voids[voidNames[v]] = true;
        var autoClosed = Object.create(null);
        var autoNames = ["p", "li", "dt", "dd", "option"];
        for (var w = 0; w < autoNames.length; w += 1) autoClosed[autoNames[w]] = true;
        var raws = Object.create(null);
        raws.script = /<\/script\s*>/ig;
        raws.style = /<\/style\s*>/ig;
        raws.textarea = /<\/textarea\s*>/ig;
        raws.title = /<\/title\s*>/ig;
        var attrRe = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
        var length = html.length;
        var node = root;
        var pos = 0;

        function addText(parent, text, raw) {
            if (text) parent.children.push({ text: raw ? text : decode(text), parent: parent });
        }

        while (pos < length) {
            var lt = html.indexOf("<", pos);
            if (lt === -1) {
                addText(node, html.slice(pos), false);
                break;
            }
            if (lt > pos) addText(node, html.slice(pos, lt), false);
            pos = lt;
            if (html.substr(pos, 4) === "<!--") {
                var endComment = html.indexOf("-->", pos + 4);
                pos = endComment === -1 ? length : endComment + 3;
                continue;
            }
            var next = html.charAt(pos + 1);
            if (next === "!" || next === "?") {
                var endDecl = html.indexOf(">", pos + 2);
                pos = endDecl === -1 ? length : endDecl + 1;
                continue;
            }
            if (next === "/") {
                var endTag = html.indexOf(">", pos + 2);
                if (endTag === -1) break;
                var closing = html.slice(pos + 2, endTag).replace(/\s[\s\S]*$/, "").toLowerCase();
                var ancestor = node;
                while (ancestor !== null && ancestor.tag !== closing) ancestor = ancestor.parent;
                if (ancestor !== null) node = ancestor.parent;
                pos = endTag + 1;
                continue;
            }
            if (!/[a-zA-Z]/.test(next)) {
                addText(node, "<", true);
                pos += 1;
                continue;
            }
            var i = pos + 1;
            var quote = "";
            while (i < length) {
                var ch = html.charAt(i);
                if (quote) {
                    if (ch === quote) quote = "";
                } else if (ch === '"' || ch === "'") {
                    quote = ch;
                } else if (ch === ">") {
                    break;
                }
                i += 1;
            }
            if (i >= length) break;
            var inner = html.slice(pos + 1, i);
            var name = /^[a-zA-Z][^\s\/>]*/.exec(inner)[0];
            var attrs = Object.create(null);
            attrRe.lastIndex = 0;
            var rest = inner.slice(name.length);
            var am = attrRe.exec(rest);
            while (am !== null) {
                var key = am[1].toLowerCase();
                if (attrs[key] === undefined) {
                    var raw = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ""));
                    attrs[key] = decode(raw);
                }
                am = attrRe.exec(rest);
            }
            name = name.toLowerCase();
            pos = i + 1;
            if (autoClosed[name] === true && node.tag === name) node = node.parent;
            var element = { tag: name, attrs: attrs, children: [], parent: node };
            node.children.push(element);
            if (raws[name] !== undefined) {
                var endRaw = raws[name];
                endRaw.lastIndex = pos;
                var closeMatch = endRaw.exec(html);
                var contentEnd = closeMatch ? closeMatch.index : length;
                addText(element, html.slice(pos, contentEnd), true);
                pos = closeMatch ? closeMatch.index + closeMatch[0].length : length;
                continue;
            }
            if (voids[name] !== true) node = element;
        }
        return root;
    }

    function traverse(root, visit) {
        var nodes = [root];
        var cursors = [0];
        while (nodes.length > 0) {
            var top = nodes.length - 1;
            var current = nodes[top];
            var index = cursors[top];
            if (index >= current.children.length) {
                nodes.pop();
                cursors.pop();
                continue;
            }
            cursors[top] = index + 1;
            var child = current.children[index];
            visit(child);
            if (child.tag !== undefined) {
                nodes.push(child);
                cursors.push(0);
            }
        }
    }

    function select(root, test) {
        var found = [];
        traverse(root, function (n) {
            if (n.tag !== undefined && test(n)) found.push(n);
        });
        return found;
    }

    function textOf(node) {
        var out = "";
        traverse(node, function (n) {
            if (n.tag === undefined) out += n.text;
        });
        return out;
    }

    function isTag(name) {
        return function (n) {
            return n.tag === name;
        };
    }

    function hasHref(n) {
        return n.tag === "a" && n.attrs.href !== undefined;
    }

    function nextElement(node) {
        var siblings = node.parent.children;
        for (var i = siblings.indexOf(node) + 1; i < siblings.length; i += 1) {
            if (siblings[i].tag !== undefined) return siblings[i];
        }
        return null;
    }

    function firstHref(node) {
        if (!node) return undefined;
        var anchors = select(node, isTag("a"));
        return anchors.length > 0 ? anchors[0].attrs.href : undefined;
    }

    function insideHeading(node) {
        var ancestor = node.parent;
        while (ancestor !== null) {
            if (ancestor.tag === "h5") return true;
            ancestor = ancestor.parent;
        }
        return false;
    }

    function joinText(nodes) {
        var out = "";
        for (var i = 0; i < nodes.length; i += 1) out += textOf(nodes[i]);
        return out.trim();
    }

    function landingTarget(html) {
        var doc = parseHtml(html);
        var php = select(doc, function (n) {
            return hasHref(n) && n.attrs.href.indexOf("hubcloud.php") !== -1;
        });
        if (php.length > 0) return php[0].attrs.href;
        var button = select(doc, function (n) {
            return n.attrs.id === "download";
        });
        if (button.length > 0) return button[0].attrs.href || "";
        var inline = /var url = ["']([^"']+)["']/.exec(html);
        return inline ? inline[1] : "";
    }

    function hubCloudPage(pageUrl, referer) {
        return load(pageUrl, withReferer(referer)).then(function (first) {
            if (!first) return null;
            var same = { url: pageUrl, html: first.text };
            if (pageUrl.indexOf("hubcloud.php") !== -1) return same;
            var target = landingTarget(first.text);
            if (!target) return same;
            if (target.indexOf("http") !== 0) {
                var base = splitUrl(pageUrl);
                if (!base) return null;
                target = base.protocol + "//" + base.host + "/" + target.replace(/^\//, "");
            }
            return load(target, withReferer(pageUrl)).then(function (second) {
                return second ? { url: target, html: second.text } : null;
            });
        });
    }

    function hubCloudStreams(page) {
        var doc = parseHtml(page.html);
        var size = joinText(select(doc, function (n) {
            return n.tag === "i" && n.attrs.id === "size";
        }));
        var quality = resolveQuality(joinText(select(doc, function (n) {
            return n.tag === "div" && (" " + (n.attrs["class"] || "").replace(/\s+/g, " ") + " ").indexOf(" card-header ") !== -1;
        })));
        if (QUALITY_FILTER[quality] !== true || toGB(size) < 1) return [];
        var pxlVar = /var\s+pxl\s*=\s*["']([^"']+)["']/.exec(page.html);
        var blocked = ["tinyurl", "telegram", "hubcloud.cx/tg", "hubcloud.foo/tg"];
        var playbackHeaders = { "User-Agent": PLAY_UA, "Referer": page.url };
        var results = [];
        var anchors = select(doc, hasHref);
        for (var i = 0; i < anchors.length; i += 1) {
            var href = anchors[i].attrs.href;
            var text = textOf(anchors[i]).toLowerCase().trim();
            if (!href) continue;
            var isBlocked = false;
            for (var b = 0; b < blocked.length; b += 1) {
                if (href.indexOf(blocked[b]) !== -1) isBlocked = true;
            }
            if (isBlocked) continue;
            if (href.indexOf("negn6f") !== -1 && pxlVar) href = pxlVar[1];

            if (text.indexOf("fslv2") !== -1 || text.indexOf("fsl v2") !== -1) {
                results.push({ name: PROVIDER + " \u2022 FSLv2", title: PROVIDER + " \u2022 FSLv2", quality: quality, size: size, url: href, headers: playbackHeaders });
            } else if (text.indexOf("fsl server") !== -1 || (text.indexOf("fsl") !== -1 && text.indexOf("v2") === -1)) {
                results.push({ name: PROVIDER + " \u2022 FSL", title: PROVIDER + " \u2022 FSL", quality: quality, size: size, url: href, headers: playbackHeaders });
            } else if (text.indexOf("pixeldra") !== -1 || text.indexOf("pixelserver") !== -1 || text.indexOf("pixeldrain") !== -1 || href.indexOf("pixeldrain") !== -1) {
                var directUrl = href;
                if (directUrl.indexOf("/u/") !== -1) {
                    var fileId = directUrl.split("/u/")[1].split("?")[0].replace("/", "");
                    directUrl = "https://pixeldrain.dev/api/file/" + fileId + "?download";
                }
                results.push({ name: PROVIDER + " \u2022 Pixeldrain", title: PROVIDER + " \u2022 Pixeldrain", quality: quality, size: size, url: directUrl, headers: playbackHeaders });
            }
        }
        return results;
    }

    function resolveHubCloudLinks(pageUrl, referer) {
        return hubCloudPage(pageUrl, referer).then(function (page) {
            return page ? hubCloudStreams(page) : [];
        }).then(null, function () {
            return [];
        });
    }

    function hostLinks(html) {
        var anchors = select(parseHtml(html), hasHref);
        var links = [];
        for (var i = 0; i < anchors.length; i += 1) {
            if (/hubcloud|gdflix|gdlink/i.test(anchors[i].attrs.href)) links.push(anchors[i].attrs.href);
        }
        return links;
    }

    function extractFromMdrive(url) {
        if (!url) return Promise.resolve([]);
        if (/hubcloud|gdflix|gdlink/i.test(url) && (url.indexOf("/drive/") !== -1 || url.indexOf("/file/") !== -1)) return Promise.resolve([url]);
        return load(url, DEFAULT_HEADERS).then(function (reply) {
            if (!reply) return [];
            var html = reply.text;
            if (url.indexOf("search-recover.php") === -1) return hostLinks(html);
            var qParam = /const\s+Q_INITIAL\s*=\s*["']([^"']+)["']/.exec(html);
            var tokenParam = /const\s+FROM_AC_TOKEN\s*=\s*["']([^"']+)["']/.exec(html);
            if (!qParam || !tokenParam) return hostLinks(html);
            var params = "api=search&q=" + formEncode(qParam[1]) + "&page=1&from_ac=" + formEncode(tokenParam[1]);
            var headers = { "User-Agent": DEFAULT_HEADERS["User-Agent"], "Accept": "application/json", "Referer": url };
            return fetchJson(url.split("/drive/")[0] + "/drive/search-recover.php?" + params, headers, false).then(function (payload) {
                if (payload === null) return [];
                if (!payload.hits) return hostLinks(html);
                if (!Array.isArray(payload.hits)) return [];
                var hits = [];
                for (var i = 0; i < payload.hits.length; i += 1) {
                    if (payload.hits[i] && payload.hits[i].url) hits.push(payload.hits[i].url);
                }
                return hits;
            });
        }).then(null, function () {
            return [];
        });
    }

    function resolveStreams(links, referer) {
        var lookups = [];
        for (var i = 0; i < links.length; i += 1) lookups.push(extractFromMdrive(links[i]));
        return Promise.all(lookups).then(function (candidates) {
            var targets = unique(flatten(candidates));
            var settled = [];
            for (var j = 0; j < targets.length; j += 1) {
                var parts = splitUrl(targets[j]);
                if (parts && parts.host.indexOf("hubcloud") !== -1) settled.push(resolveHubCloudLinks(targets[j], referer));
                else settled.push(Promise.resolve([]));
            }
            return Promise.all(settled);
        }).then(flatten);
    }

    function findPost(imdbId, title, query) {
        var seasonPatterns = null;
        if (mediaType === "tv") {
            seasonPatterns = [
                new RegExp("\\bseason\\s*0?" + query.season + "\\b", "i"),
                new RegExp("\\bs0?" + query.season + "\\b", "i"),
                new RegExp("\\bseason\\s*" + pad2(query.season) + "\\b", "i")
            ];
        }

        function matchesSeason(doc) {
            if (!seasonPatterns) return true;
            var postTitle = (doc.post_title || "").toLowerCase();
            var permalink = (doc.permalink || "").toLowerCase();
            for (var i = 0; i < seasonPatterns.length; i += 1) {
                if (seasonPatterns[i].test(postTitle) || seasonPatterns[i].test(permalink)) return true;
            }
            return false;
        }

        function titleMatches(doc) {
            var postTitle = (doc.post_title || "").toLowerCase();
            var permalink = (doc.permalink || "").toLowerCase();
            var normPost = postTitle.replace(/[^a-z0-9]/g, "");
            var normQuery = title.toLowerCase().replace(/[^a-z0-9]/g, "");
            return normPost.indexOf(normQuery) !== -1
                || postTitle.indexOf(title.toLowerCase()) !== -1
                || permalink.indexOf(title.toLowerCase().replace(/ /g, "-")) !== -1;
        }

        function docsOf(payload) {
            var docs = [];
            var hits = payload && payload.hits;
            if (!hits || !Array.isArray(hits)) return docs;
            for (var i = 0; i < hits.length; i += 1) {
                if (hits[i] && hits[i].document) docs.push(hits[i].document);
            }
            return docs;
        }

        function first(docs, test) {
            for (var i = 0; i < docs.length; i += 1) {
                if (test(docs[i])) return docs[i];
            }
            return null;
        }

        var requests = [
            imdbId ? fetchJson(BASE_URL + "/search.php?q=" + imdbId + "&page=1", DEFAULT_HEADERS, true) : Promise.resolve(null),
            fetchJson(BASE_URL + "/search.php?q=" + encodeURIComponent(title) + "&page=1", DEFAULT_HEADERS, true)
        ];
        return Promise.all(requests).then(function (payloads) {
            if (imdbId) {
                var hit = first(docsOf(payloads[0]), function (d) {
                    return d.imdb_id === imdbId && (mediaType === "tv" ? matchesSeason(d) : true);
                });
                if (hit) return hit;
            }
            if (!payloads[1]) return null;
            var docs = docsOf(payloads[1]);
            if (mediaType === "tv") {
                return first(docs, function (doc) {
                    return titleMatches(doc) && matchesSeason(doc);
                });
            }
            return first(docs, titleMatches) || docs[0] || null;
        });
    }

    function movieStreams(html, postUrl) {
        var doc = parseHtml(html);
        var anchors = select(doc, function (n) {
            return n.tag === "a" && insideHeading(n);
        });
        var links = [];
        for (var i = 0; i < anchors.length; i += 1) {
            if (anchors[i].attrs.href) links.push(anchors[i].attrs.href);
        }
        return resolveStreams(unique(links), postUrl);
    }

    function episodeRows(html, episodeRe) {
        var doc = parseHtml(html);
        var sectionRe = /^\s*(EP\d+|Episode\s*\d+|S\d+E\d+)/i;
        var rows = select(doc, function (n) {
            return n.tag === "h5" && episodeRe.test(textOf(n));
        });
        var all = [];
        for (var i = 0; i < rows.length; i += 1) {
            var links = [];
            var sibling = nextElement(rows[i]);
            while (sibling && !sectionRe.test(textOf(sibling).trim())) {
                var anchors = select(sibling, hasHref);
                for (var j = 0; j < anchors.length; j += 1) {
                    if (anchors[j].attrs.href) links.push(anchors[j].attrs.href);
                }
                sibling = nextElement(sibling);
            }
            if (links.length === 0) {
                var near = nextElement(rows[i]);
                var a1 = firstHref(near);
                var a2 = firstHref(near ? nextElement(near) : null);
                if (a1) links.push(a1);
                if (a2) links.push(a2);
            }
            all.push(unique(links));
        }
        return all;
    }

    function episodeStreams(episodePageUrl, episodeRe) {
        return load(episodePageUrl, DEFAULT_HEADERS).then(function (reply) {
            if (!reply) return [];
            var rows = episodeRows(reply.text, episodeRe);
            var tasks = [];
            for (var i = 0; i < rows.length; i += 1) tasks.push(resolveStreams(rows[i], episodePageUrl));
            return Promise.all(tasks).then(flatten);
        }).then(null, function () {
            return [];
        });
    }

    function seriesStreams(html, query) {
        var seasonRe = new RegExp("Season " + query.season + "|S" + pad2(query.season), "i");
        var episodeRe = new RegExp("\\b(?:ep|episode|e)\\s*0?" + query.episode + "\\b|s0?" + query.season + "\\s*e0?" + query.episode + "\\b", "i");
        var doc = parseHtml(html);
        var blocks = select(doc, function (n) {
            return n.tag === "h5" && seasonRe.test(textOf(n));
        });
        var tasks = [];
        for (var i = 0; i < blocks.length; i += 1) {
            var episodePageUrl = firstHref(nextElement(blocks[i])) || firstHref(blocks[i]);
            if (!episodePageUrl) continue;
            tasks.push(episodeStreams(episodePageUrl, episodeRe));
        }
        return Promise.all(tasks).then(flatten);
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (query === null) return Promise.resolve([]);
        return fetchJson(query.tmdbUrl, { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }, false).then(function (tmdb) {
            if (!tmdb) return [];
            var imdbId = tmdb.external_ids && tmdb.external_ids.imdb_id;
            var title = tmdb.title || tmdb.name || "";
            if (!title) return [];
            return findPost(imdbId, title, query).then(function (post) {
                if (!post || typeof post.permalink !== "string") return [];
                var postUrl = post.permalink.indexOf("http") === 0 ? post.permalink : BASE_URL + post.permalink;
                return load(postUrl, DEFAULT_HEADERS).then(function (page) {
                    if (!page) return [];
                    if (mediaType === "movie") return movieStreams(page.text, postUrl);
                    return seriesStreams(page.text, query);
                });
            });
        }).then(function (streams) {
            return rankAndTrim(dedupe(streams));
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };