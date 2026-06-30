import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, resetDb, closeDb, makePatient, makeAppointment, firstService, AppDataSource } from './helpers.mjs';
import * as invoiceService from '../src/services/invoiceService.js';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = new Date().getFullYear();

before(initDb);
after(closeDb);
beforeEach(resetDb);

describe('createInvoice', () => {
  test('generates TFL-YYYY-0001 and computes total = subtotal - discount', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000, discountAmount: 500, discountReason: 'Loyalty' });
    assert.equal(inv.invoice_number, `TFL-${YEAR}-0001`);
    assert.equal(Number(inv.total_amount), 4500);
    assert.equal(inv.status, 'UNPAID');
    assert.equal(inv.appointment_id, null);
  });

  test('invoice numbers increment sequentially within the year', async () => {
    const p = await makePatient();
    const a = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    const b = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    assert.equal(a.invoice_number, `TFL-${YEAR}-0001`);
    assert.equal(b.invoice_number, `TFL-${YEAR}-0002`);
  });

  test('defaults discount to 0 when omitted', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 3000 });
    assert.equal(Number(inv.discount_amount), 0);
    assert.equal(Number(inv.total_amount), 3000);
  });
});

describe('addPayment', () => {
  test('partial payment -> PARTIALLY_PAID with correct balance', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 4500 });
    const res = await invoiceService.addPayment(inv.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: TODAY });
    assert.equal(res.invoice.status, 'PARTIALLY_PAID');
    assert.equal(res.totalPaid, 2000);
    assert.equal(res.balance, 2500);
  });

  test('paying the balance -> PAID, balance 0', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 4500 });
    await invoiceService.addPayment(inv.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: TODAY });
    const res = await invoiceService.addPayment(inv.id, { amount: 2500, paymentMethod: 'ONLINE', paymentDate: TODAY });
    assert.equal(res.invoice.status, 'PAID');
    assert.equal(res.balance, 0);
  });

  test('ONLINE payment method persists', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.addPayment(inv.id, { amount: 1000, paymentMethod: 'ONLINE', paymentDate: TODAY });
    const full = await invoiceService.getInvoiceWithPayments(inv.id);
    assert.equal(full.payments[0].payment_method, 'ONLINE');
  });

  test('returns null for a non-existent invoice', async () => {
    const res = await invoiceService.addPayment('11111111-1111-1111-1111-111111111111', { amount: 100, paymentMethod: 'CASH', paymentDate: TODAY });
    assert.equal(res, null);
  });

  test('throws INVOICE_CANCELLED when paying a cancelled invoice', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.cancelInvoice(inv.id);
    await assert.rejects(
      () => invoiceService.addPayment(inv.id, { amount: 100, paymentMethod: 'CASH', paymentDate: TODAY }),
      (e) => e.code === 'INVOICE_CANCELLED'
    );
  });

  test('EDGE: overpayment is currently allowed (status PAID, negative balance) — flagged', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    const res = await invoiceService.addPayment(inv.id, { amount: 1500, paymentMethod: 'CASH', paymentDate: TODAY });
    assert.equal(res.invoice.status, 'PAID');
    assert.equal(res.balance, -500); // documents actual behavior; see SQA report
  });
});

describe('getInvoiceWithPayments', () => {
  test('exposes total/paid/balance aliases and sorts payments by date', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 3000 });
    await invoiceService.addPayment(inv.id, { amount: 1000, paymentMethod: 'CASH', paymentDate: '2026-06-10' });
    await invoiceService.addPayment(inv.id, { amount: 500, paymentMethod: 'CASH', paymentDate: '2026-06-05' });
    const full = await invoiceService.getInvoiceWithPayments(inv.id);
    assert.equal(full.total, 3000);
    assert.equal(full.paid, 1500);
    assert.equal(full.balance, 1500);
    assert.equal(full.payments[0].payment_date <= full.payments[1].payment_date, true);
  });

  test('returns null for unknown id', async () => {
    assert.equal(await invoiceService.getInvoiceWithPayments('11111111-1111-1111-1111-111111111111'), null);
  });
});

