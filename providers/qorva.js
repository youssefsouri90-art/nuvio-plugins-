function getStreams(tmdbId, mediaType, season, episode) {
  var MOVIE_BASE = "https://new.katmoviehd.top";
  var TVSHW_BASE = "https://new.katdrama.my";
  var ANIME_BASE = "https://new.pikahd.co";
  var TMDB_API = "https://api.themoviedb.org/3";
  var TMDB_KEY = (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY) || "307b7b8ef035c6aa336900aef4e203bd";
  var LNK_BASE = "https://links.kmhd.me";
  var HBC_BASE = "hubcloud.ist";
  var GDF_BASE = ["new5.gdflix.io", "new4.gdflix.io"];
  var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

  function request(url, options) {
    return Promise.resolve().then(function () {
      return fetch(url, options);
    }).then(null, function () {
      return null;
    });
  }

  function safely(promise, fallback) {
    return promise.then(null, function () {
      return fallback;
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

  function decodeEntities(s) {
    return String(s == null ? "" : s)
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#8211;|&ndash;/g, "-").replace(/&#8212;|&mdash;/g, "-")
      .replace(/&#8217;|&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
  }

  function stripTags(html) {
    return decodeEntities(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  }

  function normWords(s) {
    return String(s || "").toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  }

  function getText(url, extraHeaders) {
    var headers = extend({
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/json,*/*;q=0.8",
      "Referer": (String(url).match(/^https?:\/\/[^\/]+/) || [""])[0] + "/",
      "Accept-Language": "en-US,en;q=0.9"
    }, extraHeaders);
    return request(url, { headers: headers }).then(function (res) {
      if (!res || !res.ok) return null;
      return res.text();
    }).then(null, function () {
      return null;
    });
  }

  function qualityFromText(t) {
    var m = String(t || "").match(/\b(2160p|1440p|1080p|720p|480p|360p)\b/i) || String(t || "").match(/\b4k\b/i);
    if (!m) return "";
    var q = (m[1] || m[0]).toLowerCase();
    return q === "4k" ? "2160p" : q;
  }

  function qualityRank(q) {
    var n = parseInt(q, 10);
    if (n >= 2160) return 4;
    if (n >= 1080) return 3;
    if (n >= 720) return 2;
    if (n >= 480) return 1;
    return 0;
  }

  function getSortTag(rank, maxRank) {
    var bin = Math.max(0, maxRank - rank).toString(2);
    while (bin.length < 20) bin = "0" + bin;
    return bin.split("").map(function (b) {
      return b === "1" ? "\uFEFF" : "\u200B";
    }).join("");
  }

  function parseTitle(raw) {
    var t = decodeEntities(raw).replace(/\s+/g, " ").trim();
    var y = t.match(/\b(19\d{2}|20\d{2})\b/);
    var year = y ? parseInt(y[1], 10) : null;
    var sm = t.match(/^(.*?\(Season\s*\d+\))/i);
    var base = sm ? sm[1] : t;
    var cut = base.split(/\s+(?=\(?(?:Hindi|English|Dual|Dubbed|ORG|Clean|Full|All\s+Episodes|Complete|TCRip|HDRip|WEB|BluRay|AMZN|Netflix|JioHotstar|Prime|1080p|720p|480p|2160p|4K|10bit|x265|x264|DD\b|5\.1))/i)[0];
    cut = cut.replace(/\s*[-\u2013|:]+\s*$/, "").replace(/\s*\|.*$/, "").trim();
    if ((cut.match(/\(/g) || []).length > (cut.match(/\)/g) || []).length) cut = cut.replace(/\s*\([^()]*$/, "").trim();
    if (!cut || cut.length < 2) cut = t.split(/\s+(?:Hindi|English|Dual|Dubbed)/i)[0].trim();
    return { name: cut || t.slice(0, 80), year: year };
  }

  function seasonOf(title, slug) {
    var m = String(title || "").match(/Season\s*(\d+)/i) || String(title || "").match(/\bS(\d{1,2})\b/i) || String(slug || "").match(/-s(?:eason-)?(\d{1,2})(?:-|$)/i);
    return m ? parseInt(m[1], 10) : 1;
  }

  function devalueResolve(arr) {
    var resolved = new Array(arr.length);
    var done = [];
    var busy = [];

    function walk(v) {
      if (typeof v === "number") return get(v);
      if (Array.isArray(v)) return v.map(function (item) {
        return walk(item);
      });
      if (v && typeof v === "object") {
        var o = {};
        for (var k in v) o[k] = walk(v[k]);
        return o;
      }
      return v;
    }

    function get(i) {
      if (i < 0 || i >= arr.length) return i;
      if (done[i]) return resolved[i];
      if (busy[i]) return null;
      busy[i] = true;
      var val = arr[i];
      resolved[i] = typeof val === "number" ? val : walk(val);
      busy[i] = false;
      done[i] = true;
      return resolved[i];
    }

    for (var i = 0; i < arr.length; i++) get(i);
    return resolved;
  }

  function resolveAllChunks(text) {
    var out = [];
    var lines = String(text || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      try {
        var obj = JSON.parse(s);
        if (obj && obj.type === "chunk" && Array.isArray(obj.data)) {
          out.push(devalueResolve(obj.data));
        } else if (obj && obj.type === "data" && Array.isArray(obj.nodes)) {
          for (var j = 0; j < obj.nodes.length; j++) {
            var n = obj.nodes[j];
            if (n && Array.isArray(n.data)) out.push(devalueResolve(n.data));
          }
        }
      } catch (error) { }
    }
    return out;
  }

  function findIn(list, pred) {
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < list[i].length; j++) {
        var v = list[i][j];
        if (v && typeof v === "object" && pred(v)) return v;
      }
    }
    return null;
  }

  function fetchItems(url) {
    return getText(url).then(function (txt) {
      var hit = findIn(resolveAllChunks(txt), function (v) {
        return Array.isArray(v.items) || (v.data && Array.isArray(v.data.items));
      });
      if (!hit) return [];
      return Array.isArray(hit.items) ? hit.items : hit.data.items;
    });
  }

  function decodePostContent(html) {
    var m = html.match(/"post_content":"([\s\S]*?)"\},"error"/);
    if (!m) return html;
    return m[1].replace(/\\u003C/g, "<").replace(/\\u003E/g, ">").replace(/\\u002F/g, "/")
      .replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }

  function fetchPostContent(site, slug) {
    return getText(site + "/" + slug + "/__data.json?x-sveltekit-invalidated=01").then(function (txt) {
      if (txt === null) return "";
      var hit = findIn(resolveAllChunks(txt), function (v) {
        return typeof v.post_content === "string" || (v.data && typeof v.data.post_content === "string");
      });
      if (hit) return typeof hit.post_content === "string" ? hit.post_content : hit.data.post_content;
      return getText(site + "/" + slug).then(function (html) {
        return html === null ? "" : decodePostContent(html);
      });
    });
  }

  function parseKmhdPlay(html, id) {
    var info = {};
    var re = /(\w+):\{name:"([^"]+)"((?:,[a-z_]+:"[^"]*")*)\}/g;
    var mm;
    while ((mm = re.exec(html)) !== null) {
      if (!/(?:\.|\s)(mkv|mp4|avi)\b/i.test(mm[2])) continue;
      var st = (mm[3].match(/streamtape_res:"([^"]*)"/) || [])[1];
      var sw = (mm[3].match(/streamwish_res:"([^"]*)"/) || [])[1];
      info[mm[1]] = { name: mm[2], streamtape_res: st === "None" ? null : st, streamwish_res: sw === "None" ? null : sw };
    }
    if (!Object.keys(info).length) return null;
    return { _id: id, name: "Play " + id, info: info };
  }

  function fetchKmhdData(kind, id) {
    var path = kind === "pack"
      ? "/pack/" + encodeURIComponent(id) + "/__data.json?x-sveltekit-invalidated=01"
      : "/play/__data.json?x-sveltekit-invalidated=01&id=" + encodeURIComponent(id);
    return getText(LNK_BASE + path, { "Referer": LNK_BASE + "/", "Origin": LNK_BASE }).then(function (txt) {
      if (txt === null) return null;
      var hit = findIn(resolveAllChunks(txt), function (v) {
        return v._id && v.info;
      });
      if (hit || kind !== "play") return hit;
      return getText(LNK_BASE + "/play?id=" + id, { "Referer": LNK_BASE + "/" }).then(function (html) {
        return html === null ? null : parseKmhdPlay(html, id);
      });
    }).then(null, function () {
      return null;
    });
  }

  function parseKmhdLinks(html) {
    var out = [];
    var m;
    var re = /<a[^>]+href=["'](?:https?:\/\/links\.kmhd\.(?:me|eu))?\/(play|pack)\/?(?:\?id=|=)?([A-Za-z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re.exec(html)) !== null) out.push({ kind: m[1], id: m[2], label: stripTags(m[3]) });
    var re2 = /<a[^>]+href=["'](https?:\/\/(?:gdflix\.dev|gdlink\.dev|gd\.kmhd\.(?:eu|me)|new\d*\.gdflix\.io)\/file\/[A-Za-z0-9]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = re2.exec(html)) !== null) out.push({ kind: "gdflix", id: m[1], label: stripTags(m[2]), url: m[1] });
    return out;
  }

  function fileLinks(html) {
    var out = [];
    var re = /<a[^>]+href=["'](?:https?:\/\/links\.kmhd\.(?:me|eu))?\/file\/([A-Za-z0-9_-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    while ((m = re.exec(html))) {
      var label = stripTags(m[2]);
      if (!qualityFromText(label)) {
        var found = html.slice(0, m.index).match(/\b(?:2160p|1440p|1080p|720p|480p|360p)\b|\b4k\b/gi);
        var ctx = found ? qualityFromText(found[found.length - 1]) : "";
        if (ctx) label = ctx + " " + label;
      }
      out.push({ id: m[1], label: label, at: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function playEpisodes(playData) {
    var out = [];
    var info = playData.info || {};
    var keys = Object.keys(info);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = info[k];
      if (!v || !v.name || !/(?:\.|\s)(mkv|mp4|avi)\b/i.test(v.name)) continue;
      var sem = v.name.match(/S(\d{1,2})\s?E(\d{1,3})/i);
      out.push({
        key: k,
        hasSeason: !!sem,
        season: sem ? parseInt(sem[1], 10) : null,
        episode: sem ? parseInt(sem[2], 10) : out.length + 1,
        streamtape: v.streamtape_res && v.streamtape_res !== "None" ? v.streamtape_res : null
      });
    }
    return out;
  }

  function addFiles(list, extra) {
    var more = extra || [];
    for (var i = 0; i < more.length; i++) {
      var f = more[i];
      var known = list.some(function (g) {
        return g[0] === f[0];
      });
      if (!known) list.push(f);
    }
    return list;
  }

  function firstLink(links, kind) {
    for (var i = 0; i < links.length; i++) {
      if (links[i].kind === kind) return links[i];
    }
    return null;
  }

  function groupByEpisode(content, files) {
    var byEp = {};
    var marks = [];
    var mre = /(?:\bEpisode|\bEp\.?|\bE)\s*0*(\d{1,3})\b(?![^<]{0,6}Added)/gi;
    var dlAt = content.search(/DOWNLOAD LINKS|Single Episodes? Link/i);
    var mm;
    while ((mm = mre.exec(content))) {
      if (mm.index > dlAt) marks.push({ ep: parseInt(mm[1], 10), at: mm.index });
    }
    if (!marks.length || !files.length) return byEp;
    for (var i = 0; i < files.length; i++) {
      var cur = null;
      for (var j = 0; j < marks.length; j++) {
        if (marks[j].at < files[i].end) cur = marks[j].ep;
      }
      if (cur != null) (byEp[cur] = byEp[cur] || []).push([files[i].id, files[i].label]);
    }
    return byEp;
  }

  function collectPackEpisodes(packData, season) {
    var packEps = {};
    var packKeys = [];
    for (var i = 0; i < packData.length; i++) {
      var x = packData[i];
      if (!x.d || !x.d.info) continue;
      var lab = String(x.pk.label || "").replace(/\s*Links?\b/i, "").replace(/\s+/g, " ").trim();
      var names = Object.keys(x.d.info);
      for (var j = 0; j < names.length; j++) {
        var k = names[j];
        var v = x.d.info[k];
        if (!v || !v.name || !/\.(mkv|mp4|avi)\b/i.test(v.name)) continue;
        var sem = v.name.match(/S(\d{1,2})\s?E(\d{1,3})/i);
        var em = sem ? null : v.name.match(/(?:\bE|\bEP|Episode)[ ._-]?(\d{1,3})\b/i);
        if (!sem && !em) continue;
        var s = sem ? parseInt(sem[1], 10) : season;
        var e = parseInt(sem ? sem[2] : em[1], 10);
        var key = s + ":" + e;
        if (!packEps[key]) {
          packEps[key] = { season: s, episode: e, f: [] };
          packKeys.push(key);
        }
        packEps[key].f.push([k, lab || qualityFromText(v.name) || "Auto"]);
      }
    }
    return { packEps: packEps, packKeys: packKeys };
  }

  function assembleEpisodes(ctx) {
    var eps = [];
    var packEps = ctx.packEps;
    var packKeys = ctx.packKeys;
    var byEp = ctx.byEp;
    var files = ctx.files;

    function pushPackOnly(key) {
      var pe = packEps[key];
      eps.push({ season: pe.season, episode: pe.episode, ref: { f: addFiles(pe.f.slice(), byEp[pe.episode]) } });
    }

    if (ctx.play) {
      var list = ctx.pd ? playEpisodes(ctx.pd) : [];
      for (var i = 0; i < list.length; i++) {
        eps.push({
          season: list[i].hasSeason ? list[i].season : ctx.season,
          episode: list[i].episode,
          ref: { p: ctx.play.id, k: list[i].key, st: list[i].streamtape, f: byEp[list[i].episode] || [] }
        });
      }
      if (eps.length === 1 && !Object.keys(byEp).length && !packKeys.length) {
        eps[0].ref.f = files.map(function (f) {
          return [f.id, f.label];
        });
      }
      if (packKeys.length) {
        var have = {};
        for (var j = 0; j < eps.length; j++) {
          var epKey = eps[j].season + ":" + eps[j].episode;
          have[epKey] = 1;
          if (packEps[epKey]) addFiles(eps[j].ref.f, packEps[epKey].f);
        }
        packKeys.forEach(function (key) {
          if (!have[key]) pushPackOnly(key);
        });
      }
    }
    if (!eps.length && packKeys.length) packKeys.forEach(pushPackOnly);
    if (!eps.length && Object.keys(byEp).length) {
      Object.keys(byEp).map(Number).sort(function (a, b) {
        return a - b;
      }).forEach(function (n) {
        eps.push({ season: ctx.season, episode: n, ref: { f: byEp[n] } });
      });
    }
    if (!eps.length && files.length) {
      eps.push({
        season: ctx.season,
        episode: 1,
        ref: {
          f: files.map(function (f) {
            return [f.id, f.label];
          })
        }
      });
    }
    if (!eps.length) {
      var gd = ctx.links.filter(function (l) {
        return l.kind === "gdflix" && !/\bpack\b|\bzip\b/i.test(l.label);
      });
      if (gd.length) {
        eps.push({
          season: ctx.season,
          episode: 1,
          ref: {
            g: gd.slice(0, 4).map(function (l) {
              return [l.url, l.label];
            })
          }
        });
      }
    }
    return eps;
  }

  function postEpisodes(content, slug, title) {
    var season = seasonOf(title, slug);
    var links = parseKmhdLinks(content);
    var play = firstLink(links, "play");
    var files = fileLinks(content);
    var byEp = groupByEpisode(content, files);
    var packs = links.filter(function (l) {
      return l.kind === "pack";
    }).slice(0, 4);
    var packJobs = packs.map(function (pk) {
      return fetchKmhdData("pack", pk.id).then(function (d) {
        return { pk: pk, d: d };
      });
    });
    var playJob = play ? fetchKmhdData("play", play.id) : Promise.resolve(null);

    return Promise.all([Promise.all(packJobs), playJob]).then(function (replies) {
      var collected = collectPackEpisodes(replies[0], season);
      return assembleEpisodes({
        season: season,
        links: links,
        play: play,
        pd: replies[1],
        files: files,
        byEp: byEp,
        packEps: collected.packEps,
        packKeys: collected.packKeys
      });
    });
  }

  function touchMe(fileId, code) {
    return request(LNK_BASE + "/api/touchme/" + encodeURIComponent(fileId) + "?c=" + encodeURIComponent(code), {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": LNK_BASE + "/play?id=xxx",
        "Origin": LNK_BASE,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: ""
    }).then(function (res) {
      return res ? res.json() : null;
    }).then(function (j) {
      return j && j.status === "Done" && j.linkId && j.linkId !== "None" ? j.linkId : null;
    }).then(null, function () {
      return null;
    });
  }

  function extractStreamTape(embedUrl) {
    return getText(embedUrl, { "Referer": "https://streamtape.com/" }).then(function (html) {
      if (html === null) return null;
      var s = html.match(/robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']+)'\)\.substring\(2\)\.substring\(1\)/);
      if (s) {
        var built = s[1] + s[2].substring(2).substring(1);
        return built.indexOf("//") === 0 ? "https:" + built : built;
      }
      var m = html.match(/id="robotlink"[^>]*>([^<]+)</);
      if (!m) return null;
      var u = m[1].trim().replace(/^\/(?=[^\/])/, "//");
      if (u.indexOf("//") === 0) return "https:" + u;
      if (u.indexOf("http") === 0) return u;
      return null;
    });
  }

  function resolveHubcloud(pageUrl) {
    return getText(pageUrl, { "Referer": "https://" + HBC_BASE + "/" }).then(function (html) {
      if (html === null) return [];
      var dl = (html.match(/id=["']download["'][^>]*href=["']([^"']+)["']/) ||
        html.match(/href=["']([^"']*hubcloud\.php[^"']+)["']/) || [])[1];
      if (!dl) return [];
      dl = dl.replace(/&amp;/g, "&");
      if (!/hubcloud\.php|gamerxyt/.test(dl)) {
        return /r2\.cloudflarestorage\.com|pixel\.hubcloud|pixeldrain/.test(dl) ? [dl] : [];
      }
      return getText(dl, { "Referer": pageUrl }).then(function (d2) {
        var out = [];
        if (d2 === null) return out;
        var r2 = (d2.match(/https:\/\/[^"'\s<>]*r2\.cloudflarestorage\.com[^"'\s<>]+/) || [])[0];
        if (r2) out.push(r2.replace(/&amp;/g, "&"));
        var px = (d2.match(/https:\/\/pixel\.hubcloud\.cx\/\?id=[^"'\s<>]+/) || [])[0];
        if (px) out.push(px);
        if (!out.length) {
          var pd = (d2.match(/https:\/\/pixeldrain\.(?:com|dev)\/u\/([A-Za-z0-9]+)/) || [])[1];
          if (pd) out.push("https://pixeldrain.com/api/file/" + pd + "?download");
        }
        return out;
      });
    }).then(null, function () {
      return [];
    });
  }

  function unwrapInstant(u) {
    return request(u, { headers: { "User-Agent": USER_AGENT, "Range": "bytes=0-0" } }).then(function (r) {
      if (!r) return u;
      var fu = String(r.url || "");
      var m = fu.match(/[?&]url=([^&#]+)/);
      if (m) {
        var inner = decodeURIComponent(m[1]);
        if (/^https?:\/\//i.test(inner)) return inner;
      }
      if (/\.pages\.dev\//i.test(fu)) return null;
      if (fu && fu !== u && /^https?:/i.test(fu)) return fu;
      return u;
    }).then(null, function () {
      return u;
    });
  }

  function gdPost(host, fid, base, action) {
    return request("https://" + host + "/" + base + "/" + fid, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://" + host + "/file/" + fid,
        "x-token": host,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "action=" + action + "&key=acbe2066696a1d44345698deb3d9ebf9ae9bbdfd&action_token="
    }).then(function (res) {
      return res ? res.json() : {};
    }).then(function (json) {
      return json || {};
    }, function () {
      return {};
    });
  }

  function googleDownload(gid) {
    return getText("https://drive.usercontent.google.com/download?id=" + gid + "&export=download", { "Referer": "https://drive.google.com/" }).then(function (html) {
      if (html === null) return null;
      var action = (html.match(/action="([^"]+)"/) || [])[1] || "";
      var fields = [];
      var fr = /name="([^"]+)"\s+value="([^"]*)"/g;
      var fm;
      while ((fm = fr.exec(html))) fields.push(fm[1] + "=" + encodeURIComponent(fm[2]));
      return action && fields.length ? action + "?" + fields.join("&") : null;
    });
  }

  function collectGdLinks(html, instant, direct) {
    var pub = html.match(/https:\/\/pub-[^\s"']+\.r2\.dev\/[^\s"']+\?token=[^\s"']+/g) || [];
    for (var i = 0; i < pub.length; i++) {
      var c = pub[i].replace(/&amp;/g, "&");
      if (direct.indexOf(c) < 0) direct.push(c);
    }
    var busy = html.match(/https:\/\/[^"']*busycdn\.xyz\/[^"']+/g) || [];
    for (var j = 0; j < busy.length; j++) {
      var d = busy[j].replace(/&amp;/g, "&");
      if (instant.indexOf(d) < 0) instant.push(d);
    }
  }

  function postGdflix(host, fid, instant, direct) {
    return Promise.all([gdPost(host, fid, "mfile", "instant"), gdPost(host, fid, "file", "direct")]).then(function (res) {
      var iu = String(res[0].url || "").replace(/&amp;/g, "&");
      if (!res[0].error && iu.indexOf("http") === 0) instant.push(iu);
      var du = String(res[1].url || "").replace(/&amp;/g, "&");
      if (res[1].error || du.indexOf("http") !== 0) return null;
      if (!/drive\.google\.com/.test(du)) {
        direct.push(du);
        return null;
      }
      var gid = (du.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || [])[1];
      if (!gid) return null;
      return googleDownload(gid).then(function (link) {
        if (link) direct.push(link);
      });
    });
  }

  function resolveGdflix(pageUrl) {
    var instant = [];
    var direct = [];
    var fid = (String(pageUrl).match(/\/file\/([A-Za-z0-9]+)/) || [])[1];
    if (!fid) return Promise.resolve({ instant: instant, direct: direct });
    var given = (String(pageUrl).match(/^https?:\/\/([^\/]+)/) || [])[1];
    var hosts = [given && /gdflix\./i.test(given) ? given : null].concat(GDF_BASE).filter(function (h, i, a) {
      return h && a.indexOf(h) === i;
    });
    var pages = hosts.map(function (h) {
      return [h, "https://" + h + "/file/" + fid];
    }).concat([[hosts[0], "https://gdflix.dev/file/" + fid]]);

    return Promise.all(pages.map(function (page) {
      return getText(page[1], { "Referer": "https://" + page[0] + "/" });
    })).then(function (htmls) {
      var html = "";
      var gdHost = hosts[0];
      for (var i = 0; i < pages.length; i++) {
        if (/busycdn\.xyz|r2\.dev/.test(html)) break;
        if (htmls[i] === null) {
          html = "";
        } else {
          html = htmls[i];
          gdHost = pages[i][0];
        }
      }
      collectGdLinks(html, instant, direct);
      if (direct.length || instant.length) return null;
      return postGdflix(gdHost, fid, instant, direct);
    }).then(null, function () {
      return null;
    }).then(function () {
      return Promise.all(instant.slice(0, 3).map(function (u) {
        return unwrapInstant(u);
      }));
    }).then(function (unwrapped) {
      return {
        instant: unwrapped.filter(function (x, i) {
          return x && unwrapped.indexOf(x) === i;
        }),
        direct: direct
      };
    });
  }

  function makeStream(url, host, quality, headers, rank) {
    return { url: url, host: host, quality: quality, headers: headers, rank: rank };
  }

  function gdStreams(g, q) {
    var out = [];
    for (var i = 0; i < g.instant.length; i++) {
      out.push(makeStream(g.instant[i], "GDFlix Instant", q, { "User-Agent": USER_AGENT }, 2));
    }
    for (var j = 0; j < g.direct.length; j++) {
      if (/drive\.google\.com\/open/.test(g.direct[j])) continue;
      out.push(makeStream(g.direct[j], "GDFlix", q, { "User-Agent": USER_AGENT }, 3));
    }
    return out;
  }

  function tapeStreams(embedUrl, quality) {
    return extractStreamTape(embedUrl).then(function (url) {
      if (!url) return [];
      return [makeStream(url, "StreamTape", quality, { "User-Agent": USER_AGENT, "Referer": "https://streamtape.com/" }, 1)];
    });
  }

  function hubcloudStreams(pageUrl, quality) {
    return resolveHubcloud(pageUrl).then(function (links) {
      return links.map(function (u) {
        return makeStream(u, "HubCloud", quality, { "User-Agent": USER_AGENT }, 0);
      });
    });
  }

  function streamsForFile(fileId, label, codes) {
    return Promise.all(codes.map(function (code) {
      return touchMe(fileId, code);
    })).then(function (links) {
      var mirrors = Object.create(null);
      codes.forEach(function (code, i) {
        if (links[i]) mirrors[code] = links[i];
      });
      var q = qualityFromText(label) || "";
      var jobs = [];
      if (mirrors.streamtape_res) {
        var m = mirrors.streamtape_res;
        jobs.push(tapeStreams(m.indexOf("http") === 0 ? m : "https://streamtape.com/e/" + m, q));
      }
      if (mirrors.hubdrive_res) {
        jobs.push(hubcloudStreams(mirrors.hubdrive_res, q));
      }
      if (mirrors.gdflix_res) {
        jobs.push(resolveGdflix(mirrors.gdflix_res).then(function (g) {
          return gdStreams(g, q);
        }));
      }
      return Promise.all(jobs.map(function (job) {
        return safely(job, []);
      })).then(flatten);
    });
  }

  function playStreams(ref) {
    var quality = fetchKmhdData("play", ref.p).then(function (pd) {
      var entry = pd && pd.info && pd.info[ref.k];
      return entry ? qualityFromText(entry.name) : "";
    });
    var files = streamsForFile(ref.k, "", ["hubdrive_res", "gdflix_res"]);
    var tape = ref.st ? tapeStreams("https://streamtape.com/e/" + ref.st, "") : Promise.resolve([]);
    return Promise.all([quality, files, tape]).then(function (replies) {
      var all = flatten([replies[1], replies[2]]);
      all.forEach(function (s) {
        s.quality = replies[0];
      });
      return all;
    });
  }

  function streamsFromRef(ref) {
    var jobs = [];
    if (ref.p && ref.k) jobs.push(playStreams(ref));
    (ref.g || []).slice(0, 4).forEach(function (g) {
      jobs.push(resolveGdflix(g[0]).then(function (r) {
        return gdStreams(r, qualityFromText(g[1]));
      }));
    });
    (ref.f || []).slice(0, 6).forEach(function (f) {
      jobs.push(streamsForFile(f[0], f[1], ["hubdrive_res", "gdflix_res", "streamtape_res"]));
    });
    return Promise.all(jobs.map(function (job) {
      return safely(job, []);
    })).then(flatten);
  }

  function probe(s) {
    var headers = extend(extend({}, s.headers), { "Range": "bytes=0-2047" });
    return request(s.url, { headers: headers }).then(function (r) {
      if (!r) return "unknown";
      var st = r.status;
      if (st === 0) return /host lookup|ENOTFOUND|getaddrinfo|No address/i.test(String(r.statusText || "")) ? "dead" : "unknown";
      if (st === 200 || st === 206) {
        if (parseInt(r.headers.get("content-length"), 10) > 65536) return "unknown";
        return r.text().then(function (text) {
          var body = String(text).replace(/^\uFEFF/, "").replace(/^\s+/, "").slice(0, 600);
          if (/^<(!doctype|html|head|body)/i.test(body)) return "dead";
          if (/^PK\u0003\u0004|^Rar!/.test(body)) return "dead";
          return "ok";
        });
      }
      if (st === 401 || st === 403 || st === 429) return "unknown";
      return "dead";
    }).then(null, function () {
      return "unknown";
    });
  }

  function verifyStreams(list) {
    return Promise.all(list.map(function (s) {
      return probe(s);
    })).then(function (verdicts) {
      var ok = [];
      var unknown = [];
      list.forEach(function (s, i) {
        if (verdicts[i] === "ok") ok.push(s);
        else if (verdicts[i] === "unknown") unknown.push(s);
      });
      var keep = unknown.slice(0, Math.max(0, 3 - Math.min(ok.length, 2)));
      return ok.concat(keep);
    });
  }

  function namesFrom(d, mediaType) {
    var alts = (d.alternative_titles && (d.alternative_titles.results || d.alternative_titles.titles)) || [];
    var altNames = alts.filter(function (a) {
      return a.iso_3166_1 === "JP";
    }).concat(alts).map(function (a) {
      return a.title;
    });
    var names = [mediaType === "tv" ? d.name : d.title, mediaType === "tv" ? d.original_name : d.original_title]
      .concat(altNames)
      .filter(function (n, i, a) {
        return n && a.indexOf(n) === i && normWords(n).length;
      })
      .slice(0, 6);
    var year = parseInt(String(d.release_date || d.first_air_date || "").slice(0, 4), 10) || null;
    var animation = (d.genres || []).some(function (g) {
      return g.id === 16;
    });
    var japan = d.original_language === "ja"
      || (d.origin_country || []).indexOf("JP") >= 0
      || (d.production_countries || []).some(function (c) {
        return c.iso_3166_1 === "JP";
      });
    return names.length ? { names: names, year: year, animation: animation, anime: animation && japan } : null;
  }

  function getTmdbNames(tmdbId, mediaType) {
    if (!TMDB_KEY) return Promise.resolve(null);
    var endpoint = mediaType === "tv" ? "tv" : "movie";
    return request(TMDB_API + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_KEY + "&append_to_response=alternative_titles").then(function (res) {
      if (!res || !res.ok) return null;
      return res.json();
    }).then(function (d) {
      return d ? namesFrom(d, mediaType) : null;
    }).then(null, function () {
      return null;
    });
  }

  function buildQueries(names) {
    var queries = [];
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var words = normWords(n);
      var longest = "";
      for (var j = 0; j < words.length; j++) {
        if (words[j].length > longest.length) longest = words[j];
      }
      var variants = i < 2 ? [n, words.join("-"), longest || n] : [n];
      for (var k = 0; k < variants.length; k++) {
        if (variants[k] && queries.indexOf(variants[k]) < 0) queries.push(variants[k]);
      }
    }
    return queries.slice(0, 10);
  }

  function searchSite(site, query) {
    return fetchItems(site + "/__data.json?x-sveltekit-invalidated=01&q=" + encodeURIComponent(query) + "&page=1").then(function (list) {
      return list.map(function (it) {
        var copy = extend({}, it);
        copy.site = site;
        return copy;
      });
    }).then(null, function () {
      return [];
    });
  }

  function searchPosts(sites, queries) {
    var jobs = [];
    sites.forEach(function (site) {
      queries.forEach(function (query) {
        jobs.push(searchSite(site, query));
      });
    });
    return Promise.all(jobs).then(function (lists) {
      var seen = {};
      var found = [];
      for (var i = 0; i < lists.length; i++) {
        for (var j = 0; j < lists[i].length; j++) {
          var it = lists[i][j];
          var k = it && it.slug ? it.site + "/" + it.slug : null;
          if (k && !seen[k]) {
            seen[k] = 1;
            found.push(it);
          }
        }
      }
      return found;
    });
  }

  function scorePosts(found, names, year) {
    var wanted = names.map(function (n) {
      return normWords(n);
    });
    var scored = [];
    for (var i = 0; i < found.length; i++) {
      var it = found[i];
      var title = String(it.post_title || it.slug);
      if (/\bzip\b/i.test(title)) continue;
      var isSeason = /\bSeason\s*\d+|\bS\d{1,2}\b/i.test(title) || /-s\d{1,2}(?:-|$)/i.test(it.slug);
      if (mediaType === "tv") {
        if (seasonOf(title, it.slug) !== season) continue;
      } else {
        if (isSeason) continue;
        var py = parseTitle(title).year;
        if (year && py && Math.abs(py - year) > 1) continue;
      }
      var bare = normWords(parseTitle(title).name.replace(/\(Season\s*\d+\)|\bSeason\s*\d+\b|\bS\d{1,2}\b|\((?:19|20)\d{2}(?:[-\u2013]\d{2,4})?\)/gi, " "));
      var bareJoined = bare.join(" ");
      var tw = " " + normWords(title).join(" ") + " ";
      var twj = tw.replace(/ /g, "");
      var best = -1;
      for (var j = 0; j < wanted.length; j++) {
        var w = wanted[j];
        if (!w.length) continue;
        if (w.join(" ") === bareJoined) {
          best = 0;
          break;
        }
        var every = w.every(function (x) {
          return tw.indexOf(" " + x) >= 0 || twj.indexOf(x) >= 0;
        });
        if (every) best = 1;
      }
      if (best >= 0) scored.push({ it: it, score: best });
    }
    return sortStable(scored, function (a, b) {
      return a.score - b.score;
    });
  }

  function findPosts(names, year, sites) {
    return searchPosts(sites, buildQueries(names)).then(function (found) {
      var perSite = {};
      return scorePosts(found, names, year).filter(function (s) {
        perSite[s.it.site] = (perSite[s.it.site] || 0) + 1;
        return perSite[s.it.site] <= 3;
      }).map(function (s) {
        return s.it;
      });
    });
  }

  function findEpisode(eps) {
    if (mediaType !== "tv") return eps[0] || null;
    for (var i = 0; i < eps.length; i++) {
      if (eps[i].season === season && eps[i].episode === episode) return eps[i];
    }
    return null;
  }

  function refFor(it) {
    return fetchPostContent(it.site, it.slug).then(function (content) {
      if (!content) return null;
      return postEpisodes(content, it.slug, String(it.post_title || "") + " " + it.slug).then(function (eps) {
        var hit = findEpisode(eps);
        return hit ? { ref: hit.ref, site: it.site } : null;
      });
    }).then(null, function () {
      return null;
    });
  }

  function toStream(s) {
    var site = s.site === TVSHW_BASE ? "KatDrama" : s.site === MOVIE_BASE ? "KatMovie" : "PikaHD";
    var label = site + " \u2022 " + s.host + (s.quality ? " \u2022 " + s.quality : "");
    var tag = getSortTag(qualityRank(s.quality), 4);
    return {
      name: tag + label,
      title: tag + label,
      url: s.url,
      quality: s.quality || "Unknown",
      headers: s.headers
    };
  }

  function rankUnique(all) {
    var seenUrl = {};
    return sortStable(all, function (a, b) {
      return (qualityRank(b.quality) - qualityRank(a.quality)) || (a.rank - b.rank);
    }).filter(function (s) {
      var k = String(s.url).split("?")[0];
      if (seenUrl[k]) return false;
      seenUrl[k] = 1;
      return true;
    });
  }

  function pickOnePerHost(verified) {
    var taken = {};
    return verified.filter(function (s) {
      var k = s.host + "|" + s.quality;
      if (taken[k]) return false;
      taken[k] = 1;
      return true;
    });
  }

  function gather(refs) {
    return Promise.all(refs.filter(Boolean).map(function (r) {
      return safely(streamsFromRef(r.ref).then(function (list) {
        list.forEach(function (s) {
          s.site = r.site;
        });
        return list;
      }), []);
    })).then(flatten);
  }

  function streamsFromSites(meta, sites) {
    return findPosts(meta.names, meta.year, sites).then(function (posts) {
      if (!posts.length) return [];
      return Promise.all(posts.map(refFor)).then(gather).then(function (all) {
        var hd = rankUnique(all).filter(function (s) {
          return s.quality === "1080p" || s.quality === "2160p";
        });
        if (!hd.length) return [];
        return verifyStreams(hd).then(function (verified) {
          return pickOnePerHost(verified).map(toStream);
        });
      });
    });
  }

  function pickSites(meta) {
    if (meta.anime) return [ANIME_BASE];
    var sites = mediaType === "tv" ? [TVSHW_BASE] : [TVSHW_BASE, MOVIE_BASE];
    if (meta.animation) sites.push(ANIME_BASE);
    return sites;
  }

  function buildQuery(tmdbId, mediaType, season, episode) {
    if (!/^\d+$/.test(String(tmdbId))) return null;
    if (mediaType !== "tv") return { tmdbId: tmdbId, mediaType: "movie", season: null, episode: null };
    if (season == null || episode == null) return null;
    var seasonNumber = parseInt(season, 10);
    var episodeNumber = parseInt(episode, 10);
    if (isNaN(seasonNumber) || isNaN(episodeNumber)) return null;
    return { tmdbId: tmdbId, mediaType: "tv", season: seasonNumber, episode: episodeNumber };
  }

  var query = buildQuery(tmdbId, mediaType, season, episode);
  if (!query) return Promise.resolve([]);
  mediaType = query.mediaType;
  season = query.season;
  episode = query.episode;

  return getTmdbNames(query.tmdbId, mediaType).then(function (meta) {
    if (!meta) return [];
    return streamsFromSites(meta, pickSites(meta));
  }).then(null, function () {
    return [];
  });
}

module.exports = { getStreams: getStreams };