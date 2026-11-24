function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var BASE_URL = "https://id-mapping-api-showbox-proxy.hf.space/api/media";
  var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
  var SERVERS = ["ShowBox", "FebBox"];
  var QUALITIES = ["4K", "1080p", "Original"];
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
  var PROXY_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json"
  };

  function trim(text) {
    return text.replace(/^\s+|\s+$/g, "");
  }

  function pad(value) {
    var text = String(value);
    return text.length < 2 ? "0" + text : text;
  }

  function settings() {
    return (typeof SCRAPER_SETTINGS !== "undefined" && SCRAPER_SETTINGS) || {};
  }

  function decodeBase64(text) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var body = text.replace(/\s+/g, "").replace(/=+$/, "");
    var bytes = [];
    var bits = 0;
    var value = 0;
    var index;
    var i;
    if (body.length % 4 === 1) return null;
    for (i = 0; i < body.length; i++) {
      index = alphabet.indexOf(body.charAt(i));
      if (index < 0) return null;
      value = (value << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((value >> bits) & 255);
        value = value & ((1 << bits) - 1);
      }
    }
    return bytes;
  }

  function toUtf8(bytes) {
    var encoded = "";
    var i;
    for (i = 0; i < bytes.length; i++) encoded += "%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return decodeURIComponent(encoded);
  }

  function asciiBytes(text) {
    var out = [];
    var i;
    for (i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 255);
    return out;
  }

  function table(text) {
    var parts = text.split(" ");
    var out = [];
    var i;
    for (i = 0; i < parts.length; i++) out.push(+parts[i]);
    return out;
  }

  function permute(bits, map) {
    var out = [];
    var i;
    for (i = 0; i < map.length; i++) out.push(bits[map[i] - 1]);
    return out;
  }

  function toBits(bytes) {
    var out = [];
    var i;
    var j;
    for (i = 0; i < bytes.length; i++) {
      for (j = 7; j >= 0; j--) out.push((bytes[i] >> j) & 1);
    }
    return out;
  }

  function fromBits(bits) {
    var out = [];
    var i;
    var j;
    var value;
    for (i = 0; i < bits.length; i += 8) {
      value = 0;
      for (j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
      out.push(value);
    }
    return out;
  }

  function subkeys(keyBytes) {
    var pc1 = table("57 49 41 33 25 17 9 1 58 50 42 34 26 18 10 2 59 51 43 35 27 19 11 3 60 52 44 36 63 55 47 39 31 23 15 7 62 54 46 38 30 22 14 6 61 53 45 37 29 21 13 5 28 20 12 4");
    var pc2 = table("14 17 11 24 1 5 3 28 15 6 21 10 23 19 12 4 26 8 16 7 27 20 13 2 41 52 31 37 47 55 30 40 51 45 33 48 44 49 39 56 34 53 46 42 50 36 29 32");
    var shifts = table("1 1 2 2 2 2 2 2 1 2 2 2 2 2 2 1");
    var permuted = permute(toBits(keyBytes), pc1);
    var left = permuted.slice(0, 28);
    var right = permuted.slice(28);
    var keys = [];
    var i;
    var s;
    for (i = 0; i < 16; i++) {
      for (s = 0; s < shifts[i]; s++) {
        left.push(left.shift());
        right.push(right.shift());
      }
      keys.push(permute(left.concat(right), pc2));
    }
    return keys;
  }

  function desBlock(block, keys) {
    var ip = table("58 50 42 34 26 18 10 2 60 52 44 36 28 20 12 4 62 54 46 38 30 22 14 6 64 56 48 40 32 24 16 8 57 49 41 33 25 17 9 1 59 51 43 35 27 19 11 3 61 53 45 37 29 21 13 5 63 55 47 39 31 23 15 7");
    var fp = table("40 8 48 16 56 24 64 32 39 7 47 15 55 23 63 31 38 6 46 14 54 22 62 30 37 5 45 13 53 21 61 29 36 4 44 12 52 20 60 28 35 3 43 11 51 19 59 27 34 2 42 10 50 18 58 26 33 1 41 9 49 17 57 25");
    var expand = table("32 1 2 3 4 5 4 5 6 7 8 9 8 9 10 11 12 13 12 13 14 15 16 17 16 17 18 19 20 21 20 21 22 23 24 25 24 25 26 27 28 29 28 29 30 31 32 1");
    var mix = table("16 7 20 21 29 12 28 17 1 15 23 26 5 18 31 10 2 8 24 14 32 27 3 9 19 13 30 6 22 11 4 25");
    var boxes = [
      table("14 4 13 1 2 15 11 8 3 10 6 12 5 9 0 7 0 15 7 4 14 2 13 1 10 6 12 11 9 5 3 8 4 1 14 8 13 6 2 11 15 12 9 7 3 10 5 0 15 12 8 2 4 9 1 7 5 11 3 14 10 0 6 13"),
      table("15 1 8 14 6 11 3 4 9 7 2 13 12 0 5 10 3 13 4 7 15 2 8 14 12 0 1 10 6 9 11 5 0 14 7 11 10 4 13 1 5 8 12 6 9 3 2 15 13 8 10 1 3 15 4 2 11 6 7 12 0 5 14 9"),
      table("10 0 9 14 6 3 15 5 1 13 12 7 11 4 2 8 13 7 0 9 3 4 6 10 2 8 5 14 12 11 15 1 13 6 4 9 8 15 3 0 11 1 2 12 5 10 14 7 1 10 13 0 6 9 8 7 4 15 14 3 11 5 2 12"),
      table("7 13 14 3 0 6 9 10 1 2 8 5 11 12 4 15 13 8 11 5 6 15 0 3 4 7 2 12 1 10 14 9 10 6 9 0 12 11 7 13 15 1 3 14 5 2 8 4 3 15 0 6 10 1 13 8 9 4 5 11 12 7 2 14"),
      table("2 12 4 1 7 10 11 6 8 5 3 15 13 0 14 9 14 11 2 12 4 7 13 1 5 0 15 10 3 9 8 6 4 2 1 11 10 13 7 8 15 9 12 5 6 3 0 14 11 8 12 7 1 14 2 13 6 15 0 9 10 4 5 3"),
      table("12 1 10 15 9 2 6 8 0 13 3 4 14 7 5 11 10 15 4 2 7 12 9 5 6 1 13 14 0 11 3 8 9 14 15 5 2 8 12 3 7 0 4 10 1 13 11 6 4 3 2 12 9 5 15 10 11 14 1 7 6 0 8 13"),
      table("4 11 2 14 15 0 8 13 3 12 9 7 5 10 6 1 13 0 11 7 4 9 1 10 14 3 5 12 2 15 8 6 1 4 11 13 12 3 7 14 10 15 6 8 0 5 9 2 6 11 13 8 1 4 10 7 9 5 0 15 14 2 3 12"),
      table("13 2 8 4 6 15 11 1 10 9 3 14 5 0 12 7 1 15 13 8 10 3 7 4 12 5 6 11 0 14 9 2 7 11 4 1 9 12 14 2 0 6 10 13 15 3 5 8 2 1 14 7 4 10 8 13 15 12 9 0 3 5 6 11")
    ];
    var state = permute(block, ip);
    var left = state.slice(0, 32);
    var right = state.slice(32);
    var round;
    var mixed;
    var out;
    var box;
    var row;
    var column;
    var value;
    var next;
    var i;
    var j;
    for (round = 0; round < 16; round++) {
      mixed = permute(right, expand);
      for (i = 0; i < 48; i++) mixed[i] ^= keys[round][i];
      out = [];
      for (box = 0; box < 8; box++) {
        row = (mixed[box * 6] << 1) | mixed[box * 6 + 5];
        column = (mixed[box * 6 + 1] << 3) | (mixed[box * 6 + 2] << 2) | (mixed[box * 6 + 3] << 1) | mixed[box * 6 + 4];
        value = boxes[box][row * 16 + column];
        for (j = 3; j >= 0; j--) out.push((value >> j) & 1);
      }
      out = permute(out, mix);
      next = [];
      for (i = 0; i < 32; i++) next.push(left[i] ^ out[i]);
      left = right;
      right = next;
    }
    return permute(right.concat(left), fp);
  }

  function tripleDesDecrypt(cipher, key, iv) {
    var k1 = subkeys(key.slice(0, 8));
    var k2 = subkeys(key.slice(8, 16));
    var k3 = subkeys(key.slice(16, 24));
    var reversed1 = k1.slice(0).reverse();
    var reversed3 = k3.slice(0).reverse();
    var previous = iv.slice(0);
    var plain = [];
    var block;
    var step;
    var i;
    var j;
    if (cipher.length % 8 !== 0) return null;
    for (i = 0; i < cipher.length; i += 8) {
      block = cipher.slice(i, i + 8);
      step = fromBits(desBlock(toBits(block), reversed3));
      step = fromBits(desBlock(toBits(step), k2));
      step = fromBits(desBlock(toBits(step), reversed1));
      for (j = 0; j < 8; j++) plain.push(step[j] ^ previous[j]);
      previous = block;
    }
    return plain;
  }

  function parseToken(raw) {
    var token = trim(String(raw));
    var bytes;
    var parsed;
    var cipher;
    var plain;
    var pad;
    var data;
    if (!token) return "";
    if (token.indexOf("eyJ") !== 0) return token;
    try {
      bytes = decodeBase64(token);
      parsed = JSON.parse(toUtf8(bytes));
      if (parsed && parsed.encrypt_data) {
        cipher = decodeBase64(String(parsed.encrypt_data));
        plain = tripleDesDecrypt(cipher, asciiBytes("123d6cedf626dy54233aa1w6"), asciiBytes("wEiphTn!"));
        pad = plain[plain.length - 1];
        if (pad >= 1 && pad <= 8) plain = plain.slice(0, plain.length - pad);
        data = JSON.parse(toUtf8(plain));
        if (data && data.uid) return String(data.uid);
      }
    } catch (error) {
      return token;
    }
    return token;
  }

  function readTokens() {
    var values = settings();
    var raw = [];
    var parts;
    var seen = {};
    var out = [];
    var token;
    var i;
    if (values.uiToken) raw.push(String(values.uiToken));
    if (values.uiTokens) raw.push(String(values.uiTokens));
    parts = raw.join(",").split(/[,\n]+/);
    for (i = 0; i < parts.length; i++) {
      token = parseToken(parts[i]);
      if (!token || seen["t_" + token] === true) continue;
      seen["t_" + token] = true;
      out.push(token);
    }
    return out;
  }

  function buildQuery(tmdbId, mediaType, seasonNum, episodeNum) {
    var id = trim(String(tmdbId));
    var tokens;
    if (mediaType === undefined) mediaType = "movie";
    if (seasonNum === undefined) seasonNum = null;
    if (episodeNum === undefined) episodeNum = null;
    if (!/^\d+$/.test(id) || parseInt(id, 10) <= 0) return null;
    if (mediaType === "tv") {
      if (seasonNum == null || episodeNum == null) return null;
      if (isNaN(parseInt(trim(String(seasonNum)), 10)) || isNaN(parseInt(trim(String(episodeNum)), 10))) return null;
      if (parseInt(trim(String(seasonNum)), 10) < 1 || parseInt(trim(String(episodeNum)), 10) < 1) return null;
    }
    tokens = readTokens();
    if (!tokens.length) return null;
    return {
      id: tmdbId,
      isTv: mediaType === "tv",
      season: seasonNum,
      episode: episodeNum,
      tokens: tokens,
      apiBase: settings().apiBase ? String(settings().apiBase) : BASE_URL
    };
  }

  function qualityOf(label) {
    var upper;
    var match;
    var height;
    if (!label) return "Unknown";
    upper = label.toUpperCase();
    if (upper === "ORG" || upper === "ORIGINAL") return "Original";
    if (upper === "4K" || upper === "2160P") return "4K";
    if (upper === "1440P" || upper === "2K") return "1440p";
    if (upper === "1080P" || upper === "FHD") return "1080p";
    if (upper === "720P" || upper === "HD") return "720p";
    if (upper === "480P" || upper === "SD") return "480p";
    if (upper === "360P") return "360p";
    if (upper === "240P") return "240p";
    match = label.match(/(\d{3,4})[pP]?/);
    if (!match) return "Unknown";
    height = parseInt(match[1], 10);
    if (height >= 2160) return "4K";
    if (height >= 1440) return "1440p";
    if (height >= 1080) return "1080p";
    if (height >= 720) return "720p";
    if (height >= 480) return "480p";
    if (height >= 360) return "360p";
    return "240p";
  }

  function sizeLabel(size) {
    var gb;
    if (!size) return "Unknown";
    if (typeof size === "string" && /GB|MB|KB/.test(size)) return size;
    if (typeof size === "number") {
      gb = size / (1024 * 1024 * 1024);
      return gb >= 1 ? gb.toFixed(2) + " GB" : (size / (1024 * 1024)).toFixed(2) + " MB";
    }
    return String(size);
  }

  function fetchDetails(query) {
    var fallback = { title: "TMDB ID " + query.id, year: null };
    return Promise.resolve()
      .then(function () { return fetch(TMDB_API + "/" + (query.isTv ? "tv" : "movie") + "/" + query.id + "?api_key=" + TMDB_KEY); })
      .then(function (res) {
        if (!res.ok) return fallback;
        return res.json().then(function (data) {
          var date = query.isTv ? data.first_air_date : data.release_date;
          return {
            title: query.isTv ? data.name : data.title,
            year: date ? parseInt(date.split("-")[0], 10) : null
          };
        });
      })
      .then(null, function () { return fallback; });
  }

  function probe(url, token) {
    var headers = {};
    var key;
    for (key in PROXY_HEADERS) {
      if (Object.prototype.hasOwnProperty.call(PROXY_HEADERS, key)) headers[key] = PROXY_HEADERS[key];
    }
    headers["X-FebBox-Token"] = token;
    return Promise.resolve()
      .then(function () { return fetch(url, { headers: headers }); })
      .then(function (res) {
        if (res.ok) return res.json().then(function (data) { return { state: "ok", data: data, token: token }; });
        if (res.status === 401 || res.status === 403 || res.status === 429) return { state: "skip" };
        return { state: "stop" };
      })
      .then(null, function () { return { state: "skip" }; });
  }

  function fetchProxy(query) {
    var url = query.isTv && query.season && query.episode
      ? query.apiBase + "/tv/" + query.id + "/" + query.season + "/" + query.episode
      : query.apiBase + "/movie/" + query.id;
    return Promise.all(query.tokens.map(function (token) { return probe(url, token); })).then(function (results) {
      var i;
      for (i = 0; i < results.length; i++) {
        if (results[i].state === "ok") return results[i];
        if (results[i].state === "stop") return null;
      }
      return null;
    });
  }

  function readJson(url, headers) {
    return Promise.resolve()
      .then(function () { return fetch(url, headers ? { headers: headers } : undefined); })
      .then(function (res) { return res.json(); })
      .then(null, function () { return null; });
  }

  function decode(text) {
    return text.replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  function attrOf(tag, name) {
    var match = tag.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
    if (!match) return "";
    return decode(match[1] !== undefined ? match[1] : match[2]);
  }

  function closeOf(html, tag, from) {
    var pattern = new RegExp("<(/?)" + tag + "\\b[^>]*>", "gi");
    var depth = 1;
    var match;
    pattern.lastIndex = from;
    match = pattern.exec(html);
    while (match) {
      if (match[1]) {
        depth--;
        if (depth === 0) return match.index;
      } else if (match[0].slice(-2) !== "/>") {
        depth++;
      }
      match = pattern.exec(html);
    }
    return html.length;
  }

  function byClass(html, name, tag) {
    var pattern = new RegExp("<(" + tag + ")\\b[^>]*\\sclass\\s*=\\s*[\"'](?:[^\"']*\\s)?" + name + "(?:\\s[^\"']*)?[\"'][^>]*>", "gi");
    var out = [];
    var open = pattern.exec(html);
    var start;
    while (open) {
      start = open.index + open[0].length;
      out.push({ open: open[0], inner: html.slice(start, closeOf(html, open[1].toLowerCase(), start)) });
      open = pattern.exec(html);
    }
    return out;
  }

  function textOf(html) {
    return decode(html.replace(/<[^>]*>/g, ""));
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

  function fileStreams(file, shareKey, cookie) {
    var headers = {
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.8",
      "Connection": "keep-alive",
      "Referer": "https://www.febbox.com/",
      "User-Agent": USER_AGENT
    };
    return readJson("https://www.febbox.com/console/video_quality_list?fid=" + file.fid + "&share_key=" + shareKey, { "Cookie": cookie }).then(function (data) {
      var found;
      var streams = [];
      var url;
      var quality;
      var i;
      if (!data || !data.html) return [];
      found = byClass(data.html, "file_quality", "div");
      for (i = 0; i < found.length; i++) {
        url = attrOf(found[i].open, "data-url");
        if (!url) continue;
        quality = qualityOf(attrOf(found[i].open, "data-quality"));
        if (QUALITIES.indexOf(quality) === -1) continue;
        streams.push({
          name: SERVERS[1] + " \u2022  " + quality,
          title: SERVERS[1] + " \u2022  " + quality,
          url: url,
          quality: quality,
          size: trim(byClass(found[i].inner, "size", "[a-z0-9]+").map(function (node) { return textOf(node.inner); }).join("")) || file.file_size || "Unknown",
          headers: headers
        });
      }
      return streams;
    }).then(null, function () { return []; });
  }

  function shareStreams(showboxId, query, token) {
    var shareUrl = "https://www.febbox.com/mbp/to_share_page?box_type=" + (query.isTv ? 2 : 1) + "&mid=" + showboxId + "&json=1";
    var cookie = token.indexOf("ui=") === 0 ? token : "ui=" + token;
    return readJson(shareUrl).then(function (share) {
      var link;
      var key;
      if (!share || share.code !== 1 || !share.data) return [];
      link = share.data.share_link || share.data.shareLink;
      if (!link || !/^[a-z][a-z0-9+.\-]*:\/\/[^\/]*/i.test(link)) return [];
      key = link.replace(/^[a-z][a-z0-9+.\-]*:\/\/[^\/]*/i, "").replace(/[?#].*$/, "").split("/").pop();
      if (!key) return [];
      return readJson("https://www.febbox.com/file/file_share_list?share_key=" + key, { "Accept-Language": "en" }).then(function (list) {
        var folder;
        var i;
        if (!list || list.code !== 1 || !list.data || !list.data.file_list) return [];
        if (!query.isTv) return gather(list.data.file_list.map(function (file) { return fileStreams(file, key, cookie); }), 6);
        for (i = 0; i < list.data.file_list.length; i++) {
          if (list.data.file_list[i].file_name && list.data.file_list[i].file_name.toLowerCase() === "season " + query.season) {
            folder = list.data.file_list[i];
            break;
          }
        }
        if (!folder) return [];
        return readJson("https://www.febbox.com/file/file_share_list?share_key=" + key + "&parent_id=" + folder.fid + "&page=1", { "Accept-Language": "en" }).then(function (episodes) {
          var files;
          var first = "s" + pad(query.season) + "e" + pad(query.episode);
          var second = "s" + query.season + "e" + query.episode;
          if (!episodes || episodes.code !== 1 || !episodes.data || !episodes.data.file_list) return [];
          files = episodes.data.file_list.filter(function (file) {
            return file.file_name && (file.file_name.toLowerCase().indexOf(first) !== -1 || file.file_name.toLowerCase().indexOf(second) !== -1);
          });
          return gather(files.map(function (file) { return fileStreams(file, key, cookie); }), 6);
        });
      });
    }).then(null, function () { return []; });
  }

  function showboxStreams(data, info, query) {
    var streams = [];
    var title = info.title || "Unknown Title";
    var versions;
    var links;
    var quality;
    var name;
    var i;
    var j;
    if (!data || data.success !== true) return streams;
    if (!Array.isArray(data.versions) || !data.versions.length) return streams;
    if (info.year) title += " (" + info.year + ")";
    if (query.isTv && query.season && query.episode) {
      title = (info.title || "Unknown") + " S" + pad(query.season) + "E" + pad(query.episode);
      if (info.year) title += " (" + info.year + ")";
    }
    versions = data.versions;
    for (i = 0; i < versions.length; i++) {
      links = versions[i].links;
      if (!Array.isArray(links)) continue;
      for (j = 0; j < links.length; j++) {
        if (!links[j].url) continue;
        quality = qualityOf(links[j].quality || "Unknown");
        if (QUALITIES.indexOf(quality) === -1) continue;
        name = SERVERS[0];
        if (versions.length > 1) name += " V" + (i + 1);
        streams.push({
          name: name + " " + quality,
          title: title,
          url: links[j].url,
          quality: quality,
          size: sizeLabel(links[j].size || versions[i].size || "Unknown"),
          speed: links[j].speed || null
        });
      }
    }
    return streams;
  }

  var query = buildQuery(tmdbId, mediaType, seasonNum, episodeNum);
  if (!query) return Promise.resolve([]);

  return Promise.all([fetchDetails(query), fetchProxy(query)])
    .then(function (replies) {
      var result = replies[1];
      var streams;
      var showboxId;
      var seen = {};
      if (!result) return [];
      streams = showboxStreams(result.data, replies[0], query);
      showboxId = (result.data.id || result.data.mid) || (result.data.data && (result.data.data.id || result.data.data.mid)) || null;
      return (showboxId ? shareStreams(showboxId, query, result.token) : Promise.resolve([])).then(function (direct) {
        return streams.concat(direct).filter(function (stream) {
          if (!stream.url || seen[stream.url] === true) return false;
          seen[stream.url] = true;
          return true;
        });
      });
    })
    .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };