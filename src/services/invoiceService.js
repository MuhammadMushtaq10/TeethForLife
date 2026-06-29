import { Not } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Invoice from '../entities/Invoice.js';
import Payment from '../entities/Payment.js';
import Appointment from '../entities/Appointment.js';
import Patient from '../entities/Patient.js';

// NUMERIC columns come back from pg as strings — coerce before any math.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// Payment status derived from money, never set blindly. CANCELLED is sticky and
// handled by the caller (cancelInvoice / explicit status update).
function computeStatus(total, paid) {
  if (paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function getRepo() {
  return AppDataSource.getRepository(Invoice);
}

// Sum of payments per invoice id → { [invoiceId]: number }. Empty input → {}.
async function sumPaidByInvoiceIds(ids) {
  if (!ids || ids.length === 0) return {};
  const rows = await AppDataSource.query(
    `SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid
       FROM payments
      WHERE invoice_id = ANY($1)
      GROUP BY invoice_id`,
    [ids]
  );
  const map = {};
  for (const r of rows) map[r.invoice_id] = round2(r.paid);
  return map;
}

// TFL-YYYY-NNNN. Generated inside the caller's transaction. A per-year advisory
// lock serialises concurrent inserts so two invoices can't grab the same NNNN;
// the invoice_number UNIQUE constraint is the final backstop.
async function generateInvoiceNumber(manager, year) {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`invoice_year_${year}`]);
  const rows = await manager.query(
    `SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::int), 0) + 1 AS next
       FROM invoices
      WHERE invoice_number LIKE $1`,
    [`TFL-${year}-%`]
  );
  const next = num(rows[0]?.next) || 1;
  return `TFL-${year}-${String(next).padStart(4, '0')}`;
}

async function createInvoice(appointmentId, patientId, { subtotal, discountAmount = 0, discountReason = null, notes = null } = {}) {
  const subtotalN = round2(subtotal);
  const discountN = round2(discountAmount);
  const totalN = round2(subtotalN - discountN);
  const year = new Date().getFullYear();

  return AppDataSource.transaction(async (manager) => {
    const invoiceNumber = await generateInvoiceNumber(manager, year);
    const repo = manager.getRepository(Invoice);
    const invoice = repo.create({
      appointment_id: appointmentId || null,
      patient_id: patientId,
      invoice_number: invoiceNumber,
      subtotal: subtotalN,
      discount_amount: discountN,
      discount_reason: discountReason || null,
      total_amount: totalN,
      status: 'UNPAID',
      notes: notes || null,
    });
    return repo.save(invoice);
  });
}

