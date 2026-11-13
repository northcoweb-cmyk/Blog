// Regenerates the PNG brand images (app icons, share image, Instagram profile picture).
// Needs Playwright: run from a folder where `playwright` is installed.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/brand');
const mark = (size, bg = '#09090b', r = 8) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="${r}" fill="${bg}"/><path d="M11 8v16M22 8l-10.5 8L22 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const font = `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..800&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">`;
const page = (w, h, body, bg = '#fff') => `<!doctype html><html><head>${font}<style>*{margin:0;box-sizing:border-box}body{width:${w}px;height:${h}px;background:${bg};font-family:Geist,Helvetica,Arial,sans-serif;overflow:hidden}</style></head><body>${body}</body></html>`;

const poster = (kicker, big, small, dark = true) => `<div style="width:1080px;height:1350px;background:${dark ? '#09090b' : '#fff'};color:${dark ? '#fff' : '#09090b'};padding:84px;display:flex;flex-direction:column;justify-content:space-between">
  <div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;align-items:center;gap:20px">${mark(64, dark ? '#fff' : '#09090b').replace('stroke="#fff"', `stroke="${dark ? '#09090b' : '#fff'}"`)}<span style="font-size:44px;font-weight:800;letter-spacing:-.05em">Kelvane</span></div><span style="font:500 26px 'Geist Mono',monospace;letter-spacing:.06em;opacity:.6">${kicker}</span></div>
  <div style="font-size:168px;font-weight:780;letter-spacing:-.045em;line-height:.9">${big}</div>
  <div style="font:500 30px 'Geist Mono',monospace;letter-spacing:.04em;opacity:.7;border-top:2px solid currentColor;padding-top:28px">${small}</div></div>`;
const jobs = {
  'ig-launch.png': [1080, 1350, poster('HELLO', 'The AI economy, daily.', 'MODELS · MARKETS · STARTUPS · MAIN STREET AI')],
  'ig-template-brief.png': [1080, 1350, poster('THE BRIEF', 'Five stories that matter today.', 'SWAP IN TODAY’S HEADLINES')],
  'ig-template-market.png': [1080, 1350, poster('BY THE NUMBERS', '+0.73%', 'KELVANE AI INDEX · SWAP IN THE DAY’S NUMBER', false)],
  'icon-512.png': [512, 512, mark(512, '#09090b', 0)],
  'icon-192.png': [192, 192, mark(192, '#09090b', 0)],
  'apple-touch-icon.png': [180, 180, mark(180, '#09090b', 0)],
  'favicon-32.png': [32, 32, mark(32)],
  'instagram-profile.png': [1080, 1080, mark(1080, '#09090b', 0)],
  'og-image.png': [1200, 630, `<div style="width:1200px;height:630px;background:#fff;padding:80px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #e4e4e7">
    <div style="display:flex;align-items:center;gap:22px">${mark(84)}<span style="font-size:60px;font-weight:700;letter-spacing:-.04em;color:#09090b">Kelvane</span></div>
    <div><div style="font-size:92px;font-weight:700;letter-spacing:-.05em;line-height:.98;color:#09090b">The AI economy,<br>in one briefing.</div>
    <div style="margin-top:28px;font:500 28px 'Geist Mono',monospace;color:#71717a;letter-spacing:.02em">MODELS · MARKETS · STARTUPS · MAIN STREET</div></div></div>`],
};
const browser = await chromium.launch();
for (const [file, [w, h, body]] of Object.entries(jobs)) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(page(w, h, body), { waitUntil: 'networkidle' }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, file) });
  await p.close();
  console.log('wrote', file);
}
await browser.close();
