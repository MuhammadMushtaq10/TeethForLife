import express from 'express';
import reminderJob from '../jobs/reminderJob.js';

const router = express.Router();

// Cron auth guard.
//
// Vercel Cron does NOT support custom headers in vercel.json. Instead, when a
// CRON_SECRET env var is set on the project, Vercel automatically attaches
// `Authorization: Bearer <CRON_SECRET>` to every cron request. That is the
// canonical 2024+ way to authenticate Vercel Cron.
//
// We accept that header, and also accept `x-cron-secret: <CRON_SECRET>` so the
// endpoint can be triggered manually (curl) or by a non-Vercel scheduler.
// If CRON_SECRET is unset we fail closed (401) to avoid an open endpoint.
function authorizeCron(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing request');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const authHeader = req.headers['authorization'];
  const bearerOk = authHeader === `Bearer ${secret}`;
  const customOk = req.headers['x-cron-secret'] === secret;
  if (!bearerOk && !customOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/reminders', authorizeCron, reminderJob);

export default router;
