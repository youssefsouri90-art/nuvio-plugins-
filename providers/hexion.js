function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "4kHdHub";
    var BASE_URL = "https://4khdhub.one";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var MOBILE_UAS = [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    ];
    var PLAY_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var SSON_UA = MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];

    function buildQuery() {
        var isSeries;
        if (!tmdbId) return null;
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        isSeries = mediaType === "tv";
        if (isSeries && (season == null || episode == null)) return null;
        return { id: String(tmdbId), isSeries: isSeries, season: season, seasonNo: +season, episodeNo: +episode };
    }

    function settings() {
        var raw = typeof SCRAPER_SETTINGS === "object" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
        function cap(key) {
            var v = raw[key], n;
            if (v === null || v === undefined || v === "" || v === "unlimited") return Infinity;
            n = parseInt(v, 10);
            return isNaN(n) || n <= 0 ? Infinity : n;
        }
        return {
            sortBySize: raw.sortBySize === true,
            enable4K: raw.enable4K !== false,
            enable1080p: raw.enable1080p !== false,
            max4K: cap("max4K"),
            max1080p: cap("max1080p"),
            maxFSLv2: cap("maxFSLv2"),
            maxFSL: cap("maxFSL"),
            maxPixelDrain: cap("maxPixelDrain")
        };
    }

    function headersFor(referer) {
        return {
            "User-Agent": SSON_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": referer || BASE_URL + "/"
        };
    }

    function request(url, referer, asJson) {
        return Promise.resolve().then(function () {
            return fetch(url, { headers: headersFor(referer) });
        }).then(function (res) {
            if (!res || !res.ok) return null;
            return asJson ? res.json() : res.text();
        }).then(null, function () {
            return null;
        });
    }

    function fetchText(url, referer) {
        return request(url, referer, false);
    }

    function fetchJson(url) {
        return request(url, null, true);
    }

    function pad(n) {
        var s = String(n);
        return s.length < 2 ? "0" + s : s;
    }

    function clean(value) {
        return String(value).replace(/\s+/g, " ").trim();
    }

    function decode64(text) {
        var map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var s = String(text).replace(/[\t\n\f\r ]/g, "");
        var out = "";
        var i, a, b, c, d;
        if (s.length % 4 === 0) s = s.replace(/={1,2}$/, "");
        if (s.length % 4 === 1 || /[^A-Za-z0-9+\/]/.test(s)) throw new Error("base64");
        for (i = 0; i < s.length; i += 4) {
            a = map.indexOf(s.charAt(i));
            b = map.indexOf(s.charAt(i + 1));
            c = i + 2 < s.length ? map.indexOf(s.charAt(i + 2)) : -1;
            d = i + 3 < s.length ? map.indexOf(s.charAt(i + 3)) : -1;
            out += String.fromCharCode((a << 2) | (b >> 4));
            if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
            if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
        }
        return out;
    }

    function rot13(value) {
        return String(value).replace(/[a-zA-Z]/g, function (c) {
            var code = c.charCodeAt(0) + 13;
            var limit = c <= "Z" ? 90 : 122;
            return String.fromCharCode(code <= limit ? code : code - 26);
        });
    }

    function dots(path) {
        var cut = path.search(/[?#]/);
        var tail = "";
        var segs, out = [], i, last;
        if (cut >= 0) {
            tail = path.substring(cut);
            path = path.substring(0, cut);
        }
        segs = path.split("/");
        for (i = 1; i < segs.length; i++) {
            last = i === segs.length - 1;
            if (segs[i] === "..") {
                if (out.length) out.pop();
                if (last) out.push("");
            } else if (segs[i] === ".") {
                if (last) out.push("");
            } else {
                out.push(segs[i]);
            }
        }
        return ("/" + out.join("/") + tail).replace(/ /g, "%20");
    }

    function resolveUrl(href, base) {
        var m = /^([a-zA-Z][a-zA-Z0-9+.\-]*:)\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?/.exec(base);
        var head, path, dir;
        if (!m) return "";
        if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(href)) return href;
        if (href.substring(0, 2) === "//") return m[1] + href;
        head = m[1] + "//" + m[2];
        path = m[3] || "/";
        if (href.charAt(0) === "#") return head + path + (m[4] || "") + href;
        if (href.charAt(0) === "?") return head + path + href;
        if (href.charAt(0) === "/") return head + dots(href);
        dir = path.substring(0, path.lastIndexOf("/") + 1);
        return head + dots(dir + href);
    }

    function absolute(href, base) {
        if (!href) return "";
        if (/^https?:\/\//i.test(href)) return href;
        return resolveUrl(String(href).replace(/&amp;/g, "&"), base || BASE_URL);
    }

    function hostOf(url) {
        var m = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/(?:[^\/?#@]*@)?([^\/?#:]*)/.exec(String(url).trim());
        return m ? m[1].toLowerCase() : "";
    }

    function entities(s) {
        var named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0" };
        if (s.indexOf("&") < 0) return s;
        return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (all, body) {
            var code;
            if (body.charAt(0) !== "#") {
                return Object.prototype.hasOwnProperty.call(named, body) ? named[body] : all;
            }
            code = body.charAt(1) === "x" || body.charAt(1) === "X" ? parseInt(body.substring(2), 16) : parseInt(body.substring(1), 10);
            if (!code || code > 1114111) return "\uFFFD";
            if (code > 65535) {
                code -= 65536;
                return String.fromCharCode(55296 + (code >> 10), 56320 + (code & 1023));
            }
            return String.fromCharCode(code);
        });
    }

    function attributes(tail) {
        var out = Object.create(null);
        var re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=\x60]+)))?/g;
        var m, key, value;
        while ((m = re.exec(tail)) !== null) {
            key = m[1].toLowerCase();
            if (key in out) continue;
            value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
            out[key] = entities(value);
        }
        return out;
    }

    function parse(html) {
        var root = { tag: "#root", attrs: Object.create(null), children: [] };
        var stack = [root];
        var re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/([a-zA-Z][^\s>\/]*)[^>]*>|<([a-zA-Z][^\s\/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
        var m, top, node, name, i, closer, found, gt;
        html = String(html);
        while ((m = re.exec(html)) !== null) {
            top = stack[stack.length - 1];
            if (m[1]) {
                name = m[1].toLowerCase();
                for (i = stack.length - 1; i > 0; i--) {
                    if (stack[i].tag === name) {
                        stack.length = i;
                        break;
                    }
                }
            } else if (m[2]) {
                name = m[2].toLowerCase();
                node = { tag: name, attrs: attributes(m[3]), children: [] };
                if (" li p option dt dd tr td th ".indexOf(" " + name + " ") >= 0 && top.tag === name) {
                    stack.pop();
                    top = stack[stack.length - 1];
                }
                top.children.push(node);
                if (name === "script" || name === "style") {
                    closer = new RegExp("</" + name + "[\\s/>]", "ig");
                    closer.lastIndex = re.lastIndex;
                    found = closer.exec(html);
                    gt = found ? html.indexOf(">", found.index) : -1;
                    re.lastIndex = gt < 0 ? html.length : gt + 1;
                } else if (" area base br col embed hr img input link meta param source track wbr ".indexOf(" " + name + " ") < 0) {
                    stack.push(node);
                }
            } else if (m[0].length === 1 || m[0].charAt(0) !== "<") {
                top.children.push({ text: entities(m[0]) });
            }
        }
        return root;
    }

    function hasClass(node, cls) {
        var value = node.attrs["class"];
        return value !== undefined && (" " + value.replace(/\s+/g, " ") + " ").indexOf(" " + cls + " ") >= 0;
    }

    function select(node, tag, cls) {
        var out = [];
        var stack = [node];
        var cur, i;
        while (stack.length) {
            cur = stack.pop();
            if (cur !== node && (!tag || cur.tag === tag) && (!cls || hasClass(cur, cls))) out.push(cur);
            for (i = cur.children.length - 1; i >= 0; i--) {
                if (cur.children[i].tag) stack.push(cur.children[i]);
            }
        }
        return out;
    }

    function textOf(node) {
        var out = "";
        var stack = [node];
        var cur, i;
        while (stack.length) {
            cur = stack.pop();
            if (cur.tag === undefined) {
                out += cur.text;
                continue;
            }
            for (i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
        }
        return out;
    }

    function textOfAll(nodes) {
        var out = "";
        var i;
        for (i = 0; i < nodes.length; i++) out += textOf(nodes[i]);
        return out;
    }

    function linksOf(node) {
        var anchors = select(node, "a", null);
        var links = [];
        var i;
        for (i = 0; i < anchors.length; i++) {
            if (anchors[i].attrs.href !== undefined) links.push({ href: anchors[i].attrs.href, text: textOf(anchors[i]) });
        }
        return links;
    }

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\[[^\]]*]/g, " ")
            .replace(/\b(the|a|an|directors?|cut)\b/g, " ")
            .replace(/[^a-z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function words(value) {
        var parts = normalize(value).split(" ");
        var out = [];
        var i;
        for (i = 0; i < parts.length; i++) {
            if (parts[i]) out.push(parts[i]);
        }
        return out;
    }

    function titleScore(expected, candidate) {
        var want = words(expected);
        var have = Object.create(null);
        var got = words(candidate);
        var hits = 0;
        var i;
        if (!want.length) return 0;
        for (i = 0; i < got.length; i++) have[got[i]] = true;
        for (i = 0; i < want.length; i++) {
            if (have[want[i]] === true) hits++;
        }
        return hits / want.length;
    }

    function parseSizeMB(size) {
        var m;
        if (!size) return null;
        m = /(\d+\.?\d*)\s*(GB|MB)/i.exec(size);
        if (!m) return null;
        return m[2].toUpperCase() === "GB" ? parseFloat(m[1]) * 1024 : parseFloat(m[1]);
    }

    function bitrate(sizeMB, runtime) {
        if (!sizeMB || !runtime) return null;
        return ((sizeMB * 1024 * 1024 * 8) / (runtime * 60) / 1000000).toFixed(1) + " Mbps";
    }

    function qualityOf(text) {
        var m = /(2160|1080|720|480)p|(4K|UHD)/i.exec(text);
        var v;
        if (!m) return "1080P";
        v = (m[1] || m[2]).toUpperCase();
        return v === "4K" || v === "UHD" ? "2160P" : v + "P";
    }

    function sizeOf(text) {
        var m = /(?:^|[\s>])(\d+\.?\d*)\s*(GB|MB)\b/i.exec(text);
        return m ? m[1] + " " + m[2] : "";
    }

    function languageOf(hay) {
        var out = [];
        if (/\b(?:english|eng)\b/.test(hay)) out.push("English");
        if (/\bhindi\b/.test(hay)) out.push("Hindi");
        if (/\btamil\b/.test(hay)) out.push("Tamil");
        if (/\btelugu\b/.test(hay)) out.push("Telugu");
        return out.join(" \u2022 ");
    }

    function hdrOf(hay) {
        if (/\b(?:hdr10\+|hdr10p)\b/.test(hay)) return "HDR10+";
        if (/\bhdr10\b/.test(hay)) return "HDR10";
        if (/\bhdr\b/.test(hay)) return "HDR";
        if (/\bsdr\b/.test(hay)) return "SDR";
        return "";
    }

    function audioOf(hay) {
        var label = "DDP 5.1";
        if (/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i.test(hay)) label = "DDP 5.1 + TrueHD 7.1";
        else if (/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i.test(hay)) label = "DDP 5.1 + DDP 7.1";
        else if (/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i.test(hay)) label = "DDP 5.1 + AAC 7.1";
        else if (/ddp.?51/i.test(hay)) label = "DDP 5.1";
        else if (/truehd/i.test(hay)) label = "TrueHD 7.1";
        else if (/aac.*71|71.*aac/i.test(hay)) label = "AAC 7.1";
        else if (/aac/i.test(hay)) label = "AAC 5.1";
        return /\batmos\b/.test(hay) ? label + " Atmos" : label;
    }

    function toStream(filename, host, url, res, referer, size, runtime) {
        var encoded = url.replace(/ /g, "%20");
        var hay = (String(filename || "") + " " + host + " " + encoded).toLowerCase();
        var remux = /\bremux\b/.test(hay);
        var source = "WEB-DL";
        var main, detail;
        if (remux || /\bblu[-\s]?ray\b/.test(hay)) source = "Blu-ray";
        else if (/\b(?:webrip|hdrip)\b/.test(hay)) source = "WEB-Rip";
        main = [PROVIDER, res, size].filter(Boolean).join(" \u2022 ");
        detail = [
            languageOf(hay),
            [source, remux && "REMUX", /\bimax\b/.test(hay) && "IMAX", host, bitrate(parseSizeMB(size), runtime)].filter(Boolean).join(" \u2022 "),
            [
                /\b10bit\b/.test(hay) && "10Bit",
                /\b(?:dv|dolby\s*vision)\b/.test(hay) && "DV",
                hdrOf(hay),
                /\b(?:hevc|x265|265)\b/.test(hay) || res === "2160P" ? "H.265" : "H.264",
                audioOf(hay)
            ].filter(Boolean).join(" \u2022 ")
        ].filter(Boolean).join("\n");
        return {
            res: res,
            host: host,
            mb: parseSizeMB(size),
            stream: {
                name: main,
                title: main,
                url: encoded,
                quality: res + " \u2022 " + detail,
                headers: { "User-Agent": PLAY_UA, "Referer": referer || BASE_URL + "/" }
            }
        };
    }

    function tmdbInfo(q) {
        var path = q.isSeries
            ? "/tv/" + q.id + "?api_key=" + TMDB_KEY + "&append_to_response=external_ids"
            : "/movie/" + q.id + "?api_key=" + TMDB_KEY;
        return fetchJson(TMDB_API + path).then(function (d) {
            var info = { title: "", year: "", imdbId: "", runtime: null };
            if (!d) return info;
            try {
                if (q.isSeries) {
                    info.title = d.name;
                    info.year = (d.first_air_date || "").slice(0, 4);
                    info.imdbId = (d.external_ids && d.external_ids.imdb_id) || "";
                    info.runtime = (d.episode_run_time && d.episode_run_time[0]) || null;
                } else {
                    info.title = d.title;
                    info.year = (d.release_date || "").slice(0, 4);
                    info.imdbId = d.imdb_id || "";
                    info.runtime = d.runtime != null ? d.runtime : null;
                }
            } catch (e) { }
            return info;
        });
    }

    function searchTerm(info, q) {
        if (q.isSeries && q.season) return info.title + " Season " + q.season;
        return (info.title + " " + (info.year || "")).trim();
    }

    function firstHref(card) {
        var links = select(card, "a", null);
        var i;
        for (i = 0; i < links.length; i++) {
            if (links[i].attrs.href !== undefined) return links[i].attrs.href;
        }
        return "";
    }

    function bestCard(html, info, q) {
        var cards, card, title, format, href, ym, cardYear, score, sm, link, i;
        var best = null;
        if (!html) return null;
        cards = select(parse(html), null, "movie-card");
        for (i = 0; i < cards.length; i++) {
            card = cards[i];
            title = textOfAll(select(card, null, "movie-card-title")).trim();
            format = textOfAll(select(card, null, "movie-card-format")).trim();
            href = card.attrs.href || firstHref(card);
            if (!title || !href) continue;
            if (q.isSeries && !/series/i.test(format)) continue;
            if (!q.isSeries && !/movies?/i.test(format)) continue;
            ym = textOfAll(select(card, null, "movie-card-meta")).match(/\b(19|20)\d{2}\b/);
            cardYear = ym ? Number(ym[0]) : null;
            score = titleScore(info.title, title);
            if (info.year && cardYear === +info.year) score += 0.35;
            else if (info.year && cardYear && Math.abs(cardYear - +info.year) > 1) score -= 0.5;
            if (q.isSeries && q.season) {
                sm = title.match(/(?:season\s*|s)(\d+)/i);
                if (sm && Number(sm[1]) === Number(q.season)) score += 0.4;
                else if (sm) score -= 0.6;
            }
            link = absolute(href, BASE_URL);
            if (!best || score > best.score) best = { url: link, score: score };
        }
        return best && best.score >= 0.5 ? best.url : null;
    }

    function findPage(info, q) {
        var posts = info.imdbId
            ? fetchJson(BASE_URL + "/wp-json/wp/v2/posts?search=" + encodeURIComponent(info.imdbId))
            : Promise.resolve(null);
        var html = fetchText(BASE_URL + "/?s=" + encodeURIComponent(searchTerm(info, q)));
        return Promise.all([posts, html]).then(function (r) {
            if (r[0] && r[0].length > 0 && r[0][0] != null) return r[0][0].link || null;
            return bestCard(r[1], info, q);
        });
    }

    function itemsOf(root, q) {
        var items = [];
        var sections, downloads, code, mark, text, i, j;
        if (q.isSeries) {
            code = "S" + pad(q.seasonNo);
            mark = "Episode-" + pad(q.episodeNo);
            sections = select(root, null, "episode-item");
            for (i = 0; i < sections.length; i++) {
                if (textOfAll(select(sections[i], null, "episode-title")).indexOf(code) < 0) continue;
                downloads = select(sections[i], null, "episode-download-item");
                for (j = 0; j < downloads.length; j++) {
                    text = textOf(downloads[j]);
                    if (text.indexOf(mark) >= 0) items.push({ links: linksOf(downloads[j]), context: text });
                }
            }
            return items;
        }
        downloads = select(root, null, "download-item");
        for (i = 0; i < downloads.length; i++) {
            items.push({ links: linksOf(downloads[i]), context: textOf(downloads[i]) });
        }
        return items;
    }

    function unwrap(url) {
        if (/hubcloud|hubdrive/i.test(url)) return Promise.resolve(url);
        return fetchText(url).then(function (html) {
            var m, payload;
            if (!html) return url;
            try {
                m = /['"]o['"]\s*,\s*['"]([^'"]+)['"]/.exec(html);
                if (!m) return url;
                payload = JSON.parse(decode64(rot13(decode64(decode64(m[1])))));
                return payload.o ? decode64(payload.o).trim() : url;
            } catch (e) {
                return url;
            }
        });
    }

    function cloudOnPage(html, base) {
        var anchors, i, href;
        if (!html) return "";
        try {
            anchors = select(parse(html), "a", null);
            for (i = 0; i < anchors.length; i++) {
                href = anchors[i].attrs.href;
                if (href === undefined) continue;
                if (/hubcloud/i.test(textOf(anchors[i]) + " " + href)) return href ? absolute(href, base) : "";
            }
        } catch (e) { }
        return "";
    }

    function probe(link, pageUrl) {
        var abs;
        if (!link.href) return Promise.resolve({ stop: false, url: "" });
        abs = absolute(link.href, pageUrl);
        if (!abs) return Promise.resolve({ stop: false, url: "" });
        if (/hubcloud/i.test(link.text) || /hubcloud/i.test(link.href)) {
            return unwrap(abs).then(function (url) {
                return { stop: true, url: url };
            });
        }
        if (/hubdrive/i.test(link.text) || /hubdrive/i.test(link.href)) {
            return unwrap(abs).then(function (drive) {
                return fetchText(drive, pageUrl).then(function (html) {
                    return { stop: false, url: cloudOnPage(html, drive) };
                });
            });
        }
        return Promise.resolve({ stop: false, url: "" });
    }

    function findCloud(links, pageUrl) {
        var probes = [];
        var i;
        for (i = 0; i < links.length; i++) probes.push(probe(links[i], pageUrl));
        return Promise.all(probes).then(function (found) {
            var k;
            for (k = 0; k < found.length; k++) {
                if (found[k].stop || found[k].url) return found[k].url;
            }
            return "";
        });
    }

    function hasUrl(entries, url) {
        var i;
        for (i = 0; i < entries.length; i++) {
            if (entries[i].stream.url === url) return true;
        }
        return false;
    }

    function collect(html, pageUrl, res, size, runtime) {
        var out = [];
        var root, head, filename, found, anchors, href, abs, host, pxl, drain, i;
        try {
            root = parse(html);
            head = clean(textOfAll(select(root, "div", "card-header")));
            if (!head) head = textOfAll(select(root, "title", null)).trim();
            filename = head.replace(/\.(mkv|mp4|avi|rar|zip)$/i, "");
            found = /<td[^>]*>\s*File\s*Size\s*:\s*<\/td>\s*<td[^>]*>\s*([\d\.]+\s*[MGBtbi]+)\s*<\/td>/i.exec(html) ||
                /Size\s*:\s*<\/strong>\s*([\d\.]+\s*[MGBtbi]+)/i.exec(html);
            if (found) size = found[1].trim();
            anchors = select(root, "a", null);
            for (i = 0; i < anchors.length; i++) {
                href = anchors[i].attrs.href;
                if (!href || href.indexOf("javascript:") === 0) continue;
                abs = href.replace(/&amp;/g, "&");
                if (/\.zip|\.rar/.test(abs)) continue;
                host = hostOf(abs);
                if (host.length < 1) continue;
                if (!(/\.r2\.cloudflarestorage\.com$|\.r2\.dev$|^cdn\.fsl-buckets\.life$|\.fsl-buckets\.life$/.test(host))) continue;
                if (!hasUrl(out, abs)) out.push(toStream(filename, "FSL-v2", abs, res, pageUrl, size, runtime));
            }
            pxl = /var\s+pxl\s*=\s*["']https?:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i.exec(html) ||
                /href=["']https?:\/\/pixeldrain\.[a-z0-9.-]+\/u\/([A-Za-z0-9_-]+)["']/i.exec(html);
            if (pxl && pxl[1]) {
                drain = "https://pixeldrain.com/api/file/" + pxl[1];
                if (!hasUrl(out, drain)) out.push(toStream(filename, "PixelDrain", drain, res, pageUrl, size, runtime));
            }
        } catch (e) { }
        return out;
    }

    function redirectOf(html) {
        var m = /var\s+url\s*=\s*['"]([^'"]+)['"]/.exec(html) ||
            /id=["']download["'][^>]*href=["']([^'"]+)["']/i.exec(html) ||
            /href=["']([^'"]+)["'][^>]*id=["']download["']/i.exec(html);
        return m ? m[1] : "";
    }

    function hubStreams(cloudUrl, res, size, runtime) {
        return fetchText(cloudUrl, BASE_URL + "/").then(function (html) {
            var redirect, next;
            if (!html) return null;
            redirect = redirectOf(html);
            if (!redirect) return { html: html, url: cloudUrl };
            next = absolute(redirect.replace(/&amp;/g, "&"), cloudUrl);
            return fetchText(next, cloudUrl).then(function (page) {
                return page ? { html: page, url: next } : null;
            });
        }).then(function (page) {
            return page ? collect(page.html, page.url, res, size, runtime) : [];
        });
    }

    function resolveItem(item, pageUrl, runtime) {
        var text = clean(item.context);
        var res = qualityOf(text);
        var size;
        if (res === "480P") return Promise.resolve([]);
        size = sizeOf(text);
        return findCloud(item.links, pageUrl).then(function (cloud) {
            return cloud ? hubStreams(cloud, res, size, runtime) : [];
        }).then(null, function () {
            return [];
        });
    }

    function gather(pageUrl, q, runtime) {
        return fetchText(pageUrl).then(function (html) {
            var items, jobs, i;
            if (!html) return [];
            items = itemsOf(parse(html), q);
            jobs = [];
            for (i = 0; i < items.length; i++) jobs.push(resolveItem(items[i], pageUrl, runtime));
            return Promise.all(jobs);
        }).then(function (groups) {
            var out = [];
            var i, j;
            for (i = 0; i < groups.length; i++) {
                for (j = 0; j < groups[i].length; j++) out.push(groups[i][j]);
            }
            return out;
        });
    }

    function weight(res) {
        if (res === "2160P") return 4;
        if (res === "1080P") return 3;
        if (res === "720P") return 2;
        return 1;
    }

    function limitFor(entry, set) {
        if (entry.res === "2160P") return set.max4K;
        if (entry.res === "1080P") return set.max1080p;
        return Infinity;
    }

    function hostLimit(host, set) {
        if (host === "FSL-v2") return set.maxFSLv2;
        if (host === "FSL") return set.maxFSL;
        if (host === "PixelDrain") return set.maxPixelDrain;
        return Infinity;
    }

    function sortTag(n) {
        var bin = n.toString(2);
        var out = "";
        var i;
        while (bin.length < 20) bin = "0" + bin;
        for (i = 0; i < bin.length; i++) out += bin.charAt(i) === "1" ? "\uFEFF" : "\u200B";
        return out;
    }

    function rank(entries, set) {
        var kept = [];
        var seenRes = Object.create(null);
        var seenHost = Object.create(null);
        var seenUrl = Object.create(null);
        var picked = [];
        var out = [];
        var i, e, key, limit;
        for (i = 0; i < entries.length; i++) {
            e = entries[i];
            if (e.res === "2160P" && !set.enable4K) continue;
            if (e.res === "1080P" && !set.enable1080p) continue;
            kept.push({ e: e, i: i });
        }
        kept.sort(function (a, b) {
            var d = 0;
            if (!set.sortBySize) d = weight(b.e.res) - weight(a.e.res);
            if (d === 0) d = (b.e.mb || 0) - (a.e.mb || 0);
            return d !== 0 ? d : a.i - b.i;
        });
        for (i = 0; i < kept.length; i++) {
            e = kept[i].e;
            limit = limitFor(e, set);
            if (limit !== Infinity) {
                seenRes[e.res] = (seenRes[e.res] || 0) + 1;
                if (seenRes[e.res] > limit) continue;
            }
            picked.push(e);
        }
        kept = picked;
        picked = [];
        for (i = 0; i < kept.length; i++) {
            e = kept[i];
            limit = hostLimit(e.host, set);
            if (limit !== Infinity) {
                key = e.host + ":" + e.res;
                seenHost[key] = (seenHost[key] || 0) + 1;
                if (seenHost[key] > limit) continue;
            }
            picked.push(e);
        }
        for (i = 0; i < picked.length; i++) {
            e = picked[i];
            if (!e.stream.url || seenUrl[e.stream.url] === true) continue;
            seenUrl[e.stream.url] = true;
            out.push(e);
        }
        return out.map(function (entry, index) {
            var s = entry.stream;
            var tag = sortTag(index + 1);
            return { name: tag + s.name, title: tag + s.title, url: s.url, quality: s.quality, headers: s.headers };
        });
    }

    return Promise.resolve().then(function () {
        var q = buildQuery();
        var info;
        if (!q) return [];
        return tmdbInfo(q).then(function (found) {
            info = found;
            if (!info.title) return null;
            return findPage(info, q);
        }).then(function (pageUrl) {
            if (!pageUrl) return [];
            return gather(pageUrl, q, info.runtime).then(function (entries) {
                return rank(entries, settings());
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        var counts = [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "unlimited", label: "Unlimited" }
        ];
        return Promise.resolve([
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
            { type: "select", key: "max4K", label: "4K / 2160p", defaultValue: "unlimited", options: counts },
            { type: "select", key: "max1080p", label: "FHD / 1080p", defaultValue: "unlimited", options: counts },
            { type: "header", label: "Limit Stream by Source" },
            { type: "info", label: "Default: Unlimited" },
            { type: "select", key: "maxFSL", label: "FSL", defaultValue: "unlimited", options: counts },
            { type: "select", key: "maxFSLv2", label: "FSL-v2 [R2]", defaultValue: "unlimited", options: counts },
            { type: "select", key: "maxPixelDrain", label: "PixelDrain", defaultValue: "unlimited", options: counts }
        ]);
    }
};