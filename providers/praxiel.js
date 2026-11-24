function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = "Re:ANIME";
    var BASE_URL = "https://reanime.to";
    var API_BASE = "https://flixcloud.cc";
    var ENC_DEC_API = "https://enc-dec.app/api";
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var USER_AGENT = "Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36";

    function unique(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (out.indexOf(list[i]) === -1) out.push(list[i]);
        }
        return out;
    }

    function flatten(lists) {
        var out = [];
        for (var i = 0; i < lists.length; i++) {
            for (var j = 0; j < lists[i].length; j++) out.push(lists[i][j]);
        }
        return out;
    }

    function buildQuery() {
        var isTv = mediaType === "tv";
        if (isTv && (season == null || episode == null)) return null;
        return {
            hlsEnabled: typeof SCRAPER_SETTINGS !== "undefined" && !!SCRAPER_SETTINGS && SCRAPER_SETTINGS.hlsEnabled === true,
            season: isTv ? season : 1,
            episode: isTv ? episode : 1
        };
    }

    function createSortTag(rank) {
        var value = Math.max(0, 23 - rank);
        var tag = "";
        for (var bit = 19; bit >= 0; bit--) {
            tag += (value >> bit) & 1 ? "\uFEFF" : "\u200B";
        }
        return tag;
    }

    function parseJsObjectLiteral(source) {
        var json = "";
        var cursor = 0;

        while (cursor < source.length) {
            var ch = source.charAt(cursor);

            if (ch === '"' || ch === "'") {
                var end = cursor + 1;
                var body = "";
                while (end < source.length && source.charAt(end) !== ch) {
                    if (source.charAt(end) === "\\") {
                        body += source.charAt(end) + source.charAt(end + 1);
                        end += 2;
                    } else {
                        body += source.charAt(end);
                        end += 1;
                    }
                }
                json += ch === '"' ? '"' + body + '"' : JSON.stringify(body.replace(/\\'/g, "'"));
                cursor = end + 1;
            } else if (/[A-Za-z_$]/.test(ch)) {
                var wordEnd = cursor;
                while (wordEnd < source.length && /[\w$]/.test(source.charAt(wordEnd))) wordEnd += 1;
                var word = source.slice(cursor, wordEnd);

                var lookahead = wordEnd;
                while (lookahead < source.length && /\s/.test(source.charAt(lookahead))) lookahead += 1;

                if (source.charAt(lookahead) === ":") {
                    json += JSON.stringify(word);
                } else if (word === "void") {
                    if (source.charAt(lookahead) === "0") lookahead += 1;
                    json += "null";
                    wordEnd = lookahead;
                } else if (word === "true" || word === "false" || word === "null") {
                    json += word;
                } else {
                    json += "null";
                }
                cursor = wordEnd;
            } else if (ch === "!" && (source.charAt(cursor + 1) === "0" || source.charAt(cursor + 1) === "1")) {
                json += source.charAt(cursor + 1) === "0" ? "true" : "false";
                cursor += 2;
            } else {
                json += ch;
                cursor += 1;
            }
        }

        return JSON.parse(json.replace(/,(\s*[}\]])/g, "$1"));
    }

    function request(url, init, format) {
        return fetch(url, init).then(function (response) {
            if (!response || !response.ok) return null;
            return format === "json" ? response.json() : response.text();
        }).then(null, function () {
            return null;
        });
    }

    function callEncDec(path, body) {
        return request(ENC_DEC_API + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
            body: JSON.stringify(body)
        }, "json").then(function (payload) {
            return payload && payload.status === 200 && payload.result ? payload.result : null;
        });
    }

    function copyWithout(source, skipped) {
        var copy = {};
        for (var key in source) {
            if (Object.prototype.hasOwnProperty.call(source, key) && key !== skipped) copy[key] = source[key];
        }
        return copy;
    }

    function resolveEmbed(embedUrl) {
        return request(embedUrl, { headers: { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" } }, "text").then(function (page) {
            var found = page ? /type:\s*"data",\s*data:\s*(\{[\s\S]*?\})\s*,\s*uses:/.exec(page) : null;
            var rawData = found ? found[1] : null;
            if (!rawData) return null;

            var parsed = parseJsObjectLiteral(rawData);
            var subtitles = parsed.subtitles;
            var payload = copyWithout(parsed, "subtitles");

            return callEncDec("/dec-flixcloud?type=token", { data: payload }).then(function (tokenResult) {
                if (!tokenResult || !tokenResult.token) return null;
                return request(
                    API_BASE + "/api/m3u8/" + tokenResult.token,
                    { headers: { "User-Agent": USER_AGENT, Referer: BASE_URL + "/" } },
                    "json"
                ).then(function (streamResponse) {
                    if (!streamResponse) return null;
                    return callEncDec("/dec-flixcloud?type=stream", {
                        data: { context: tokenResult.context, stream_response: streamResponse }
                    });
                }).then(function (streamResult) {
                    if (!streamResult || !streamResult.stream || !streamResult.context) return null;
                    var manifestUrl =
                        ENC_DEC_API + "/parse-flixcloud?url=" + encodeURIComponent(streamResult.stream) +
                        "&w_payload=" + encodeURIComponent(streamResult.context.w_payload);
                    return request(manifestUrl, { headers: { "User-Agent": USER_AGENT, Referer: API_BASE + "/" } }, "text").then(function (manifest) {
                        if (!manifest || manifest.indexOf("#EXTM3U") === -1) return null;
                        return { manifestUrl: manifestUrl, manifest: manifest, subtitles: Array.isArray(subtitles) ? subtitles : [] };
                    });
                });
            });
        }).then(null, function () {
            return null;
        });
    }

    function resolveDownloadLink(embedUrl) {
        var idMatch = /\/e\/([a-z0-9]+)/i.exec(embedUrl);
        if (!idMatch) return Promise.resolve(null);

        var headers = { Accept: "*/*", Referer: API_BASE + "/", "User-Agent": USER_AGENT };
        return request(API_BASE + "/d/" + idMatch[1] + "/__data.json", { headers: headers }, "text").then(function (payload) {
            if (!payload) return null;

            var fileMatch = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(payload);
            var tokenMatch = /eyJ[\w-]+\.[\w-]+\.[\w-]+/.exec(payload);
            if (!fileMatch || !tokenMatch) return null;

            var hostMatch = /https:\/\/fetch\d*\.flixcloud\.cc/.exec(payload);
            var fetchHost = hostMatch ? hostMatch[0] : API_BASE;
            return request(
                fetchHost + "/download/" + fileMatch[0] + "/progress?token=" + tokenMatch[0],
                { headers: headers },
                "text"
            ).then(function (progress) {
                if (progress && progress.indexOf('"status":"failed"') !== -1) return null;
                return { url: fetchHost + "/download/" + fileMatch[0] + "?token=" + tokenMatch[0], headers: headers };
            });
        }).then(null, function () {
            return null;
        });
    }

    function matchGroup(text, pattern) {
        var match = pattern.exec(text);
        return match ? match[1] : null;
    }

    function isEnglishTrack(mediaLine) {
        var lang = (matchGroup(mediaLine, /LANGUAGE="([^"]*)"/) || "").toLowerCase();
        var name = (matchGroup(mediaLine, /NAME="([^"]*)"/) || "").toLowerCase();
        return lang.indexOf("en") === 0 || name.indexOf("english") !== -1;
    }

    function utf8Bytes(text) {
        var encoded = encodeURIComponent(text);
        var bytes = [];
        var i = 0;
        while (i < encoded.length) {
            if (encoded.charAt(i) === "%") {
                bytes.push(parseInt(encoded.substr(i + 1, 2), 16));
                i += 3;
            } else {
                bytes.push(encoded.charCodeAt(i));
                i += 1;
            }
        }
        return bytes;
    }

    function base64Of(bytes) {
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var chunks = [];
        for (var i = 0; i < bytes.length; i += 3) {
            var a = bytes[i];
            var hasB = i + 1 < bytes.length;
            var hasC = i + 2 < bytes.length;
            var b = hasB ? bytes[i + 1] : 0;
            var c = hasC ? bytes[i + 2] : 0;
            chunks.push(
                alphabet.charAt(a >> 2) +
                alphabet.charAt(((a & 3) << 4) | (b >> 4)) +
                (hasB ? alphabet.charAt(((b & 15) << 2) | (c >> 6)) : "=") +
                (hasC ? alphabet.charAt(c & 63) : "=")
            );
        }
        return chunks.join("");
    }

    function encodePlaylist(text) {
        return "data:application/vnd.apple.mpegurl;base64," + base64Of(utf8Bytes(text));
    }

    function squash(path) {
        var segments = path.split("/").slice(1);
        var out = [];
        for (var i = 0; i < segments.length; i++) {
            var last = i === segments.length - 1;
            if (segments[i] === ".") {
                if (last) out.push("");
            } else if (segments[i] === "..") {
                out.pop();
                if (last) out.push("");
            } else {
                out.push(segments[i]);
            }
        }
        return "/" + out.join("/");
    }

    function toAbsoluteUrl(ref, base) {
        if (/^https?:\/\//i.test(ref)) return ref;
        var parts = /^(https?:)\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?/i.exec(base);
        if (!parts) return null;
        if (ref.indexOf("//") === 0) return parts[1] + ref;

        var origin = parts[1] + "//" + parts[2];
        var hashAt = ref.indexOf("#");
        var hash = hashAt === -1 ? "" : ref.slice(hashAt);
        var rest = hashAt === -1 ? ref : ref.slice(0, hashAt);
        var queryAt = rest.indexOf("?");
        var query = queryAt === -1 ? "" : rest.slice(queryAt);
        var path = queryAt === -1 ? rest : rest.slice(0, queryAt);

        if (!path) return origin + parts[3] + (query || parts[4] || "") + hash;
        if (path.charAt(0) !== "/") {
            path = (parts[3].slice(0, parts[3].lastIndexOf("/") + 1) || "/") + path;
        }
        return origin + squash(path) + query + hash;
    }

    function rewriteUriAttribute(line, transform) {
        return line.replace(/URI="([^"]+)"/, function (match, uri) {
            var rewritten = transform(uri);
            return rewritten ? 'URI="' + rewritten + '"' : match;
        });
    }

    function clean(text) {
        var lines = text.split("\n");
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) out.push(line);
        }
        return out;
    }

    function absolutizePlaylist(playlist, base) {
        var rewritten = clean(playlist).map(function (line) {
            if (line.indexOf("#") !== 0) return toAbsoluteUrl(line, base) || line;
            if (line.indexOf("#EXT-X-KEY") === 0 || line.indexOf("#EXT-X-MAP") === 0) {
                return rewriteUriAttribute(line, function (uri) {
                    return toAbsoluteUrl(uri, base);
                });
            }
            return line;
        });
        return rewritten.join("\n") + "\n";
    }

    function fetchPlaylistDataUri(url) {
        return request(url, { headers: { "User-Agent": USER_AGENT, Referer: API_BASE + "/" } }, "text").then(function (playlist) {
            if (!playlist || playlist.indexOf("#EXTM3U") === -1) return null;
            var target = matchGroup(url, /[?&]url=([^&]+)/);
            return encodePlaylist(absolutizePlaylist(playlist, target ? decodeURIComponent(target) : url));
        }).then(null, function () {
            return null;
        });
    }

    function toSet(indexes) {
        var set = Object.create(null);
        for (var i = 0; i < indexes.length; i++) set[indexes[i]] = true;
        return set;
    }

    function buildVariants(lines) {
        var audioIndexes = [];
        lines.forEach(function (line, i) {
            if (line.indexOf("#EXT-X-MEDIA") === 0 && line.indexOf("TYPE=AUDIO") !== -1) audioIndexes.push(i);
        });
        var english = audioIndexes.filter(function (i) {
            return isEnglishTrack(lines[i]);
        });
        var other = audioIndexes.filter(function (i) {
            return english.indexOf(i) === -1;
        });

        var variants = [];
        if (audioIndexes.length === 0) {
            variants.push({ language: "sub", keep: toSet([]) });
        } else {
            if (other.length) variants.push({ language: "sub", keep: toSet(other) });
            if (english.length) variants.push({ language: "dub", keep: toSet(english) });
        }
        return { variants: variants, audioSet: toSet(audioIndexes) };
    }

    function playlistUrlsOf(lines, audioSet, variants, manifestUrl) {
        var kept = Object.create(null);
        variants.forEach(function (variant) {
            for (var key in variant.keep) kept[key] = true;
        });

        var urls = [];
        var expectingVariantUrl = false;
        lines.forEach(function (line, i) {
            if (audioSet[i] === true) {
                if (kept[i] !== true) return;
                var uri = matchGroup(line, /URI="([^"]+)"/);
                var absolute = uri && toAbsoluteUrl(uri, manifestUrl);
                if (absolute) urls.push(absolute);
            } else if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
                expectingVariantUrl = true;
            } else if (expectingVariantUrl && line.indexOf("#") !== 0) {
                var variantUrl = toAbsoluteUrl(line, manifestUrl);
                if (variantUrl) urls.push(variantUrl);
                expectingVariantUrl = false;
            }
        });
        return unique(urls);
    }

    function renderMaster(lines, audioSet, variant, manifestUrl, dataUriByUrl) {
        var output = [];
        var pendingStreamInf = null;
        var variantCount = 0;

        lines.forEach(function (line, i) {
            if (line.indexOf("#EXT-X-MEDIA") === 0) {
                if (audioSet[i] !== true) {
                    output.push(rewriteUriAttribute(line, function (uri) {
                        return toAbsoluteUrl(uri, manifestUrl);
                    }));
                    return;
                }
                if (variant.keep[i] !== true) return;
                var uri = matchGroup(line, /URI="([^"]+)"/);
                if (!uri) {
                    output.push(line);
                    return;
                }
                var mediaUri = dataUriByUrl[toAbsoluteUrl(uri, manifestUrl)];
                if (mediaUri) {
                    output.push(rewriteUriAttribute(line, function () {
                        return mediaUri;
                    }));
                }
                return;
            }
            if (line.indexOf("#EXT-X-STREAM-INF") === 0) {
                pendingStreamInf = line;
                return;
            }
            if (pendingStreamInf !== null && line.indexOf("#") !== 0) {
                var dataUri = dataUriByUrl[toAbsoluteUrl(line, manifestUrl)];
                if (dataUri) {
                    output.push(pendingStreamInf, dataUri);
                    variantCount += 1;
                }
                pendingStreamInf = null;
                return;
            }
            output.push(line);
        });

        return variantCount > 0 ? { language: variant.language, url: encodePlaylist(output.join("\n") + "\n") } : null;
    }

    function buildMasterPlaylists(embed) {
        var manifestUrl = embed.manifestUrl;
        var lines = clean(embed.manifest);
        var built = buildVariants(lines);
        var urls = playlistUrlsOf(lines, built.audioSet, built.variants, manifestUrl);

        return Promise.all(urls.map(fetchPlaylistDataUri)).then(function (dataUris) {
            var dataUriByUrl = Object.create(null);
            urls.forEach(function (url, i) {
                if (dataUris[i]) dataUriByUrl[url] = dataUris[i];
            });
            return built.variants.map(function (variant) {
                return renderMaster(lines, built.audioSet, variant, manifestUrl, dataUriByUrl);
            }).filter(Boolean);
        });
    }

    function toSubtitleTracks(subtitles) {
        return subtitles.filter(function (s) {
            return s && typeof s.url === "string" && s.url.indexOf("http") === 0;
        }).map(function (s) {
            var language = s.language || "Subtitle";
            var format = s.format ? " (" + String(s.format).toUpperCase() + ")" : "";
            return { url: s.url, language: language, name: language + format };
        });
    }

    function collectHlsStreams(embedUrl) {
        return resolveEmbed(embedUrl).then(function (embed) {
            if (!embed) return [];
            return buildMasterPlaylists(embed).then(function (masters) {
                var subtitles = toSubtitleTracks(embed.subtitles);
                return masters.map(function (master) {
                    var isDub = master.language === "dub";
                    var label = PROVIDER + " \u2022 " + (isDub ? "English" : "Japanese");
                    return {
                        name: label,
                        title: label,
                        url: master.url,
                        quality: "1080p \u2022 HLS",
                        type: "hls",
                        headers: { "User-Agent": USER_AGENT, Referer: API_BASE + "/" },
                        subtitles: subtitles,
                        rank: isDub ? 18 : 19
                    };
                });
            });
        }).then(null, function () {
            return [];
        });
    }

    function collectServerStreams(embed, hlsEnabled) {
        return Promise.all([
            hlsEnabled ? collectHlsStreams(embed.link) : Promise.resolve([]),
            resolveDownloadLink(embed.link)
        ]).then(function (replies) {
            var streams = replies[0].slice();
            var download = replies[1];
            if (download) {
                streams.push({
                    name: PROVIDER,
                    title: PROVIDER,
                    url: download.url,
                    quality: "1080p \u2022 MKV",
                    headers: download.headers,
                    rank: embed.audioType === "dub" ? 16 : 17
                });
            }
            return streams;
        }).then(null, function () {
            return [];
        });
    }

    function fetchServerList(path) {
        return request(
            BASE_URL + path,
            { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: BASE_URL + "/watch/" } },
            "json"
        ).then(function (response) {
            return response && response.success === true && Array.isArray(response.servers) ? response.servers : [];
        });
    }

    function searchSlugs(title) {
        return request(
            BASE_URL + "/api/v1/search?q=" + encodeURIComponent(title) + "&limit=10&offset=0",
            { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: BASE_URL + "/" } },
            "json"
        ).then(function (result) {
            var items = (result && result.results) || [];
            return items.map(function (item) {
                return item && item.anime_id;
            }).filter(Boolean);
        });
    }

    function fetchAnime(slug) {
        return request(
            BASE_URL + "/api/v1/anime/" + encodeURIComponent(slug),
            { headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: BASE_URL + "/" } },
            "json"
        );
    }

    function matchesTarget(candidate, targetId, number) {
        if (!candidate || !candidate.anilist_id || parseInt(candidate.themoviedb_id, 10) !== targetId) return false;
        var tmdbSeason = candidate.external_seasons ? candidate.external_seasons.tmdb : undefined;
        return !(mediaType === "tv" && tmdbSeason != null && tmdbSeason !== number);
    }

    function searchServers(number, episodeNumber) {
        var kind = mediaType === "tv" ? "tv" : "movie";
        return request(TMDB_API + "/" + kind + "/" + tmdbId + "?api_key=" + TMDB_KEY, {}, "json").then(function (details) {
            if (!details) return [];
            var titles = unique([details.name, details.title, details.original_name, details.original_title].filter(Boolean)).slice(0, 3);
            return Promise.all(titles.map(searchSlugs)).then(function (lists) {
                var slugs = unique(flatten(lists)).slice(0, 10);
                return Promise.all(slugs.map(fetchAnime));
            }).then(function (candidates) {
                var targetId = parseInt(tmdbId, 10);
                for (var i = 0; i < candidates.length; i++) {
                    if (matchesTarget(candidates[i], targetId, number)) {
                        return fetchServerList("/api/flix/" + candidates[i].anilist_id + "/" + episodeNumber);
                    }
                }
                return [];
            });
        });
    }

    function locateServers(number, episodeNumber) {
        return fetchServerList(
            "/api/flix/0/" + episodeNumber + "?tmdb=" + encodeURIComponent(tmdbId) + "&season=" + number
        ).then(function (directServers) {
            if (directServers.length) return directServers;
            return searchServers(number, episodeNumber);
        });
    }

    function extractEmbeds(servers) {
        var seen = Object.create(null);
        var embeds = [];
        for (var i = 0; i < servers.length; i++) {
            var server = servers[i];
            var link = server && typeof server.dataLink === "string" && server.dataLink.indexOf("http") === 0 ? server.dataLink : null;
            if (!link) continue;

            var serverName = String(server.serverName || "HD").trim();
            if (/^hd-?2$/i.test(serverName)) continue;

            var key = link.split("?")[0] + serverName;
            if (seen[key] === true) continue;
            seen[key] = true;
            embeds.push({ link: link, audioType: server.dataType });
        }
        return embeds;
    }

    function dedupeStreams(streams) {
        var seenUrls = Object.create(null);
        var seenHlsLabels = Object.create(null);
        return streams.filter(function (stream) {
            if (!stream.url || seenUrls[stream.url] === true) return false;
            seenUrls[stream.url] = true;

            if (stream.type !== "hls") return true;
            var labelKey = stream.name + "|" + stream.quality;
            if (seenHlsLabels[labelKey] === true) return false;
            seenHlsLabels[labelKey] = true;
            return true;
        });
    }

    function toStream(stream) {
        var tag = createSortTag(stream.rank);
        var result = {
            name: tag + stream.name,
            title: tag + stream.title,
            url: stream.url,
            quality: stream.quality,
            headers: stream.headers
        };
        if (stream.type) result.type = stream.type;
        if (stream.subtitles && stream.subtitles.length) result.subtitles = stream.subtitles;
        return result;
    }

    var query = buildQuery();
    if (!query) return Promise.resolve([]);

    return locateServers(query.season, query.episode).then(function (servers) {
        if (!servers.length) return [];
        return Promise.all(extractEmbeds(servers).map(function (embed) {
            return collectServerStreams(embed, query.hlsEnabled);
        })).then(function (lists) {
            return dedupeStreams(flatten(lists)).map(toStream);
        });
    }).then(null, function () {
        return [];
    });
}

module.exports = {
    getStreams: getStreams,
    onSettings: function () {
        return Promise.resolve([
            { type: "header", label: "Re:ANIME Settings" },
            {
                type: "toggle",
                key: "hlsEnabled",
                label: "Enable HLS Streams",
                defaultValue: false,
                description: "HLS streams in addition to MKV stream. Doesn't work on iOS & Disabled by default."
            }
        ]);
    }
};