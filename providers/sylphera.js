function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://dexter.pw";
    var HEADERS = {
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36"
    };
    var SERVERS = [21, 1, 2, 3, 4, 5];

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        if (mediaType === "movie") return mediaType + "/" + tmdbId + "?v=3";
        if (season == null || episode == null) return null;
        if (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode))) return null;
        return mediaType + "/" + tmdbId + "/" + season + "/" + episode + "?v=3";
    }

    function getSortTag(rank) {
        var bin = Math.max(0, 5 - rank).toString(2);
        while (bin.length < 20) bin = "0" + bin;
        var tag = "";
        for (var i = 0; i < bin.length; i += 1) {
            tag += bin.charAt(i) === "1" ? "\uFEFF" : "\u200B";
        }
        return tag;
    }

    function qualityOf(width, height) {
        if (width >= 3840 || height >= 2160) return { label: "2160p", rank: 5 };
        if (width >= 1920 || height >= 1080) return { label: "1080p", rank: 4 };
        return null;
    }

    function resolveUrl(path, baseUrl) {
        if (path.indexOf("http://") === 0 || path.indexOf("https://") === 0) return path;
        var origin = /^https?:\/\/[^\/?#]*/.exec(baseUrl.indexOf("http") === 0 ? baseUrl : BASE_URL);
        if (!origin) return null;
        if (path.indexOf("//") === 0) return origin[0].slice(0, origin[0].indexOf("//")) + path;
        var split = /^([^?#]*)([\s\S]*)$/.exec(path);
        var pathname = split[1].charAt(0) === "/" ? split[1] : "/" + split[1];
        var parts = pathname.split("/");
        var kept = [];
        for (var i = 1; i < parts.length; i += 1) {
            if (parts[i] === "..") kept.pop();
            else if (parts[i] !== ".") kept.push(parts[i]);
        }
        var last = parts[parts.length - 1];
        if (last === "." || last === "..") kept.push("");
        return origin[0] + "/" + kept.join("/") + split[2];
    }

    function parseMasterPlaylist(text, baseUrl) {
        var raw = text.split("\n");
        var lines = [];
        for (var i = 0; i < raw.length; i += 1) {
            var line = raw[i].trim();
            if (line) lines.push(line);
        }
        var streams = [];
        for (var j = 0; j < lines.length - 1; j += 1) {
            var info = lines[j];
            if (info.indexOf("#EXT-X-STREAM-INF") !== 0) continue;
            var next = lines[j + 1];
            if (next.charAt(0) === "#") continue;
            var res = /RESOLUTION=(\d+)x(\d+)/.exec(info);
            if (!res) continue;
            var quality = qualityOf(parseInt(res[1], 10), parseInt(res[2], 10));
            if (!quality) continue;
            var absolute = resolveUrl(next, baseUrl);
            if (!absolute) continue;
            streams.push({ url: absolute, quality: quality.label, rank: quality.rank });
        }
        return streams;
    }

    function fetchFromServer(serverId, query) {
        var url = BASE_URL + "/api/s/" + serverId + "/" + query;
        try {
            return fetch(url, { headers: HEADERS }).then(function (res) {
                if (!res.ok) return null;
                return res.text().then(function (text) {
                    if (!text || text.indexOf("#EXTM3U") === -1) return null;
                    var base = res.url && res.url.indexOf("http") === 0 ? res.url : url;
                    return parseMasterPlaylist(text, base);
                });
            }).then(null, function () {
                return null;
            });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    function gather(replies) {
        for (var i = 0; i < replies.length; i += 1) {
            if (replies[i] && replies[i].length > 0) return replies[i];
        }
        return [];
    }

    function toStreams(found) {
        var seen = Object.create(null);
        var slots = [];
        for (var i = 0; i < found.length; i += 1) {
            if (seen[found[i].url] === true) continue;
            seen[found[i].url] = true;
            slots.push({ item: found[i], index: slots.length });
        }
        slots.sort(function (a, b) {
            return (b.item.rank - a.item.rank) || (a.index - b.index);
        });
        var streams = [];
        for (var j = 0; j < slots.length; j += 1) {
            var s = slots[j].item;
            var tag = getSortTag(s.rank);
            var label = "Dexter \u2022 " + s.quality + " \u2022 HLS";
            streams.push({
                url: s.url,
                name: tag + label,
                title: tag + label,
                quality: s.quality,
                headers: HEADERS
            });
        }
        return streams;
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (query === null) return Promise.resolve([]);
        var pending = [];
        for (var i = 0; i < SERVERS.length; i += 1) {
            pending.push(fetchFromServer(SERVERS[i], query));
        }
        return Promise.all(pending).then(function (replies) {
            return toStreams(gather(replies));
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };