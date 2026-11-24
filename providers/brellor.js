function getStreams(tmdbId, mediaType, season, episode) {
  var PROVIDER = "Internet Archive";
  var BASE_URL = "https://archive.org";
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
  var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0 Safari/537.36";
  var HEADERS = { "User-Agent": USER_AGENT, "Accept": "application/json" };

  function buildQuery() {
    if (mediaType === "tv") return null;
    if (!/^\d+$/.test(String(tmdbId))) return null;
    return TMDB_API + "/movie/" + tmdbId + "?api_key=" + TMDB_KEY;
  }

  function fetchJson(url) {
    return Promise.resolve()
      .then(function () { return fetch(url, { headers: HEADERS }); })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(null, function () { return null; });
  }

  function getTmdbDetails(url) {
    return fetchJson(url).then(function (data) {
      if (!data) return null;
      return {
        title: data.title || "",
        year: (data.release_date || data.first_air_date || "").slice(0, 4)
      };
    });
  }

  function searchArchive(title, year) {
    var q = "title:(" + title + ") AND mediatype:movies";
    if (year) {
      var y = parseInt(year, 10);
      if (!isNaN(y)) q += " AND year:[" + (y - 1) + " TO " + (y + 1) + "]";
    }
    var url = BASE_URL + "/advancedsearch.php?q=" + encodeURIComponent(q) + "&fl[]=identifier&fl[]=title&fl[]=year&sort[]=downloads+desc&rows=5&output=json";
    return fetchJson(url).then(function (data) {
      return data && data.response && data.response.docs ? data.response.docs : [];
    });
  }

  function getMetadata(identifier) {
    return fetchJson(BASE_URL + "/metadata/" + encodeURIComponent(identifier));
  }

  function qualityOf(name) {
    var n = (name || "").toLowerCase();
    if (/2160|4k|uhd/.test(n)) return "2160p";
    if (/1080/.test(n)) return "1080p";
    if (/720/.test(n)) return "720p";
    if (/480/.test(n)) return "480p";
    if (/360/.test(n)) return "360p";
    return "Auto";
  }

  function serveUrl(identifier, fileName) {
    var parts = fileName.split("/").map(function (p) { return encodeURIComponent(p); });
    return BASE_URL + "/serve/" + encodeURIComponent(identifier) + "/" + parts.join("/");
  }

  function toStream(identifier, itemTitle, file) {
    var label = PROVIDER + " \u2022 " + itemTitle;
    return {
      name: label,
      title: label,
      url: serveUrl(identifier, file.name),
      quality: qualityOf(file.name),
      headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/details/" + identifier }
    };
  }

  function streamsForIdentifier(identifier) {
    return getMetadata(identifier).then(function (d) {
      if (!d) return [];
      var mp4s = (d.files || [])
        .filter(function (f) { return /\.mp4$/i.test(f.name || ""); })
        .map(function (f) { return { name: f.name, size: parseInt(f.size || "0", 10) || 0 }; });
      var big = mp4s.filter(function (f) { return f.size >= 50 * 1024 * 1024; });
      var pool = (big.length ? big : mp4s)
        .sort(function (a, b) { return b.size - a.size; })
        .slice(0, 3);
      var itemTitle = (d.metadata || {}).title || identifier;
      return pool.map(function (f) { return toStream(identifier, itemTitle, f); });
    });
  }

  function gather(replies) {
    var seen = Object.create(null);
    var out = [];
    var i;
    var j;
    for (i = 0; i < replies.length; i++) {
      for (j = 0; j < replies[i].length; j++) {
        var s = replies[i][j];
        if (!s.url || seen[s.url]) continue;
        seen[s.url] = true;
        out.push(s);
      }
    }
    return out;
  }

  var query = buildQuery();
  if (!query) return Promise.resolve([]);

  return getTmdbDetails(query)
    .then(function (details) {
      if (!details || !details.title) return [];
      return searchArchive(details.title, details.year).then(function (docs) {
        if (!docs.length) return [];
        return Promise.all(docs.slice(0, 3).map(function (doc) {
          return streamsForIdentifier(doc.identifier).then(null, function () { return []; });
        })).then(gather);
      });
    })
    .then(null, function () { return []; });
}

module.exports = { getStreams: getStreams };