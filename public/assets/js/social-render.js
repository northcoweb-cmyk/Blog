// Social post designs (Instagram). Shared by the Social Studio in the browser
// and the Instagram autopilot on the server, so both produce identical images.
// Works with any Canvas 2D context: the browser's, or @napi-rs/canvas.

export const FORMATS = { post: [1080, 1350, 'Feed post 4:5'], square: [1080, 1080, 'Square 1:1'], story: [1080, 1920, 'Story / Reel 9:16'] };
export const STYLES = { photo: 'Photo', ink: 'Ink', paper: 'Paper', breaking: 'Breaking' };
export const SEC_HEX = { ai: '#5b7bff', models: '#9b7bff', markets: '#2fd08f', policy: '#f5a524', startups: '#22c3e6', mainstreet: '#ff7a33', research: '#ff5c93', tech: '#94a3b8', desk: '#5b7bff' };
const SECTION_LONG = { ai: 'Artificial Intelligence', models: 'Models & Launches', markets: 'AI & Markets', policy: 'Policy & Politics', startups: 'Startups & Funding', mainstreet: 'Main Street AI', research: 'Research & Science', tech: 'Tech', desk: 'From the Desk' };

/**
 * Draw a post onto context `x`.
 * st: { fmt, style, headline, kicker, focus: 0..1, item: { section, source, kind }, img, date, handle, timeZone }
 */
export function renderCard(x, st) {
  const [W, H] = FORMATS[st.fmt] || FORMATS.post;
  const img = st.img || null;
  const focus = typeof st.focus === 'number' ? st.focus : { top: 0, center: 0.5, bottom: 1 }[st.focus] ?? 0.5;
  const accent = SEC_HEX[st.item.section] || '#5b7bff';
  const dark = st.style !== 'paper';
  const ink = dark ? '#ffffff' : '#0a0e1a';
  const P = 72;

  // Background
  if ((st.style === 'photo' || st.style === 'breaking') && img) {
    cover(x, img, 0, 0, W, H, focus);
    const g = x.createLinearGradient(0, H * 0.25, 0, H);
    g.addColorStop(0, 'rgba(5,8,15,0)');
    g.addColorStop(0.55, 'rgba(5,8,15,.78)');
    g.addColorStop(1, 'rgba(5,8,15,.96)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const t = x.createLinearGradient(0, 0, 0, 260);
    t.addColorStop(0, 'rgba(5,8,15,.55)');
    t.addColorStop(1, 'rgba(5,8,15,0)');
    x.fillStyle = t;
    x.fillRect(0, 0, W, 260);
  } else {
    x.fillStyle = dark ? '#070a12' : '#f4f2ec';
    x.fillRect(0, 0, W, H);
    const rg = x.createRadialGradient(W, 0, 0, W, 0, W * 0.9);
    rg.addColorStop(0, dark ? accent + '55' : accent + '22');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(10,14,26,.06)';
    x.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 54) (x.beginPath(), x.moveTo(gx, 0), x.lineTo(gx, H), x.stroke());
    for (let gy = 0; gy < H; gy += 54) (x.beginPath(), x.moveTo(0, gy), x.lineTo(W, gy), x.stroke());
    if (img) {
      const ih = Math.round((W - P * 2) * 0.56);
      x.save();
      roundRect(x, P, 190, W - P * 2, ih, 28);
      x.clip();
      cover(x, img, P, 190, W - P * 2, ih, focus);
      x.restore();
    }
  }

  // Brand header
  drawMark(x, P, 72, 56);
  x.fillStyle = ink;
  x.font = '700 38px Geist, sans-serif';
  x.textBaseline = 'middle';
  x.fillText('Tensor', P + 76, 100);
  const tw = x.measureText('Tensor').width;
  x.fillStyle = dark ? '#8ea2ff' : '#2f54ff';
  x.fillText('Street', P + 76 + tw + 2, 100);
  x.font = '500 24px "Geist Mono", monospace';
  x.fillStyle = dark ? 'rgba(255,255,255,.7)' : 'rgba(10,14,26,.6)';
  x.textAlign = 'right';
  x.fillText((st.date || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: st.timeZone || undefined }).toUpperCase(), W - P, 100);
  x.textAlign = 'left';

  // Headline block (bottom-anchored)
  const maxW = W - P * 2;
  let size = st.fmt === 'story' ? 92 : 80;
  let lines;
  const headline = (st.headline || '').trim();
  for (; size >= 44; size -= 4) {
    x.font = `700 ${size}px Geist, sans-serif`;
    lines = wrap(x, headline, maxW);
    if (lines.length <= (st.fmt === 'square' ? 5 : 6)) break;
  }
  const lh = size * 1.06;
  const footerY = H - P - 10;
  const blockBottom = footerY - 70;
  let y = blockBottom - lines.length * lh;

  // Kicker / section chip
  const kick = (st.kicker || (st.style === 'breaking' ? 'BREAKING' : (SECTION_LONG[st.item.section] || 'Artificial Intelligence'))).toUpperCase();
  x.font = '600 26px "Geist Mono", monospace';
  const kw = x.measureText(kick).width + 44;
  const ky = y - 70;
  x.fillStyle = st.style === 'breaking' ? '#ff3b30' : accent;
  roundRect(x, P, ky, kw, 46, 10);
  x.fill();
  x.fillStyle = st.style === 'breaking' || dark ? '#fff' : '#fff';
  x.textBaseline = 'middle';
  x.fillText(kick, P + 22, ky + 24);

  x.fillStyle = ink;
  x.font = `700 ${size}px Geist, sans-serif`;
  x.textBaseline = 'alphabetic';
  lines.forEach((l, i) => x.fillText(l, P, y + (i + 1) * lh - size * 0.18));

  // Footer
  x.fillStyle = dark ? 'rgba(255,255,255,.18)' : 'rgba(10,14,26,.15)';
  x.fillRect(P, footerY - 34, W - P * 2, 2);
  x.font = '500 26px "Geist Mono", monospace';
  x.fillStyle = dark ? 'rgba(255,255,255,.8)' : 'rgba(10,14,26,.7)';
  x.textBaseline = 'middle';
  x.fillText('@' + (st.handle || 'tensorstreet'), P, footerY + 6);
  x.textAlign = 'right';
  x.fillText(st.item.kind === 'wire' ? `via ${st.item.source}`.slice(0, 32) : 'Link in bio →', W - P, footerY + 6);
  x.textAlign = 'left';
}

export function wrap(x, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
export function cover(x, img, dx, dy, dw, dh, focus = 0.5) {
  const s = Math.max(dw / img.width, dh / img.height);
  const w = img.width * s;
  const h = img.height * s;
  x.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) * focus, w, h);
}
export function roundRect(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}
export function drawMark(x, mx, my, s) {
  const k = s / 32;
  x.save();
  x.translate(mx, my);
  x.scale(k, k);
  x.fillStyle = '#0a0e1a';
  roundRect(x, 0, 0, 32, 32, 9);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.15)';
  x.lineWidth = 1;
  x.stroke();
  const g = x.createLinearGradient(7, 20, 25, 8);
  g.addColorStop(0, '#5b7bff');
  g.addColorStop(1, '#2ee6c5');
  x.strokeStyle = g;
  x.lineWidth = 2.4;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  [[7, 20.5], [12.5, 14.5], [17.5, 17.5], [25, 8.5]].forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  x.stroke();
  x.fillStyle = '#fff';
  [[7, 20.5], [12.5, 14.5], [17.5, 17.5]].forEach(([a, b]) => (x.beginPath(), x.arc(a, b, 2.1, 0, 7), x.fill()));
  x.fillStyle = '#2ee6c5';
  x.beginPath();
  x.arc(25, 8.5, 2.6, 0, 7);
  x.fill();
  x.restore();
}


const TAGS = { ai: '#AI #ArtificialIntelligence', models: '#AI #LLM #AIModels', markets: '#AIStocks #Investing #Nvidia', policy: '#AIPolicy #TechPolicy', startups: '#Startups #VentureCapital', mainstreet: '#SmallBusiness #Entrepreneur', research: '#AIResearch #Science', tech: '#Tech #Innovation' };

/** Instagram caption. The first line is always the headline (the autopilot uses it to avoid repeats). */
export function caption(item, headline) {
  return `${headline}\n\n${item.summary ? item.summary + '\n\n' : ''}Get the full story and today's AI briefing at the link in bio.\n\n${item.kind === 'wire' && item.source ? `Source: ${item.source}\n\n` : ''}#TensorStreet ${TAGS[item.section] || '#AI'} #TechNews #FutureOfWork`;
}
