// Parallel probe of transcription sites: fetch page -> collect JS bundles -> regex out API candidates.
// Usage: node probe.mjs [sitesFile] [outFile]
import fs from 'node:fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const SITES = [
  'https://notegpt.io/youtube-transcript-generator',
  'https://youtubetotranscript.com/',
  'https://www.youtube-transcript.io/',
  'https://kome.ai/tools/youtube-transcript-generator',
  'https://tactiq.io/tools/youtube-transcript',
  'https://tubetranscript.com/en',
  'https://videotranscriber.ai/',
  'https://youtubetranscript.com/',
  'https://downsub.com/',
  'https://anthiago.com/transcript/',
  'https://summarize.tech/',
  'https://eightify.app/',
  'https://tubeonai.com/',
  'https://glasp.co/youtube-summary',
  'https://notegpt.io/smart-summary',
  'https://www.you-tldr.com/',
  'https://transcriptube.com/',
  'https://www.videotowords.ai/',
  'https://tubetotext.com/',
  'https://scribbar.com/',
  'https://ytviewer.com/youtube-transcript-generator',
  'https://www.clipto.com/media-downloader/youtube-transcript',
  'https://riverside.fm/transcription',
  'https://www.wisesheets?no',
];

async function fetchText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: ac.signal,
    });
    const text = await res.text();
    return { url, status: res.status, text };
  } catch (e) {
    return { url, status: 0, text: '', error: String(e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

async function pool(items, worker, limit = 10) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

const ABS_URL_RE = /https?:\/\/[a-zA-Z0-9._-]+\.[a-z]{2,}(?:\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/g;
const REL_API_RE = /["'`](\/(?:api|rest|v[1-9]|graphql|gateway|backend|svc|service)[a-zA-Z0-9._/${}!?=&#-]*)["'`]/g;
const FETCH_RE = /fetch\(\s*[`"']([^`"']+)[`"']/g;
const AXIOS_RE = /axios(?:\.[a-z]+)?\(\s*[`"']([^`"']+)[`"']/g;

// endpoints worth reporting: path or URL mentions these keywords
const KEY_RE =
  /(api|transcript|caption|subtitle|video|summar|whisper|youtube|yt\/|captions|srt|vtt|graphql|scrape|download|convert|asr)/i;

function originOf(u) {
  try {
    return new URL(u, 'https://x').origin;
  } catch {
    return '';
  }
}

function extract(url, body) {
  const found = new Map(); // key -> {endpoint, kind, host}
  const add = (raw, kind) => {
    if (!raw || raw.length > 200) return;
    if (!KEY_RE.test(raw)) return;
    let ep = raw;
    const abs = raw.startsWith('http');
    if (abs) {
      // strip query noise but keep interesting query names
      ep = raw;
    } else if (!raw.startsWith('/')) return;
    const key = ep.split('?')[0].replace(/https?:\/\//, '');
    if (!found.has(key)) found.set(key, { endpoint: ep, kind, host: originOf(ep) || originOf(url) });
  };

  for (const m of body.matchAll(ABS_URL_RE)) add(m[0], 'url');
  for (const m of body.matchAll(REL_API_RE)) add(m[1], 'rel');
  for (const m of body.matchAll(FETCH_RE)) add(m[1], 'fetch');
  for (const m of body.matchAll(AXIOS_RE)) add(m[1], 'axios');

  // Next.js buildId -> data routes count as internal API surface
  const buildId = body.match(/"buildId":"([^"]+)"/)?.[1];
  return { endpoints: [...found.values()], buildId };
}

const sites = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean) : SITES;

console.error(`Probing ${sites.length} sites...`);
const pages = await pool(sites, (u) => fetchText(u), 12);

const report = [];
const bundleQueue = [];
for (const p of pages) {
  const site = { page: p.url, status: p.status, error: p.error, endpoints: [], buildId: null, bundles: 0 };
  if (p.text) {
    const { endpoints, buildId } = extract(p.url, p.text);
    site.endpoints = endpoints;
    site.buildId = buildId;
    // collect same-origin + cdn script bundles
    const scripts = new Set();
    for (const m of p.text.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
      try {
        const u = new URL(m[1], p.url).href;
        if (/\.(js|mjs)(\?|$)/.test(u)) scripts.add(u);
      } catch {}
    }
    // SPA bundles referenced as plain strings (modulepreload, dynamic imports)
    for (const m of p.text.matchAll(/["'(\s(\/][a-zA-Z0-9_@./-]+\.js(?:\?[a-zA-Z0-9_=&-]+)?["')\s]/g)) {
      try {
        const u = new URL(m[0].replace(/["'()\s]/g, ''), p.url).href;
        if (/\.(js)(\?|$)/.test(u) && new URL(u).host.includes(new URL(p.url).host.replace(/^www\./, '').split('.').slice(-2).join('.')))
          scripts.add(u);
      } catch {}
    }
    site.bundles = scripts.size;
    for (const u of scripts) bundleQueue.push({ site, u });
  }
  report.push(site);
}

console.error(`Fetching ${bundleQueue.length} JS bundles...`);
await pool(bundleQueue, async ({ site, u }) => {
  const r = await fetchText(u, 15000);
  if (r.text) {
    const { endpoints } = extract(u, r.text);
    for (const e of endpoints) if (!site.endpoints.some((x) => x.endpoint === e.endpoint)) site.endpoints.push(e);
  }
}, 12);

const out = process.argv[3] || 'report.json';
fs.writeFileSync(out, JSON.stringify(report, null, 2));

for (const s of report) {
  console.log(`\n=== ${s.page} [${s.status}] bundles=${s.bundles} buildId=${s.buildId ?? '-'}`);
  for (const e of s.endpoints.slice(0, 40)) console.log(`  ${e.kind.padEnd(5)} ${e.endpoint}`);
}