describe('listInvoices', () => {
  test('returns { invoices, stats } with month-to-date stats', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(inv.id, { amount: 5000, paymentMethod: 'CASH', paymentDate: TODAY });
    const { invoices, stats } = await invoiceService.listInvoices({});
    assert.equal(invoices.length, 1);
    assert.equal(stats.totalRevenue, 5000);
    assert.equal(stats.invoicesThisMonth, 1);
    assert.equal(stats.fullyPaidThisMonth, 1);
    assert.equal(stats.outstanding, 0);
  });

  test('filters by status', async () => {
    const p = await makePatient();
    const a = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.createInvoice(null, p.id, { subtotal: 2000 });
    await invoiceService.cancelInvoice(a.id);
    const { invoices } = await invoiceService.listInvoices({ status: 'CANCELLED' });
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].status, 'CANCELLED');
  });

  test('filters by patientId', async () => {
    const p1 = await makePatient({ phone: '+923009990001' });
    const p2 = await makePatient({ phone: '+923009990002' });
    await invoiceService.createInvoice(null, p1.id, { subtotal: 1000 });
    await invoiceService.createInvoice(null, p2.id, { subtotal: 2000 });
    const { invoices } = await invoiceService.listInvoices({ patientId: p1.id });
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].patient_id, p1.id);
  });
});

describe('getPatientLedger', () => {
  test('summary excludes cancelled invoices', async () => {
    const p = await makePatient();
    const a = await invoiceService.createInvoice(null, p.id, { subtotal: 4000 });
    await invoiceService.addPayment(a.id, { amount: 1000, paymentMethod: 'CASH', paymentDate: TODAY });
    const b = await invoiceService.createInvoice(null, p.id, { subtotal: 9999 });
    await invoiceService.cancelInvoice(b.id);
    const ledger = await invoiceService.getPatientLedger(p.id);
    assert.equal(ledger.summary.total_charged, 4000); // cancelled 9999 excluded
    assert.equal(ledger.summary.total_paid, 1000);
    assert.equal(ledger.summary.outstanding_balance, 3000);
    assert.equal(ledger.summary.totalCharged, 4000); // alias
  });

  test('each invoice row exposes total/paid/balance aliases (the patient-ledger UI reads these)', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 4000 });
    await invoiceService.addPayment(inv.id, { amount: 1500, paymentMethod: 'CASH', paymentDate: TODAY }); // partial
    const ledger = await invoiceService.getPatientLedger(p.id);
    const row = ledger.invoices.find((i) => i.id === inv.id);
    // short aliases (were missing -> ledger showed PKR 0 for a partial payment)
    assert.equal(row.total, 4000);
    assert.equal(row.paid, 1500);
    assert.equal(row.balance, 2500);
    // long-form fields remain for any consumer relying on them
    assert.equal(row.total_amount, 4000);
    assert.equal(row.total_paid, 1500);
    assert.equal(row.balance_due, 2500);
  });

  test('returns null for unknown patient', async () => {
    assert.equal(await invoiceService.getPatientLedger('11111111-1111-1111-1111-111111111111'), null);
  });
});

describe('updateInvoice', () => {
  test('changing discount recomputes total and payment status', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(inv.id, { amount: 4500, paymentMethod: 'CASH', paymentDate: TODAY }); // PARTIALLY_PAID (of 5000)
    const updated = await invoiceService.updateInvoice(inv.id, { discountAmount: 500 }); // total -> 4500, paid 4500
    assert.equal(Number(updated.total_amount), 4500);
    assert.equal(updated.status, 'PAID');
  });

  test('returns null for unknown id', async () => {
    assert.equal(await invoiceService.updateInvoice('11111111-1111-1111-1111-111111111111', { notes: 'x' }), null);
  });
});

describe('cancelInvoice', () => {
  test('sets status to CANCELLED', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    const c = await invoiceService.cancelInvoice(inv.id);
    assert.equal(c.status, 'CANCELLED');
  });
  test('returns null for unknown id', async () => {
    assert.equal(await invoiceService.cancelInvoice('11111111-1111-1111-1111-111111111111'), null);
  });
});

describe('deleteInvoice', () => {
  test('deletes an invoice with no payments', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    const res = await invoiceService.deleteInvoice(inv.id);
    assert.equal(res.id, inv.id);
    assert.equal(res.paymentsDeleted, 0);
    assert.equal(await invoiceService.getInvoiceWithPayments(inv.id), null);
  });

  test('refuses (throws HAS_PAYMENTS) when the invoice has payments and force is not set', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.addPayment(inv.id, { amount: 500, paymentMethod: 'CASH', paymentDate: TODAY });
    await assert.rejects(
      () => invoiceService.deleteInvoice(inv.id),
      (e) => e.code === 'HAS_PAYMENTS' && e.paymentCount === 1
    );
    // invoice still present after the refused delete
    assert.notEqual(await invoiceService.getInvoiceWithPayments(inv.id), null);
  });

  test('force=true cascades the payments away with the invoice', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.addPayment(inv.id, { amount: 500, paymentMethod: 'CASH', paymentDate: TODAY });
    const res = await invoiceService.deleteInvoice(inv.id, { force: true });
    assert.equal(res.paymentsDeleted, 1);
    assert.equal(await invoiceService.getInvoiceWithPayments(inv.id), null);
    const [{ count }] = await AppDataSource.query('SELECT COUNT(*) AS count FROM payments WHERE invoice_id = $1', [inv.id]);
    assert.equal(Number(count), 0);
  });

  test('returns null for unknown id', async () => {
    assert.equal(await invoiceService.deleteInvoice('11111111-1111-1111-1111-111111111111'), null);
  });
});

describe('deletePayment', () => {
  test('deleting a payment re-derives invoice status (PAID -> PARTIALLY_PAID)', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 3000 });
    await invoiceService.addPayment(inv.id, { amount: 1000, paymentMethod: 'CASH', paymentDate: TODAY });
    const second = await invoiceService.addPayment(inv.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: TODAY });
    assert.equal(second.invoice.status, 'PAID');

    const res = await invoiceService.deletePayment(inv.id, second.payment.id);
    assert.equal(res.id, second.payment.id);
    const full = await invoiceService.getInvoiceWithPayments(inv.id);
    assert.equal(full.paid, 1000);
    assert.equal(full.status, 'PARTIALLY_PAID');
  });

  test('deleting the only payment reverts the invoice to UNPAID', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    const pay = await invoiceService.addPayment(inv.id, { amount: 1000, paymentMethod: 'CASH', paymentDate: TODAY });
    await invoiceService.deletePayment(inv.id, pay.payment.id);
    const full = await invoiceService.getInvoiceWithPayments(inv.id);
    assert.equal(full.paid, 0);
    assert.equal(full.status, 'UNPAID');
  });

  test('returns null when the payment does not belong to the invoice', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    assert.equal(await invoiceService.deletePayment(inv.id, '11111111-1111-1111-1111-111111111111'), null);
  });
});

describe('autoCreateForAppointment', () => {
  test('creates an invoice from the booked service price', async () => {
    const svc = await firstService();
    const { appt } = await makeAppointment({ service: svc });
    const inv = await invoiceService.autoCreateForAppointment(appt.id);
    assert.equal(Number(inv.subtotal), Number(svc.price_pkr));
    assert.equal(inv.appointment_id, appt.id);
  });

  test('is idempotent — second call returns the same invoice, no duplicate', async () => {
    const { appt } = await makeAppointment();
    const first = await invoiceService.autoCreateForAppointment(appt.id);
    const second = await invoiceService.autoCreateForAppointment(appt.id);
    assert.equal(first.id, second.id);
    const { invoices } = await invoiceService.listInvoices({});
    assert.equal(invoices.length, 1);
  });

  test('returns null for a non-existent appointment', async () => {
    assert.equal(await invoiceService.autoCreateForAppointment('11111111-1111-1111-1111-111111111111'), null);
  });
});
