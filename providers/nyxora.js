function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "VidFast";
    var BASE_URL = "https://vidfast.vc";
    var ENC_API = "https://enc-dec.app/api/enc-vidfast";
    var DEC_API = "https://enc-dec.app/api/dec-vidfast";
    var ALW_RES = Object.create(null);
    ALW_RES["4K"] = true;
    ALW_RES["2160p"] = true;
    ALW_RES["1440p"] = true;
    ALW_RES["1080p"] = true;
    ALW_RES["Adaptive"] = true;
    ALW_RES["Auto"] = true;
    var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
    var DEFAULT_HEADERS = {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Origin": BASE_URL,
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest"
    };

    function request(url, options) {
        return Promise.resolve().then(function () {
            return fetch(url, options);
        }).then(null, function () {
            return null;
        });
    }

    function settle(task) {
        return Promise.resolve().then(task).then(null, function () {
            return null;
        });
    }

    function extend(target, source) {
        var keys = Object.keys(source || {});
        for (var i = 0; i < keys.length; i++) target[keys[i]] = source[keys[i]];
        return target;
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) out = out.concat(lists[i] || []);
        return out;
    }

    function present(list) {
        return list.filter(function (item) {
            return item != null;
        });
    }

    function sortStable(list, compare) {
        var slots = list.map(function (item, index) {
            return { item: item, index: index };
        });
        slots.sort(function (a, b) {
            return compare(a.item, b.item) || a.index - b.index;
        });
        return slots.map(function (slot) {
            return slot.item;
        });
    }

    function buildQuery(tmdbId, mediaType, season, episode) {
        if (!/^\d+$/.test(String(tmdbId))) return null;
        var type = mediaType === "tv" || mediaType === "series" ? "tv" : "movie";
        return { tmdbId: tmdbId, type: type, season: season, episode: episode };
    }

    function heightToQuality(height) {
        if (height >= 2160) return "2160p";
        if (height >= 1440) return "1440p";
        if (height >= 1080) return "1080p";
        if (height >= 720) return "720p";
        if (height >= 480) return "480p";
        if (height >= 360) return "360p";
        return height + "p";
    }

    function parseQualityLabel(str) {
        if (/2160|4k/i.test(str)) return "2160p";
        if (/1440/i.test(str)) return "1440p";
        if (/1080/i.test(str)) return "1080p";
        if (/720/i.test(str)) return "720p";
        if (/480/i.test(str)) return "480p";
        if (/360/i.test(str)) return "360p";
        if (/auto|adaptive/i.test(str)) return "Auto";
        return null;
    }

    function extractStreamQuality(data) {
        if (data.quality) {
            var fromQuality = parseQualityLabel(data.quality);
            if (fromQuality) return fromQuality;
        }
        if (data.label) {
            var fromLabel = parseQualityLabel(data.label);
            if (fromLabel) return fromLabel;
        }
        var match = String(data.url).match(/(\d{3,4})[pP]/);
        if (match) return match[1] + "p";
        return "Auto";
    }

    function resWeight(quality) {
        var q = (quality || "").toLowerCase();
        if (q === "2160p" || q === "4k") return 5;
        if (q === "1440p") return 4;
        if (q === "1080p") return 3;
        if (q === "720p") return 2;
        if (q === "480p" || q === "360p") return 1;
        return 0;
    }

    function getInvertedSortTag(score, maxScore) {
        var inverted = Math.max(0, maxScore - Math.max(0, parseInt(score, 10) || 0));
        var binary = inverted.toString(2);
        while (binary.length < 20) binary = "0" + binary;
        return binary.split("").map(function (bit) {
            return bit === "1" ? "\uFEFF" : "\u200B";
        }).join("");
    }

    function baseHeaders() {
        return {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            "Referer": BASE_URL + "/"
        };
    }

    function apiHeaders(extra) {
        return extend(extend(baseHeaders(), { "X-Requested-With": "XMLHttpRequest" }), extra);
    }

    function fetchText(url, opts) {
        return request(url, opts).then(function (res) {
            if (!res || !res.ok) return "";
            return res.text();
        }).then(null, function () {
            return "";
        });
    }

    function fetchJson(url, opts) {
        return fetchText(url, opts).then(function (body) {
            if (!body) return null;
            try {
                return JSON.parse(body);
            } catch (error) {
                return null;
            }
        });
    }

    function parseVariants(text, playlistUrl) {
        if (text.indexOf("#EXT-X-STREAM-INF") < 0) return null;

        var tracks = [];
        var lines = text.split("\n");

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf("#EXT-X-STREAM-INF") !== 0) continue;

            var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            var bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            var urlLine = i + 1 < lines.length ? lines[i + 1].trim() : "";

            if (!urlLine || urlLine.charAt(0) === "#") continue;

            tracks.push({
                url: urlLine.indexOf("http") === 0
                    ? urlLine
                    : playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1) + urlLine,
                quality: resMatch ? heightToQuality(parseInt(resMatch[2], 10)) : null,
                bandwidth: bwMatch ? parseInt(bwMatch[1], 10) : 0
            });
        }

        if (tracks.length === 0) return null;

        tracks = sortStable(tracks, function (a, b) {
            return b.bandwidth - a.bandwidth;
        });

        for (var j = 0; j < tracks.length; j++) {
            if (tracks[j].quality) continue;
            var m = tracks[j].url.match(/(\d{3,4})[pP]/);
            tracks[j].quality = m ? m[1] + "p" : heightToQuality(j === 0 ? 2160 : j === 1 ? 1080 : 720);
        }

        return tracks;
    }

    function fetchPlaylistVariants(playlistUrl) {
        return request(playlistUrl, { headers: baseHeaders() }).then(function (res) {
            if (!res || !res.ok) return null;
            return res.text().then(function (text) {
                return parseVariants(text, playlistUrl);
            });
        }).then(null, function () {
            return null;
        });
    }

    function decrypt(payload) {
        return fetchJson(DEC_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": DEFAULT_HEADERS["User-Agent"] },
            body: JSON.stringify({ text: payload })
        });
    }

    function resolvePageUrl(query) {
        return query.type === "tv"
            ? BASE_URL + "/tv/" + query.tmdbId + "/" + (query.season || 1) + "/" + (query.episode || 1) + "/"
            : BASE_URL + "/movie/" + query.tmdbId + "/";
    }

    function extractEncryptedPayload(pageText) {
        var m = String(pageText || "").match(/\\"(?:en|token)\\":\\"(.*?)\\"/);
        return m ? m[1] : null;
    }

    function openSession(query) {
        return fetchText(resolvePageUrl(query), { headers: baseHeaders() }).then(function (page) {
            var payload = extractEncryptedPayload(page);
            if (!payload) return null;
            return fetchJson(ENC_API + "?text=" + encodeURIComponent(payload) + "&stage=1");
        }).then(function (first) {
            var part = first && first.result;
            if (!part || !part.stage1) return null;
            return fetchText(part.stage1, { method: "POST", headers: apiHeaders({ "X-CSRF-Token": part.token }) }).then(function (stage1Text) {
                return fetchJson(ENC_API + "?text=" + encodeURIComponent(stage1Text) + "&stage=2");
            });
        }).then(function (second) {
            var stage = second && second.result;
            if (!stage || !stage.servers || !stage.stream) return null;
            return { stage: stage, headers: apiHeaders({ "X-CSRF-Token": stage.token || "" }) };
        });
    }

    function listServers(session) {
        return fetchText(session.stage.servers, { method: "POST", headers: session.headers }).then(decrypt).then(function (decrypted) {
            var list = decrypted && decrypted.result;
            return Array.isArray(list) ? list : [];
        });
    }

    function toRawStream(name, data) {
        var subtitles = (data.tracks || []).filter(function (t) {
            return t && t.file;
        }).map(function (t) {
            return {
                url: t.file,
                language: t.language || t.label || "en",
                name: t.label || "Subtitle"
            };
        });

        return {
            name: name,
            url: data.url,
            quality: extractStreamQuality(data),
            isM3U8: String(data.url).indexOf(".m3u8") >= 0,
            subtitles: subtitles
        };
    }

    function resolveServer(session, server, index) {
        return settle(function () {
            var name = server.name || ("Server " + (index + 1));
            return fetchText(session.stage.stream + "/" + server.data, { method: "POST", headers: session.headers }).then(function (enc) {
                if (!enc) return null;
                return decrypt(enc);
            }).then(function (streamData) {
                var data = streamData && streamData.result;
                if (!data || !data.url) return null;
                return toRawStream(name, data);
            });
        });
    }

    function expandStream(stream) {
        if (!stream.isM3U8) return Promise.resolve([stream]);
        return fetchPlaylistVariants(stream.url).then(function (tracks) {
            if (!tracks || tracks.length === 0) return [stream];
            return tracks.map(function (t) {
                return {
                    name: stream.name,
                    url: t.url,
                    quality: t.quality,
                    isM3U8: false,
                    subtitles: stream.subtitles
                };
            });
        });
    }

    function allowed(streams) {
        var seen = Object.create(null);
        return streams.filter(function (s) {
            if (seen[s.url]) return false;
            seen[s.url] = true;
            return ALW_RES[s.quality] === true;
        });
    }

    function fetchRawStreams(query) {
        return openSession(query).then(function (session) {
            if (!session) return [];
            return listServers(session).then(function (servers) {
                return Promise.all(servers.map(function (server, index) {
                    return resolveServer(session, server, index);
                }));
            }).then(function (resolved) {
                return Promise.all(present(resolved).map(function (stream) {
                    return settle(function () {
                        return expandStream(stream);
                    });
                }));
            }).then(function (expanded) {
                return allowed(flatten(expanded));
            });
        });
    }

    function sortAndTag(streams) {
        var sorted = sortStable(streams, function (a, b) {
            return resWeight(b.quality) - resWeight(a.quality);
        });
        var total = sorted.length;
        return sorted.map(function (s, i) {
            var tag = getInvertedSortTag(total - i, total + 1);
            return {
                name: tag + s.name,
                title: tag + s.title,
                url: s.url,
                quality: s.quality,
                headers: s.headers,
                subtitles: s.subtitles
            };
        });
    }

    function normalizeStreams(streams) {
        return sortAndTag(streams.map(function (stream) {
            var label = PROVIDER + " \u2022 " + stream.name;
            return {
                name: label,
                title: label,
                url: stream.url,
                quality: stream.quality,
                headers: baseHeaders(),
                subtitles: stream.subtitles || []
            };
        }));
    }

    var query = buildQuery(tmdbId, mediaType, season, episode);
    if (!query) return Promise.resolve([]);

    return fetchRawStreams(query).then(function (streams) {
        return streams.length ? normalizeStreams(streams) : [];
    }).then(null, function () {
        return [];
    });
}

module.exports = { getStreams: getStreams };