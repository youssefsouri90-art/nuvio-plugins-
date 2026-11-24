function getStreams(tmdbId, mediaType, season, episode) {
    var PROVIDER = 'MoviesHunt';
    var BASE_URL = 'https://new4.movieshunt.website';
    var TMDB_API = "https://api.themoviedb.org/3";
    var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
    var ABHL_URL = 'https://abhilinks.site';
    var Q_KEEP = Object.create(null);
    Q_KEEP['1080P'] = true;
    Q_KEEP['2160P'] = true;
    var USER_AGENTS = [
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'
    ];

    function buildQuery(id, type, seasonValue, episodeValue) {
        var clean = String(id || '').trim();
        if (!/^\d+$/.test(clean)) return null;
        var isSeries = type === 'tv';
        if (isSeries && (seasonValue == null || episodeValue == null)) return null;
        return {
            id: clean,
            isSeries: isSeries,
            seasonNum: isSeries ? parseInt(seasonValue, 10) : null,
            episodeNum: isSeries ? parseInt(episodeValue, 10) : null
        };
    }

    function randomUA() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    function resWeight(quality) {
        var q = (quality || '').toUpperCase();
        if (q === '4K' || q === '2160P') return 5;
        if (q === '1440P') return 4;
        if (q === '1080P') return 3;
        if (q === '720P') return 2;
        if (q === '480P') return 1;
        return 0;
    }

    function sortTag(quality) {
        var bin = (5 - resWeight(quality)).toString(2);
        while (bin.length < 20) bin = '0' + bin;
        var tag = '';
        for (var i = 0; i < bin.length; i++) tag += bin.charAt(i) === '1' ? '\uFEFF' : '\u200B';
        return tag;
    }

    function sortStable(list, compare) {
        var indexed = [];
        for (var i = 0; i < list.length; i++) indexed.push({ item: list[i], index: i });
        indexed.sort(function (a, b) {
            return compare(a.item, b.item) || a.index - b.index;
        });
        var out = [];
        for (var j = 0; j < indexed.length; j++) out.push(indexed[j].item);
        return out;
    }

    function contains(whole, part) {
        return whole.indexOf(part) !== -1;
    }

    function hdrs(ua, extra) {
        var out = {
            'User-Agent': ua,
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        };
        var keys = Object.keys(extra || {});
        for (var i = 0; i < keys.length; i++) out[keys[i]] = extra[keys[i]];
        return out;
    }

    function fetchText(url, options) {
        return fetch(url, options || {}).then(function (res) {
            return res && res.ok ? res.text() : null;
        }).then(null, function () {
            return null;
        });
    }

    function fetchJson(url, options) {
        return fetch(url, options || {}).then(function (res) {
            return res && res.ok ? res.json() : null;
        }).then(null, function () {
            return null;
        });
    }

    function decodeBase64(text) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        var clean = String(text).replace(/[\t\n\f\r ]/g, '');
        if (clean.length % 4 === 0) clean = clean.replace(/==?$/, '');
        if (clean.length % 4 === 1 || /[^A-Za-z0-9+\/]/.test(clean)) return null;
        var out = '';
        var acc = 0;
        var bits = 0;
        for (var i = 0; i < clean.length; i++) {
            acc = (acc << 6) | alphabet.indexOf(clean.charAt(i));
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out += String.fromCharCode((acc >> bits) & 255);
                acc = acc & ((1 << bits) - 1);
            }
        }
        return out;
    }

    function getTMDBInfo(query, ua) {
        var endpoint = query.isSeries ? 'tv' : 'movie';
        return fetchJson(
            TMDB_API + '/' + endpoint + '/' + query.id + '?api_key=' + TMDB_KEY + '&language=en-US',
            { headers: { 'User-Agent': ua } }
        );
    }

    function buildSearchQueries(query) {
        var queries = [query.replace(/'/g, '').trim()];
        var cleaned = query.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned !== queries[0]) queries.push(cleaned);
        var noYear = cleaned.replace(/\s*\d{4}\s*/g, ' ').trim();
        if (noYear && !contains(queries, noYear)) queries.push(noYear);

        var words = [];
        var split = cleaned.split(' ');
        for (var i = 0; i < split.length; i++) {
            if (split[i].length > 2) words.push(split[i]);
        }
        while (words.length > 1) {
            words.pop();
            var partial = words.join(' ');
            if (partial.length > 3 && !contains(queries, partial)) queries.push(partial);
        }

        if (cleaned) {
            var parts = cleaned.split(' ');
            if (parts.length > 1) {
                var lastTwo = parts.slice(-Math.min(2, parts.length)).join(' ');
                if (lastTwo.length > 3 && !contains(queries, lastTwo)) queries.push(lastTwo);
                var lastWord = parts[parts.length - 1];
                if (lastWord.length > 3 && /[a-zA-Z]/.test(lastWord) && !contains(queries, lastWord)) queries.push(lastWord);
            }
        }

        var usable = [];
        for (var j = 0; j < queries.length; j++) {
            if (queries[j].length >= 3) usable.push(queries[j]);
        }
        return usable;
    }

    function keepUsable(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].title.length > 5 && list[i].url) out.push(list[i]);
        }
        return out;
    }

    function fromPosts(posts) {
        var list = [];
        for (var i = 0; i < posts.length; i++) {
            var post = posts[i];
            list.push({
                title: (post.title && post.title.rendered ? post.title.rendered : '').replace(/<[^>]+>/g, '').trim(),
                url: post.link
            });
        }
        return keepUsable(list);
    }

    function fromLookup(items) {
        var list = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            list.push({
                title: (item.title || item.name || '').replace(/<[^>]+>/g, '').trim(),
                url: item.url || item.link || (item.slug ? BASE_URL + '/' + item.slug + '/' : null)
            });
        }
        return keepUsable(list);
    }

    function searchSite(query, ua) {
        var queries = buildSearchQueries(query);
        var requests = [];
        for (var i = 0; i < queries.length; i++) {
            var encoded = encodeURIComponent(queries[i]);
            requests.push(fetchJson(BASE_URL + '/wp-json/wp/v2/posts?search=' + encoded + '&per_page=10', { headers: hdrs(ua) }));
            requests.push(fetchJson(BASE_URL + '/lookup.php?q=' + encoded + '&page=1&per_page=30', { headers: hdrs(ua) }));
        }
        return Promise.all(requests).then(function (replies) {
            for (var j = 0; j < queries.length; j++) {
                var posts = replies[j * 2];
                if (posts && posts.length) return fromPosts(posts);
                var lookup = replies[j * 2 + 1];
                if (lookup && lookup.length) return fromLookup(lookup);
            }
            return [];
        });
    }

    function normalize(text) {
        return text.toLowerCase().replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    }

    function stripStops(text) {
        return text.replace(/\b(and|&|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
    }

    function wordsOf(text) {
        var out = [];
        var split = text.split(/\s+/);
        for (var i = 0; i < split.length; i++) {
            if (split[i].length > 1) out.push(split[i]);
        }
        return out;
    }

    function wordsOverlap(titleWords, resultLower) {
        var resultWords = wordsOf(resultLower);
        var matches = 0;
        for (var i = 0; i < titleWords.length; i++) {
            for (var j = 0; j < resultWords.length; j++) {
                var tw = titleWords[i];
                var rw = resultWords[j];
                if (tw === rw || rw.indexOf(tw) === 0 || tw.indexOf(rw) === 0) {
                    matches++;
                    break;
                }
            }
        }
        return matches >= Math.min(titleWords.length, 3);
    }

    function scoreResult(resultLower, titleLower, titleNoStops, titleWords) {
        var score = 0;
        if (resultLower === titleLower) {
            score += 100;
        } else if (contains(resultLower, titleLower) || contains(titleLower, resultLower)) {
            score += 50;
        } else {
            var resultNoStops = stripStops(resultLower);
            if (contains(resultNoStops, titleNoStops) || contains(titleNoStops, resultNoStops)) {
                score += 50;
            } else if (
                resultNoStops.replace(/[^a-z0-9\s]/g, '').trim() ===
                titleNoStops.replace(/[^a-z0-9\s]/g, '').trim()
            ) {
                score += 60;
            }
        }
        if (score === 0 && titleWords.length > 1 && wordsOverlap(titleWords, resultLower)) score += 50;
        return score;
    }

    function matchHits(results, tmdbInfo, isSeries) {
        var tmdbTitle = (isSeries ? tmdbInfo.name : tmdbInfo.title) || '';
        var tmdbYear = isSeries
            ? (tmdbInfo.first_air_date || '').split('-')[0]
            : (tmdbInfo.release_date || '').split('-')[0];

        var titleLower = normalize(tmdbTitle);
        var titleNoStops = stripStops(titleLower);
        var titleWords = wordsOf(titleLower);

        var scored = [];
        var seen = Object.create(null);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            var resultTitle = result.title || '';
            var resultUrl = result.url || '';
            if (seen[resultUrl]) continue;
            seen[resultUrl] = true;

            var score = scoreResult(normalize(resultTitle), titleLower, titleNoStops, titleWords);
            if (score >= 50 && tmdbYear && contains(resultTitle, tmdbYear)) score += 10;
            if (score >= 50) scored.push({ doc: result, score: score });
        }

        scored = sortStable(scored, function (a, b) {
            return b.score - a.score;
        });
        var hits = [];
        for (var j = 0; j < scored.length && j < 5; j++) hits.push(scored[j].doc);
        return hits;
    }

    function extractAbhilinksUrl(html) {
        var btnMatch = html.match(/<a[^>]*href="(https:\/\/abhilinks\.(?:life|site)\/[^"]+)"[^>]*class="btn"[^>]*>/i);
        if (btnMatch) return btnMatch[1];
        var anyMatch = html.match(/<a[^>]*href="(https:\/\/abhilinks\.(?:life|site)\/[^"]+)"[^>]*>/i);
        if (anyMatch) return anyMatch[1];
        return null;
    }

    function extractQualityOptions(html) {
        var options = [];
        var qualityRegex = /(2160|1080|720|480)[pP](?:\s+\w{1,15})?\s*\[([^\]]+)\]/g;
        var match;
        while ((match = qualityRegex.exec(html)) !== null) {
            var quality = match[1] + 'P';
            var size = match[2];
            if (quality === '480P') continue;
            var context = html.substring(Math.max(0, match.index - 200), match.index + 600);
            var hubcloudMatch = context.match(/href="(https:\/\/hubcloud\.ist\/(?:drive|video)\/[^"]+)"/i);
            var vcloudMatch = context.match(/href="(https:\/\/href\.li\/\?https:\/\/vcloud\.fit\/[^"]+)"/i);
            if (hubcloudMatch) options.push({ quality: quality, size: size, type: 'hubcloud', url: hubcloudMatch[1] });
            else if (vcloudMatch) options.push({ quality: quality, size: size, type: 'vcloud', url: vcloudMatch[1] });
        }
        return options;
    }

    function extractVcloudUrl(raw) {
        var match = raw.match(/href\.li\/\?https:\/\/vcloud\.fit\/([^"&?]+)/i);
        if (match) return 'https://vcloud.fit/' + match[1];
        return null;
    }

    function extractR2Links(html) {
        var links = [];
        var anchorMatches = html.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
        if (!anchorMatches) return links;
        for (var i = 0; i < anchorMatches.length; i++) {
            var anchor = anchorMatches[i];
            var hrefMatch = anchor.match(/href="([^"]+)"/i);
            var textMatch = anchor.match(/>([\s\S]*?)<\/a>/i);
            if (!hrefMatch) continue;
            var url = hrefMatch[1].replace(/&amp;/g, '&');
            var text = textMatch ? textMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            if (!url || url.indexOf('javascript:') === 0) continue;
            if (/telegram/i.test(text) || /tg\//i.test(url) || /pixeldrain/i.test(url)) continue;
            if (!/r2\.cloudflarestorage/i.test(url)) continue;
            var qualityMatch = text.match(/(2160|1080|720|480)\s*[pP]/i);
            links.push({ url: url, quality: qualityMatch ? qualityMatch[1] + 'P' : '' });
        }
        return links;
    }

    function extractEpisodes(html) {
        var episodes = [];
        var markers = [];
        var match;
        var markerRegex = /-:\s*Episodes?\s*:\s*(\d+)\s*:-/gi;
        while ((match = markerRegex.exec(html)) !== null) markers.push({ num: parseInt(match[1], 10), idx: match.index });

        if (markers.length === 0) {
            var fallback = />\s*Episode\s*(\d+)\s*</gi;
            while ((match = fallback.exec(html)) !== null) markers.push({ num: parseInt(match[1], 10), idx: match.index });
        }

        for (var i = 0; i < markers.length; i++) {
            var start = markers[i].idx;
            var end = i + 1 < markers.length ? markers[i + 1].idx : html.length;
            var segment = html.substring(start, end);
            var links = [];
            var hubcloudRegex = /href="(https:\/\/hubcloud\.ist\/(?:drive|video)\/[^"]+)"/gi;
            while ((match = hubcloudRegex.exec(segment)) !== null) links.push({ type: 'hubcloud', url: match[1] });
            var vcloudRegex = /href="(https:\/\/href\.li\/\?https:\/\/vcloud\.fit\/[^"]+)"/gi;
            while ((match = vcloudRegex.exec(segment)) !== null) {
                var vUrl = extractVcloudUrl(match[1]);
                if (vUrl) links.push({ type: 'vcloud', url: vUrl });
            }
            var sizeMatch = segment.match(/\[(\d+(?:\.\d+)?\s*(?:GB|MB))\]/i);
            if (links.length) episodes.push({ number: markers[i].num, links: links, size: sizeMatch ? sizeMatch[1] : '' });
        }
        return episodes;
    }

    function extractSeasonLinks(html) {
        var seasons = Object.create(null);
        var h4Regex = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
        var h4s = [];
        var match;
        while ((match = h4Regex.exec(html)) !== null) {
            h4s.push({ inner: match[1], start: match.index, end: match.index + match[0].length });
        }

        for (var i = 0; i < h4s.length; i++) {
            var seasonMatch = h4s[i].inner.match(/Season\s+(\d+)/i);
            var qualityMatch = h4s[i].inner.match(/(\d+p)/i);
            if (!seasonMatch || !qualityMatch) continue;
            var seasonNum = parseInt(seasonMatch[1], 10);
            var quality = qualityMatch[1].toUpperCase();
            var sectionEnd = i + 1 < h4s.length ? h4s[i + 1].start : html.length;
            var segment = html.substring(h4s[i].end, sectionEnd);
            var abhiMatch = segment.match(/href="(https:\/\/abhilinks\.(?:life|site)\/archives\/\d+)\/?"/i);
            if (!abhiMatch) continue;
            if (!seasons[seasonNum]) seasons[seasonNum] = Object.create(null);
            if (!seasons[seasonNum][quality]) seasons[seasonNum][quality] = abhiMatch[1];
        }
        return seasons;
    }

    function processHubcloud(url, ua) {
        return fetchText(url, { headers: hdrs(ua, { 'Referer': ABHL_URL + '/' }) }).then(function (html) {
            if (!html) return null;

            var direct = extractR2Links(html);
            if (direct.length) return direct;

            var phpMatch = html.match(/href="(https:\/\/[^"]*hubcloud\.php[^"]*)"/i);
            if (!phpMatch) return null;
            var phpUrl = phpMatch[1].replace(/&amp;/g, '&');
            return fetchText(phpUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': url,
                    'DNT': '1',
                    'Cookie': 'xla=s4t'
                }
            }).then(function (phpHtml) {
                if (!phpHtml || phpHtml.length < 500) return null;
                return extractR2Links(phpHtml);
            });
        });
    }

    function processVcloud(url, ua) {
        return fetchText(url, { headers: hdrs(ua, { 'Referer': ABHL_URL + '/' }) }).then(function (html) {
            if (!html) return null;
            var atobMatch = html.match(/atob\s*\(\s*atob\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/);
            if (!atobMatch) return null;
            var first = decodeBase64(atobMatch[1]);
            var decoded = first === null ? null : decodeBase64(first);
            if (decoded === null) return null;
            return fetchText(decoded, {
                headers: hdrs(ua, { 'Referer': BASE_URL + '/', 'Cookie': 'xla=s4t' })
            }).then(function (innerHtml) {
                if (!innerHtml) return null;
                return extractR2Links(innerHtml);
            });
        });
    }

    function processLink(type, url, ua) {
        if (type === 'hubcloud') return processHubcloud(url, ua);
        if (type === 'vcloud') return processVcloud(url, ua);
        return Promise.resolve(null);
    }

    function candidatesFrom(links, quality, size) {
        var out = [];
        if (!links) return out;
        for (var i = 0; i < links.length; i++) {
            out.push({ url: links[i].url, quality: links[i].quality || quality, size: size });
        }
        return out;
    }

    function flatten(groups) {
        var out = [];
        for (var i = 0; i < groups.length; i++) {
            for (var j = 0; j < groups[i].length; j++) out.push(groups[i][j]);
        }
        return out;
    }

    function seasonEntries(postHtml, seasonNum) {
        var entries = [];
        if (seasonNum) {
            var seasonLinks = extractSeasonLinks(postHtml);
            if (seasonLinks[seasonNum]) {
                var qualities = Object.keys(seasonLinks[seasonNum]).sort(function (a, b) {
                    return parseInt(b, 10) - parseInt(a, 10);
                });
                for (var i = 0; i < qualities.length; i++) {
                    entries.push({ quality: qualities[i], url: seasonLinks[seasonNum][qualities[i]] });
                }
            }
        }
        if (!entries.length) {
            var abhiUrl = extractAbhilinksUrl(postHtml);
            if (abhiUrl) entries.push({ quality: '', url: abhiUrl });
        }
        return entries;
    }

    function collectSeries(postHtml, seasonNum, episodeNum, ua) {
        var entries = seasonEntries(postHtml, seasonNum);
        if (!entries.length) return Promise.resolve([]);

        return Promise.all(entries.map(function (entry) {
            return fetchText(entry.url, { headers: hdrs(ua) });
        })).then(function (pages) {
            var jobs = [];
            for (var i = 0; i < entries.length; i++) {
                if (!pages[i]) continue;
                var allEpisodes = extractEpisodes(pages[i]);
                if (!allEpisodes.length) continue;
                var chosen = [];
                for (var j = 0; j < allEpisodes.length; j++) {
                    if (!episodeNum || allEpisodes[j].number === episodeNum) chosen.push(allEpisodes[j]);
                }
                for (var k = 0; k < chosen.length; k++) {
                    for (var m = 0; m < chosen[k].links.length; m++) {
                        jobs.push(linkJob(chosen[k].links[m], entries[i].quality, chosen[k].size, ua));
                    }
                }
            }
            return Promise.all(jobs).then(flatten);
        });
    }

    function linkJob(link, quality, size, ua) {
        return processLink(link.type, link.url, ua).then(function (links) {
            return candidatesFrom(links, quality, size);
        });
    }

    function collectMovie(postHtml, ua) {
        var abhiUrl = extractAbhilinksUrl(postHtml);
        if (!abhiUrl) return Promise.resolve([]);

        return fetchText(abhiUrl, { headers: hdrs(ua) }).then(function (abhiHtml) {
            if (!abhiHtml) return [];
            var options = extractQualityOptions(abhiHtml);
            return Promise.all(options.map(function (opt) {
                var url = opt.type === 'vcloud' ? extractVcloudUrl(opt.url) : opt.url;
                if (!url) return Promise.resolve([]);
                return linkJob({ type: opt.type, url: url }, opt.quality, opt.size, ua);
            })).then(flatten);
        });
    }

    function toStream(candidate, ua) {
        if (Q_KEEP[candidate.quality] !== true) return null;
        var sizePart = candidate.size ? ' \u2022 ' + candidate.size : '';
        var name = PROVIDER + ' \u2022 ' + candidate.quality.toLowerCase() + sizePart;
        return {
            name: name,
            title: name,
            url: candidate.url,
            quality: candidate.quality,
            headers: { 'Referer': BASE_URL + '/', 'User-Agent': ua }
        };
    }

    function dedupe(list) {
        var seen = Object.create(null);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (!list[i] || !list[i].url) continue;
            if (seen[list[i].url]) continue;
            seen[list[i].url] = true;
            out.push(list[i]);
        }
        return out;
    }

    function rank(streams) {
        var sorted = sortStable(dedupe(streams), function (a, b) {
            return resWeight(b.quality) - resWeight(a.quality);
        });
        var out = [];
        for (var i = 0; i < sorted.length; i++) {
            var tag = sortTag(sorted[i].quality);
            out.push({
                name: tag + sorted[i].name,
                title: tag + sorted[i].title,
                url: sorted[i].url,
                quality: sorted[i].quality,
                headers: sorted[i].headers
            });
        }
        return out;
    }

    function resolveMatch(postUrl, query, ua) {
        return fetchText(postUrl, { headers: hdrs(ua) }).then(function (postHtml) {
            if (!postHtml) return [];
            var collected = query.isSeries
                ? collectSeries(postHtml, query.seasonNum, query.episodeNum, ua)
                : collectMovie(postHtml, ua);
            return collected.then(function (candidates) {
                var streams = [];
                for (var i = 0; i < candidates.length; i++) {
                    var stream = toStream(candidates[i], ua);
                    if (stream) streams.push(stream);
                }
                return rank(streams);
            });
        }).then(null, function () {
            return [];
        });
    }

    try {
        var query = buildQuery(tmdbId, mediaType, season, episode);
        if (!query) return Promise.resolve([]);
        var ua = randomUA();

        return getTMDBInfo(query, ua).then(function (tmdbInfo) {
            if (!tmdbInfo) return [];
            var title = query.isSeries ? tmdbInfo.name : tmdbInfo.title;
            if (!title) return [];

            return searchSite(title, ua).then(function (searchResults) {
                if (!searchResults.length) return [];
                var matches = matchHits(searchResults, tmdbInfo, query.isSeries);
                if (!matches.length) return [];

                return Promise.all(matches.map(function (m) {
                    return resolveMatch(m.url, query, ua);
                })).then(function (groups) {
                    for (var i = 0; i < groups.length; i++) {
                        if (groups[i].length) return groups[i];
                    }
                    return [];
                });
            });
        }).then(null, function () {
            return [];
        });
    } catch (e) {
        return Promise.resolve([]);
    }
}

module.exports = { getStreams: getStreams };