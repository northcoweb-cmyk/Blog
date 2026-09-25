// Admin endpoints: /api/admin/* — sign-in, posts, uploads, AI drafts, newsletter.
import { makeHandler } from '../lib/router.js';
import { adminRoutes } from '../lib/handlers/admin.js';

export default makeHandler(adminRoutes, 'admin');