async function addPayment(invoiceId, { amount, paymentMethod, paymentDate, receivedBy = null, notes = null }) {
  return AppDataSource.transaction(async (manager) => {
    const invRepo = manager.getRepository(Invoice);
    const payRepo = manager.getRepository(Payment);

    const invoice = await invRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) return null;
    if (invoice.status === 'CANCELLED') {
      const err = new Error('Cannot add a payment to a cancelled invoice');
      err.code = 'INVOICE_CANCELLED';
      throw err;
    }

    const payment = payRepo.create({
      invoice_id: invoiceId,
      patient_id: invoice.patient_id,
      amount: round2(amount),
      payment_method: paymentMethod,
      payment_date: paymentDate,
      received_by: receivedBy || null,
      notes: notes || null,
    });
    await payRepo.save(payment);

    const [{ paid }] = await manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1`,
      [invoiceId]
    );
    const totalPaid = round2(paid);
    const total = round2(invoice.total_amount);

    invoice.status = computeStatus(total, totalPaid);
    await invRepo.save(invoice); // bumps updated_at

    return { invoice, payment, totalPaid, balance: round2(total - totalPaid) };
  });
}

async function getInvoiceWithPayments(invoiceId) {
  const invoice = await getRepo().findOne({
    where: { id: invoiceId },
    relations: ['patient', 'appointment', 'appointment.service', 'payments'],
  });
  if (!invoice) return null;

  const payments = [...(invoice.payments || [])].sort(
    (a, b) => new Date(a.payment_date) - new Date(b.payment_date)
  );
  const total = round2(invoice.total_amount);
  const totalPaid = round2(payments.reduce((s, p) => s + num(p.amount), 0));

  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    appointment_id: invoice.appointment_id,
    patient: invoice.patient
      ? { id: invoice.patient.id, full_name: invoice.patient.full_name, phone: invoice.patient.phone, email: invoice.patient.email }
      : null,
    service_name: invoice.appointment?.service?.name || null,
    subtotal: round2(invoice.subtotal),
    discount_amount: round2(invoice.discount_amount),
    discount_reason: invoice.discount_reason,
    total_amount: total,
    total_paid: totalPaid,
    balance_due: round2(total - totalPaid),
    // Short aliases the admin UI reads (total / paid / balance).
    total,
    paid: totalPaid,
    balance: round2(total - totalPaid),
    status: invoice.status,
    notes: invoice.notes,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
    payments: payments.map((p) => ({
      id: p.id,
      amount: round2(p.amount),
      payment_method: p.payment_method,
      payment_date: p.payment_date,
      received_by: p.received_by,
      notes: p.notes,
      created_at: p.created_at,
    })),
  };
}

// Current month in Asia/Karachi as { start, end } YYYY-MM-DD (end exclusive).
function karachiMonthBounds() {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit' }).format(new Date());
  const [y, m] = ym.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${y}-${pad(m)}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { start, end };
}

// Month-to-date billing stats for the Billing page header cards. Independent of
// the list filters (revenue recognised on payment date; outstanding is all-time).
async function getBillingStats() {
  const { start, end } = karachiMonthBounds();
  const [{ revenue }] = await AppDataSource.query(
    `SELECT COALESCE(SUM(amount), 0) AS revenue FROM payments WHERE payment_date >= $1 AND payment_date < $2`,
    [start, end]
  );
  const [{ outstanding }] = await AppDataSource.query(
    `SELECT COALESCE(SUM(i.total_amount - COALESCE(
        (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)), 0) AS outstanding
       FROM invoices i WHERE i.status IN ('UNPAID', 'PARTIALLY_PAID')`
  );
  const [{ invoices_month }] = await AppDataSource.query(
    `SELECT COUNT(*) AS invoices_month FROM invoices WHERE created_at >= $1 AND created_at < $2 AND status <> 'CANCELLED'`,
    [start, end]
  );
  const [{ paid_month }] = await AppDataSource.query(
    `SELECT COUNT(*) AS paid_month FROM invoices WHERE created_at >= $1 AND created_at < $2 AND status = 'PAID'`,
    [start, end]
  );
  return {
    totalRevenue: round2(revenue),
    outstanding: round2(outstanding),
    invoicesThisMonth: num(invoices_month),
    fullyPaidThisMonth: num(paid_month),
  };
}

async function listInvoices({ status, patientId, from, to } = {}) {
  const qb = getRepo()
    .createQueryBuilder('i')
    .leftJoinAndSelect('i.patient', 'p')
    .orderBy('i.created_at', 'DESC');

  if (status) qb.andWhere('i.status = :status', { status });
  if (patientId) qb.andWhere('i.patient_id = :patientId', { patientId });
  if (from) qb.andWhere('i.created_at >= :from', { from });
  if (to) qb.andWhere('i.created_at <= :to', { to: `${to} 23:59:59` });

  const invoices = await qb.getMany();
  const paidMap = await sumPaidByInvoiceIds(invoices.map((i) => i.id));

  const rows = invoices.map((i) => {
    const total = round2(i.total_amount);
    const paid = paidMap[i.id] || 0;
    const balance = round2(total - paid);
    return {
      id: i.id,
      invoice_number: i.invoice_number,
      patient_name: i.patient?.full_name || null,
      patient_phone: i.patient?.phone || null,
      patient_id: i.patient_id,
      appointment_id: i.appointment_id,
      subtotal: round2(i.subtotal),
      discount_amount: round2(i.discount_amount),
      total_amount: total,
      total_paid: paid,
      balance_due: balance,
      // Short aliases the admin UI reads (total / paid / balance).
      total,
      paid,
      balance,
      status: i.status,
      created_at: i.created_at,
    };
  });

  const stats = await getBillingStats();
  return { invoices: rows, stats };
}

async function getPatientLedger(patientId) {
  const patientRepo = AppDataSource.getRepository(Patient);
  const patient = await patientRepo.findOne({ where: { id: patientId } });
  if (!patient) return null;

  const invoices = await getRepo().find({
    where: { patient_id: patientId },
    relations: ['payments'],
    order: { created_at: 'DESC' },
  });

  let totalCharged = 0;
  let totalPaid = 0;

  const ledger = invoices.map((inv) => {
    const total = round2(inv.total_amount);
    const paid = round2((inv.payments || []).reduce((s, p) => s + num(p.amount), 0));
    if (inv.status !== 'CANCELLED') {
      totalCharged += total;
      totalPaid += paid;
    }
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      created_at: inv.created_at,
      subtotal: round2(inv.subtotal),
      discount_amount: round2(inv.discount_amount),
      total_amount: total,
      total_paid: paid,
      balance_due: round2(total - paid),
      status: inv.status,
      payments: [...(inv.payments || [])]
        .sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date))
        .map((p) => ({
          id: p.id,
          amount: round2(p.amount),
          payment_method: p.payment_method,
          payment_date: p.payment_date,
          received_by: p.received_by,
        })),
    };
  });

  totalCharged = round2(totalCharged);
  totalPaid = round2(totalPaid);

  return {
    patient: { id: patient.id, full_name: patient.full_name, phone: patient.phone, email: patient.email },
    invoices: ledger,
    summary: {
      invoice_count: ledger.length,
      total_charged: totalCharged,
      total_paid: totalPaid,
      outstanding_balance: round2(totalCharged - totalPaid),
      // Aliases the admin UI reads.
      totalVisits: ledger.length,
      totalCharged,
      totalPaid,
      outstanding: round2(totalCharged - totalPaid),
    },
  };
}

async function updateInvoice(invoiceId, { discountAmount, discountReason, notes, status } = {}) {
  return AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Invoice);
    const invoice = await repo.findOne({ where: { id: invoiceId } });
    if (!invoice) return null;

    if (discountAmount !== undefined) {
      invoice.discount_amount = round2(discountAmount);
      invoice.total_amount = round2(num(invoice.subtotal) - invoice.discount_amount);
    }
    if (discountReason !== undefined) invoice.discount_reason = discountReason || null;
    if (notes !== undefined) invoice.notes = notes || null;

    if (status !== undefined) {
      invoice.status = status;
    } else if (discountAmount !== undefined) {
      // Total changed — re-derive payment status from what's actually been paid.
      const [{ paid }] = await manager.query(
        `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1`,
        [invoiceId]
      );
      invoice.status = computeStatus(round2(invoice.total_amount), round2(paid));
    }

    return repo.save(invoice);
  });
}

async function cancelInvoice(invoiceId) {
  const repo = getRepo();
  const invoice = await repo.findOne({ where: { id: invoiceId } });
  if (!invoice) return null;
  invoice.status = 'CANCELLED';
  return repo.save(invoice);
}

// ── STEP 5 helpers ─────────────────────────────────────────────────────────

// Auto-create an invoice when an appointment is marked COMPLETED. Idempotent:
// returns the existing non-cancelled invoice if one already exists, and is
// resilient to the active-appointment unique index (concurrent completes).
async function autoCreateForAppointment(appointmentId) {
  const existing = await getRepo().findOne({
    where: { appointment_id: appointmentId, status: Not('CANCELLED') },
  });
  if (existing) return existing;

  const appt = await AppDataSource.getRepository(Appointment).findOne({
    where: { id: appointmentId },
    relations: ['service'],
  });
  if (!appt) return null;

  const subtotal = appt.service?.price_pkr ?? 0;
  try {
    return await createInvoice(appointmentId, appt.patient_id, {
      subtotal,
      notes: 'Auto-generated on appointment completion',
    });
  } catch (err) {
    // Lost a race against the partial unique index — fetch the winner.
    if (err?.code === '23505') {
      return getRepo().findOne({ where: { appointment_id: appointmentId, status: Not('CANCELLED') } });
    }
    throw err;
  }
}

// For enriching the admin appointment list: appointment_id → invoice summary.
async function summarizeByAppointmentIds(ids) {
  if (!ids || ids.length === 0) return {};
  const rows = await AppDataSource.query(
    `SELECT i.appointment_id,
            i.id AS invoice_id,
            i.invoice_number,
            i.status,
            i.total_amount,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
       FROM invoices i
      WHERE i.appointment_id = ANY($1)
        AND i.status <> 'CANCELLED'`,
    [ids]
  );
  const map = {};
  for (const r of rows) {
    const total = round2(r.total_amount);
    const paid = round2(r.paid);
    map[r.appointment_id] = {
      invoice_id: r.invoice_id,
      invoice_number: r.invoice_number,
      invoice_status: r.status,
      total_amount: total,
      amount_paid: paid,
      balance_due: round2(total - paid),
    };
  }
  return map;
}

export {
  createInvoice,
  addPayment,
  getInvoiceWithPayments,
  listInvoices,
  getPatientLedger,
  updateInvoice,
  cancelInvoice,
  autoCreateForAppointment,
  summarizeByAppointmentIds,
};
