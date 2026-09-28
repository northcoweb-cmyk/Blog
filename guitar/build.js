// Bundles guitar/src into one self-contained page: public/guitar/index.html
// Run: npm run guitar:build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const script = ['dsp.js', 'data.js', 'engine.js', 'components.js', 'views.js'].map(src).join('\n');
const html = src('index.html')
  .replace('/*STYLE*/', () => src('style.css'))
  .replace('/*SCRIPT*/', () => script.replace(/<\/script/gi, '<\\/script'));
const out = new URL('../public/guitar/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('index.html', out), html);
console.log(`Built public/guitar/index.html (${Math.round(html.length / 1024)} KB)`);
