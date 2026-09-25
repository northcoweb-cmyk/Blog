// Public endpoints: /api/news, /api/markets, /api/brief, /api/story, /api/posts, /media/*, /p/:slug, /rss.xml …
// (Routed here by the rewrites in vercel.json. The logic lives in lib/handlers/public.js.)
import { makeHandler } from '../lib/router.js';
import { publicRoutes } from '../lib/handlers/public.js';

export default makeHandler(publicRoutes, '');
