import { expenseCreateSchema, expenseUpdateSchema } from '../validators/schemas.js';
import * as expenseService from '../services/expenseService.js';

async function createExpense(req, res) {
  try {
    const result = expenseCreateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const expense = await expenseService.createExpense(result.data);
    res.status(201).json({ message: 'Expense recorded', expense });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to record expense' });
  }
}

async function listExpenses(req, res) {
  try {
    const { startDate, endDate, category } = req.query;
    const data = await expenseService.getExpenses({ startDate, endDate, category });
    res.json(data);
  } catch (err) {
    console.error('List expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
}

async function updateExpense(req, res) {
  try {
    const result = expenseUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const updated = await expenseService.updateExpense(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense updated', expense: updated });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
}

async function deleteExpense(req, res) {
  try {
    const ok = await expenseService.deleteExpense(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
}

export { createExpense, listExpenses, updateExpense, deleteExpense };
