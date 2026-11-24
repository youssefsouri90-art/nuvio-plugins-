function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "Wikimedia";
    var CMNS_API_BASE = "https://commons.wikimedia.org/w/api.php";
    var WKPD_API_BASE = "https://en.wikipedia.org/w/api.php";
    var settings = typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
    var MIN_DUR_SECS = parseInt(settings.minSeconds, 10) || 360;
    var CMNS_REFERER = "https://commons.wikimedia.org/";
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36";
    var REQUEST_HEADERS = { "User-Agent": USER_AGENT, "Accept": "application/json" };
    var IMAGE_INFO_PROPS = "url|size|metadata";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";

    function buildQuery() {
        if (mediaType === "tv") return null;
        if (!/^\d+$/.test(String(tmdbId))) return null;
        return TMDB_API + "/movie/" + tmdbId + "?api_key=" + TMDB_KEY;
    }

    function fetchJson(url) {
        return Promise.resolve()
            .then(function () { return fetch(url, { headers: REQUEST_HEADERS }); })
            .then(function (response) { return response && response.ok ? response.json() : null; })
            .then(null, function () { return null; });
    }

    function fetchTmdbMovieMetadata(url) {
        return fetchJson(url).then(function (movieData) {
            if (!movieData || !movieData.title) return null;
            return {
                title: movieData.title,
                year: (movieData.release_date || "").slice(0, 4),
                originalTitle: movieData.original_title || movieData.title
            };
        });
    }

    function extractVideoFileTitles(pages) {
        var seen = Object.create(null);
        var videoFiles = [];
        var i;
        var j;
        for (i = 0; i < pages.length; i++) {
            var page = pages[i];
            if (page.missing) continue;
            var images = page.images || [];
            for (j = 0; j < images.length; j++) {
                var title = images[j].title;
                if (/\.(webm|mp4|ogv|ogg)(\?|$)/i.test(title) && !seen[title]) {
                    seen[title] = true;
                    videoFiles.push(title);
                }
            }
        }
        return videoFiles;
    }

    function queryWikipediaVideoFiles(titles) {
        var url = WKPD_API_BASE + "?action=query&format=json&formatversion=2" +
            "&titles=" + encodeURIComponent(titles.join("|")) +
            "&prop=images&imlimit=50";
        return fetchJson(url).then(function (wikipediaData) {
            return extractVideoFileTitles((wikipediaData && wikipediaData.query && wikipediaData.query.pages) || []);
        });
    }

    function candidateTitles(title, year, originalTitle) {
        var candidates = [];
        if (year) {
            candidates.push(title + " (" + year + " film)");
            if (originalTitle !== title) candidates.push(originalTitle + " (" + year + " film)");
        }
        candidates.push(title + " (film)");
        candidates.push(title);
        if (originalTitle !== title) candidates.push(originalTitle + " (film)");
        return candidates;
    }

    function searchVideoFiles(title, year) {
        var terms = [title, year, "film"].filter(function (t) { return t; }).join(" ");
        var url = WKPD_API_BASE + "?action=query&format=json&formatversion=2" +
            "&list=search&srsearch=" + encodeURIComponent(terms) +
            "&srlimit=5&srnamespace=0";
        return fetchJson(url).then(function (searchResponse) {
            var results = (searchResponse && searchResponse.query && searchResponse.query.search) || [];
            if (!results.length) return [];
            return queryWikipediaVideoFiles(results.slice(0, 3).map(function (result) { return result.title; }));
        });
    }

    function discoverFilmVideoFiles(title, year, originalTitle) {
        return Promise.all([
            queryWikipediaVideoFiles(candidateTitles(title, year, originalTitle)),
            searchVideoFiles(title, year)
        ]).then(function (lists) {
            return lists[0].length ? lists[0] : lists[1];
        });
    }

    function batchFetchCommonsImageInfo(fileTitles) {
        if (!fileTitles.length) return Promise.resolve([]);
        var batches = [];
        var i;
        for (i = 0; i < fileTitles.length; i += 20) batches.push(fileTitles.slice(i, i + 20));
        return Promise.all(batches.map(function (batch) {
            var url = CMNS_API_BASE + "?action=query&format=json&formatversion=2" +
                "&prop=imageinfo&iiprop=" + IMAGE_INFO_PROPS +
                "&titles=" + encodeURIComponent(batch.join("|"));
            return fetchJson(url).then(function (responseData) {
                return (responseData && responseData.query && responseData.query.pages) || [];
            });
        })).then(function (results) {
            var pages = [];
            var j;
            for (j = 0; j < results.length; j++) pages = pages.concat(results[j]);
            return pages.filter(function (page) {
                return !page.missing && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
            });
        });
    }

    function getMetadataValue(imageInfo, name) {
        var entries = (imageInfo && imageInfo.metadata) || [];
        var i;
        for (i = 0; i < entries.length; i++) {
            if (entries[i].name === name) return entries[i].value;
        }
        return null;
    }

    function getPlaytimeSeconds(imageInfo) {
        var seconds = parseFloat(getMetadataValue(imageInfo, "playtime_seconds"));
        return isNaN(seconds) ? 0 : seconds;
    }

    function getVideoWidth(imageInfo) {
        var width = parseInt(getMetadataValue(imageInfo, "width"), 10);
        return isNaN(width) ? 0 : width;
    }

    function qualityOf(width) {
        if (width >= 3840) return "2160p";
        if (width >= 1920) return "1080p";
        if (width >= 1280) return "720p";
        if (width >= 640) return "480p";
        if (width > 0) return "SD";
        return "Auto";
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return null;
        if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
        if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + " MB";
        return Math.round(bytes / 1e3) + " KB";
    }

    function getContainerFormat(url) {
        if (/\.mp4(\?|$)/i.test(url)) return "MP4";
        if (/\.webm(\?|$)/i.test(url)) return "WebM";
        return "OGV";
    }

    function toStream(page) {
        var imageInfo = page.imageinfo[0];
        if (!imageInfo.url || getPlaytimeSeconds(imageInfo) < MIN_DUR_SECS) return null;
        var label = PROVIDER + " \u2022 " + getContainerFormat(imageInfo.url);
        return {
            name: label,
            title: label,
            quality: qualityOf(getVideoWidth(imageInfo)),
            url: imageInfo.url,
            size: formatFileSize(imageInfo.size) || undefined,
            headers: { "User-Agent": USER_AGENT, "Referer": CMNS_REFERER }
        };
    }

    function gather(pages) {
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < pages.length; i++) {
            var stream = toStream(pages[i]);
            if (!stream || !stream.url || seen[stream.url]) continue;
            seen[stream.url] = true;
            out.push(stream);
        }
        return out;
    }

    var tmdbUrl = buildQuery();
    if (!tmdbUrl) return Promise.resolve([]);

    return fetchTmdbMovieMetadata(tmdbUrl)
        .then(function (movie) {
            if (!movie) return [];
            return discoverFilmVideoFiles(movie.title, movie.year, movie.originalTitle).then(function (fileTitles) {
                if (!fileTitles.length) return [];
                return batchFetchCommonsImageInfo(fileTitles).then(gather);
            });
        })
        .then(null, function () { return []; });
}

function onSettings() {
    return Promise.resolve([
        {
            type: "select",
            key: "minSeconds",
            label: "Minimum video duration",
            defaultValue: "360",
            options: [
                { value: "0", label: "No minimum" },
                { value: "60", label: "1 minute" },
                { value: "300", label: "5 minutes" },
                { value: "360", label: "6 minutes (default)" },
                { value: "900", label: "15 minutes" },
                { value: "1800", label: "30 minutes" },
                { value: "2700", label: "45 minutes" },
                { value: "3600", label: "60 minutes" }
            ],
            description: "Skip videos shorter than this. Raise to filter out short films and clips."
        }
    ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };