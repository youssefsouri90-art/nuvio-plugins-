function getStreams(tmdbId, mediaType, season, episode) {
    var API_BASE = "https://api.hicine.sbs";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        if (!/^\d+$/.test(String(id))) return null;
        if (type !== "tv" && type !== "movie") return null;
        var isTv = type === "tv";
        if (isTv && (seasonNumber == null || episodeNumber == null)) return null;
        return {
            id: id,
            mediaType: type,
            season: isTv ? Number(seasonNumber) : null,
            episode: isTv ? Number(episodeNumber) : null
        };
    }

    function sorted(list, compare) {
        var slots = [];
        for (var i = 0; i < list.length; i++) slots.push({ index: i, value: list[i] });
        slots.sort(function (a, b) {
            var diff = compare(a.value, b.value);
            return diff !== 0 ? diff : a.index - b.index;
        });
        return slots.map(function (slot) {
            return slot.value;
        });
    }

    function getSortTag(rank) {
        var inv = 4 - Math.max(0, Math.min(4, rank));
        var bin = inv.toString(2);
        while (bin.length < 20) bin = "0" + bin;
        return bin.split("").map(function (b) {
            return b === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function fetchSafe(url, opts) {
        var given = opts || {};
        var options = {};
        var headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        };
        var extra = given.headers || {};
        var key;
        for (key in given) {
            if (Object.prototype.hasOwnProperty.call(given, key)) options[key] = given[key];
        }
        for (key in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
        }
        options.headers = headers;
        try {
            return fetch(url, options).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function fetchJson(url, opts) {
        return fetchSafe(url, opts).then(function (r) {
            if (!r || !r.ok) return null;
            return r.json().then(null, function () {
                return null;
            });
        });
    }

    function hiFetchJson(url) {
        return fetchJson(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json, text/plain, */*" } });
    }

    function dedupe(streams) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < streams.length; i++) {
            var x = streams[i];
            if (!x || !x.url || seen[x.url] === true) continue;
            seen[x.url] = true;
            out.push(x);
        }
        return out;
    }

    function dedupeBySize(entries) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.size) {
                var k = e.host + "|" + e.size;
                if (seen[k] === true) continue;
                seen[k] = true;
            }
            out.push(e);
        }
        return out;
    }

    function languageOf(t) {
        if (/dual|hindi\-eng|eng\-hin/i.test(t)) return "English \u2022 Hindi";
        var parts = [];
        if (/english|eng/i.test(t)) parts.push("English");
        if (/hindi|hin/i.test(t)) parts.push("Hindi");
        return parts.join(" \u2022 ") || "English";
    }

    function hostOf(url) {
        var lUrl = url.toLowerCase();
        if (lUrl.indexOf("hubcloud") !== -1 || lUrl.indexOf("/hub2/") !== -1 || lUrl.indexOf("homelander.buzz") !== -1 || lUrl.indexOf("whistle.lat") !== -1 || lUrl.indexOf("mandalorian.buzz") !== -1) return "HubCloud";
        if (lUrl.indexOf(".r2.dev") !== -1 || lUrl.indexOf("vcloud") !== -1) return "vCloud";
        if (lUrl.indexOf("pixeldrain") !== -1) return "PixelDrain";
        return "";
    }

    function audioOf(t) {
        var audio = "AAC";
        var am = t.match(/(TrueHD\s*7\.1|DDP\s*7\.1|DDP\s*5\.1|DD\s*5\.1|5\.1|AAC)/i);
        if (am) {
            audio = am[1].toUpperCase().replace(/\s+/g, "");
            if (audio === "5.1") audio = "DDP5.1";
            if (audio.indexOf("TRUEHD") !== -1) audio = "TrueHD 7.1";
        } else if (/dolby\s*digital|dd/i.test(t)) {
            audio = "Dolby Digital";
        }
        if (/atmos/i.test(t)) audio += " \u2022 Atmos";
        return audio;
    }

    var count1080p = 0;

    function makeStream(title, url, quality, headers, fallbackQ) {
        if (!url || url.indexOf("https://") !== 0) return null;
        var nq = null;
        var candidates = [quality, fallbackQ];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (c === "2160p" || c === "1440p" || c === "1080p") {
                nq = c;
                break;
            }
        }
        if (!nq || (nq === "1080p" && count1080p >= 4)) return null;

        var t = (title || "").replace(/[\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
        var sizeM = t.match(/\[\s*(\d+(?:\.\d+)?\s*[MG]B)\s*\]/i);
        var sizeStr = sizeM ? sizeM[1].trim() : null;
        var src = /bluray|blu\-ray|bdrip/i.test(t) ? "Blu-ray" : /hdrip|webrip/i.test(t) ? "WEBRip" : "WEB-DL";
        var imax = /imax/i.test(t) ? " \u2022 IMAX" : "";
        var range = /dolby\s*vision|dovi/i.test(t) ? "Dolby Vision" : /hdr10/i.test(t) ? "HDR10" : /hdr/i.test(t) ? "HDR" : /10bit|10\-bit/i.test(t) ? "10-Bit" : /sdr/i.test(t) ? "SDR" : "";
        var codec = /hevc|x265|h265/i.test(t) ? "H.265" : "H.264";
        var audio = audioOf(t);
        var langs = languageOf(t);
        var host = hostOf(url);

        if (nq === "1080p") count1080p++;

        var ranks = { "2160p": 4, "1440p": 3, "1080p": 2 };
        var sortTag = getSortTag(ranks[nq]);
        var shortLabel = "VegaMovies \u2022 " + nq.toUpperCase() + imax + (host ? " \u2022 " + host : "");
        var detailLine1 = langs + (sizeStr ? " \u2022 " + sizeStr : "");
        var detailLine2 = src + " \u2022 " + audio + (range ? " \u2022 " + range : "") + " \u2022 " + codec;

        return {
            host: host || shortLabel,
            size: sizeStr ? sizeStr.replace(/\s+/g, "").toUpperCase() : "",
            stream: {
                name: sortTag + shortLabel,
                title: sortTag + shortLabel,
                quality: nq + " \u2022 " + detailLine1 + "\n" + detailLine2,
                language: langs,
                url: url,
                headers: headers || {}
            }
        };
    }

    function getTMDBInfo(id, type) {
        var kind = type === "tv" ? "tv" : "movie";
        return fetchJson(TMDB_API + "/" + kind + "/" + id + "?api_key=" + TMDB_KEY).then(function (d) {
            if (!d) return { title: String(id), year: null };
            return {
                title: kind === "tv" ? d.name : d.title,
                year: (d.first_air_date || d.release_date || "").split("-")[0]
            };
        });
    }

    function qualityOf(text) {
        var m = String(text || "").match(/\b(2160p|1440p|1080p|720p|480p|360p)\b/i) || String(text || "").match(/\b4k\b/i);
        if (!m) return "";
        var q = m[1] ? m[1].toLowerCase() : "4k";
        return q === "4k" ? "2160p" : q;
    }

    function allowedQuality(q) {
        return q === "2160p" || q === "1080p";
    }

    function sizeOf(text) {
        var m = String(text || "").match(/([\d.]+)\s*(GB|MB)/i);
        return m ? m[1] + m[2].toUpperCase() : "";
    }

    function hiLang(text) {
        var s = String(text || "").toLowerCase();
        var all = ["hindi", "punjabi", "urdu", "tamil", "telugu", "marathi", "kannada", "malayalam", "bengali", "gujarati", "english", "korean", "japanese", "chinese", "spanish", "arabic"];
        var found = [];
        for (var i = 0; i < all.length; i++) {
            if (s.indexOf(all[i]) !== -1) found.push(all[i]);
        }
        return found.join("-");
    }

    function hiLangLabel(lang) {
        if (!lang) return "";
        return lang.split("-").map(function (p) {
            return p.charAt(0).toUpperCase() + p.slice(1);
        }).join("-");
    }

    function hiLangTier(lang) {
        if (!lang) return 3;
        if (lang.indexOf("hindi") !== -1) return 0;
        if (lang.indexOf("punjabi") !== -1 || lang.indexOf("urdu") !== -1) return 1;
        if (lang.indexOf("english") !== -1) return 4;
        return 2;
    }

    function hiQueryParam(url, key) {
        var qi = url.indexOf("?");
        if (qi < 0) return null;
        var pairs = url.slice(qi + 1).split("&");
        for (var i = 0; i < pairs.length; i++) {
            var kv = pairs[i].split("=");
            if (decodeURIComponent(kv[0]) === key) return decodeURIComponent(kv.slice(1).join("="));
        }
        return null;
    }

    function hiSearch(query) {
        var norm = function (t) {
            return String(t || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
        };
        var words = query.toLowerCase().split(/[^a-z0-9]+/i).filter(function (w) {
            return w.length > 1;
        });

        function fetchQ(t) {
            return hiFetchJson(API_BASE + "/api/search/" + encodeURIComponent(t)).then(function (d) {
                return (d && Array.isArray(d.data)) ? d.data : (Array.isArray(d) ? d : []);
            });
        }

        return fetchQ(query).then(function (items) {
            if (items.length >= 3 || words.length <= 1) return items;
            var variants = [words.join("-"), words.join(" ")];
            var longest = sorted(words.slice(), function (a, b) {
                return b.length - a.length;
            }).slice(0, 2);
            for (var i = 0; i < longest.length; i++) {
                if (longest[i].length > 2) variants.push(longest[i]);
            }
            var unique = variants.filter(function (v, index, a) {
                return v !== query && a.indexOf(v) === index;
            });
            return Promise.all(unique.map(fetchQ)).then(function (extra) {
                for (var a = 0; a < extra.length; a++) {
                    for (var b = 0; b < extra[a].length; b++) {
                        var rec = extra[a][b];
                        var t = norm(rec && (rec.title || rec.name));
                        var all = true;
                        for (var c = 0; c < words.length; c++) {
                            if (t.indexOf(norm(words[c])) === -1) {
                                all = false;
                                break;
                            }
                        }
                        if (all) items.push(rec);
                    }
                }
                return items;
            });
        });
    }

    function hiFindId(title, year, type) {
        if (!title) return Promise.resolve(null);
        return hiSearch(title).then(function (results) {
            var wantSeries = type === "tv";
            var normalize = function (s) {
                return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
            };
            var normTitle = normalize(title);
            for (var i = 0; i < results.length; i++) {
                var rec = results[i];
                if (!rec || !rec.record_id) continue;
                var recTitle = normalize(rec.title || rec.name || "");
                if (recTitle !== normTitle && recTitle.indexOf(normTitle) === -1 && normTitle.indexOf(recTitle) === -1) continue;
                var cats = String(rec.categories || "").toLowerCase();
                var recIsMovie = cats.indexOf("series") === -1 && cats.indexOf("anime") === -1;
                if (!wantSeries && !recIsMovie) continue;
                if (wantSeries && recIsMovie) continue;
                var recYear = (String(rec.title || "").match(/\((19\d{2}|20\d{2})\)/) || [])[1] || String(rec.date || "").slice(0, 4);
                if (year && recYear && Math.abs(parseInt(recYear, 10) - parseInt(year, 10)) > 1) continue;
                return { id: rec.record_id, categories: rec.categories || "" };
            }
            return null;
        });
    }

    function hiCollection(categories, type) {
        var cats = String(categories || "").toLowerCase();
        var bollywood = cats.indexOf("bollywood") !== -1;
        if (bollywood && cats.indexOf("series") !== -1) return "bollywood_series";
        if (bollywood) return "bollywood_movies";
        if (cats.indexOf("anime") !== -1) return "anime";
        return type === "tv" ? "hollywood_series" : "hollywood_movies";
    }

    function hiPixelDirect(goUrl) {
        return fetchSafe(goUrl, { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-0" } }).then(function (r) {
            if (!r) return null;
            var m = (r.url || "").match(/^https?:\/\/(pixeldrain\.[a-z]+)\/(?:u|api\/file)\/([A-Za-z0-9]+)/);
            return m ? "https://" + m[1] + "/api/file/" + m[2] : null;
        });
    }

    function hiResolveWorker(workerUrl, quality, size, lang) {
        var qi = workerUrl.indexOf("?");
        if (qi < 0) return Promise.resolve([]);
        var base = workerUrl.slice(0, qi).replace(/\/+$/, "");
        var vcloud = hiQueryParam(workerUrl, "vcloud");
        if (!vcloud) return Promise.resolve([]);
        return hiFetchJson(base + "/api/links?vcloud=" + encodeURIComponent(vcloud)).then(function (data) {
            var tokens = data && data.tokens;
            if (!tokens || !Object.keys(tokens).length) return [];

            var order = ["fsl", "server1", "fsl2", "pixel"];
            var keys = sorted(Object.keys(tokens).filter(function (k) {
                return order.indexOf(k) !== -1;
            }), function (a, b) {
                return order.indexOf(a) - order.indexOf(b);
            });
            return Promise.all(keys.map(function (k) {
                var tk = tokens[k] || {};
                if (!tk.ts || !tk.sig) return Promise.resolve(null);
                var finalUrl = base + "/go?type=" + encodeURIComponent(k) + "&vcloud=" + encodeURIComponent(vcloud) + "&ts=" + encodeURIComponent(tk.ts) + "&sig=" + encodeURIComponent(tk.sig);
                if (k !== "pixel") return Promise.resolve({ url: finalUrl, quality: quality, size: size, lang: lang });
                return hiPixelDirect(finalUrl).then(function (direct) {
                    if (!direct) return null;
                    return { url: direct, quality: quality, size: size, lang: lang };
                });
            })).then(function (list) {
                return list.filter(Boolean);
            });
        });
    }

    function hiResolveSafe(u, q, s, l) {
        try {
            return hiResolveWorker(u, q, s, l).then(null, function () {
                return [];
            });
        } catch (e) {
            return Promise.resolve([]);
        }
    }

    function hiParseMovieLinks(field) {
        var out = [];
        var lines = String(field || "").split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var m = line.match(/https?:\/\/[^\s,]+/);
            if (!m) continue;
            var q = qualityOf(line) || "auto";
            if (q !== "auto" && !allowedQuality(q)) continue;
            out.push({ workerUrl: m[0], quality: q, size: sizeOf(line), lang: hiLang(line) });
        }
        return out;
    }

    function hiParseEpisodes(seasonText) {
        var out = [];
        var decoded = String(seasonText || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ");
        var lines = decoded.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/episode\s*(\d+)\s*[:\-]?\s*(.*)/i);
            if (!m) continue;
            var rest = m[2] || "";
            var variants = [];
            var re = /(https?:\/\/[^\s,]+?)\s*,\s*,?\s*([^:]*?)(?=\s*:|$)/g;
            var hit;
            while ((hit = re.exec(rest)) !== null) {
                var label = hit[2].trim();
                var q = qualityOf(label) || label || "auto";
                if (q !== "auto" && !allowedQuality(q)) continue;
                variants.push({ url: hit[1], quality: q });
            }
            if (!variants.length) {
                var urls = rest.match(/https?:\/\/[^\s,]+/g) || [];
                for (var j = 0; j < urls.length; j++) variants.push({ url: urls[j], quality: "auto" });
            }
            if (variants.length) out.push({ num: parseInt(m[1], 10), variants: variants });
        }
        return out;
    }

    function hiTargets(det, type, seasonNumber, episodeNumber) {
        var targets = [];
        var i;
        if (type === "tv") {
            var seasonText = det["season_" + seasonNumber] || "";
            var episodes = hiParseEpisodes(seasonText);
            var ep = null;
            for (i = 0; i < episodes.length; i++) {
                if (episodes[i].num === Number(episodeNumber)) {
                    ep = episodes[i];
                    break;
                }
            }
            if (!ep) return targets;
            var seasonLang = hiLang(seasonText.split(/\r?\n/)[0] || "");
            for (i = 0; i < ep.variants.length; i++) {
                targets.push({ workerUrl: ep.variants[i].url, quality: ep.variants[i].quality, size: "", lang: seasonLang });
            }
            return targets;
        }
        return hiParseMovieLinks(det.links);
    }

    function toStream(r) {
        var t = [hiLangLabel(r.lang), r.quality, r.size ? "[" + r.size + "]" : ""].filter(Boolean).join(" ");
        return makeStream(t, r.url, r.quality, { "User-Agent": USER_AGENT }, "HD");
    }

    function collect(results) {
        var flat = [];
        for (var i = 0; i < results.length; i++) {
            for (var j = 0; j < results[i].length; j++) {
                if (results[i][j]) flat.push(results[i][j]);
            }
        }
        var entries = [];
        var raws = dedupe(flat);
        for (var k = 0; k < raws.length; k++) {
            var entry = toStream(raws[k]);
            if (entry) entries.push(entry);
        }
        return dedupeBySize(entries).map(function (e) {
            return e.stream;
        });
    }

    function getHicineStreams(title, year, type, seasonNumber, episodeNumber) {
        return hiFindId(title, year, type).then(function (match) {
            if (!match) return [];
            return hiFetchJson(API_BASE + "/api/" + hiCollection(match.categories, type) + "/" + match.id).then(function (det) {
                if (!det || det.error) return [];
                var targets = hiTargets(det, type, seasonNumber, episodeNumber);
                if (!targets.length) return [];

                var qRank = { "2160p": 5, "1080p": 3 };
                targets = sorted(targets, function (a, b) {
                    return (hiLangTier(a.lang || "") - hiLangTier(b.lang || "")) || ((qRank[b.quality] || 0) - (qRank[a.quality] || 0));
                });

                return Promise.all(targets.map(function (t) {
                    return hiResolveSafe(t.workerUrl, t.quality, t.size, t.lang);
                })).then(collect);
            });
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return getTMDBInfo(query.id, query.mediaType).then(function (info) {
        return getHicineStreams(info.title, info.year, query.mediaType, query.season, query.episode);
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };