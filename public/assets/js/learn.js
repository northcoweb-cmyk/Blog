import { $, esc, initChrome } from './site.js';
import { TERMS, termSlug } from './glossary-data.js';

initChrome({ active: 'learn' });


const CATS = ['All', ...new Set(TERMS.map((t) => t[1]))];
let cat = 'All';
let filter = '';

function render() {
  const f = filter.toLowerCase();
  const list = TERMS.filter((t) => (cat === 'All' || t[1] === cat) && (!f || `${t[0]} ${t[2]}`.toLowerCase().includes(f)));
  $('#gloss').innerHTML = list.length
    ? list
        .map(
          ([term, c, def, eg]) => `<article class="term" id="${termSlug(term)}"><span class="chip" data-sec="research">${esc(c)}</span><h3 style="margin-top:8px"><a href="/learn/${termSlug(term)}">${esc(term)}</a></h3><p>${esc(def)}</p><p class="eg"><strong>In the news:</strong> ${esc(eg)}</p></article>`,
        )
        .join('')
    : '<div class="empty" style="grid-column:1/-1">No terms match. Try another word.</div>';
  $('#gloss-tabs').innerHTML = CATS.map((c) => `<button aria-selected="${c === cat}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
}
$('#gloss-tabs').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) {
    cat = b.dataset.c;
    render();
  }
};
$('#gloss-filter').oninput = (e) => {
  filter = e.target.value;
  render();
};
render();
