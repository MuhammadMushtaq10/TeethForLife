import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, resetDb, closeDb } from './helpers.mjs';
import * as expenseService from '../src/services/expenseService.js';

before(initDb);
after(closeDb);
beforeEach(resetDb);

describe('expenseService', () => {
  test('createExpense stores and rounds amount', async () => {
    const e = await expenseService.createExpense({ expense_date: '2026-06-10', category: 'SUPPLIES', description: 'Gloves', amount: 1234.5, vendor: 'MedCo' });
    assert.equal(Number(e.amount), 1234.5);
    assert.equal(e.category, 'SUPPLIES');
    assert.equal(e.vendor, 'MedCo');
  });

  test('getExpenses returns list, total and count', async () => {
    await expenseService.createExpense({ expense_date: '2026-06-10', category: 'SUPPLIES', description: 'A', amount: 1000 });
    await expenseService.createExpense({ expense_date: '2026-06-11', category: 'RENT', description: 'B', amount: 2000 });
    const { expenses, total, count } = await expenseService.getExpenses({});
    assert.equal(count, 2);
    assert.equal(total, 3000);
    assert.equal(expenses.length, 2);
  });

  test('filters by category', async () => {
    await expenseService.createExpense({ expense_date: '2026-06-10', category: 'SUPPLIES', description: 'A', amount: 1000 });
    await expenseService.createExpense({ expense_date: '2026-06-11', category: 'RENT', description: 'B', amount: 2000 });
    const { expenses, total } = await expenseService.getExpenses({ category: 'RENT' });
    assert.equal(expenses.length, 1);
    assert.equal(total, 2000);
  });

  test('filters by date range', async () => {
    await expenseService.createExpense({ expense_date: '2026-05-31', category: 'OTHER', description: 'old', amount: 500 });
    await expenseService.createExpense({ expense_date: '2026-06-15', category: 'OTHER', description: 'in', amount: 700 });
    const { expenses } = await expenseService.getExpenses({ startDate: '2026-06-01', endDate: '2026-06-30' });
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].description, 'in');
  });

  test('updateExpense modifies fields; unknown id -> null', async () => {
    const e = await expenseService.createExpense({ expense_date: '2026-06-10', category: 'OTHER', description: 'X', amount: 100 });
    const updated = await expenseService.updateExpense(e.id, { amount: 250, description: 'Y' });
    assert.equal(Number(updated.amount), 250);
    assert.equal(updated.description, 'Y');
    assert.equal(await expenseService.updateExpense('11111111-1111-1111-1111-111111111111', { amount: 1 }), null);
  });

  test('deleteExpense returns true then false', async () => {
    const e = await expenseService.createExpense({ expense_date: '2026-06-10', category: 'OTHER', description: 'X', amount: 100 });
    assert.equal(await expenseService.deleteExpense(e.id), true);
    assert.equal(await expenseService.deleteExpense(e.id), false);
  });
});
