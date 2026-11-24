function getStreams(tmdbId, mediaType, season, episode) {
  var SERVERS = [
    { slug: "atlanta", display: "Atlanta", langNote: "English" },
    { slug: "austin", display: "Austin", langNote: "English" },
    { slug: "berlin", display: "Berlin", langNote: "German" },
    { slug: "boise", display: "Boise", langNote: "English" },
    { slug: "delhi", display: "Delhi", langNote: "Hindi" },
    { slug: "miami", display: "Miami", langNote: "English" },
    { slug: "munich", display: "Munich", langNote: "German" },
    { slug: "phoenix", display: "Phoenix", langNote: "English" },
    { slug: "reno", display: "Reno", langNote: "English" },
    { slug: "seattle", display: "Seattle", langNote: "English" }
  ];
  var PROVIDER = "Vidy";
  var BASE_URL = "https://www.vidy.st";
  var API_BASE = "https://api.wecollege.net";
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
  var REFERER = BASE_URL + "/";
  var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
  var Q_RANK = { "2160p": 2, "1080p": 1, "Auto": 0 };
  var HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
    "Referer": REFERER,
    "Origin": BASE_URL
  };
  var P_HEADERS = {
    "User-Agent": USER_AGENT,
    "Referer": REFERER,
    "Origin": BASE_URL
  };

  function settings() {
    var raw = typeof SCRAPER_SETTINGS === "object" && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : {};
    var out = Object.create(null);
    var i;
    for (i = 0; i < SERVERS.length; i++) {
      out[SERVERS[i].slug] = raw["city_" + SERVERS[i].slug] !== false;
    }
    return out;
  }

  function buildQuery(id, type, seasonNumber, episodeNumber) {
    var text = String(id);
    if (!/^\d+$/.test(text)) return null;
    var isTv = type === "tv";
    if (isTv && (seasonNumber == null || episodeNumber == null)) return null;
    return {
      id: text,
      kind: isTv ? "tv" : "movie",
      season: isTv ? seasonNumber : 1,
      episode: isTv ? episodeNumber : 1
    };
  }

  function safeFetch(url, options) {
    try {
      return fetch(url, options).then(null, function () {
        return null;
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function readJson(res) {
    return res.json().then(null, function () {
      return null;
    });
  }

  function readText(res) {
    return res.text().then(null, function () {
      return null;
    });
  }

  function getJson(url) {
    return safeFetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } }).then(function (res) {
      if (!res || res.status !== 200) return null;
      return readJson(res);
    });
  }

  function javaEncode(text) {
    return encodeURIComponent(text)
      .replace(/[!'()~]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16).toUpperCase();
      })
      .replace(/%20/g, "+");
  }

  function titleOnWire(title) {
    return javaEncode(title).replace(/\+/g, "%20").replace(/%/g, "%25");
  }

  function imul(a, b) {
    var ah = (a >>> 16) & 0xffff;
    var al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff;
    var bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)) | 0;
  }

  function fmix(value) {
    var v = value | 0;
    v ^= v >>> 16;
    v = imul(v, 0x85ebca6b);
    v ^= v >>> 13;
    v = imul(v, 0xc2b2ae35);
    v ^= v >>> 16;
    return v | 0;
  }

  function rotl(value, shift) {
    var s = shift & 31;
    if (s === 0) return value | 0;
    return ((value << s) | (value >>> (32 - s))) | 0;
  }

  function mod61(value) {
    return (value >>> 0) % 61;
  }

  function fnv1aMixed(text) {
    var hash = -2128831035;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = imul(hash, 0x1000193);
    }
    return fmix(hash);
  }

  function toUint32(text) {
    var parsed = Number(String(text).trim());
    if (!isFinite(parsed)) return 0;
    var whole = parsed < 0 ? Math.ceil(parsed) : Math.floor(parsed);
    return (whole >>> 0) | 0;
  }

  function initState(seed, mediaId) {
    var slots = [];
    var filled = [];
    for (var i = 0; i < 61; i++) {
      slots.push(0);
      filled.push(false);
    }
    var n = fmix(fnv1aMixed(seed) ^ fmix(toUint32(mediaId) ^ -1640531527));
    for (var round = 0; round < 8; round++) {
      var slot = mod61(n);
      n = rotl((n - 1640531527) | 0, 7 + (7 & round));
      slots[slot] = n ^ fmix(n);
      filled[slot] = true;
      n = fmix((n + slot) | 0);
    }
    return { slots: slots, filled: filled, acc: fmix(0xa5a5a5a5 ^ n) };
  }

  function nextWord(state, counter) {
    var slot = mod61(state.acc);
    var known = state.filled[slot];
    var picked = known ? state.slots[slot] : 0;
    var salt = picked ^ imul(-1640531527, counter + 1);
    var acc = state.acc;
    var blended = known ? (acc | salt) : (acc ^ salt);
    var rotated = rotl((blended + acc) | 0, slot & 31) ^ rotl(acc, 31 & (slot * 7));
    var word = fmix((rotated - 1640531527) | 0);
    state.slots[slot] = word;
    state.filled[slot] = true;
    state.acc = word;
    return word;
  }

  function keystream(seed, mediaId, length) {
    var state = initState(seed, mediaId);
    var out = [];
    var counter = 0;
    while (out.length < length) {
      var word = nextWord(state, counter++);
      out.push(word & 0xff);
      if (out.length < length) out.push((word >>> 8) & 0xff);
      if (out.length < length) out.push((word >>> 16) & 0xff);
      if (out.length < length) out.push((word >>> 24) & 0xff);
    }
    return out;
  }

  function decodeBase64Url(payload) {
    var text = String(payload).trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    if (text.length % 4 === 1) return null;
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var bytes = [];
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < text.length; i++) {
      var value = alphabet.indexOf(text.charAt(i));
      if (value < 0) return null;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xff);
        buffer &= (1 << bits) - 1;
      }
    }
    return bytes;
  }

  function utf8Decode(bytes, start) {
    var out = "";
    var i = start;
    while (i < bytes.length) {
      var b = bytes[i++];
      var cp;
      if (b < 0x80) {
        cp = b;
      } else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) {
        cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      } else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length) {
        cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      } else if (b >= 0xf0 && i + 2 < bytes.length) {
        cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) |
          ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      } else {
        cp = 0xfffd;
      }
      if (cp > 0xffff) {
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        out += String.fromCharCode(cp);
      }
    }
    return out;
  }

  function decrypt(payload, seed, mediaId) {
    try {
      var raw = decodeBase64Url(payload);
      if (!raw || raw.length <= 4) return null;
      var mask = keystream(seed, mediaId, raw.length);
      var plain = [];
      for (var i = 0; i < raw.length; i++) plain.push((raw[i] ^ mask[i]) & 0xff);
      if (plain[0] !== 109 || plain[1] !== 118 || plain[2] !== 109 || plain[3] !== 49) return null;
      return utf8Decode(plain, 4);
    } catch (e) {
      return null;
    }
  }

  function createSeedPool(mediaId) {
    var pool = { seed: null, expiresAt: 0, queue: Promise.resolve() };

    function fetchSeed(rateLimited) {
      return safeFetch(API_BASE + "/seed?mediaId=" + mediaId, { headers: HEADERS }).then(function (res) {
        if (!res) return null;
        if (res.status === 200) {
          return readJson(res).then(function (reply) {
            var fresh = reply && typeof reply.seed === "string" && reply.seed ? reply.seed : null;
            if (!fresh) return null;
            pool.seed = fresh;
            pool.expiresAt = Date.now() - 5000 + (Number(reply.ttlMs) || 30000);
            return fresh;
          });
        }
        if (res.status === 429 && rateLimited < 1) return fetchSeed(rateLimited + 1);
        return null;
      });
    }

    pool.drop = function () {
      pool.seed = null;
    };

    pool.current = function () {
      var run = pool.queue.then(function () {
        if (pool.seed !== null && Date.now() < pool.expiresAt) return pool.seed;
        return fetchSeed(0);
      });
      pool.queue = run.then(function () { }, function () { });
      return run.then(null, function () {
        return null;
      });
    };

    return pool;
  }

  function buildUrl(city, req, seed) {
    var q = "title=" + titleOnWire(req.title);
    q += "&mediaType=" + req.mediaType;
    q += "&year=" + req.year;
    q += "&episodeId=" + req.episode;
    q += "&seasonId=" + req.season;
    q += "&tmdbId=" + req.tmdbId;
    if (req.imdbId) q += "&imdbId=" + req.imdbId;
    if (city.slug === "munich") q += "&language=german";
    if (city.slug === "berlin" && req.germanTitle) q += "&altTitle=" + titleOnWire(req.germanTitle);
    q += "&enc=2&seed=" + javaEncode(seed);
    return API_BASE + "/" + city.slug + "/sources?" + q;
  }

  function citySources(city, req, pool) {
    var transportRetries = 1;
    var staleStrikes = 0;
    var coolDowns = 0;

    function attempt(n) {
      if (n >= 5) return Promise.resolve(null);
      return pool.current().then(function (seed) {
        if (!seed) return null;
        return safeFetch(buildUrl(city, req, seed), { headers: HEADERS }).then(function (res) {
          if (!res) {
            if (transportRetries > 0) {
              transportRetries--;
              return attempt(n + 1);
            }
            return null;
          }
          var code = res.status;
          if (code === 200) {
            return readText(res).then(function (body) {
              var plain = body ? decrypt(body, seed, req.tmdbId) : null;
              if (plain === null) {
                staleStrikes++;
                if (staleStrikes >= 2) {
                  pool.drop();
                  staleStrikes = 0;
                }
                return attempt(n + 1);
              }
              try {
                return JSON.parse(plain);
              } catch (e) {
                return null;
              }
            });
          }
          if (code === 401) {
            staleStrikes++;
            if (staleStrikes >= 3) {
              pool.drop();
              staleStrikes = 0;
            }
            return attempt(n + 1);
          }
          if (code === 429) {
            if (coolDowns >= 1) return null;
            coolDowns++;
            pool.drop();
            return attempt(n + 1);
          }
          return null;
        });
      });
    }

    return attempt(0);
  }

  function loadMeta(id, kind) {
    var base = TMDB_API + "/" + kind + "/" + id;
    return Promise.all([
      getJson(base + "?api_key=" + TMDB_KEY + "&language=en&append_to_response=external_ids"),
      getJson(base + "/translations?api_key=" + TMDB_KEY)
    ]).then(function (results) {
      var d = results[0];
      if (!d) return null;
      var title = String((kind === "tv" ? d.name : d.title) || "").trim();
      if (!title) return null;
      var date = (kind === "tv" ? d.first_air_date : d.release_date) || "";
      var year = /^\d{4}/.test(date) ? date.slice(0, 4) : "0";
      var imdbId = d.imdb_id || (d.external_ids && d.external_ids.imdb_id) || "";

      var germanTitle = null;
      var list = results[1] && results[1].translations;
      if (Array.isArray(list)) {
        for (var i = 0; i < list.length; i++) {
          var t = list[i];
          if (t && t.iso_639_1 === "de") {
            var data = t.data;
            var german = data && String(data.title || data.name || "").trim();
            if (german && german !== title) germanTitle = german;
            break;
          }
        }
      }
      return { title: title, year: year, imdbId: imdbId, germanTitle: germanTitle };
    });
  }

  function bucket(height) {
    if (height >= 2000) return "2160p";
    if (height >= 1000) return "1080p";
    return "Auto";
  }

  function qualityFromLabel(text) {
    var t = String(text || "").trim().toLowerCase();
    if (!t) return null;
    if (/\bauto\b/.test(t)) return "Auto";
    if (/\b4k\b|\buhd\b/.test(t)) return "2160p";
    var m = t.match(/(^|[^0-9a-z])(\d{3,4})p?(?![0-9a-z])/);
    if (m) return bucket(parseInt(m[2], 10));
    if (/\bfull\s*hd\b|\bfhd\b|\bhd\b/.test(t)) return "1080p";
    if (/\bsd\b/.test(t)) return "Auto";
    return null;
  }

  function qualityFromUrl(url) {
    var m = String(url).toLowerCase().match(/(^|[^0-9a-z])(2160|1440|1080|720|480|360)p?(?![0-9a-z])/);
    return m ? bucket(parseInt(m[2], 10)) : null;
  }

  function probeQuality(record) {
    record.quality = "Auto";
    return safeFetch(record.url, { headers: P_HEADERS }).then(function (res) {
      if (!res || res.status !== 200) return;
      return readText(res).then(function (text) {
        if (text === null) return;
        var re = /RESOLUTION=(\d+)x(\d+)/g;
        var best = 0;
        var m;
        while ((m = re.exec(text)) !== null) {
          var equivalent = Math.max(parseInt(m[2], 10), Math.round(parseInt(m[1], 10) * 9 / 16));
          if (equivalent > best) best = equivalent;
        }
        if (best > 0) record.quality = bucket(best);
      });
    });
  }

  function collectSubtitles(city, reply, seen) {
    var out = [];
    var subs = reply && Array.isArray(reply.subtitles) ? reply.subtitles : [];
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i];
      if (!sub) continue;
      var url = typeof sub.url === "string" && sub.url.indexOf("http") === 0 ? sub.url : null;
      if (!url) continue;
      var format = sub.type ? String(sub.type).toLowerCase() : "";
      if (format !== "vtt" && format !== "srt") continue;
      var label = String(sub.language || sub.lang || "").trim();
      if (label.length < 4) continue;
      var cut = label.indexOf(" - [");
      if (cut > 0) label = label.slice(0, cut).trim();
      if (seen.urls[url] === true) continue;
      seen.urls[url] = true;
      if (seen.labels[label.toLowerCase()] === true) {
        label = label + " (" + city.display + ")";
      } else {
        seen.labels[label.toLowerCase()] = true;
      }
      out.push({ url: url, language: label, name: label, headers: P_HEADERS });
    }
    return out;
  }

  function collectRecords(city, reply, seenLinks, seenSubs) {
    var out = [];
    var sources = reply && Array.isArray(reply.sources) ? reply.sources : [];
    var subtitles = collectSubtitles(city, reply, seenSubs);
    for (var i = 0; i < sources.length; i++) {
      var source = sources[i];
      if (!source) continue;
      var url = typeof source.url === "string" && source.url.indexOf("http") === 0 ? source.url : null;
      if (!url) continue;
      var label = String(source.quality || "").trim();
      if (!label) continue;
      if (city.slug === "austin" && label !== "English") continue;
      if (seenLinks[url] === true) continue;
      seenLinks[url] = true;

      var hls = url.indexOf("/mp4/") === -1;
      var quality = qualityFromLabel(label);
      if (quality === null) quality = qualityFromUrl(url);
      if (quality === null && !hls) quality = "Auto";
      out.push({ city: city, url: url, quality: quality, hls: hls, subtitles: subtitles });
    }
    return out;
  }

  function getSortTag(rank, maxRank) {
    var bin = Math.max(0, maxRank - rank).toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(function (b) {
      return b === "1" ? "\uFEFF" : "\u200B";
    }).join("");
  }

  function toStream(record) {
    var label = getSortTag(Q_RANK[record.quality], 2) +
      [PROVIDER, record.city.display, record.city.langNote].join(" \u2022 ");
    var stream = {
      name: label,
      title: label,
      url: record.url,
      quality: record.quality,
      headers: P_HEADERS
    };
    if (record.hls) stream.type = "hls";
    if (record.subtitles.length) stream.subtitles = record.subtitles;
    return stream;
  }

  function select(records) {
    var slots = [];
    for (var i = 0; i < records.length; i++) slots.push({ index: i, record: records[i] });
    slots.sort(function (a, b) {
      var diff = Q_RANK[b.record.quality] - Q_RANK[a.record.quality];
      return diff !== 0 ? diff : a.index - b.index;
    });
    return slots.map(function (slot) {
      return toStream(slot.record);
    });
  }

  function gather(replies) {
    var seenLinks = Object.create(null);
    var seenSubs = { urls: Object.create(null), labels: Object.create(null) };
    var records = [];
    for (var i = 0; i < replies.length; i++) {
      if (!replies[i].reply) continue;
      var found = collectRecords(replies[i].city, replies[i].reply, seenLinks, seenSubs);
      for (var j = 0; j < found.length; j++) records.push(found[j]);
    }
    var unknown = [];
    for (var k = 0; k < records.length; k++) {
      if (records[k].quality === null) unknown.push(probeQuality(records[k]));
    }
    return Promise.all(unknown).then(function () {
      return select(records);
    });
  }

  var query = buildQuery(tmdbId, mediaType, season, episode);
  if (!query) return Promise.resolve([]);

  return loadMeta(query.id, query.kind).then(function (meta) {
    if (!meta) return [];
    var req = {
      mediaType: query.kind,
      tmdbId: query.id,
      imdbId: meta.imdbId,
      title: meta.title,
      year: meta.year,
      season: query.season,
      episode: query.episode,
      germanTitle: meta.germanTitle
    };
    var pool = createSeedPool(query.id);
    var set = settings();
    var cities = [];
    for (var i = 0; i < SERVERS.length; i++) {
      if (set[SERVERS[i].slug]) cities.push(SERVERS[i]);
    }
    return Promise.all(cities.map(function (city) {
      return citySources(city, req, pool).then(function (reply) {
        return { city: city, reply: reply };
      }, function () {
        return { city: city, reply: null };
      });
    })).then(gather);
  }).then(null, function () {
    return [];
  });
}

module.exports = {
  getStreams: getStreams,
  onSettings: function () {
    return Promise.resolve([
      { type: "header", label: "Servers" },
      { type: "toggle", key: "city_atlanta", label: "Atlanta (English)", defaultValue: true },
      { type: "toggle", key: "city_austin", label: "Austin (English)", defaultValue: true },
      { type: "toggle", key: "city_berlin", label: "Berlin (German)", defaultValue: true },
      { type: "toggle", key: "city_boise", label: "Boise (English)", defaultValue: true },
      { type: "toggle", key: "city_delhi", label: "Delhi (Hindi)", defaultValue: true },
      { type: "toggle", key: "city_miami", label: "Miami (English)", defaultValue: true },
      { type: "toggle", key: "city_munich", label: "Munich (German)", defaultValue: true },
      { type: "toggle", key: "city_phoenix", label: "Phoenix (English)", defaultValue: true },
      { type: "toggle", key: "city_reno", label: "Reno (English)", defaultValue: true },
      { type: "toggle", key: "city_seattle", label: "Seattle (English)", defaultValue: true }
    ]);
  }
};