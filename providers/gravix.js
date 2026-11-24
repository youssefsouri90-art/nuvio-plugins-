function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://watchanimeworld.one";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": BASE_URL + "/"
    };

    function buildQuery() {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        if (mediaType !== "tv") return { isSeries: false, season: 0, episode: 0 };
        if (season == null || episode == null) return null;
        return {
            isSeries: true,
            season: parseInt(season, 10) || 1,
            episode: parseInt(episode, 10) || 1
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

    function request(url, options) {
        return Promise.resolve()
            .then(function () { return fetch(url, options); })
            .then(null, function () { return null; });
    }

    function getText(url, extra) {
        return request(url, { headers: merge(HEADERS, extra) })
            .then(function (res) { return res && res.ok ? res.text() : ""; })
            .then(null, function () { return ""; });
    }

    function fetchJson(url, options) {
        return request(url, options)
            .then(function (res) { return res && res.ok ? res.json() : null; })
            .then(null, function () { return null; });
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
                case "nbsp": return " ";
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
        var lower = html.toLowerCase();
        var voids = " area base br col embed hr img input link meta param source track wbr ";
        var pattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
        var current = root;
        var last = 0;
        var m;

        function addText(raw) {
            if (!raw) return;
            var node = makeNode("#text", Object.create(null), current);
            node.text = decodeEntities(raw);
            current.children.push(node);
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
                var end = lower.indexOf("</" + name, last);
                if (end < 0) end = html.length;
                pattern.lastIndex = end;
                last = end;
            }
        }
        if (last < html.length) addText(html.slice(last));
        return root;
    }

    function find(node, test) {
        var out = [];
        var stack = [];
        var i;
        for (i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
        while (stack.length) {
            var n = stack.pop();
            if (n.tag !== "#text" && test(n)) out.push(n);
            for (i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
        }
        return out;
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

    function normalize(str) {
        return String(str || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    }

    function wordSet(text) {
        var set = Object.create(null);
        var words = text.split(" ");
        var i;
        for (i = 0; i < words.length; i++) set[words[i]] = true;
        return set;
    }

    function similarity(a, b) {
        var x = normalize(a);
        var y = normalize(b);
        if (!x || !y) return 0;
        if (x === y) return 1;
        if (x.indexOf(y) !== -1 || y.indexOf(x) !== -1) return 0.85;
        var wx = wordSet(x);
        var wy = wordSet(y);
        var hit = 0;
        var union = 0;
        var w;
        for (w in wx) {
            union++;
            if (wy[w]) hit++;
        }
        for (w in wy) {
            if (!wx[w]) union++;
        }
        return union ? hit / union : 0;
    }

    function isFullHd(values) {
        var text = values.filter(Boolean).join(" ");
        if (!text) return true;
        var m = text.match(/(\d{3,4})\s*p/i);
        if (m) return m[1] === "1080";
        return !/4k|uhd|2160/i.test(text);
    }

    function decodeBase64(input) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var out = "";
        var buffer = 0;
        var bits = 0;
        var i;
        for (i = 0; i < input.length; i++) {
            var idx = alphabet.indexOf(input.charAt(i));
            if (idx < 0) continue;
            buffer = (buffer << 6) | idx;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out += String.fromCharCode((buffer >> bits) & 255);
                buffer = buffer & ((1 << bits) - 1);
            }
        }
        return out;
    }

    function decodeUtf8(binary) {
        var encoded = "";
        var i;
        for (i = 0; i < binary.length; i++) {
            var h = binary.charCodeAt(i).toString(16);
            if (h.length < 2) h = "0" + h;
            encoded += "%" + h;
        }
        try {
            return decodeURIComponent(encoded);
        } catch (e) {
            return binary;
        }
    }

    function languageOf(key) {
        switch (key) {
            case "hin": return "Hindi";
            case "tam": return "Tamil";
            case "tel": return "Telugu";
            case "eng": return "English";
            case "jpn": return "Japanese";
            default: return key.toUpperCase();
        }
    }

    function getTmdbInfo(isSeries) {
        var url = TMDB_API + "/" + (isSeries ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_KEY;
        return fetchJson(url, {}).then(function (d) {
            if (!d) return null;
            return {
                title: d.name || d.title || "",
                originalTitle: d.original_name || d.original_title || ""
            };
        });
    }

    function searchSite(info, isSeries) {
        return getText(BASE_URL + "/?s=" + encodeURIComponent(info.title)).then(function (html) {
            if (!html) return [];
            var root = parseHtml(html);
            var want = isSeries ? "/series/" : "/movies/";
            var seen = Object.create(null);
            var found = [];

            function add(href, title) {
                if (!href || href.indexOf(want) === -1 || seen[href]) return;
                seen[href] = true;
                var sim = Math.max(
                    similarity(info.title, title),
                    info.originalTitle ? similarity(info.originalTitle, title) : 0
                );
                found.push({ href: href, sim: sim, order: found.length });
            }

            var blocks = find(root, function (n) {
                return n.tag === "article" || hasClass(n, "result-item") ||
                    (n.tag === "div" && hasClass(n, "item")) || hasClass(n, "search-post");
            });

            blocks.forEach(function (block) {
                var a = find(block, function (n) { return n.tag === "a"; })[0];
                var heads = find(block, function (n) {
                    return hasClass(n, "title") || n.tag === "h2" || n.tag === "h3" || hasClass(n, "entry-title");
                });
                var headText = "";
                heads.forEach(function (h) { headText += textOf(h); });
                var title = headText.trim() || (a && a.attrs.title) || (a ? textOf(a).trim() : "");
                add(a ? a.attrs.href : undefined, title);
            });

            if (!found.length) {
                find(root, function (n) { return n.tag === "a" && n.attrs.href !== undefined; }).forEach(function (a) {
                    var href = a.attrs.href || "";
                    var m = href.match(/^https?:\/\/[^/]+\/(?:series|movies)\/([^/]+)\//);
                    if (!m || m[1] === "page") return;
                    add(href, a.attrs.title || textOf(a).trim() || m[1].replace(/-/g, " "));
                });
            }

            var good = found.filter(function (c) { return c.sim >= 0.5; });
            return (good.length ? good : found)
                .sort(function (a, b) { return (b.sim - a.sim) || (a.order - b.order); })
                .slice(0, 2)
                .map(function (c) { return c.href; });
        });
    }

    function findEpisodeUrl(root, s, e) {
        var links = find(root, function (n) {
            return n.tag === "a" && n.attrs.href !== undefined && n.attrs.href.indexOf("/episode/") !== -1;
        }).map(function (a) {
            return { href: a.attrs.href, text: textOf(a).trim() };
        });
        var patterns = [
            new RegExp("(^|[^0-9])" + s + "x0?" + e + "(?![0-9])", "i"),
            new RegExp("s0?" + s + "[-_ ]?e0?" + e + "(?![0-9])", "i"),
            new RegExp("season[-_\\s]*" + s + "[-_\\s]*episode[-_\\s]*" + e + "(?![0-9])", "i")
        ];
        var i;
        var j;
        for (i = 0; i < patterns.length; i++) {
            for (j = 0; j < links.length; j++) {
                if (patterns[i].test(links[j].href || "") || patterns[i].test(links[j].text)) return links[j].href;
            }
        }
        return null;
    }

    function postIdOf(root) {
        var body = find(root, function (n) { return n.tag === "body"; })[0];
        var m = ((body && body.attrs["class"]) || "").match(/postid-(\d+)/);
        if (m && m[1]) return m[1];
        var holder = find(root, function (n) { return n.attrs["data-post"] !== undefined; })[0];
        return holder ? holder.attrs["data-post"] : "";
    }

    function resolveEpisode(seriesUrl, s, e) {
        return getText(seriesUrl).then(function (html) {
            if (!html) return null;
            var root = parseHtml(html);
            var direct = findEpisodeUrl(root, s, e);
            if (direct) return direct;
            var postId = postIdOf(root);
            if (!postId) return null;
            var ajaxUrl = BASE_URL + "/wp-admin/admin-ajax.php?action=action_select_season&season=" + s + "&post=" + postId;
            return getText(ajaxUrl, { Referer: seriesUrl }).then(function (ajax) {
                if (!ajax) return null;
                return findEpisodeUrl(parseHtml(ajax), s, e);
            });
        });
    }

    function findEpisodePage(candidates, s, e) {
        return Promise.all(candidates.map(function (url) {
            return resolveEpisode(url, s, e).then(function (ep) {
                if (ep || s === 1) return ep;
                return resolveEpisode(url, 1, e);
            }).then(null, function () { return null; });
        })).then(function (eps) {
            var i;
            for (i = 0; i < eps.length; i++) {
                if (eps[i]) return eps[i];
            }
            return null;
        });
    }

    function cookieOf(res) {
        if (!res) return "";
        try {
            return (res.headers.get("set-cookie") || "")
                .split(/,(?=[^;]+=[^;]+)/)
                .map(function (c) { return c.trim().split(";")[0]; })
                .filter(Boolean)
                .join("; ");
        } catch (e) {
            return "";
        }
    }

    function extractZephyrix(playerUrl, referer) {
        var m = playerUrl.match(/^(https?:\/\/[^/]+)\/video\/([a-f0-9]+)/i);
        if (!m) return Promise.resolve(null);
        var origin = m[1];
        var hash = m[2];

        return request(playerUrl, { headers: merge(HEADERS, { Referer: referer }) })
            .then(cookieOf)
            .then(function (cookie) {
                var cookieHeader = cookie ? { Cookie: cookie } : {};
                var headers = merge(merge(HEADERS, {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": playerUrl,
                    "Origin": origin,
                    "X-Requested-With": "XMLHttpRequest"
                }), cookieHeader);
                return request(origin + "/player/index.php?data=" + hash + "&do=getVideo", {
                    method: "POST",
                    headers: headers,
                    body: "hash=" + hash + "&r=" + encodeURIComponent(BASE_URL + "/")
                }).then(function (res) {
                    return res && res.ok ? res.json() : null;
                }).then(function (data) {
                    if (!data) return null;
                    var url = data.securedLink || data.videoSource || data.source || data.file;
                    if (!url || typeof url !== "string") return null;
                    var hm = url.match(/\/cdn\/hls\/([a-f0-9]+)\//);
                    var contentHash = hm ? hm[1] : hash;
                    return {
                        url: url,
                        headers: merge({ "Referer": origin + "/", "Origin": origin, "User-Agent": USER_AGENT }, cookieHeader),
                        subtitles: [{
                            url: origin + "/cdn/down/" + contentHash + "/Subtitle/subtitle_eng.srt",
                            language: "en",
                            name: "English"
                        }]
                    };
                });
            })
            .then(null, function () { return null; });
    }

    function decodeAbyss(url) {
        var cleanUrl = url.replace("https://short.icu", "https://player.abyssplayer.com");
        var reqHeaders = { "Referer": "https://playhydrax.com/", "User-Agent": USER_AGENT, "Origin": "https://playhydrax.com" };
        return getText(cleanUrl, reqHeaders).then(function (html) {
            var match = html.match(/const\s+datas\s*=\s*"([^"]*)"/);
            if (!match || !match[1]) return [];
            return fetchJson("https://enc-dec.app/api/dec-abyss", {
                method: "POST",
                headers: merge(merge(HEADERS, reqHeaders), { "Content-Type": "application/json" }),
                body: JSON.stringify({ text: match[1] })
            }).then(function (data) {
                var sources = data && data.result && data.result.sources;
                return Array.isArray(sources) ? sources : [];
            });
        }).then(null, function () { return []; });
    }

    function readDubPlayer(iframeUrl, referer) {
        return getText(iframeUrl, { Referer: referer }).then(function (text) {
            var m = text.match(/var\s+CONFIG\s*=\s*({[\s\S]*?});/);
            if (!m) return [];
            var config = JSON.parse(m[1]);
            var prefix = config.prefix || "https://player.abyssplayer.com/";
            var ready = config.ready || {};
            var keys = Object.keys(ready);
            var out = [];
            var i;
            for (i = 0; i < keys.length; i++) {
                if (ready[keys[i]]) out.push({ type: "abyss", url: prefix + ready[keys[i]], lang: languageOf(keys[i]) });
            }
            return out;
        }).then(null, function () { return []; });
    }

    function collectSources(pageUrl) {
        return getText(pageUrl).then(function (html) {
            if (!html) return [];
            var root = parseHtml(html);
            var sources = [];
            var dubTasks = [];
            var hasZephyrix = false;

            find(root, function (n) { return n.tag === "iframe"; }).forEach(function (el) {
                var src = el.attrs.src || el.attrs["data-src"];
                if (!src) return;
                if (src.indexOf("//") === 0) src = "https:" + src;
                else if (src.charAt(0) === "/") src = BASE_URL + src;

                if (src.indexOf("dub-player") !== -1) {
                    dubTasks.push(readDubPlayer(src, pageUrl));
                } else if (/play\.(?:zephyrix|zephyrflick)\./i.test(src)) {
                    hasZephyrix = true;
                    sources.push({ type: "zephyrix", url: src, lang: "Multi-Dub" });
                }
            });

            if (!hasZephyrix) {
                var loose = html.match(/https?:\/\/play\.(?:zephyrflick|zephyrix)\.[^/\s"']+\/video\/[a-f0-9]+/i);
                if (loose) sources.push({ type: "zephyrix", url: loose[0], lang: "Multi-Dub" });
            }

            var p1 = html.match(/player1\.php\?data=([a-zA-Z0-9+=/]+)/);
            if (p1) {
                try {
                    var list = JSON.parse(decodeUtf8(decodeBase64(p1[1])));
                    if (Array.isArray(list)) {
                        list.forEach(function (item) {
                            if (!item || !item.link) return;
                            var abyss = item.link.indexOf("short.icu") !== -1 || item.link.indexOf("abyssplayer") !== -1;
                            sources.push({
                                type: abyss ? "abyss" : "direct",
                                url: item.link,
                                lang: item.language ? String(item.language) : "English"
                            });
                        });
                    }
                } catch (e) {
                    sources = sources.slice(0);
                }
            }

            return Promise.all(dubTasks).then(function (dubs) {
                var i;
                for (i = 0; i < dubs.length; i++) sources = sources.concat(dubs[i]);
                return sources;
            });
        });
    }

    function makeStream(lang, url, headers, subtitles) {
        var label = "AnimeWorld \u2022 " + lang;
        var stream = {
            name: label,
            title: label,
            url: url,
            quality: "1080p",
            headers: headers,
            type: url.indexOf(".m3u8") !== -1 ? "m3u8" : "mp4"
        };
        if (subtitles && subtitles.length) stream.subtitles = subtitles;
        return stream;
    }

    function buildStreams(src, pageUrl) {
        if (src.type === "zephyrix") {
            return extractZephyrix(src.url, pageUrl).then(function (z) {
                return z ? [makeStream(src.lang, z.url, z.headers, z.subtitles)] : [];
            });
        }

        if (src.type === "abyss") {
            return decodeAbyss(src.url).then(function (decoded) {
                var out = [];
                var i;
                for (i = 0; i < decoded.length; i++) {
                    var d = decoded[i];
                    if (!d || !d.url || !isFullHd([d.label, d.type, d.quality, d.res])) continue;
                    out.push(makeStream(src.lang, d.url, {
                        "Referer": "https://playhydrax.com/",
                        "User-Agent": USER_AGENT
                    }));
                }
                return out;
            });
        }

        return Promise.resolve([makeStream(src.lang, src.url, { "Referer": BASE_URL + "/", "User-Agent": USER_AGENT })]);
    }

    function gather(groups) {
        var seen = Object.create(null);
        var out = [];
        var i;
        var j;
        for (i = 0; i < groups.length; i++) {
            for (j = 0; j < groups[i].length; j++) {
                var s = groups[i][j];
                if (!s.url || seen[s.url]) continue;
                seen[s.url] = true;
                out.push(s);
            }
        }
        return out;
    }

    function resolvePage(query, candidates) {
        if (!query.isSeries) return Promise.resolve(candidates[0]);
        return findEpisodePage(candidates, query.season, query.episode);
    }

    function streamsFor(pageUrl) {
        return collectSources(pageUrl).then(function (sources) {
            if (!sources.length) return [];
            return Promise.all(sources.map(function (s) {
                return buildStreams(s, pageUrl).then(null, function () { return []; });
            })).then(gather);
        });
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return getTmdbInfo(query.isSeries)
        .then(function (info) {
            if (!info || !info.title) return [];
            return searchSite(info, query.isSeries).then(function (candidates) {
                if (!candidates.length) return [];
                return resolvePage(query, candidates).then(function (pageUrl) {
                    return pageUrl ? streamsFor(pageUrl) : [];
                });
            });
        })
        .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };