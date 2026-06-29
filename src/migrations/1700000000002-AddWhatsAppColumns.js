export class AddWhatsAppColumns1700000000002 {
  name = 'AddWhatsAppColumns1700000000002';

  async up(queryRunner) {
    // Phase 4 (WhatsApp agent) columns on appointments:
    //  - reminder_sent_24h / reminder_sent_2h: idempotency flags so the cron
    //    reminder job never double-sends, even if Vercel Cron fires twice.
    //  - booked_via: provenance of the booking ('website' | 'whatsapp').
    // IF NOT EXISTS keeps the migration safe to re-run.
    await queryRunner.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS reminder_sent_24h BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS reminder_sent_2h  BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS booked_via        VARCHAR(20) NOT NULL DEFAULT 'website'
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS reminder_sent_24h,
        DROP COLUMN IF EXISTS reminder_sent_2h,
        DROP COLUMN IF EXISTS booked_via
    `);
  }
}
