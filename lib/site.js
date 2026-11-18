// Brand settings. Change the name here (and in public/assets/js/site.js) to rebrand.
export const SITE = {
  name: process.env.SITE_NAME || 'Kelvane Club',
  alternateNames: ['Kelvane', 'kelvane.club', 'KelvaneClub', 'Kelvane Club AI News'],
  // The official address. Search engines are always told this one.
  url: (process.env.SITE_URL || 'https://kelvane.club').replace(/\/$/, ''),
  tagline: 'The daily briefing on the AI economy',
  description:
    'Kelvane Club is a free daily briefing on artificial intelligence: model launches, AI stocks and markets, policy, startups, and how small businesses are putting AI to work. Updated all day.',
  // Always @kelvaneclub (an old INSTAGRAM_HANDLE setting in Vercel can't send people to the old account).
  instagram: 'kelvaneclub',
  x: process.env.X_HANDLE || '',
  email: process.env.CONTACT_EMAIL || '',
};

/** Plain answers about the brand: shown on the homepage and About page, and given to Google as FAQ data. */
export const BRAND_FAQ = [
  ['What is Kelvane Club?', 'Kelvane Club (kelvane.club) is a free daily news site about artificial intelligence and the AI economy: new AI models, AI stocks and markets, regulation, startup funding, and how small businesses use AI.'],
  ['Is Kelvane Club free?', 'Yes. Every story, the daily Brief, the AI market tape and the AI glossary are free to read, with no account needed.'],
  ['How often is Kelvane Club updated?', 'All day. The live wire checks dozens of newsrooms and AI labs every few minutes, and a new edition of The Brief is published every morning.'],
  ['Where does Kelvane Club get its news?', 'Kelvane Club tracks reporting from trusted outlets and the AI labs themselves, then writes each story up in its own words and names the original source.'],
  ['Where can I follow Kelvane Club?', 'On the web at kelvane.club and on Instagram at @kelvaneclub.'],
];

