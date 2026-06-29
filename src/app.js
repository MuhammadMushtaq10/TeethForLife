import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { AppDataSource } from './db/index.js';

import appointmentRoutes from './routes/appointmentRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import availabilityRoutes from './routes/availabilityRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import webhookRoutes from './routes/webhook.js';
import cronRoutes from './routes/cron.js';

const app = express();

// Behind Vercel's proxy: trust X-Forwarded-* so req.protocol/host are correct
// (needed for Twilio webhook signature validation and rate-limit client IPs).
app.set('trust proxy', true);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
// Twilio webhooks POST application/x-www-form-urlencoded — parse it globally
// so it's available before the Twilio signature-validation middleware.
app.use(express.urlencoded({ extended: false }));

// Lazy DB init for Lambda cold starts
app.use(async (req, res, next) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    next();
  } catch (err) {
    console.error('DB initialization error:', err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/cron', cronRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
