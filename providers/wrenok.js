function getStreams(tmdbId, mediaType, season, episode) {
    var API_BASE = 'https://api.purstream.sh/api/v1';
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
        'Referer': 'https://purstream.sh/'
    };
    var QUALITY_RANK = { '4K': 4, '1080p': 3, '720p': 2 };

    function buildQuery(id, type, seasonNumber, episodeNumber) {
        var isTv = type === 'tv';
        if (isTv && (seasonNumber == null || episodeNumber == null)) return null;
        return { id: id, isTv: isTv, season: seasonNumber, episode: episodeNumber };
    }

    function getSortTag(rank) {
        var bin = Math.max(0, 4 - rank).toString(2);
        var out = '';
        var i;
        while (bin.length < 20) bin = '0' + bin;
        for (i = 0; i < bin.length; i++) out += bin.charAt(i) === '1' ? '﻿' : '​';
        return out;
    }

    function parseQuality(n) {
        var up = (n || '').toUpperCase();
        if (up.indexOf('4K') !== -1) return '4K';
        if (up.indexOf('1080') !== -1) return '1080p';
        if (up.indexOf('720') !== -1) return '720p';
        return '1080p';
    }

    function fetchJson(url, headers) {
        return Promise.resolve().then(function () {
            return headers ? fetch(url, { headers: headers }) : fetch(url);
        }).then(function (res) {
            return res.json();
        }).then(null, function () {
            return null;
        });
    }

    function getEnglishTitle(id, isTv) {
        var url = TMDB_API + '/' + (isTv ? 'tv' : 'movie') + '/' + id + '?api_key=' + TMDB_KEY + '&language=en-US';
        return fetchJson(url, null).then(function (data) {
            return data ? data.title || data.name || '' : '';
        });
    }

    function findIdByTitle(title, preferType) {
        return fetchJson(API_BASE + '/search-bar/search/' + encodeURIComponent(title), HEADERS).then(function (data) {
            var movies = data && data.data && data.data.items && data.data.items.movies;
            var items = (movies && movies.items) || [];
            var i;
            if (!items.length) return null;
            for (i = 0; i < items.length; i++) {
                if (items[i].type === preferType) return items[i];
            }
            return items[0];
        });
    }

    function fetchMovieSources(id) {
        return fetchJson(API_BASE + '/media/' + id + '/sheet', HEADERS).then(function (data) {
            if (!data || !data.data || !data.data.items) return null;
            return data.data.items.urls || [];
        });
    }

    function fetchEpisodeSources(id, seasonNumber, episodeNumber) {
        var url = API_BASE + '/stream/' + id + '/episode?season=' + seasonNumber + '&episode=' + episodeNumber;
        return fetchJson(url, HEADERS).then(function (data) {
            if (!data || !data.data || !data.data.items) return null;
            return data.data.items.sources || [];
        });
    }

    function toStream(url, rawQuality) {
        var quality = parseQuality(rawQuality);
        var label = getSortTag(QUALITY_RANK[quality] || 1) + 'Purstream • French • English';
        return { name: label, title: label, url: url, quality: quality, headers: HEADERS };
    }

    function normalizeMovieSources(urls) {
        return urls.filter(function (u) {
            return u.url && (u.url.match(/\.m3u8/i) || u.url.match(/\.mp4/i));
        }).map(function (u) {
            return toStream(u.url, u.name);
        });
    }

    function normalizeEpisodeSources(sources) {
        return sources.map(function (s) {
            return toStream(s.stream_url, s.source_name);
        });
    }

    function unique(streams) {
        var seen = Object.create(null);
        var out = [];
        var i;
        for (i = 0; i < streams.length; i++) {
            if (!streams[i].url || seen[streams[i].url] === true) continue;
            seen[streams[i].url] = true;
            out.push(streams[i]);
        }
        return out;
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return getEnglishTitle(query.id, query.isTv).then(function (title) {
        if (!title) return null;
        return findIdByTitle(title, query.isTv ? 'tv' : 'movie');
    }).then(function (match) {
        if (!match) return null;
        return query.isTv ? fetchEpisodeSources(match.id, query.season, query.episode) : fetchMovieSources(match.id);
    }).then(function (sources) {
        if (!sources) return [];
        return unique(query.isTv ? normalizeEpisodeSources(sources) : normalizeMovieSources(sources));
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };