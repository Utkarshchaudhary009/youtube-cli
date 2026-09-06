// Deep dive: download page + all JS, print context around API/token clues.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SITES = [
  'https://downsub.com/',
  'https://www.youtube-transcript.io/',
  'https://www.you-tldr.com/',
  'https://anthiago.com/transcript/',
  'https://tubetranscript.com/en',
  'https://savesubs.com/',
  'https://www.downloadyoutubesubtitles.com/',
  'https://filmot.com/',
  'https://transcriptube.com/',
  'https://recapio.com/',
];

const KEYWORDS = ['get-info', 'subtitle.downsub', 'api/transcripts', 'ingestions', 'default-transcript',
  'transcript', 'admin-ajax', 'action=', 'Authorization', 'Bearer', 'token', 'timedtext', 'youtubei',
  'summarize', 'XMLHttpRequest', 'axios.create', 'baseURL'];

async function f(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ac.signal });
    return await r.text();
  } catch { return ''; } finally { clearTimeout(t); }
}

for (const site of SITES) {
  console.log(`\n########## ${site}`);
  const page = await f(site);
  if (!page) { console.log('  (fetch failed)'); continue; }
  const scripts = new Set();
  for (const m of page.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) scripts.add(new URL(m[1], site).href);
  for (const m of page.matchAll(/["'(\s(\/][a-zA-Z0-9_@./-]+\.js["')\s]/g)) {
    try { scripts.add(new URL(m[0].replace(/["'()\s]/g, ''), site).href); } catch {}
  }
  // inline scripts matter too
  const bodies = [page];
  let n = 0;
  await Promise.all([...scripts].slice(0, 40).map(async (u) => {
    if (/\.(css|png|svg|webp|jpg|woff)/.test(u)) return;
    const t = await f(u);
    if (t) { bodies.push(t); n++; }
  }));
  console.log(`  bundles: ${n}`);
  const hits = new Set();
  for (const body of bodies) {
    for (const kw of KEYWORDS) {
      let idx = 0;
      while (hits.size < 120) {
        const i = body.indexOf(kw, idx);
        if (i === -1) break;
        idx = i + kw.length;
        const ctx = body.slice(Math.max(0, i - 80), i + 120).replace(/\s+/g, ' ');
        if (/\.src=|function |var |let |const /.test(ctx) && !/api|token|transcript|Bearer|http/i.test(ctx)) continue;
        hits.add(ctx);
      }
    }
  }
  for (const h of hits) console.log('   · ' + h);
}
