function getStreams(tmdbId, mediaType, season, episode) {
    var API_BASE = "https://vidlink.pro/api/b";
    var ENC_API = "https://enc-dec.app/api";
    var HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        "Connection": "keep-alive",
        "Referer": "https://vidlink.pro/",
        "Origin": "https://vidlink.pro"
    };
    var ALLOWED_QUALITIES = ["4K", "1440p", "1080p", "720p"];

    function buildQuery() {
        var id = String(tmdbId == null ? "" : tmdbId);
        if (!/^\d+$/.test(id)) return null;
        var isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return null;
        return { id: id, isTv: isTv, season: season, episode: episode };
    }

    function fetchText(url, headers) {
        return Promise.resolve().then(function () {
            return fetch(url, headers ? { headers: headers } : {});
        }).then(function (response) {
            if (!response || !response.ok) return null;
            return response.text();
        }).then(null, function () {
            return null;
        });
    }

    function fetchJson(url, headers) {
        return fetchText(url, headers).then(function (text) {
            if (!text) return null;
            try {
                return JSON.parse(text);
            } catch (error) {
                return null;
            }
        });
    }

    function qualityRank(quality) {
        var q = (quality || "").toUpperCase();
        if (q === "4K" || q === "2160P") return 5;
        if (q === "1440P") return 4;
        if (q === "1080P") return 3;
        if (q === "720P") return 2;
        if (q === "480P") return 1;
        return 0;
    }

    function getSortTag(score, maxScore) {
        maxScore = maxScore || 999999;
        var inv = Math.max(0, maxScore - Math.max(0, parseInt(score, 10) || 0));
        var bin = inv.toString(2);
        while (bin.length < 20) bin = "0" + bin;
        return bin.split("").map(function (c) {
            return c === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function qualityOf(str) {
        if (!str) return null;
        var s = str.toString().toLowerCase();
        if (s.indexOf("2160") !== -1 || s.indexOf("4k") !== -1) return "4K";
        if (s.indexOf("1440") !== -1 || s.indexOf("2k") !== -1) return "1440p";
        if (s.indexOf("1080") !== -1 || s.indexOf("fhd") !== -1) return "1080p";
        if (s.indexOf("720") !== -1 || s.indexOf("hd") !== -1) return "720p";
        var match = s.match(/(\d{3,4})[p]?/);
        if (match) {
            var h = parseInt(match[1], 10);
            if (h >= 2160) return "4K";
            if (h >= 1440) return "1440p";
            if (h >= 1080) return "1080p";
            if (h >= 720) return "720p";
        }
        return null;
    }

    function resolveUrl(url, baseUrl) {
        if (!url) return null;
        if (url.indexOf("http") === 0) return url;
        var base = baseUrl.match(/^(https?:)\/\/([^\/?#]+)([^?#]*)/);
        if (!base) return url;
        var origin = base[1] + "//" + base[2];
        if (url.indexOf("//") === 0) return base[1] + url;
        var basePath = base[3] || "/";
        if (url.charAt(0) === "?" || url.charAt(0) === "#") return origin + basePath + url;
        var full = url.charAt(0) === "/" ? url : basePath.slice(0, basePath.lastIndexOf("/") + 1) + url;
        var tailAt = full.search(/[?#]/);
        var tail = tailAt === -1 ? "" : full.slice(tailAt);
        var segments = (tailAt === -1 ? full : full.slice(0, tailAt)).split("/");
        var out = [];
        for (var i = 0; i < segments.length; i++) {
            var segment = segments[i];
            var last = i === segments.length - 1;
            if (segment === "..") {
                if (out.length > 1) out.pop();
                if (last) out.push("");
            } else if (segment === ".") {
                if (last) out.push("");
            } else {
                out.push(segment);
            }
        }
        return origin + out.join("/") + tail;
    }

    function toStream(url, qualityKey) {
        if (!url) return null;
        var quality = qualityOf(qualityKey);
        if (!quality) return null;
        return {
            name: "Vidlink",
            title: "Vidlink",
            url: url,
            quality: quality,
            type: url.toLowerCase().indexOf(".m3u8") !== -1 ? "m3u8" : "video",
            headers: { "User-Agent": HEADERS["User-Agent"], "Referer": HEADERS["Referer"] }
        };
    }

    function parseM3U8(content, baseUrl) {
        var lines = content.split("\n").map(function (l) {
            return l.trim();
        }).filter(Boolean);
        var streams = [];
        var current = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
                current = { resolution: null };
                var resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                if (resMatch) current.resolution = resMatch[1];
            } else if (current && line.charAt(0) !== "#") {
                current.url = resolveUrl(line, baseUrl);
                streams.push(current);
                current = null;
            }
        }
        return streams;
    }

    function fetchPlaylist(playlistUrl) {
        return fetchText(playlistUrl, HEADERS).then(function (content) {
            if (!content) return [];
            var found = [];
            var rows = parseM3U8(content, playlistUrl);
            for (var i = 0; i < rows.length; i++) {
                var key = rows[i].resolution ? rows[i].resolution.split("x").pop() + "p" : null;
                var stream = toStream(rows[i].url, key);
                if (stream) found.push(stream);
            }
            return found;
        });
    }

    function isSubtitleUrl(value) {
        return value.indexOf(".srt") !== -1 || value.indexOf(".vtt") !== -1 ||
            value.indexOf("subtitle") !== -1 || value.indexOf("caption") !== -1;
    }

    function collect(data) {
        var results = [];
        var i;
        var stream;
        if (!data) return results;

        if (data.stream && data.stream.qualities) {
            var keys = Object.keys(data.stream.qualities);
            for (i = 0; i < keys.length; i++) {
                var item = data.stream.qualities[keys[i]];
                if (item && item.url) {
                    stream = toStream(item.url, keys[i]);
                    if (stream) results.push(stream);
                }
            }
            if (data.stream.playlist) results.push({ playlist: data.stream.playlist });
            return results;
        }

        if (data.stream && data.stream.playlist) {
            results.push({ playlist: data.stream.playlist });
            return results;
        }

        if (data.url) {
            stream = toStream(data.url, data.quality || null);
            if (stream) results.push(stream);
            return results;
        }

        if (Array.isArray(data.streams)) {
            for (i = 0; i < data.streams.length; i++) {
                if (data.streams[i] && data.streams[i].url) {
                    stream = toStream(data.streams[i].url, data.streams[i].quality || data.streams[i].resolution || null);
                    if (stream) results.push(stream);
                }
            }
            return results;
        }

        if (Array.isArray(data.links)) {
            for (i = 0; i < data.links.length; i++) {
                if (data.links[i] && data.links[i].url) {
                    stream = toStream(data.links[i].url, data.links[i].quality || null);
                    if (stream) results.push(stream);
                }
            }
            return results;
        }

        function walk(obj) {
            if (!obj || typeof obj !== "object") return;
            var names = Object.keys(obj);
            for (var n = 0; n < names.length; n++) {
                var val = obj[names[n]];
                if (names[n].toLowerCase().indexOf("subtitle") !== -1 || names[n].toLowerCase().indexOf("caption") !== -1) continue;
                if (typeof val === "string" && val.indexOf("http") === 0) {
                    if (isSubtitleUrl(val)) continue;
                    var found = toStream(val, names[n]);
                    if (found) results.push(found);
                } else if (typeof val === "object" && val !== null) {
                    walk(val);
                }
            }
        }
        walk(data);

        return results;
    }

    function rank(streams) {
        var seen = Object.create(null);
        var kept = [];
        var i;
        for (i = 0; i < streams.length; i++) {
            var s = streams[i];
            if (ALLOWED_QUALITIES.indexOf(s.quality) === -1 || !s.url || s.url.indexOf("https") !== 0) continue;
            if (seen[s.url]) continue;
            seen[s.url] = true;
            kept.push({ stream: s, index: kept.length });
        }
        kept.sort(function (a, b) {
            return (qualityRank(b.stream.quality) - qualityRank(a.stream.quality)) || (a.index - b.index);
        });
        var total = kept.length;
        var out = [];
        for (i = 0; i < total; i++) {
            var item = kept[i].stream;
            var tag = getSortTag(total - i, total + 1);
            out.push({
                name: tag + item.name,
                title: tag + item.title,
                url: item.url,
                quality: item.quality,
                type: item.type,
                headers: item.headers
            });
        }
        return out;
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return fetchJson(ENC_API + "/enc-vidlink?text=" + query.id).then(function (encrypted) {
        var encryptedId = encrypted && encrypted.result != null ? encrypted.result : null;
        if (!encryptedId) return [];

        var vidlinkUrl = query.isTv
            ? API_BASE + "/tv/" + encryptedId + "/" + query.season + "/" + query.episode
            : API_BASE + "/movie/" + encryptedId;

        return fetchJson(vidlinkUrl, HEADERS).then(function (data) {
            if (!data) return [];
            var extracted = collect(data);
            if (!extracted.length) return [];

            var direct = [];
            var playlists = [];
            for (var i = 0; i < extracted.length; i++) {
                if (extracted[i].playlist) playlists.push(extracted[i].playlist);
                else direct.push(extracted[i]);
            }
            if (!playlists.length) return rank(direct);

            return Promise.all(playlists.map(fetchPlaylist)).then(function (lists) {
                var all = direct;
                for (var j = 0; j < lists.length; j++) all = all.concat(lists[j]);
                return rank(all);
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };