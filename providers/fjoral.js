function getStreams(tmdbId, mediaType, season, episode) {
    var BASE_URL = "https://bollywood.eu.org/";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var SERVERS = ["tga-hd"];
    var PROVIDER = "GramCinema";
    var HH_API = "https://tga-hd.api.hashhackers.com";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";

    function trim(text) {
        return text.replace(/^\s+|\s+$/g, "");
    }

    function pad(value) {
        var text = String(value);
        return text.length < 2 ? "0" + text : text;
    }

    function joinParts(parts, separator) {
        var kept = [];
        var i;
        for (i = 0; i < parts.length; i++) {
            if (parts[i]) kept.push(parts[i]);
        }
        return kept.join(separator);
    }

    function buildQuery(tmdbId, mediaType, season, episode) {
        var settings = (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
        var token = settings.cinemaTvToken ? trim(String(settings.cinemaTvToken)) : "";
        if (mediaType !== "movie" && mediaType !== "tv") return null;
        if (mediaType === "tv" && (season == null || episode == null)) return null;
        if (!token || !/^\d+$/.test(String(tmdbId))) return null;
        return {
            id: String(tmdbId),
            isTv: mediaType === "tv",
            season: season,
            episode: episode,
            token: token,
            allow2160: settings.enable2160p !== false,
            allow1080: settings.enable1080p !== false,
            allow720: settings.enable720p === true
        };
    }

    function fetchJson(url, options) {
        return Promise.resolve()
            .then(function () { return fetch(url, options || {}); })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(null, function () { return null; });
    }

    function formatSize(bytes) {
        var units = ["Bytes", "KB", "MB", "GB", "TB"];
        var exp;
        if (!bytes || bytes === 0) return "";
        exp = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, exp)).toFixed(2)) + " " + units[exp];
    }

    function qualityOf(text) {
        if (/2160p|4k|uhd/i.test(text)) return "2160P";
        if (/1080p/i.test(text)) return "1080P";
        if (/720p/i.test(text)) return "720P";
        if (/480p/i.test(text)) return "480P";
        return "1080P";
    }

    function audioOf(text) {
        var audio = "DDP 5.1";
        if (/ddp.?51.*truehd.*71|truehd.*71.*ddp.?51/i.test(text)) audio = "DDP 5.1 + TrueHD 7.1";
        else if (/ddp.?51.*ddp.?71|ddp.?71.*ddp.?51/i.test(text)) audio = "DDP 5.1 + DDP 7.1";
        else if (/ddp.?51.*aac.?71|aac.?71.*ddp.?51/i.test(text)) audio = "DDP 5.1 + AAC 7.1";
        else if (/ddp.?51/i.test(text)) audio = "DDP 5.1";
        else if (/truehd/i.test(text)) audio = "TrueHD 7.1";
        else if (/aac.*71|71.*aac/i.test(text)) audio = "AAC 7.1";
        else if (/aac/i.test(text)) audio = "AAC 5.1";
        return /\batmos\b/.test(text) ? audio + " Atmos" : audio;
    }

    function languagesOf(text) {
        var out = [];
        if (/\b(?:english|eng)\b/.test(text)) out.push("English");
        if (/\bhindi\b/.test(text)) out.push("Hindi");
        if (/\btamil\b/.test(text)) out.push("Tamil");
        if (/\btelugu\b/.test(text)) out.push("Telugu");
        return out;
    }

    function hdrOf(text) {
        if (/\b(?:hdr10\+|hdr10p)\b/.test(text)) return "HDR10+";
        if (/\bhdr10\b/.test(text)) return "HDR10";
        if (/\bhdr\b/.test(text)) return "HDR";
        if (/\bsdr\b/.test(text)) return "SDR";
        return "";
    }

    function cdnOf(url) {
        var match = url.match(/cdn(\d+)/i);
        if (match) return "CDN" + match[1];
        return url.indexOf(SERVERS[0]) !== -1 ? "TGA-CDN" : "CDN1";
    }

    function toStream(filename, url, sizeLabel) {
        var text;
        var quality;
        var source = "WEB-DL";
        var title;
        try {
            text = (String(filename || "") + " " + decodeURIComponent(url)).toLowerCase();
        } catch (error) {
            text = (String(filename || "") + " " + url).toLowerCase();
        }
        quality = qualityOf(text);
        if (/\bremux\b/.test(text)) source = "Blu-ray";
        else if (/\bblu[-\s]?ray\b/.test(text)) source = "Blu-ray";
        else if (/\b(?:webrip|hdrip)\b/.test(text)) source = "WEB-Rip";
        title = joinParts([PROVIDER, quality, sizeLabel], " \u2022 ");
        return {
            name: title,
            title: title,
            size: joinParts([
                joinParts(languagesOf(text), " \u2022 "),
                joinParts([source, /\bremux\b/.test(text) && "REMUX", /\bimax\b/.test(text) && "IMAX", cdnOf(url)], " \u2022 "),
                joinParts([
                    /\b10bit\b/.test(text) ? "10Bit" : "",
                    /\b(?:dv|dolby\s*vision)\b/.test(text) ? "DV" : "",
                    hdrOf(text),
                    (/\b(?:hevc|x265|265)\b/.test(text) || quality === "2160P") ? "H.265" : "H.264",
                    audioOf(text)
                ], " \u2022 ")
            ], "\n"),
            url: url.replace(/ /g, "%20"),
            quality: quality,
            headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL }
        };
    }

    function fetchMetadata(query) {
        return fetchJson(TMDB_API + "/" + (query.isTv ? "tv" : "movie") + "/" + query.id + "?api_key=" + TMDB_KEY + "&language=en-US").then(function (data) {
            if (!data) return null;
            return {
                title: query.isTv ? data.name : data.title,
                year: (data.release_date || data.first_air_date || "").slice(0, 4)
            };
        });
    }

    function gather(tasks, minimum) {
        return new Promise(function (resolve) {
            var slots = [];
            var pending = tasks.length;
            var finished = false;
            var i;

            function flatten() {
                var out = [];
                var j;
                for (j = 0; j < slots.length; j++) {
                    if (slots[j]) out = out.concat(slots[j]);
                }
                return out;
            }

            function settle(index, list) {
                if (finished) return;
                slots[index] = list;
                pending--;
                if (pending === 0 || flatten().length >= minimum) {
                    finished = true;
                    resolve(flatten());
                }
            }

            function receive(index) {
                tasks[index].then(function (list) { settle(index, list); }, function () { settle(index, null); });
            }

            if (!pending) {
                resolve([]);
                return;
            }
            for (i = 0; i < tasks.length; i++) receive(i);
        });
    }

    function resolveFile(file, headers) {
        return fetchJson(HH_API + "/genLink?type=mix_media&id=" + file.id, { headers: headers }).then(function (data) {
            if (!data || !data.success || !data.url) return [];
            return [toStream(file.file_name, data.url, formatSize(parseInt(file.file_size, 10)))];
        });
    }

    function weightOf(quality) {
        if (quality === "2160P" || quality === "4K") return 4;
        if (quality === "1080P") return 3;
        if (quality === "720P") return 2;
        return 1;
    }

    function select(streams, query) {
        var kept = [];
        var seen = {};
        var i;
        for (i = 0; i < streams.length; i++) {
            if (streams[i].quality === "2160P" && !query.allow2160) continue;
            if (streams[i].quality === "1080P" && !query.allow1080) continue;
            if (streams[i].quality === "720P" && !query.allow720) continue;
            kept.push({ stream: streams[i], index: kept.length });
        }
        kept.sort(function (a, b) {
            return (weightOf(b.stream.quality) - weightOf(a.stream.quality)) || (a.index - b.index);
        });
        return kept.map(function (entry) { return entry.stream; }).filter(function (stream) {
            if (!stream.url || seen[stream.url] === true) return false;
            seen[stream.url] = true;
            return true;
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return fetchMetadata(query)
        .then(function (metadata) {
            if (!metadata || !metadata.title) return [];
            var text = trim(metadata.title + " " + metadata.year);
            var headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1",
                "Accept": "*/*",
                "Authorization": "Bearer " + query.token,
                "Origin": "https://bollywood.eu.org",
                "Referer": BASE_URL
            };
            if (query.isTv) text += " S" + pad(query.season) + "E" + pad(query.episode);
            return fetchJson(HH_API + "/mix_media_files/search?q=" + encodeURIComponent(text) + "&page=1", { headers: headers }).then(function (found) {
                var files;
                if (!found || !found.files || found.files.length === 0) return [];
                files = found.files.filter(function (file) {
                    return /\.(mkv|mp4)$/i.test(trim(file.file_name));
                }).slice(0, 6);
                return gather(files.map(function (file) { return resolveFile(file, headers); }), 6).then(function (streams) {
                    return select(streams, query);
                });
            });
        })
        .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };