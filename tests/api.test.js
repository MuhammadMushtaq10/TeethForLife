import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { initDb, resetDb, closeDb, makeAppointment } from './helpers.mjs';

let server;
let base;
let token;

async function api(method, path, { token: tok, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, ct };
}

before(async () => {
  await initDb();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await api('POST', '/api/admin/login', {
    body: { email: process.env.ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD },
  });
  token = login.data.token;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await closeDb();
});

beforeEach(resetDb);

describe('auth', () => {
  test('protected route without a token -> 401', async () => {
    const r = await api('GET', '/api/admin/invoices');
    assert.equal(r.status, 401);
  });

  test('login with wrong password -> 401', async () => {
    const r = await api('POST', '/api/admin/login', { body: { email: process.env.ADMIN_EMAIL, password: 'wrong' } });
    assert.equal(r.status, 401);
  });

  test('login with correct credentials -> 200 + token', async () => {
    assert.ok(token, 'token issued in before()');
    const r = await api('POST', '/api/admin/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } });
    assert.equal(r.status, 200);
    assert.ok(r.data.token);
  });
});

describe('invoices API', () => {
  test('create by name + phone -> 201 with invoice number', async () => {
    const r = await api('POST', '/api/admin/invoices', {
      token,
      body: { full_name: 'Walk In', phone: '+923001234567', subtotal: 5000, discount_amount: 500 },
    });
    assert.equal(r.status, 201);
    assert.match(r.data.invoice.invoice_number, /^TFL-\d{4}-\d{4}$/);
    assert.equal(r.data.invoice.total_amount, 4500);
  });

  test('create without patient identity -> 400', async () => {
    const r = await api('POST', '/api/admin/invoices', { token, body: { subtotal: 5000 } });
    assert.equal(r.status, 400);
  });

  test('list returns { invoices, stats }', async () => {
    await api('POST', '/api/admin/invoices', { token, body: { full_name: 'A B', phone: '+923001234568', subtotal: 1000 } });
    const r = await api('GET', '/api/admin/invoices', { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.invoices));
    assert.ok(r.data.stats && typeof r.data.stats.totalRevenue === 'number');
  });

  test('record an ONLINE payment -> 201 and status advances', async () => {
    const c = await api('POST', '/api/admin/invoices', { token, body: { full_name: 'Pay Me', phone: '+923001234569', subtotal: 2000 } });
    const id = c.data.invoice.id;
    const r = await api('POST', `/api/admin/invoices/${id}/payments`, {
      token,
      body: { amount: 2000, payment_method: 'ONLINE', payment_date: '2026-06-15' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.invoice.status, 'PAID');
    assert.equal(r.data.invoice.balance_due, 0);
  });

  test('payment with invalid method -> 400', async () => {
    const c = await api('POST', '/api/admin/invoices', { token, body: { full_name: 'Bad Pay', phone: '+923001234570', subtotal: 2000 } });
    const r = await api('POST', `/api/admin/invoices/${c.data.invoice.id}/payments`, {
      token,
      body: { amount: 100, payment_method: 'GOLD', payment_date: '2026-06-15' },
    });
    assert.equal(r.status, 400);
  });

  test('invoice PDF -> 200 application/pdf', async () => {
    const c = await api('POST', '/api/admin/invoices', { token, body: { full_name: 'Pdf Guy', phone: '+923001234571', subtotal: 1500 } });
    const r = await api('GET', `/api/admin/invoices/${c.data.invoice.id}/pdf`, { token });
    assert.equal(r.status, 200);
    assert.match(r.ct, /application\/pdf/);
    assert.equal(r.data.subarray(0, 5).toString(), '%PDF-');
  });

  test('cancel via DELETE -> 200 CANCELLED', async () => {
    const c = await api('POST', '/api/admin/invoices', { token, body: { full_name: 'Cancel Me', phone: '+923001234572', subtotal: 1000 } });
    const r = await api('DELETE', `/api/admin/invoices/${c.data.invoice.id}/cancel`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'CANCELLED');
  });
});

describe('expenses API', () => {
  test('create + list', async () => {
    const c = await api('POST', '/api/admin/expenses', {
      token,
      body: { expense_date: '2026-06-15', category: 'SUPPLIES', description: 'Masks', amount: 800 },
    });
    assert.equal(c.status, 201);
    const r = await api('GET', '/api/admin/expenses', { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 800);
  });
});

describe('appointment completion auto-invoice', () => {
  test('PATCH status COMPLETED creates an invoice from the service price', async () => {
    const { appt, service } = await makeAppointment();
    const r = await api('PATCH', `/api/admin/appointments/${appt.id}`, { token, body: { status: 'COMPLETED' } });
    assert.equal(r.status, 200);
    assert.ok(r.data.invoice, 'invoice auto-created');
    assert.equal(Number(r.data.invoice.total_amount), Number(service.price_pkr));

    const list = await api('GET', '/api/admin/invoices', { token });
    assert.equal(list.data.invoices.length, 1);
  });
});

describe('reports API', () => {
  test('monthly -> 200 with numeric totalRevenue', async () => {
    const r = await api('GET', '/api/admin/reports/monthly?year=2026&month=6', { token });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.totalRevenue, 'number');
  });

  test('outstanding -> 200 with invoices array', async () => {
    const r = await api('GET', '/api/admin/reports/outstanding', { token });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.invoices));
  });
});
