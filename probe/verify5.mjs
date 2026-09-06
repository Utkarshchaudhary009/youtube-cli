const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${VID}`;

async function t(name, url, opts = {}) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', 'content-type': 'application/json', ...(opts.headers || {}) }, ...opts });
    const text = await res.text();
    console.log(`\n### ${name}\n  ${res.status} ${res.headers.get('content-type')} len=${text.length}\n  ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
    return text;
  } catch (e) { console.log(`\n### ${name}\n  ERROR ${String(e).slice(0, 100)}`); return ''; }
}
const post = (url, body, headers) => ({ method: 'POST', body: JSON.stringify(body), headers });

await t('transcriptube {url}', 'https://transcriptube.com/api/transcript', post({ url: WATCH, platform: 'yt' }, { origin: 'https://transcriptube.com' }));
await t('transcriptube {videoUrl}', 'https://transcriptube.com/api/transcript', post({ videoUrl: WATCH, platform: 'yt' }, { origin: 'https://transcriptube.com' }));

// anthiago sveltekit bundles
const page = await (await fetch('https://anthiago.com/transcript/', { headers: { 'user-agent': UA } })).text();
const urls = [...new Set([...page.matchAll(/["'(\/][a-zA-Z0-9_@./-]+\.js/g)].map((m) => new URL(m[0].replace(/["'(\s]/g, ''), 'https://anthiago.com').href))];
console.log(`\nanthiago bundles: ${urls.length}`);
for (const u of urls) {
  const js = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
  for (const m of js.matchAll(/["'`](https?:\/\/[^"'`\s]{6,120})["'`]/g)) {
    if (/anthiago|desegrate|api|transcript/i.test(m[1]) && !/w3\.org|schema|google|cloudflare/.test(m[1])) console.log(`  ${u.split('/').pop()}: ${m[1]}`);
  }
  for (const m of js.matchAll(/fetch\(\s*[^)]{0,140}/g)) {
    if (/api|transcript|v=|\?/.test(m[0]) && !/google|cloudflare/i.test(m[0])) console.log(`  fetch in ${u.split('/').pop()}: ${m[0].replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}

// recapio chunks: find /api strings in a few chunks
const recUrls = [...new Set([...page.matchAll(/["'(\/][a-zA-Z0-9_@./-]+\.js/g)].map((m) => new URL(m[0].replace(/["'(\s]/g, ''), 'https://recapio.com').href))].slice(0, 30);
for (const u of recUrls) {
  const js = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
  for (const m of js.matchAll(/["'`](\/(?:api|v1|trpc)[a-zA-Z0-9_\-/${}.?=&[\]]*)["'`]/g)) console.log(`  recapio ${u.split('/').pop()}: ${m[1]}`);
  for (const m of js.matchAll(/["'`](https?:\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}\/(?:api|v1|trpc)[a-zA-Z0-9_\-/${}.?=&[\]]*)["'`]/g)) console.log(`  recapio-abs ${u.split('/').pop()}: ${m[1]}`);
}
