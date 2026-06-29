import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceCreateSchema,
  invoiceUpdateSchema,
  paymentSchema,
  expenseCreateSchema,
  treatmentCreateSchema,
} from '../src/validators/schemas.js';

const ok = (schema, data) => schema.safeParse(data).success;

describe('invoiceCreateSchema', () => {
  test('valid with patient_id', () => {
    assert.ok(ok(invoiceCreateSchema, { patient_id: '11111111-1111-1111-1111-111111111111', subtotal: 5000 }));
  });

  test('valid with full_name + phone (no appointment)', () => {
    assert.ok(ok(invoiceCreateSchema, { full_name: 'Ali Khan', phone: '+923001234567', subtotal: 5000 }));
  });

  test('rejects when neither patient_id nor name+phone provided', () => {
    assert.equal(ok(invoiceCreateSchema, { subtotal: 5000 }), false);
  });

  test('rejects name without phone', () => {
    assert.equal(ok(invoiceCreateSchema, { full_name: 'Ali Khan', subtotal: 5000 }), false);
  });

  test('rejects discount greater than subtotal', () => {
    assert.equal(ok(invoiceCreateSchema, { patient_id: '11111111-1111-1111-1111-111111111111', subtotal: 1000, discount_amount: 2000 }), false);
  });

  test('rejects negative subtotal', () => {
    assert.equal(ok(invoiceCreateSchema, { patient_id: '11111111-1111-1111-1111-111111111111', subtotal: -1 }), false);
  });

  test('coerces numeric strings', () => {
    const r = invoiceCreateSchema.safeParse({ patient_id: '11111111-1111-1111-1111-111111111111', subtotal: '5000', discount_amount: '500' });
    assert.ok(r.success);
    assert.equal(r.data.subtotal, 5000);
    assert.equal(r.data.discount_amount, 500);
  });

  test('rejects invalid phone format', () => {
    assert.equal(ok(invoiceCreateSchema, { full_name: 'Ali', phone: '12345', subtotal: 100 }), false);
  });
});

describe('paymentSchema', () => {
  for (const m of ['CASH', 'ONLINE', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH']) {
    test(`accepts method ${m}`, () => {
      assert.ok(ok(paymentSchema, { amount: 100, payment_method: m, payment_date: '2026-06-29' }));
    });
  }
  test('rejects unknown method', () => {
    assert.equal(ok(paymentSchema, { amount: 100, payment_method: 'BITCOIN', payment_date: '2026-06-29' }), false);
  });
  test('rejects amount <= 0', () => {
    assert.equal(ok(paymentSchema, { amount: 0, payment_method: 'CASH', payment_date: '2026-06-29' }), false);
  });
  test('rejects bad date format', () => {
    assert.equal(ok(paymentSchema, { amount: 100, payment_method: 'CASH', payment_date: '29-06-2026' }), false);
  });
});

describe('expenseCreateSchema', () => {
  test('valid', () => {
    assert.ok(ok(expenseCreateSchema, { expense_date: '2026-06-29', category: 'SUPPLIES', description: 'Gloves', amount: 500 }));
  });
  test('rejects unknown category', () => {
    assert.equal(ok(expenseCreateSchema, { expense_date: '2026-06-29', category: 'FOOD', description: 'x', amount: 500 }), false);
  });
  test('rejects empty description', () => {
    assert.equal(ok(expenseCreateSchema, { expense_date: '2026-06-29', category: 'OTHER', description: '', amount: 500 }), false);
  });
  test('rejects amount <= 0', () => {
    assert.equal(ok(expenseCreateSchema, { expense_date: '2026-06-29', category: 'OTHER', description: 'x', amount: 0 }), false);
  });
});

describe('treatmentCreateSchema', () => {
  test('valid minimal', () => {
    assert.ok(ok(treatmentCreateSchema, { patient_id: '11111111-1111-1111-1111-111111111111', treatment_date: '2026-06-29' }));
  });
  test('requires patient_id', () => {
    assert.equal(ok(treatmentCreateSchema, { treatment_date: '2026-06-29' }), false);
  });
  test('rejects bad date', () => {
    assert.equal(ok(treatmentCreateSchema, { patient_id: '11111111-1111-1111-1111-111111111111', treatment_date: 'yesterday' }), false);
  });
});

describe('invoiceUpdateSchema', () => {
  test('accepts a valid status', () => {
    assert.ok(ok(invoiceUpdateSchema, { status: 'PAID' }));
  });
  test('rejects an invalid status', () => {
    assert.equal(ok(invoiceUpdateSchema, { status: 'REFUNDED' }), false);
  });
  test('accepts empty (all optional)', () => {
    assert.ok(ok(invoiceUpdateSchema, {}));
  });
});
