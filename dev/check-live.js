// Live health check against the real internet: news feeds, images, markets.
// Runs daily on GitHub Actions (.github/workflows/health.yml) and fails loudly
// if the wire breaks, so you hear about it before readers do.
//   node dev/check-live.js
import { getNews } from '../lib/news.js';
import { getMarkets } from '../lib/markets.js';

const news = await getNews({ force: true });
const ok = news.sources.filter((s) => s.ok);
console.log(`\nNEWS SOURCES: ${ok.length}/${news.sources.length} online`);
for (const s of news.sources) console.log(`  ${s.ok ? 'OK  ' : 'FAIL'} ${s.id.padEnd(22)} ${String(s.items).padStart(3)} items  ${s.ms}ms ${s.error || ''}`);

const st = news.stories;
const real = st.filter((s) => s.image && !s.imageKind).length;
const topic = st.filter((s) => s.imageKind).length;
const none = st.filter((s) => !s.image).length;
console.log(`\nSTORIES: ${st.length} (built in ${news.buildMs}ms)`);
console.log(`IMAGES: ${real} publisher photos, ${topic} topic images, ${none} without image`);
console.log(`BREAKING: ${st.filter((s) => s.breaking).map((s) => s.title).join(' | ') || 'none'}`);
const bySec = {};
for (const s of st) bySec[s.section] = (bySec[s.section] || 0) + 1;
console.log('DESKS:', JSON.stringify(bySec));
console.log('\nTOP 15:');
for (const s of st.slice(0, 15)) console.log(`  [${s.section}] ${s.title.slice(0, 90)} — ${s.source} ${s.image ? (s.imageKind ? `(${s.imageKind}: ${s.image.slice(0, 80)})` : '(photo)') : '(no image)'}`);

const m = await getMarkets();
console.log(`\nMARKETS: ${m.ok ? `OK via ${m.provider}` : 'FAIL ' + JSON.stringify(m.errors)}`);
if (m.ok) console.log('  ' + m.stocks.map((s) => `${s.symbol} ${s.price} (${s.changePct}%)`).join(', '));

const failures = [];
if (ok.length < news.sources.length * 0.6) failures.push('fewer than 60% of news sources are online');
if (st.length < 20) failures.push('fewer than 20 stories');
if (none > st.length * 0.25) failures.push('too many stories without images');
if (failures.length) {
  console.error('\nHEALTH CHECK FAILED: ' + failures.join('; '));
  process.exit(1);
}
console.log('\nHEALTH CHECK PASSED');
