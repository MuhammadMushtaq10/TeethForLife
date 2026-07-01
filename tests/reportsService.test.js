import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, resetDb, closeDb, makePatient, makeAppointment, firstService } from './helpers.mjs';
import * as invoiceService from '../src/services/invoiceService.js';
import * as expenseService from '../src/services/expenseService.js';
import * as reportsService from '../src/services/reportsService.js';

before(initDb);
after(closeDb);
beforeEach(resetDb);

describe('getDailyReport', () => {
  test('aggregates revenue, expenses, net profit and payment breakdown for the day', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(inv.id, { amount: 3000, paymentMethod: 'CASH', paymentDate: '2026-06-15' });
    await invoiceService.addPayment(inv.id, { amount: 2000, paymentMethod: 'ONLINE', paymentDate: '2026-06-15' });
    await expenseService.createExpense({ expense_date: '2026-06-15', category: 'SUPPLIES', description: 'x', amount: 1000 });

    const r = await reportsService.getDailyReport('2026-06-15');
    assert.equal(r.revenue, 5000);
    assert.equal(r.expenses, 1000); // numeric for the UI card
    assert.equal(r.netProfit, 4000);
    const cash = r.paymentBreakdown.find((m) => m.method === 'CASH');
    const online = r.paymentBreakdown.find((m) => m.method === 'ONLINE');
    assert.equal(cash.amount, 3000);
    assert.equal(online.amount, 2000);
  });

  test('a payment on another day does not leak into the day total', async () => {
    const p = await makePatient();
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(inv.id, { amount: 5000, paymentMethod: 'CASH', paymentDate: '2026-06-14' });
    const r = await reportsService.getDailyReport('2026-06-15');
    assert.equal(r.revenue, 0);
  });
});

describe('getMonthlyReport', () => {
  test('recognises revenue by payment date, attributes by service, counts completed appts', async () => {
    const svc = await firstService();
    const { appt } = await makeAppointment({ service: svc, date: '2026-06-15', status: 'COMPLETED' });
    const inv = await invoiceService.autoCreateForAppointment(appt.id); // subtotal = service price
    await invoiceService.addPayment(inv.id, { amount: Number(svc.price_pkr), paymentMethod: 'CASH', paymentDate: '2026-06-15' });

    // A payment in the previous month must be excluded from June.
    const p2 = await makePatient({ phone: '+923009990010' });
    const prev = await invoiceService.createInvoice(null, p2.id, { subtotal: 9999 });
    await invoiceService.addPayment(prev.id, { amount: 9999, paymentMethod: 'CASH', paymentDate: '2026-05-20' });

    await expenseService.createExpense({ expense_date: '2026-06-05', category: 'RENT', description: 'rent', amount: 1000 });

    const r = await reportsService.getMonthlyReport(2026, 6);
    assert.equal(r.totalRevenue, Number(svc.price_pkr)); // May payment excluded
    assert.equal(r.totalExpenses, 1000);
    assert.equal(r.netProfit, Number(svc.price_pkr) - 1000);
    assert.equal(r.appointmentsCompleted, 1);
    assert.equal(r.daily.length, 30); // June has 30 days
    const svcRow = r.revenueByService.find((s) => s.service === svc.name);
    assert.ok(svcRow, 'service revenue attributed');
    assert.equal(svcRow.amount, Number(svc.price_pkr));
  });

  test('top patients ranked by spend with name + amount aliases', async () => {
    const big = await makePatient({ full_name: 'Big Spender', phone: '+923009990020' });
    const small = await makePatient({ full_name: 'Small Spender', phone: '+923009990021' });
    const i1 = await invoiceService.createInvoice(null, big.id, { subtotal: 8000 });
    await invoiceService.addPayment(i1.id, { amount: 8000, paymentMethod: 'CASH', paymentDate: '2026-06-10' });
    const i2 = await invoiceService.createInvoice(null, small.id, { subtotal: 2000 });
    await invoiceService.addPayment(i2.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: '2026-06-10' });

    const r = await reportsService.getMonthlyReport(2026, 6);
    assert.equal(r.topPatients[0].name, 'Big Spender');
    assert.equal(r.topPatients[0].amount, 8000);
  });

  test('breaks expenses down by category and lists each expense item', async () => {
    await expenseService.createExpense({ expense_date: '2026-06-03', category: 'RENT', description: 'June rent', amount: 30000, vendor: 'Landlord' });
    await expenseService.createExpense({ expense_date: '2026-06-08', category: 'SUPPLIES', description: 'Gloves', amount: 1500 });
    await expenseService.createExpense({ expense_date: '2026-06-09', category: 'SUPPLIES', description: 'Masks', amount: 500 });

    const r = await reportsService.getMonthlyReport(2026, 6);
    assert.equal(r.totalExpenses, 32000);
    const supplies = r.expenses_by_category.find((c) => c.category === 'SUPPLIES');
    const rent = r.expenses_by_category.find((c) => c.category === 'RENT');
    assert.equal(supplies.amount, 2000);
    assert.equal(supplies.count, 2);
    assert.equal(rent.amount, 30000);
    assert.equal(r.expense_items.length, 3); // itemised breakdown
    assert.ok(r.expense_items.every((e) => e.expense_date && e.category && typeof e.amount === 'number'));
  });
});

