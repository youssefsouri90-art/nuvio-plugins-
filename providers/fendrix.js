function getStreams(tmdbId, mediaType, season, episode) {
  var BASE_URL = "https://cinejoy.pk";
  var API_BASE = ["https://api.wing.st", "https://api.shegu.st"];
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
  var HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36" };
  var SERVERS = ["Nebula", "Secret"];

  function fetchResponse(url, options) {
    return Promise.resolve()
      .then(function () { return fetch(url, options); })
      .then(null, function () { return null; });
  }

  function fetchJson(url, options) {
    return fetchResponse(url, options).then(function (res) {
      if (!res || !res.ok) return null;
      return res.json().then(null, function () { return null; });
    });
  }

  function fetchText(url, options) {
    return fetchResponse(url, options).then(function (res) {
      if (!res || !res.ok) return null;
      return res.text().then(null, function () { return null; });
    });
  }

  function isCount(value) {
    return isFinite(value) && Math.floor(value) === value && value >= 1;
  }

  function buildQuery() {
    var normalizedId = String(tmdbId || "").trim();
    var normalizedType = String(mediaType || "").toLowerCase().trim();
    if (!/^\d+$/.test(normalizedId)) return null;
    if (normalizedType !== "movie" && normalizedType !== "tv") return null;
    if (normalizedType === "tv" && (season == null || episode == null)) return null;
    var seasonNumber = normalizedType === "tv" ? Number(season) : 1;
    var episodeNumber = normalizedType === "tv" ? Number(episode) : 1;
    if (normalizedType === "tv" && (!isCount(seasonNumber) || !isCount(episodeNumber))) return null;
    return {
      normalizedId: normalizedId,
      normalizedType: normalizedType,
      seasonNumber: seasonNumber,
      episodeNumber: episodeNumber
    };
  }

  function fetchTmdbMediaDetails(tmdbId, mediaType) {
    var normalizedType = mediaType === "tv" ? "tv" : "movie";
    var url = TMDB_API + "/" + normalizedType + "/" + tmdbId + "?api_key=" + encodeURIComponent(TMDB_KEY) + "&append_to_response=external_ids";
    var options = { headers: { "Accept": "application/json", "User-Agent": HEADERS["User-Agent"] } };
    return fetchJson(url, options).then(function (payload) {
      var title = normalizedType === "tv"
        ? payload && (payload.name || payload.original_name)
        : payload && (payload.title || payload.original_title);
      var releaseDate = payload && (normalizedType === "tv" ? payload.first_air_date : payload.release_date);
      var externalIds = payload && payload.external_ids;
      return {
        title: title || "",
        year: releaseDate ? String(releaseDate).slice(0, 4) : "",
        imdbId: (externalIds && externalIds.imdb_id) || ""
      };
    });
  }

  function decodeBase64(encodedValue) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var data = String(encodedValue).replace(/[\t\n\f\r ]/g, "");
    if (data.length % 4 === 0) data = data.replace(/==?$/, "");
    if (data.length % 4 === 1 || /[^A-Za-z0-9+\/]/.test(data)) throw new Error("base64");
    var byteArray = [];
    var buffer = 0;
    var bits = 0;
    for (var i = 0; i < data.length; i++) {
      buffer = (buffer << 6) | alphabet.indexOf(data.charAt(i));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        byteArray.push((buffer >> bits) & 255);
        buffer = buffer & ((1 << bits) - 1);
      }
    }
    return byteArray;
  }

  function decodeBase64ToBytes(encodedValue) {
    var normalized = String(encodedValue || "").replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    return decodeBase64(normalized);
  }

  function decodeUtf8(byteArray) {
    var text = "";
    var i = byteArray[0] === 239 && byteArray[1] === 187 && byteArray[2] === 191 ? 3 : 0;
    while (i < byteArray.length) {
      var first = byteArray[i++];
      var extra = first >= 194 && first <= 223 ? 1 : first >= 224 && first <= 239 ? 2 : first >= 240 && first <= 244 ? 3 : 0;
      if (first < 128) {
        text += String.fromCharCode(first);
        continue;
      }
      if (!extra) {
        text += "\uFFFD";
        continue;
      }
      var point = first & (63 >> extra);
      var valid = true;
      for (var k = 0; k < extra; k++) {
        var next = byteArray[i + k];
        if (next === undefined || (next & 192) !== 128) {
          valid = false;
          break;
        }
        point = (point << 6) | (next & 63);
      }
      var floor = extra === 1 ? 128 : extra === 2 ? 2048 : 65536;
      if (!valid || point < floor || point > 1114111 || (point >= 55296 && point <= 57343)) {
        text += "\uFFFD";
        continue;
      }
      i += extra;
      if (point >= 65536) {
        point -= 65536;
        text += String.fromCharCode(55296 + (point >> 10), 56320 + (point & 1023));
      } else {
        text += String.fromCharCode(point);
      }
    }
    return text;
  }

  function convertBytesToWords(byteArray) {
    var words = [];
    for (var i = 0; i < 4; i++) {
      var at = i * 4;
      words.push((((byteArray[at] || 0) << 24) | ((byteArray[at + 1] || 0) << 16) | ((byteArray[at + 2] || 0) << 8) | (byteArray[at + 3] || 0)) >>> 0);
    }
    return words;
  }

  function convertWordsToBytes(words) {
    var byteArray = [];
    for (var i = 0; i < 4; i++) {
      byteArray.push((words[i] >>> 24) & 255, (words[i] >>> 16) & 255, (words[i] >>> 8) & 255, words[i] & 255);
    }
    return byteArray;
  }

  function xtime(x) {
    return ((x << 1) ^ ((x & 128) ? 27 : 0)) & 255;
  }

  function buildSbox() {
    function rotateLeft(value, shift) {
      return ((value << shift) | (value >> (8 - shift))) & 255;
    }
    var box = [];
    var p = 1;
    var q = 1;
    do {
      p = (p ^ (p << 1) ^ ((p & 128) ? 27 : 0)) & 255;
      q = (q ^ (q << 1)) & 255;
      q = (q ^ (q << 2)) & 255;
      q = (q ^ (q << 4)) & 255;
      if (q & 128) q ^= 9;
      box[p] = (q ^ rotateLeft(q, 1) ^ rotateLeft(q, 2) ^ rotateLeft(q, 3) ^ rotateLeft(q, 4) ^ 99) & 255;
    } while (p !== 1);
    box[0] = 99;
    return box;
  }

  var AES_SBOX = buildSbox();

  function rotateWord(word) { return [word[1], word[2], word[3], word[0]]; }
  function substituteWord(word) { return word.map(function (byte) { return AES_SBOX[byte]; }); }

  function expandAesKeySchedule(rawKey) {
    var keyWords = rawKey.length / 4;
    var numRounds = keyWords + 6;
    var roundWords = new Array(4 * (numRounds + 1));
    var i;
    for (i = 0; i < keyWords; i++) {
      roundWords[i] = [rawKey[i * 4], rawKey[i * 4 + 1], rawKey[i * 4 + 2], rawKey[i * 4 + 3]];
    }
    var rconValue = 1;
    for (i = keyWords; i < roundWords.length; i++) {
      var temp = roundWords[i - 1].slice();
      if (i % keyWords === 0) {
        temp = substituteWord(rotateWord(temp));
        temp[0] ^= rconValue;
        rconValue = xtime(rconValue);
      } else if (keyWords > 6 && i % keyWords === 4) {
        temp = substituteWord(temp);
      }
      var prevWord = roundWords[i - keyWords];
      roundWords[i] = [prevWord[0] ^ temp[0], prevWord[1] ^ temp[1], prevWord[2] ^ temp[2], prevWord[3] ^ temp[3]];
    }
    return { roundWords: roundWords, numRounds: numRounds };
  }

  function xorRoundKey(state, roundWords, roundIndex) {
    for (var col = 0; col < 4; col++) {
      var word = roundWords[roundIndex * 4 + col];
      var offset = col * 4;
      state[offset] ^= word[0];
      state[offset + 1] ^= word[1];
      state[offset + 2] ^= word[2];
      state[offset + 3] ^= word[3];
    }
  }

  function mixSingleColumn(state, offset) {
    var b0 = state[offset], b1 = state[offset + 1], b2 = state[offset + 2], b3 = state[offset + 3];
    state[offset] = xtime(b0) ^ (xtime(b1) ^ b1) ^ b2 ^ b3;
    state[offset + 1] = b0 ^ xtime(b1) ^ (xtime(b2) ^ b2) ^ b3;
    state[offset + 2] = b0 ^ b1 ^ xtime(b2) ^ (xtime(b3) ^ b3);
    state[offset + 3] = (xtime(b0) ^ b0) ^ b1 ^ b2 ^ xtime(b3);
  }

  function subBytesShiftRows(state) {
    var i;
    for (i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];
    var shifted = [
      state[0], state[5], state[10], state[15],
      state[4], state[9], state[14], state[3],
      state[8], state[13], state[2], state[7],
      state[12], state[1], state[6], state[11]
    ];
    for (i = 0; i < 16; i++) state[i] = shifted[i];
  }

  function aesEncryptBlock(plainBlock, keySchedule) {
    var state = plainBlock.slice();
    var roundWords = keySchedule.roundWords;
    var numRounds = keySchedule.numRounds;
    xorRoundKey(state, roundWords, 0);
    for (var round = 1; round < numRounds; round++) {
      subBytesShiftRows(state);
      for (var i = 0; i < 16; i += 4) mixSingleColumn(state, i);
      xorRoundKey(state, roundWords, round);
    }
    subBytesShiftRows(state);
    xorRoundKey(state, roundWords, numRounds);
    return state;
  }

  function ghashFieldMultiply(x, y) {
    var product = [0, 0, 0, 0];
    var shifted = x.slice();
    for (var bit = 0; bit < 128; bit++) {
      if ((y[bit >> 5] >>> (31 - (bit & 31))) & 1) {
        product[0] = (product[0] ^ shifted[0]) >>> 0;
        product[1] = (product[1] ^ shifted[1]) >>> 0;
        product[2] = (product[2] ^ shifted[2]) >>> 0;
        product[3] = (product[3] ^ shifted[3]) >>> 0;
      }
      var lowBit = shifted[3] & 1;
      shifted[3] = ((shifted[3] >>> 1) | (shifted[2] << 31)) >>> 0;
      shifted[2] = ((shifted[2] >>> 1) | (shifted[1] << 31)) >>> 0;
      shifted[1] = ((shifted[1] >>> 1) | (shifted[0] << 31)) >>> 0;
      shifted[0] = shifted[0] >>> 1;
      if (lowBit) shifted[0] = (shifted[0] ^ 3774873600) >>> 0;
    }
    return product;
  }

  function ghashProcessBlocks(accumulatedHash, hashSubkey, dataBlock) {
    for (var i = 0; i < dataBlock.length; i += 16) {
      var blockBuffer = convertBytesToWords(dataBlock.slice(i, i + 16));
      accumulatedHash = ghashFieldMultiply([
        (accumulatedHash[0] ^ blockBuffer[0]) >>> 0,
        (accumulatedHash[1] ^ blockBuffer[1]) >>> 0,
        (accumulatedHash[2] ^ blockBuffer[2]) >>> 0,
        (accumulatedHash[3] ^ blockBuffer[3]) >>> 0
      ], hashSubkey);
    }
    return accumulatedHash;
  }

  function incrementCounter(counterBlock) {
    var incremented = counterBlock.slice();
    for (var i = 15; i >= 12; i--) {
      incremented[i] = (incremented[i] + 1) & 255;
      if (incremented[i]) break;
    }
    return incremented;
  }

  function timingSafeByteEqual(bufferA, bufferB) {
    var mismatch = 0;
    for (var i = 0; i < bufferA.length; i++) mismatch |= bufferA[i] ^ bufferB[i];
    return mismatch === 0;
  }

  function aesGcmDecrypt(ciphertext, encryptionKey, initVector, additionalAuthData) {
    if (initVector.length !== 12 || ciphertext.length < 16) throw new Error("Invalid AES-GCM input");
    var keySchedule = expandAesKeySchedule(encryptionKey);
    var hashSubkey = convertBytesToWords(aesEncryptBlock([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], keySchedule));
    var counterJ0 = initVector.concat([0, 0, 0, 1]);
    var ciphertextBody = ciphertext.slice(0, ciphertext.length - 16);
    var authTag = ciphertext.slice(ciphertext.length - 16);
    var ghashAccumulator = [0, 0, 0, 0];
    ghashAccumulator = ghashProcessBlocks(ghashAccumulator, hashSubkey, additionalAuthData);
    ghashAccumulator = ghashProcessBlocks(ghashAccumulator, hashSubkey, ciphertextBody);
    var aadBitLength = additionalAuthData.length * 8;
    var dataBitLength = ciphertextBody.length * 8;
    var lengthBlock = convertWordsToBytes([
      Math.floor(aadBitLength / 4294967296), aadBitLength % 4294967296,
      Math.floor(dataBitLength / 4294967296), dataBitLength % 4294967296
    ]);
    ghashAccumulator = ghashProcessBlocks(ghashAccumulator, hashSubkey, lengthBlock);
    var ghashResult = convertWordsToBytes(ghashAccumulator);
    var encryptedCounter = aesEncryptBlock(counterJ0, keySchedule);
    var expectedAuthTag = [];
    for (var i = 0; i < 16; i++) expectedAuthTag[i] = encryptedCounter[i] ^ ghashResult[i];
    if (!timingSafeByteEqual(authTag, expectedAuthTag)) throw new Error("aes-gcm: invalid tag");
    var plaintextOut = [];
    var counter = incrementCounter(counterJ0);
    for (var offset = 0; offset < ciphertextBody.length; offset += 16) {
      var keystream = aesEncryptBlock(counter, keySchedule);
      var chunkLength = Math.min(16, ciphertextBody.length - offset);
      for (var j = 0; j < chunkLength; j++) plaintextOut[offset + j] = ciphertextBody[offset + j] ^ keystream[j];
      counter = incrementCounter(counter);
    }
    return plaintextOut;
  }

  function decryptSealedResponse(encryptedData, sealedSession) {
    var initVector = encryptedData.slice(0, 12);
    var ciphertext = encryptedData.slice(12);
    var plaintext = aesGcmDecrypt(ciphertext, sealedSession.responseKey, initVector, sealedSession.aad);
    return decodeUtf8(plaintext);
  }

  function createEncryptedSession(streamRequestParams) {
    var isTv = streamRequestParams.isTv;
    var sheguApiUrl = "https://api.shegu.xyz/?type=" + (isTv ? "series" : "movie") + "&tmdb=" + streamRequestParams.tmdbId + "&server=" + streamRequestParams.server;
    if (isTv) sheguApiUrl += "&season=" + streamRequestParams.season + "&episode=" + streamRequestParams.episode;
    if (streamRequestParams.title) sheguApiUrl += "&title=" + encodeURIComponent(streamRequestParams.title);
    if (streamRequestParams.year) sheguApiUrl += "&year=" + streamRequestParams.year;
    if (streamRequestParams.imdbId) sheguApiUrl += "&imdb=" + streamRequestParams.imdbId;
    var proxyUrl = "https://enc-dec.app/api/enc-cinejoy?url=" + encodeURIComponent(sheguApiUrl);
    var options = { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } };
    return fetchJson(proxyUrl, options).then(function (responseJson) {
      if (!responseJson || responseJson.status !== 200 || !responseJson.result) return null;
      return {
        body: decodeBase64ToBytes(responseJson.result.data),
        responseKey: decodeBase64ToBytes(responseJson.result.state.responseKey),
        aad: decodeBase64ToBytes(responseJson.result.state.aad)
      };
    });
  }

  function resolveUrl(url, base) {
    if (url.indexOf("http") === 0) return url;
    var parts = base.match(/^([a-z][a-z0-9+.\-]*:)\/\/([^\/?#]*)([^?#]*)/i);
    if (!parts) throw new Error("url");
    var origin = parts[1] + "//" + parts[2];
    if (url.indexOf("//") === 0) return parts[1] + url;
    var path = url.indexOf("/") === 0 ? url : parts[3].slice(0, parts[3].lastIndexOf("/") + 1) + url;
    var tail = path.match(/[?#][\s\S]*$/);
    var segments = path.replace(/[?#][\s\S]*$/, "").split("/");
    var resolved = [];
    segments.forEach(function (segment, index) {
      var last = index === segments.length - 1;
      if (segment === "." || segment === "..") {
        if (segment === ".." && resolved.length > 1) resolved.pop();
        if (last) resolved.push("");
        return;
      }
      resolved.push(segment);
    });
    return origin + resolved.join("/") + (tail ? tail[0] : "");
  }

  function extractHlsVariants(masterPlaylistText, masterPlaylistUrl) {
    var variants = [];
    var lines = masterPlaylistText.split("\n");
    var pendingStreamInfo = null;
    lines.forEach(function (rawLine) {
      var line = rawLine.trim();
      if (line.indexOf("#EXT-X-STREAM-INF:") === 0) {
        var resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
        pendingStreamInfo = { height: resolutionMatch ? Number(resolutionMatch[2]) : 0 };
      } else if (line && line.indexOf("#") !== 0 && pendingStreamInfo) {
        variants.push({ height: pendingStreamInfo.height, url: resolveUrl(line, masterPlaylistUrl) });
        pendingStreamInfo = null;
      }
    });
    return variants;
  }

  function normalizeQualityLabel(rawValue) {
    var normalized = String(rawValue || "").toLowerCase();
    if (normalized.indexOf("2160") !== -1 || normalized.indexOf("4k") !== -1) return "2160p";
    if (normalized.indexOf("1080") !== -1 || normalized.indexOf("fhd") !== -1) return "1080p";
    return "Auto";
  }

  function isHighValueQuality(rawValue) {
    return normalizeQualityLabel(rawValue) !== "Auto";
  }

  function normalizeSubtitleTracks(rawTracks) {
    if (!Array.isArray(rawTracks)) return [];
    return rawTracks.map(function (track) {
      var label = track && (track.language || track.id);
      return {
        url: track && typeof track.url === "string" ? track.url.trim() : "",
        language: String(label || "en").toLowerCase(),
        name: String(label || "Subtitle")
      };
    }).filter(function (track) { return track.url; });
  }

  function deduplicateAndCleanStreams(streamList) {
    var seenUrls = Object.create(null);
    var deduplicated = [];
    streamList.forEach(function (stream) {
      if (seenUrls[stream.url]) return;
      seenUrls[stream.url] = true;
      var cleaned = {};
      Object.keys(stream).forEach(function (key) { cleaned[key] = stream[key]; });
      if (!cleaned.subtitles.length) delete cleaned.subtitles;
      deduplicated.push(cleaned);
    });
    return deduplicated;
  }

  function resolveStreamItem(item, streamRequestHeaders) {
    var subtitleTracks = normalizeSubtitleTracks(item.captions);
    var streamName = "Cinejoy \u2022 " + (item.sourceServer || SERVERS[0]);
    var resolvedStreams = [];

    function buildStream(url, quality) {
      return {
        name: streamName,
        title: streamName,
        url: url,
        quality: quality,
        headers: streamRequestHeaders,
        subtitles: subtitleTracks
      };
    }

    if (item.type === "hls" && item.playlist) {
      return fetchText(item.playlist, { headers: streamRequestHeaders }).then(function (masterPlaylistText) {
        if (masterPlaylistText === null) return resolvedStreams;
        var variants = extractHlsVariants(masterPlaylistText, item.playlist);
        if (/#EXT-X-MEDIA\s*:\s*TYPE=AUDIO/i.test(masterPlaylistText)) {
          var maxHeight = 0;
          variants.forEach(function (variant) {
            if (variant.height > maxHeight) maxHeight = variant.height;
          });
          var masterQuality = maxHeight >= 2160 ? "2160p" : maxHeight === 1080 ? "1080p" : maxHeight === 720 ? "720p" : undefined;
          resolvedStreams.push(buildStream(item.playlist, masterQuality));
        } else {
          variants.forEach(function (variant) {
            if (variant.height !== 2160 && variant.height !== 1080) return;
            resolvedStreams.push(buildStream(variant.url, variant.height === 2160 ? "2160p" : "1080p"));
          });
        }
        return resolvedStreams;
      }).then(null, function () { return []; });
    }

    if (item.type === "file" && item.qualities && typeof item.qualities === "object") {
      Object.keys(item.qualities).forEach(function (qualityKey) {
        var entry = item.qualities[qualityKey];
        var qualityUrl = entry && entry.url;
        if (!qualityUrl || String(qualityUrl).indexOf("http") !== 0 || !isHighValueQuality(qualityKey)) return;
        resolvedStreams.push(buildStream(qualityUrl, normalizeQualityLabel(qualityKey)));
      });
    }
    return Promise.resolve(resolvedStreams);
  }

  function resolveStreamItems(rawItems, streamRequestHeaders) {
    var resolutionTasks = (Array.isArray(rawItems) ? rawItems : [])
      .filter(function (item) { return item && typeof item === "object"; })
      .map(function (item) {
        return Promise.resolve()
          .then(function () { return resolveStreamItem(item, streamRequestHeaders); })
          .then(null, function () { return []; });
      });
    return Promise.all(resolutionTasks).then(function (settledResults) {
      return deduplicateAndCleanStreams([].concat.apply([], settledResults));
    });
  }

  function getResolutionWeight(quality) {
    var normalizedQuality = String(quality || "").toUpperCase();
    if (normalizedQuality === "2160P") return 2;
    if (normalizedQuality === "1080P") return 1;
    return 0;
  }

  function getInvertedSortTag(score, maxScore) {
    maxScore = maxScore || 999999;
    var val = Math.max(0, parseInt(score, 10) || 0);
    var inv = Math.max(0, maxScore - val);
    var bin = inv.toString(2);
    while (bin.length < 20) bin = "0" + bin;
    var chars = [];
    for (var i = 0; i < bin.length; i++) {
      chars.push(bin.charAt(i) === "1" ? "\uFEFF" : "\u200B");
    }
    return chars.join("");
  }

  function readEndpoint(endpoint, requestOptions, sealedSession, serverName) {
    return fetchResponse(endpoint + "/g", requestOptions).then(function (apiResponse) {
      if (!apiResponse || !apiResponse.ok) return null;
      return apiResponse.arrayBuffer().then(function (buffer) {
        var encryptedBytes = Array.prototype.slice.call(new Uint8Array(buffer));
        var payload = JSON.parse(decryptSealedResponse(encryptedBytes, sealedSession));
        var streamItems = (payload && payload.data && payload.data.stream) || [];
        if (!Array.isArray(streamItems)) return null;
        return streamItems
          .filter(function (streamItem) { return streamItem && typeof streamItem === "object"; })
          .map(function (streamItem) {
            var copy = {};
            Object.keys(streamItem).forEach(function (key) { copy[key] = streamItem[key]; });
            copy.sourceServer = serverName;
            return copy;
          });
      });
    }).then(null, function () { return null; });
  }

  function readServer(serverName, query, tmdbDetails, streamRequestHeaders) {
    return createEncryptedSession({
      server: serverName,
      isTv: query.normalizedType === "tv",
      tmdbId: query.normalizedId,
      season: query.seasonNumber,
      episode: query.episodeNumber,
      title: tmdbDetails.title,
      year: tmdbDetails.year,
      imdbId: tmdbDetails.imdbId
    }).then(function (sealedSession) {
      if (!sealedSession) return [];
      var requestOptions = {
        method: "POST",
        body: new Uint8Array(sealedSession.body),
        headers: {
          "Origin": streamRequestHeaders["Origin"],
          "Referer": streamRequestHeaders["Referer"],
          "User-Agent": streamRequestHeaders["User-Agent"],
          "Content-Type": "application/octet-stream"
        }
      };
      return Promise.all(API_BASE.map(function (endpoint) {
        return readEndpoint(endpoint, requestOptions, sealedSession, serverName);
      })).then(function (slots) {
        for (var i = 0; i < slots.length; i++) {
          if (slots[i]) return slots[i];
        }
        return [];
      });
    }).then(null, function () { return []; });
  }

  var query = buildQuery();
  if (!query) return Promise.resolve([]);

  var streamRequestHeaders = {
    "Origin": BASE_URL,
    "Referer": BASE_URL + "/",
    "User-Agent": HEADERS["User-Agent"]
  };

  return fetchTmdbMediaDetails(query.normalizedId, query.normalizedType)
    .then(function (tmdbDetails) {
      return Promise.all(SERVERS.map(function (serverName) {
        return readServer(serverName, query, tmdbDetails, streamRequestHeaders);
      }));
    })
    .then(function (itemsByServer) {
      return resolveStreamItems([].concat.apply([], itemsByServer), streamRequestHeaders);
    })
    .then(function (streams) {
      var ranked = streams.map(function (stream, index) { return { stream: stream, index: index }; });
      ranked.sort(function (a, b) {
        return getResolutionWeight(b.stream.quality) - getResolutionWeight(a.stream.quality) || a.index - b.index;
      });
      return ranked.map(function (entry, index) {
        var stream = entry.stream;
        stream.name = getInvertedSortTag(streams.length - index, streams.length + 1) + stream.name;
        return stream;
      });
    })
    .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };