// Draws Instagram posts on the server (same design as the Social Studio),
// so the autopilot can post without anyone having a browser open.

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { renderCard, FORMATS } from '../public/assets/js/social-render.js';
import { fetchImage } from './http.js';
import { SITE } from './site.js';

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  // Literal paths so Vercel's bundler ships the font files with the function.
  GlobalFonts.registerFromPath(fileURLToPath(new URL('./fonts/Geist-Bold.ttf', import.meta.url)), 'Geist');
  GlobalFonts.registerFromPath(fileURLToPath(new URL('./fonts/Geist-SemiBold.ttf', import.meta.url)), 'Geist');
  GlobalFonts.registerFromPath(fileURLToPath(new URL('./fonts/GeistMono-Medium.ttf', import.meta.url)), 'Geist Mono');
  GlobalFonts.registerFromPath(fileURLToPath(new URL('./fonts/GeistMono-SemiBold.ttf', import.meta.url)), 'Geist Mono');
  fontsReady = true;
}

async function loadRemote(url) {
  if (!url) return null;
  try {
    const got = await fetchImage(url);
    return got ? await loadImage(got.buf) : null;
  } catch {
    return null;
  }
}

/**
 * card: { title, section, source, kind, image, fallbackImage, style, fmt, kicker, focus }
 * Returns { jpeg: Buffer, usedImage: 'photo'|'topic'|'none' }
 */
export async function renderCardJpeg(card) {
  registerFonts();
  const fmt = FORMATS[card.fmt] ? card.fmt : 'post';
  const [W, H] = FORMATS[fmt];
  let img = await loadRemote(card.image);
  let usedImage = img ? 'photo' : 'none';
  if (!img && card.fallbackImage) {
    img = await loadRemote(card.fallbackImage);
    if (img) usedImage = 'topic';
  }
  // No photo at all → the Ink design looks intentional; the Photo design wouldn't.
  const style = !img && card.style === 'photo' ? 'ink' : card.style || 'photo';
  const canvas = createCanvas(W, H);
  renderCard(canvas.getContext('2d'), {
    fmt,
    style,
    headline: card.title,
    kicker: card.kicker || '',
    focus: card.focus ?? 0.35,
    item: { section: card.section || 'ai', source: card.source || '', kind: card.kind || 'wire' },
    img,
    handle: SITE.instagram,
    timeZone: process.env.SITE_TIMEZONE || 'America/New_York',
  });
  return { jpeg: await canvas.encode('jpeg', 90), usedImage };
}
