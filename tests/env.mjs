// Preloaded (via `node --test --import ./tests/env.mjs`) BEFORE any app code, so
// the TypeORM DataSource is built against an isolated TEST database and never
// touches the real local dev DB or Supabase.
import 'dotenv/config';
import bcrypt from 'bcryptjs';

// Force local (host-based) mode on a dedicated test DB.
delete process.env.DATABASE_URL;
process.env.DB_NAME = process.env.TEST_DB_NAME || 'teethforlife_test';

// Silence TypeORM query logging during tests (db/index.js logs unless production).
process.env.NODE_ENV = 'production';

// Hard-disable any outbound integrations so tests can never send a real
// email / WhatsApp / Twilio call.
for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']) {
  delete process.env[k];
}

// Deterministic admin credentials for the API auth tests, independent of .env.
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.TEST_ADMIN_PASSWORD = 'Test1234!';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('Test1234!', 10);
