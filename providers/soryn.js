function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "NetMirror";
    var BASE_URL = "https://net79.cc";
    var USER_AGENT = "Mozilla/5.0 (Linux; Android 16; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36";
    var REFERER = "https://videodownloader.site/";
    var LANGS = {
        arabic: "Arabic", bangla: "Bengali", bengali: "Bengali", chinese: "Chinese",
        english: "English", french: "French", german: "German", gujarati: "Gujarati",
        hindi: "Hindi", indonesian: "Indonesian", italian: "Italian", japanese: "Japanese",
        kannada: "Kannada", korean: "Korean", malayalam: "Malayalam", marathi: "Marathi",
        portuguese: "Portuguese", punjabi: "Punjabi", russian: "Russian", spanish: "Spanish",
        tamil: "Tamil", telugu: "Telugu", thai: "Thai", turkish: "Turkish",
        urdu: "Urdu", vietnamese: "Vietnamese"
    };
    var HEADERS = {
        "User-Agent": USER_AGENT,
        "Referer": BASE_URL + "/",
        "Accept": "application/json, text/plain, */*"
    };
    var S_HEADERS = {
        "User-Agent": USER_AGENT,
        "Referer": REFERER
    };

    function list(value) {
        return Array.isArray(value) ? value : [];
    }

    function isObject(value) {
        return value && typeof value === "object";
    }

    function buildQuery(id, type, seasonValue, episodeValue) {
        var contentId = String(id);
        var isTvShow = type === "tv";
        if (!/^\d+$/.test(contentId) || (isTvShow && (seasonValue == null || episodeValue == null))) return null;
        var kind = isTvShow ? "tv" : "movie";
        var query = isTvShow ? "se=" + seasonValue + "&ep=" + episodeValue : "";
        return {
            embedUrl: BASE_URL + "/api/embed-tmdb/" + contentId + "?type=" + kind + (query && "&" + query),
            variantsUrl: BASE_URL + "/api/variants-tmdb/" + kind + "/" + contentId + (query && "?" + query)
        };
    }

    function fetchJson(url) {
        return Promise.resolve().then(function () {
            return fetch(url, { method: "GET", headers: HEADERS });
        }).then(function (response) {
            return response && response.ok ? response.text() : "";
        }).then(function (text) {
            var body = (text || "").trim();
            return body && body.charAt(0) !== "<" ? JSON.parse(body) : null;
        }).then(null, function () {
            return null;
        });
    }

    function getTier(height) {
        var pixels = Number(height) || 0;
        if (pixels >= 2160) return 2160;
        if (pixels >= 1080 && pixels < 1440) return 1080;
        if (pixels >= 720 && pixels < 1080) return 720;
        return 0;
    }

    function buildSortPrefix(tier) {
        var bits = [2160, 1080, 720].indexOf(tier).toString(2);
        while (bits.length < 20) bits = "0" + bits;
        return bits.replace(/./g, function (bit) {
            return bit === "1" ? "\uFEFF" : "\u200B";
        });
    }

    function formatFileSize(bytes) {
        var value = Number(bytes);
        if (!isFinite(value) || value <= 0) return "";
        var gigabytes = value / 1073741824;
        return gigabytes >= 1
            ? gigabytes.toFixed(2).replace(/\.?0+$/, "") + " GB"
            : Math.round(value / 1048576) + " MB";
    }

    function selectDubVariants(payload) {
        var preferred = ["Hindi", "Bengali", "Tamil", "Telugu", "Malayalam", "Kannada", "Urdu", "Punjabi", "Gujarati", "Marathi"];

        function rank(language) {
            var index = preferred.indexOf(language);
            return index < 0 ? preferred.length : index;
        }

        function findLanguage(variant) {
            var match = String(variant.language || "").trim().match(/^(.*)\s+dub$/i);
            var tokens = (match ? match[1] : "").split(/[\s+,&\/|.:;_()\[\]{}-]+/);
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i].toLowerCase();
                if (LANGS.hasOwnProperty(token) && LANGS[token]) return LANGS[token];
            }
            return undefined;
        }

        var sorted = list(payload && payload.variants).filter(function (variant) {
            return isObject(variant) && variant.isOriginal !== true;
        }).map(function (variant, index) {
            return {
                subjectId: String(variant.dubSubjectId || ""),
                detailPath: String(variant.detailPath || ""),
                language: findLanguage(variant),
                index: index
            };
        }).filter(function (variant) {
            return variant.subjectId && variant.detailPath && variant.language;
        }).sort(function (left, right) {
            return rank(left.language) - rank(right.language) || left.index - right.index;
        });

        return sorted.filter(function (variant, index, all) {
            for (var i = 0; i < all.length; i++) {
                if (all[i].subjectId === variant.subjectId) return i === index;
            }
            return false;
        }).slice(0, 4);
    }

    function extractStreams(payload, language) {
        if (!payload || payload.ok !== true) return [];

        var entries = list(payload.streams).filter(isObject).map(function (entry) {
            return { url: entry.url, height: entry.resolution, size: entry.size };
        });
        if (!entries.length) entries.push({ url: payload.mp4, height: payload.resolution, size: 0 });

        return entries.map(function (entry) {
            return {
                url: String(entry.url || ""),
                tier: getTier(entry.height),
                language: language || "Original",
                size: formatFileSize(entry.size)
            };
        }).filter(function (stream) {
            return stream.url.indexOf("http") === 0 && stream.tier;
        });
    }

    function extractSubtitles(payload) {
        return list(payload && payload.captions).filter(function (caption) {
            return isObject(caption) && caption.url;
        }).map(function (caption) {
            var path = String(caption.url);
            var language = String(caption.lang || caption.name || "Unknown");
            return {
                url: path.indexOf("http") === 0 ? path : BASE_URL + (path.charAt(0) === "/" ? path : "/" + path),
                language: language,
                name: String(caption.name || language)
            };
        }).slice(0, 40);
    }

    function mergeStreamGroups(groups) {
        var streamsByUrl = {};
        var merged = [];
        [].concat.apply([], groups).forEach(function (stream) {
            var key = "$" + stream.url.split("?")[0];
            var existing = streamsByUrl[key];
            if (existing === undefined) {
                streamsByUrl[key] = merged.length;
                merged.push(stream);
            } else if (merged[existing].language === "Original" && stream.language !== "Original") {
                merged[existing] = stream;
            }
        });
        return merged;
    }

    function returnStream(stream, subtitles) {
        var mainTitle = buildSortPrefix(stream.tier) + PROVIDER + " \u2022 " + stream.language;
        var qualityUp = stream.tier + "p";
        var streamTitle = stream.size || stream.language;
        var result = {
            name: mainTitle,
            title: mainTitle,
            url: stream.url,
            quality: qualityUp + " \u2022 " + streamTitle,
            type: stream.url.indexOf(".m3u8") !== -1 ? "hls" : "mp4",
            headers: { "User-Agent": S_HEADERS["User-Agent"], "Referer": S_HEADERS.Referer }
        };
        if (subtitles.length) result.subtitles = subtitles;
        return result;
    }

    function pickEmbed(attempts, index) {
        return attempts[index].then(function (pair) {
            return pair[0] || index === attempts.length - 1 ? pair : pickEmbed(attempts, index + 1);
        });
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);
    var embedUrl = query.embedUrl;
    var attempts = [0, 1, 2, 3].map(function () {
        return Promise.all([fetchJson(embedUrl), fetchJson(query.variantsUrl)]);
    });
    return pickEmbed(attempts, 0).then(function (pair) {
        var embed = pair[0];
        var variants = pair[1];
        return Promise.all(selectDubVariants(variants).map(function (variant) {
            var dubUrl = embedUrl + "&dub=" + encodeURIComponent(variant.subjectId) + "&dubdp=" + encodeURIComponent(variant.detailPath);
            return fetchJson(dubUrl).then(function (payload) {
                return extractStreams(payload, variant.language);
            });
        })).then(function (dubGroups) {
            var subtitles = extractSubtitles(embed);
            return mergeStreamGroups([extractStreams(embed, "")].concat(dubGroups)).map(function (stream) {
                return returnStream(stream, subtitles);
            });
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };