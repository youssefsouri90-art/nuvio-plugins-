var PROVIDERS = [
  { key: 'hades', label: 'Hades' },
  { key: 'hemera', label: 'Hemera', def: true },
  { key: 'hyperion', label: 'Hyperion', def: true },
  { key: 'nyx', label: 'Nyx' },
  { key: 'orion', label: 'Orion' },
  { key: 'poseidon', label: 'Poseidon' },
  { key: 'tethys', label: 'Tethys' },
  { key: 'theia', label: 'Theia' },
  { key: 'tyche', label: 'Tyche' }
];
var LANGUAGES = [
  { key: 'lang_ar', code: 'ar', label: 'Arabic' },
  { key: 'lang_bn', code: 'bn', label: 'Bengali' },
  { key: 'lang_zh', code: 'zh', label: 'Chinese' },
  { key: 'lang_nl', code: 'nl', label: 'Dutch' },
  { key: 'lang_fr', code: 'fr', label: 'French' },
  { key: 'lang_de', code: 'de', label: 'German' },
  { key: 'lang_hi', code: 'hi', label: 'Hindi', def: true },
  { key: 'lang_it', code: 'it', label: 'Italian' },
  { key: 'lang_ja', code: 'ja', label: 'Japanese' },
  { key: 'lang_kn', code: 'kn', label: 'Kannada' },
  { key: 'lang_ko', code: 'ko', label: 'Korean' },
  { key: 'lang_pl', code: 'pl', label: 'Polish' },
  { key: 'lang_pt', code: 'pt', label: 'Portuguese' },
  { key: 'lang_ru', code: 'ru', label: 'Russian' },
  { key: 'lang_es', code: 'es', label: 'Spanish' },
  { key: 'lang_ta', code: 'ta', label: 'Tamil' },
  { key: 'lang_te', code: 'te', label: 'Telugu' },
  { key: 'lang_tr', code: 'tr', label: 'Turkish' }
];

function getStreams(tmdbId, mediaType, season, episode) {
  var BASE_URL = 'https://vivarium.st';
  var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
  var LANG_NAMES = {
    en: 'English', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
    kn: 'Kannada', fr: 'French', de: 'German', es: 'Spanish', ja: 'Japanese',
    ko: 'Korean', zh: 'Chinese', ar: 'Arabic', pt: 'Portuguese', ru: 'Russian',
    it: 'Italian', tr: 'Turkish', pl: 'Polish', nl: 'Dutch', sv: 'Swedish',
    fi: 'Finnish', da: 'Danish', nb: 'Norwegian', cs: 'Czech', sk: 'Slovak',
    hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', hr: 'Croatian',
    el: 'Greek', he: 'Hebrew', id: 'Indonesian', ms: 'Malay', th: 'Thai',
    vi: 'Vietnamese', uk: 'Ukrainian', is: 'Icelandic', et: 'Estonian',
    lt: 'Lithuanian', lv: 'Latvian'
  };
  var RC256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var HMAC_KEY_BYTES = encodeUtf8('6af5200a03de9a234734d3ef385c84490dc4164881e408450b6c35973803bded');
  var HMAC_INNER_PAD = buildPad(0x36);
  var HMAC_OUTER_PAD = buildPad(0x5c);
  var serverClockOffsetMs = 0;

  function buildQuery() {
    if (!/^\d+$/.test(String(tmdbId))) return null;
    var isTv = mediaType === 'tv';
    if (isTv && (season == null || episode == null)) return null;
    return { isTv: isTv };
  }

  function stableSort(items, compare) {
    return items
      .map(function (item, index) { return { item: item, index: index }; })
      .sort(function (a, b) { return compare(a.item, b.item) || a.index - b.index; })
      .map(function (entry) { return entry.item; });
  }

  function readSettings() {
    return (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS) || {};
  }

  function enabledProviders() {
    var settings = readSettings();
    var enabled = [];
    for (var i = 0; i < PROVIDERS.length; i++) {
      var p = PROVIDERS[i];
      if (settings[p.key] === undefined ? !!p.def : settings[p.key] === true) {
        enabled.push(p.label.toLowerCase());
      }
    }
    return enabled;
  }

  function enabledLanguages() {
    var settings = readSettings();
    var enabled = [];
    for (var i = 0; i < LANGUAGES.length; i++) {
      var l = LANGUAGES[i];
      if (settings[l.key] === undefined ? !!l.def : settings[l.key] === true) {
        enabled.push(l.code);
      }
    }
    return enabled;
  }

  function encodeUtf8(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var codePoint = text.charCodeAt(i);
      if (codePoint >= 0xd800 && codePoint < 0xdc00 && i + 1 < text.length) {
        var low = text.charCodeAt(i + 1);
        if (low >= 0xdc00 && low < 0xe000) {
          codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (codePoint < 0x80) bytes.push(codePoint);
      else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 63));
      else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 63), 0x80 | (codePoint & 63));
      else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 63), 0x80 | ((codePoint >> 6) & 63), 0x80 | (codePoint & 63));
    }
    return bytes;
  }

  function sha256Digest(input) {
    var state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var byteLength = input.length;
    var bitLengthHigh = Math.floor(byteLength / 0x20000000);
    var bitLengthLow = (byteLength << 3) >>> 0;
    var padded = input.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    padded.push(
      (bitLengthHigh >>> 24) & 255, (bitLengthHigh >>> 16) & 255, (bitLengthHigh >>> 8) & 255, bitLengthHigh & 255,
      (bitLengthLow >>> 24) & 255, (bitLengthLow >>> 16) & 255, (bitLengthLow >>> 8) & 255, bitLengthLow & 255
    );

    var schedule = new Array(64);
    for (var offset = 0; offset < padded.length; offset += 64) {
      var round;
      for (round = 0; round < 16; round++) {
        var base = offset + round * 4;
        schedule[round] = ((padded[base] << 24) | (padded[base + 1] << 16) | (padded[base + 2] << 8) | padded[base + 3]) | 0;
      }
      for (round = 16; round < 64; round++) {
        var early = schedule[round - 15];
        var late = schedule[round - 2];
        var sigma0 = ((early >>> 7) | (early << 25)) ^ ((early >>> 18) | (early << 14)) ^ (early >>> 3);
        var sigma1 = ((late >>> 17) | (late << 15)) ^ ((late >>> 19) | (late << 13)) ^ (late >>> 10);
        schedule[round] = (schedule[round - 16] + sigma0 + schedule[round - 7] + sigma1) | 0;
      }

      var a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
      for (round = 0; round < 64; round++) {
        var bigSigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var choice = (e & f) ^ (~e & g);
        var temp1 = (h + bigSigma1 + choice + RC256[round] + schedule[round]) | 0;
        var bigSigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var majority = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (bigSigma0 + majority) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0; state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
      state[4] = (state[4] + e) | 0; state[5] = (state[5] + f) | 0; state[6] = (state[6] + g) | 0; state[7] = (state[7] + h) | 0;
    }

    var digest = [];
    for (var i = 0; i < 8; i++) {
      digest.push((state[i] >>> 24) & 255, (state[i] >>> 16) & 255, (state[i] >>> 8) & 255, state[i] & 255);
    }
    return digest;
  }

  function buildPad(mask) {
    var pad = [];
    for (var i = 0; i < 64; i++) {
      var keyByte = i < HMAC_KEY_BYTES.length ? HMAC_KEY_BYTES[i] : 0;
      pad.push(keyByte ^ mask);
    }
    return pad;
  }

  function hmacSha256Hex(messageBytes) {
    var mac = sha256Digest(HMAC_OUTER_PAD.concat(sha256Digest(HMAC_INNER_PAD.concat(messageBytes))));
    var hex = '';
    for (var i = 0; i < mac.length; i++) hex += (mac[i] < 16 ? '0' : '') + mac[i].toString(16);
    return hex;
  }

  function signRequest(method, pathAndQuery, timestamp, nonce) {
    var message = method.toUpperCase() + '\n' + pathAndQuery + '\n' + timestamp + (nonce ? '\n' + nonce : '') + '\n' + '51e87f5e8e951aa213fe48de7478cc0bf0e06b4eaa53cd948f97afd1b5f2b596';
    return hmacSha256Hex(encodeUtf8(message));
  }

  function defaultHeaders() {
    return { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/', 'Accept': '*/*' };
  }

  function syncServerClock(response) {
    try {
      var dateHeader = response && response.headers && response.headers.get('date');
      if (dateHeader) {
        var serverTime = Date.parse(dateHeader);
        if (!isNaN(serverTime)) serverClockOffsetMs = serverTime - Date.now();
      }
    } catch (e) { }
  }

  function getUnsigned(path) {
    return Promise.resolve()
      .then(function () { return fetch(BASE_URL + path, { headers: defaultHeaders() }); })
      .then(function (response) {
        syncServerClock(response);
        return response;
      });
  }

  function getSigned(path, nonce) {
    var timestamp = String(Math.floor((Date.now() + serverClockOffsetMs) / 1000));
    var headers = defaultHeaders();
    headers['x-ts'] = timestamp;
    headers['x-cv'] = '94092f52501e';
    if (nonce) headers['x-nonce'] = nonce;
    headers['x-sig'] = signRequest('GET', path, timestamp, nonce || '');
    return fetch(BASE_URL + path, { headers: headers });
  }

  function fetchNonces() {
    return getUnsigned('/api/n')
      .then(function (response) {
        if (!response.ok) return [];
        return response.json().then(function (nonces) {
          return Array.isArray(nonces) ? nonces : [];
        });
      })
      .then(null, function () { return []; });
  }

  function fetchEventStream(queryString, nonce) {
    return Promise.resolve()
      .then(function () { return getSigned('/api/es?' + queryString, nonce || ''); })
      .then(function (response) {
        if (!response.ok) return '';
        return response.text();
      })
      .then(null, function () { return ''; });
  }

  function parseServerSentEvents(text) {
    var events = [];
    var blocks = String(text || '').split(/\r?\n\r?\n/);
    for (var i = 0; i < blocks.length; i++) {
      if (!blocks[i]) continue;
      var event = { event: 'message', data: '' };
      var lines = blocks[i].split(/\r?\n/);
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var separatorIndex = line.indexOf(':');
        if (separatorIndex <= 0) continue;
        var field = line.slice(0, separatorIndex);
        var value = line.slice(separatorIndex + 1).replace(/^ /, '');
        if (field === 'event') event.event = value;
        else if (field === 'data') event.data += (event.data ? '\n' : '') + value;
      }
      events.push(event);
    }
    return events;
  }

  function toAbsoluteUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    if (url.charAt(0) === '/') return BASE_URL + url;
    return BASE_URL + '/' + url;
  }

  function langName(code) {
    return LANG_NAMES[code] || code.toUpperCase();
  }

  function extractCandidates(events) {
    var candidates = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].event !== 'source') continue;
      var payload;
      try { payload = JSON.parse(events[i].data); } catch (e) { continue; }
      var sources = (payload && payload.streams) || [];
      for (var j = 0; j < sources.length; j++) {
        var source = sources[j];
        if (!source || !source.url) continue;

        var inlineSubs = [];
        if (Array.isArray(source.subs)) {
          for (var k = 0; k < source.subs.length; k++) {
            var sub = source.subs[k];
            if (sub && sub.url && sub.lang) {
              inlineSubs.push({
                url: toAbsoluteUrl(sub.url),
                label: sub.label || langName(sub.lang),
                language: sub.lang,
                lang: sub.lang
              });
            }
          }
        }

        candidates.push({
          url: toAbsoluteUrl(String(source.url)),
          quality: String(source.quality || 'Auto'),
          provider: String(source.provider || (payload && payload.provider) || '?'),
          rank: +source.rank || 0,
          type: String(source.type || 'hls'),
          hevc: !!source.hevc,
          hdr: !!source.hdr,
          optional: !!source.opt,
          pinned: !!source.pin,
          lang: String(source.lang || 'en'),
          dub: !!source.dub,
          inlineSubs: inlineSubs
        });
      }
    }
    return candidates;
  }

  function scoreCandidate(candidate) {
    var score = candidate.rank || 720;
    if (candidate.optional) score -= 1200;
    if (candidate.hevc) score -= 150;
    if (candidate.hdr) score -= 100;
    if (candidate.pinned) score += 500;
    if (candidate.type !== 'hls') score -= 100;
    return score;
  }

  function resolutionLabel(candidate) {
    var match = /(\d{3,4})\s*p/i.exec(candidate.quality);
    if (match) return match[1] + 'p';
    return candidate.rank >= 1000 ? candidate.rank + 'p' : 'Auto';
  }

  function resolutionHeight(candidate) {
    var match = /(\d{3,4})/.exec(resolutionLabel(candidate));
    return match ? +match[1] : (candidate.rank || 0);
  }

  function resolutionTier(candidate) {
    var height = resolutionHeight(candidate);
    if (height >= 1800) return 5;
    if (height >= 900) return 4;
    if (height >= 600) return 3;
    if (height >= 420) return 2;
    if (height >= 300) return 1;
    return 0;
  }

  function buildSortTag(tier, maxTier) {
    var inverted = Math.max(0, maxTier - tier);
    var bits = inverted.toString(2);
    while (bits.length < 20) bits = '0' + bits;
    return bits.split('').map(function (bit) { return bit === '1' ? '\uFEFF' : '\u200B'; }).join('');
  }

  function buildStream(candidate, label, subtitles, langLabel) {
    var sortTag = buildSortTag(resolutionTier(candidate), 6);
    var displayName = 'Vivarium \u2022 ' + (langLabel || label || candidate.provider);
    return {
      name: sortTag + displayName,
      title: sortTag + displayName,
      url: candidate.url,
      quality: resolutionLabel(candidate),
      headers: { 'Referer': BASE_URL + '/', 'User-Agent': USER_AGENT },
      subtitles: subtitles
    };
  }

  function pushGroup(streams, seenUrls, candidates, subtitles, langLabel) {
    var fresh = [];
    for (var i = 0; i < candidates.length; i++) {
      if (seenUrls[candidates[i].url]) continue;
      seenUrls[candidates[i].url] = true;
      fresh.push(candidates[i]);
    }
    if (!fresh.length) return false;

    var best = fresh[0];
    for (var j = 1; j < fresh.length; j++) {
      if (scoreCandidate(fresh[j]) > scoreCandidate(best)) best = fresh[j];
    }

    fresh = stableSort(fresh, function (a, b) {
      return (resolutionHeight(b) - resolutionHeight(a)) || (scoreCandidate(b) - scoreCandidate(a));
    });
    for (var k = 0; k < fresh.length; k++) {
      streams.push(buildStream(fresh[k], fresh[k] === best ? 'Auto' : null, subtitles, langLabel));
    }
    return true;
  }

  function resolveStreams(query) {
    var isTv = query.isTv;
    var allowedProviders = enabledProviders();
    var allowedLangs = enabledLanguages();
    if (allowedProviders.length === 0 && allowedLangs.length === 0) return Promise.resolve([]);

    var baseQuery = 'id=' + encodeURIComponent(tmdbId) +
      '&type=' + (isTv ? 'tv' : 'movie') +
      (isTv ? '&s=' + season + '&e=' + episode : '');

    return fetchNonces().then(function (nonces) {
      var nonceIndex = 0;

      return fetchEventStream(baseQuery, nonces[nonceIndex++] || '').then(function (baseEventText) {
        var allBaseCandidates = extractCandidates(parseServerSentEvents(baseEventText));
        if (!allBaseCandidates.length) return [];

        var streams = [];
        var seenUrls = Object.create(null);

        var englishSubs = [];
        if (allowedProviders.length > 0) {
          var engCandidates = allBaseCandidates.filter(function (c) {
            return !c.dub && allowedProviders.indexOf(c.provider.toLowerCase()) !== -1;
          });
          if (engCandidates.length > 0) {
            engCandidates = stableSort(engCandidates, function (a, b) { return scoreCandidate(b) - scoreCandidate(a); });
            englishSubs = engCandidates[0].inlineSubs;
            pushGroup(streams, seenUrls, engCandidates, englishSubs, null);
          }
        }

        if (allowedLangs.length === 0) return streams;

        var coveredDubLangs = [];
        var dubGroups = Object.create(null);
        var baseDubLangs = [];
        for (var i = 0; i < allBaseCandidates.length; i++) {
          var c = allBaseCandidates[i];
          if (!c.dub || allowedLangs.indexOf(c.lang) === -1) continue;
          if (!dubGroups[c.lang]) {
            dubGroups[c.lang] = [];
            baseDubLangs.push(c.lang);
          }
          dubGroups[c.lang].push(c);
        }
        for (var j = 0; j < baseDubLangs.length; j++) {
          var lang = baseDubLangs[j];
          if (pushGroup(streams, seenUrls, dubGroups[lang], englishSubs, langName(lang))) {
            coveredDubLangs.push(lang);
          }
        }

        var missingDubLangs = allowedLangs.filter(function (code) {
          return coveredDubLangs.indexOf(code) === -1;
        });
        if (missingDubLangs.length === 0) return streams;

        return Promise.all(missingDubLangs.map(function (code) {
          return fetchEventStream(baseQuery + '&dubs=1&al=' + encodeURIComponent(code), nonces[nonceIndex++] || '');
        })).then(function (dubEventTexts) {
          for (var d = 0; d < missingDubLangs.length; d++) {
            var dubLang = missingDubLangs[d];
            var dubCandidates = extractCandidates(parseServerSentEvents(dubEventTexts[d]))
              .filter(function (candidate) { return candidate.dub && candidate.lang === dubLang; });
            pushGroup(streams, seenUrls, dubCandidates, englishSubs, langName(dubLang));
          }
          return streams;
        });
      });
    });
  }

  return Promise.resolve()
    .then(function () {
      var query = buildQuery();
      return query ? resolveStreams(query) : [];
    })
    .then(null, function () { return []; });
}

function onSettings() {
  var fields = [
    { type: 'header', label: 'Providers' }
  ];
  for (var i = 0; i < PROVIDERS.length; i++) {
    fields.push({
      type: 'toggle',
      key: PROVIDERS[i].key,
      label: PROVIDERS[i].label,
      defaultValue: !!PROVIDERS[i].def
    });
  }
  fields.push({ type: 'header', label: 'Dub Languages' });
  for (var j = 0; j < LANGUAGES.length; j++) {
    fields.push({
      type: 'toggle',
      key: LANGUAGES[j].key,
      label: LANGUAGES[j].label,
      defaultValue: !!LANGUAGES[j].def
    });
  }
  return Promise.resolve(fields);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };