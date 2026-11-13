// Regenerates the PNG brand images (app icons, share image, Instagram images).
// Needs Playwright: run from a folder where `playwright` is installed:
//   node dev/make-brand.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/brand');
const BOGLE = fs.readFileSync(path.join(ROOT, 'public/assets/fonts/bbh-bogle.ttf')).toString('base64');
const BG = '#000000';
const MINT = '#ffffff';
const css = `@font-face{font-family:B;src:url(data:font/ttf;base64,${BOGLE})}*{margin:0;box-sizing:border-box}body{background:${BG};color:#fff;font-family:B,sans-serif;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(60% 50% at 0% 100%,rgba(255,255,255,.10),transparent 70%),radial-gradient(50% 40% at 100% 0%,rgba(255,255,255,.06),transparent 70%)}`;
const KP = 'M15 12h10.5v40H15z M25.5 30.5 39 17 34 12h19v19l-7-7-20.5 20.5z M35 35 52 52H37.86l-9.93-9.93z';
const mark = (s, bg = '#fff', fg = '#000') => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><path d="${KP}" fill="${fg}"/></svg>`;
const lockup = (size) => `<div style="display:flex;align-items:center;gap:${size * 0.35}px">${mark(size * 1.6)}${wm(size)}</div>`;
const wm = (size) => `<div style="font-size:${size}px;line-height:.8;letter-spacing:.01em">KELVANE<br><span style="color:#8f8f8f">CLUB</span></div>`;
const icon = (s) => `<div style="width:${s}px;height:${s}px;background:#000;display:grid;place-items:center"><svg width="${s * 0.78}" height="${s * 0.78}" viewBox="12 9 44 46"><path d="${KP}" fill="#fff"/></svg></div>`;
const favicon = (s) => mark(s, '#000', '#fff');
const poster = (kicker, big, small) => `<div style="width:1080px;height:1350px;position:relative;padding:84px;display:flex;flex-direction:column;justify-content:space-between"><div class="glow"></div>
  <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start">${lockup(64)}<span style="font-size:34px;letter-spacing:.06em;color:${MINT};border:2px solid ${MINT};border-radius:999px;padding:10px 22px 6px">${kicker}</span></div>
  <div style="position:relative;font-size:200px;line-height:.86">${big}</div>
  <div style="position:relative;font-size:38px;letter-spacing:.06em;color:#d4d4d4;border-top:2px solid rgba(255,255,255,.2);padding-top:30px">${small}</div></div>`;

const jobs = {
  'icon-512.png': [512, 512, icon(512)],
  'icon-192.png': [192, 192, icon(192)],
  'apple-touch-icon.png': [180, 180, icon(180)],
  'favicon-32.png': [32, 32, favicon(32)],
  'instagram-profile.png': [1080, 1080, icon(1080)],
  'og-image.png': [1200, 630, `<div style="width:1200px;height:630px;position:relative;padding:76px;display:flex;flex-direction:column;justify-content:space-between"><div class="glow"></div>
    <div style="position:relative">${lockup(64)}</div>
    <div style="position:relative;font-size:118px;line-height:.86">THE AI ECONOMY,<br><span style="color:${MINT}">EVERY DAY.</span></div>
    <div style="position:relative;font-size:30px;letter-spacing:.08em;color:#a3a3a3">MODELS · MARKETS · STARTUPS · POLICY · MAIN STREET</div></div>`],
  'ig-launch.png': [1080, 1350, poster('HELLO', `THE AI<br>ECONOMY,<br><span style="color:${MINT}">DAILY.</span>`, 'MODELS · MARKETS · STARTUPS · MAIN STREET AI')],
  'ig-template-brief.png': [1080, 1350, poster('THE BRIEF', `5 STORIES<br>THAT <span style="color:${MINT}">MATTER</span><br>TODAY.`, 'SWAP IN TODAY’S HEADLINES')],
  'ig-template-market.png': [1080, 1350, poster('BY THE NUMBERS', `<span style="color:${MINT}">+0.73%</span><br>AI INDEX`, 'SWAP IN THE DAY’S NUMBER')],
};
const browser = await chromium.launch();
for (const [file, [w, h, body]] of Object.entries(jobs)) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><html><head><style>${css}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, file), omitBackground: file === 'favicon-32.png' });
  await p.close();
  console.log('wrote', file);
}
await browser.close();
