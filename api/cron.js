// Scheduled jobs: /api/cron/daily (see "crons" in vercel.json).
import { makeHandler } from '../lib/router.js';
import { cronRoutes } from '../lib/handlers/cron.js';

export default makeHandler(cronRoutes, 'cron');
