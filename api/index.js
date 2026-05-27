// Vercel serverless entrypoint.
// An Express app is itself a (req, res) handler, so Vercel's @vercel/node
// runtime can invoke it directly. All routing/middleware/lazy-DB-init lives in
// src/app.js; this file just exposes it as the default serverless function.
import 'dotenv/config';
import app from '../src/app.js';

export default app;