describe('getWeeklyReport', () => {
  test('covers Mon–Sun of the given week and excludes days outside it', async () => {
    const p = await makePatient();
    // Week of 2026-06-15 (Mon) .. 2026-06-21 (Sun).
    const inv = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(inv.id, { amount: 3000, paymentMethod: 'CASH', paymentDate: '2026-06-16' });
    await invoiceService.addPayment(inv.id, { amount: 2000, paymentMethod: 'ONLINE', paymentDate: '2026-06-21' });
    // A payment the day BEFORE the week (Sun 2026-06-14) must be excluded.
    const inv2 = await invoiceService.createInvoice(null, p.id, { subtotal: 9999 });
    await invoiceService.addPayment(inv2.id, { amount: 9999, paymentMethod: 'CASH', paymentDate: '2026-06-14' });
    await expenseService.createExpense({ expense_date: '2026-06-17', category: 'SUPPLIES', description: 'Gloves', amount: 800 });

    const r = await reportsService.getWeeklyReport('2026-06-15');
    assert.equal(r.report_type, 'WEEKLY');
    assert.equal(r.week_start, '2026-06-15');
    assert.equal(r.week_end, '2026-06-21');
    assert.equal(r.daily.length, 7); // exactly one week
    assert.equal(r.totalRevenue, 5000); // 3000 + 2000; the 06-14 payment excluded
    assert.equal(r.totalExpenses, 800);
    assert.equal(r.netProfit, 4200);
    const cash = r.revenue_by_method.find((m) => m.method === 'CASH');
    const online = r.revenue_by_method.find((m) => m.method === 'ONLINE');
    assert.equal(cash.amount, 3000);
    assert.equal(online.amount, 2000);
    assert.equal(r.expenses_by_category[0].category, 'SUPPLIES');
    assert.equal(r.expense_items.length, 1);

    // Itemised payments — who paid what (the report's single revenue section).
    assert.equal(r.payment_items.length, 2);
    assert.equal(r.payment_items.reduce((s, x) => s + x.amount, 0), 5000);
    assert.ok(r.payment_items.every((x) => x.patient_name && typeof x.amount === 'number'));
  });
});

describe('getYearlyReport', () => {
  test('breaks revenue down by month and picks the best month', async () => {
    const p = await makePatient();
    const a = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.addPayment(a.id, { amount: 5000, paymentMethod: 'CASH', paymentDate: '2026-06-10' });
    const b = await invoiceService.createInvoice(null, p.id, { subtotal: 2000 });
    await invoiceService.addPayment(b.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: '2026-03-10' });

    const r = await reportsService.getYearlyReport(2026);
    assert.equal(r.annualRevenue, 7000);
    assert.equal(r.monthly.length, 12);
    assert.equal(r.monthly[5].revenue, 5000); // June (index 5)
    assert.equal(r.monthly[2].revenue, 2000); // March (index 2)
    assert.equal(r.bestMonth, 'Jun');
    assert.ok(r.totalPatients >= 1);
  });
});

describe('getOutstandingBalances', () => {
  test('includes UNPAID + PARTIALLY_PAID, excludes PAID + CANCELLED', async () => {
    const p = await makePatient({ phone: '+923009990030' });

    const unpaid = await invoiceService.createInvoice(null, p.id, { subtotal: 4000 }); // UNPAID, bal 4000

    const partial = await invoiceService.createInvoice(null, p.id, { subtotal: 6000 });
    await invoiceService.addPayment(partial.id, { amount: 2000, paymentMethod: 'CASH', paymentDate: '2026-06-10' }); // bal 4000

    const paid = await invoiceService.createInvoice(null, p.id, { subtotal: 1000 });
    await invoiceService.addPayment(paid.id, { amount: 1000, paymentMethod: 'CASH', paymentDate: '2026-06-10' }); // excluded

    const cancelled = await invoiceService.createInvoice(null, p.id, { subtotal: 5000 });
    await invoiceService.cancelInvoice(cancelled.id); // excluded

    const r = await reportsService.getOutstandingBalances();
    assert.equal(r.count, 2);
    assert.equal(r.total_outstanding, 8000);
    // alias fields the UI reads
    assert.ok('phone' in r.invoices[0]);
    assert.ok('balance' in r.invoices[0]);
    assert.equal(typeof r.invoices[0].days_overdue, 'number');
  });
});
