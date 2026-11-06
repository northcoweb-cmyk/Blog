// The HTML shells in /pages, loaded once. The server fills in <head> tags and
// real content for each request (see lib/seo.js), so search engines see full pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pages');

export const TEMPLATES = Object.fromEntries(
  fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(DIR, f), 'utf8')]),
);
