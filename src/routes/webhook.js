import express from 'express';
import twilio from 'twilio';
import { handleInbound } from '../controllers/webhookController.js';

const router = express.Router();

// Validate Twilio's X-Twilio-Signature so spoofed POSTs are rejected.
// - Uses TWILIO_AUTH_TOKEN (read by twilio.webhook by default).
// - `url` is pinned to TWILIO_WHATSAPP_WEBHOOK_URL because behind Vercel's
//   proxy the reconstructed protocol/host can differ from the public URL Twilio
//   signed against; the signature is computed over the exact configured URL.
// - Set WHATSAPP_SKIP_VALIDATION=true for local ngrok testing if needed.
const shouldValidate =
  !!process.env.TWILIO_AUTH_TOKEN && process.env.WHATSAPP_SKIP_VALIDATION !== 'true';

const validateTwilio = twilio.webhook({
  validate: shouldValidate,
  url: process.env.TWILIO_WHATSAPP_WEBHOOK_URL || undefined,
});

// Twilio POSTs application/x-www-form-urlencoded. express.urlencoded is enabled
// globally in app.js, so req.body is populated before this validator runs.
router.post('/whatsapp', validateTwilio, handleInbound);

export default router;
