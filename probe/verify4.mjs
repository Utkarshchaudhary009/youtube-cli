const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VID = 'dQw4w9WgXcQ';
const WATCH = `https://www.youtube.com/watch?v=${VID}`;
const jar = {};

async function t(name, url, opts = {}) {
  try {
    const headers = { 'user-agent': UA, accept: '*/*', 'content-type': 'application/json', ...(opts.headers || {}) };
    const host = new URL(url).host;
    if (jar[host]) headers.cookie = jar[host];
    const res = await fetch(url, { ...opts, headers });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; jar[host] = (jar[host] ? jar[host] + '; ' : '') + kv; }
    const text = await res.text();
    console.log(`\n### ${name}\n  ${res.status} ${res.headers.get('content-type')} len=${text.length}\n  ${text.replace(/\s+/g, ' ').slice(0, 260)}`);
    return text;
  } catch (e) { console.log(`\n### ${name}\n  ERROR ${String(e).slice(0, 120)}`); return ''; }
}
const post = (url, body, headers) => ({ method: 'POST', body: JSON.stringify(body), headers });

// downsub bundle analysis
const dsPage = await (await fetch('https://downsub.com/', { headers: { 'user-agent': UA } })).text();
const bundles = [...new Set([...dsPage.matchAll(/["'(\/][a-zA-Z0-9_@./-]+\.js/g)].map((m) => new URL(m[0].replace(/["'(\s]/g, ''), 'https://downsub.com').href))];
for (const u of bundles) {
  const js = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
  const i = js.indexOf('get-info.downsub.com');
  if (i > -1) {
    // find all references within 2000 chars of any apiYTB / get-info usage
    for (const m of js.matchAll(/[\w$.]{1,40}(?:apiYTB|get-info\.downsub\.com)[\w$.]{0,30}\s*[,(]\s*[^;]{0,220}/g))
      console.log(`\n### downsub bundle ${u.split('/').pop()}\n  ${m[0].replace(/\s+/g, ' ').slice(0, 260)}`);
    for (const m of js.matchAll(/\{url:[^}]{0,180}\}/g)) console.log(`  obj: ${m[0].slice(0, 200)}`);
  }
}
// transcriptube with cookie warm-up
await t('transcriptube page (cookie warm)', 'https://transcriptube.com/', {});
await t('transcriptube POST /api/transcript (with cookies)', 'https://transcriptube.com/api/transcript', post({ videoId: VID, platform: 'yt' }, { origin: 'https://transcriptube.com', referer: 'https://transcriptube.com/' }));
// anthiago desegrate
await t('anthiago desegrate GET', 'https://anthiago.com/desegrate/?v=' + VID, { headers: { referer: 'https://anthiago.com/transcript/' } });
await t('anthiago desegrate POST', 'https://anthiago.com/desegrate/', { method: 'POST', body: JSON.stringify({ v: VID }), headers: { referer: 'https://anthiago.com/transcript/', origin: 'https://anthiago.com' } });
// filmot API guesses
await t('filmot /api/getvideos no key', 'https://filmot.com/api/getvideos?id=' + VID, {});
await t('filmot search subtitle', 'https://filmot.com/api/getsubs?key=&id=' + VID, {});
// recapio probe
const recPage = await t('recapio page', 'https://recapio.com/', {});
for (const m of recPage.matchAll(/["'`](\/api[a-zA-Z0-9_\-/${}.?=&]*)["'`]/g)) console.log(`  recapio rel: ${m[1]}`);
for (const m of recPage.matchAll(/["'`](https?:\/\/[a-zA-Z0-9.-]+\/api[a-zA-Z0-9_\-/${}.?=&]*)["'`]/g)) console.log(`  recapio abs: ${m[1]}`);
