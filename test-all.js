// node test-all.js [tmdbId] [tv|movie] [season] [episode]  — يختبر كل المزوّدات ويطبع عدد الروابط
const fs = require('fs'), path = require('path');
const [id = '1429', type = 'tv', s = '1', e = '1'] = process.argv.slice(2);
(async () => {
  for (const f of fs.readdirSync(path.join(__dirname, 'providers'))) {
    const m = require(path.join(__dirname, 'providers', f)), t0 = Date.now();
    try {
      const r = await m.getStreams(id, type, type === 'tv' ? +s : undefined, type === 'tv' ? +e : undefined);
      console.log(String(r.length).padStart(2), 'روابط |', ((Date.now() - t0) / 1000).toFixed(1) + 's |', f, r[0] ? '→ ' + r[0].name : '');
    } catch (x) { console.log(' ✗', f, x.message); }
  }
})();
