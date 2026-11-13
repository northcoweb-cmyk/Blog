// Brand settings. Change the name here (and in public/assets/js/site.js) to rebrand.
export const SITE = {
  name: process.env.SITE_NAME || 'Kelvane Club',
  alternateNames: ['Kelvane', 'kelvane.club', 'KelvaneClub', 'Kelvane Club AI News'],
  // The official address. Search engines are always told this one.
  url: (process.env.SITE_URL || 'https://kelvane.club').replace(/\/$/, ''),
  tagline: 'The daily briefing on the AI economy',
  description:
    'Kelvane Club is a free daily briefing on artificial intelligence: model launches, AI stocks and markets, policy, startups, and how small businesses are putting AI to work. Updated all day.',
  instagram: process.env.INSTAGRAM_HANDLE || 'kelvaneclub',
  x: process.env.X_HANDLE || '',
  email: process.env.CONTACT_EMAIL || '',
};
