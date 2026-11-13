// Brand settings. Change the name here (and in public/assets/js/site.js) to rebrand.
export const SITE = {
  name: process.env.SITE_NAME || 'Kelvane',
  tagline: 'The daily briefing on the AI economy',
  description:
    'Kelvane is a free daily briefing on artificial intelligence: model launches, AI stocks and markets, policy, startups, and how small businesses are putting AI to work. Updated all day.',
  instagram: process.env.INSTAGRAM_HANDLE || 'tensorstreet',
  x: process.env.X_HANDLE || '',
  email: process.env.CONTACT_EMAIL || '',
};
