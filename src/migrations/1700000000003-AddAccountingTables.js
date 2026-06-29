export class AddAccountingTables1700000000003 {
  name = 'AddAccountingTables1700000000003';

  async up(queryRunner) {
    // POS + Accounting tables (treatments, invoices, payments, expenses).
    // gen_random_uuid() lives in pgcrypto (built into Postgres 13+ / Supabase),
    // so ensure the extension is present. All statements are IF NOT EXISTS so the
    // migration is safe to re-run.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ── treatments ──────────────────────────────────────────────────────────
    // What was actually done at a visit (may differ from the booked service).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS treatments (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id   UUID REFERENCES appointments(id) ON DELETE SET NULL,
        patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        service_id       UUID REFERENCES services(id) ON DELETE SET NULL,
        treatment_date   DATE NOT NULL,
        tooth_numbers    VARCHAR(100),
        diagnosis        TEXT,
        treatment_notes  TEXT,
        next_visit_notes TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── invoices ────────────────────────────────────────────────────────────
    // One invoice per visit. invoice_number is TFL-YYYY-NNNN (generated in the
    // service layer inside a transaction; the UNIQUE constraint is the final guard).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
        patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        invoice_number  VARCHAR(20) UNIQUE NOT NULL,
        subtotal        NUMERIC(10,2) NOT NULL,
        discount_amount NUMERIC(10,2) DEFAULT 0,
        discount_reason VARCHAR(255),
        total_amount    NUMERIC(10,2) NOT NULL,
        status          VARCHAR(20) DEFAULT 'UNPAID',
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── payments ────────────────────────────────────────────────────────────
    // Multiple payments may apply to one invoice (deposit + balance).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        patient_id     UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        amount         NUMERIC(10,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        payment_date   DATE NOT NULL,
        received_by    VARCHAR(100),
        notes          TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── expenses ────────────────────────────────────────────────────────────
    // Clinic operational expenses, used for net-profit calculation.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_date   DATE NOT NULL,
        category       VARCHAR(50) NOT NULL,
        description    TEXT NOT NULL,
        amount         NUMERIC(10,2) NOT NULL,
        vendor         VARCHAR(100),
        receipt_number VARCHAR(100),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── indexes ─────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_appointment ON invoices(appointment_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_treatments_appointment ON treatments(appointment_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_treatments_date ON treatments(treatment_date)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`);

    // At most one non-cancelled invoice per appointment. Backs STEP 5's
    // "auto-create invoice on COMPLETED only if none exists" and prevents
    // accidental duplicates, while still allowing a cancelled invoice to be
    // re-issued for the same appointment.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_active_appointment
      ON invoices (appointment_id)
      WHERE appointment_id IS NOT NULL AND status <> 'CANCELLED'
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS invoices`);
    await queryRunner.query(`DROP TABLE IF EXISTS treatments`);
    await queryRunner.query(`DROP TABLE IF EXISTS expenses`);
  }
}
