import { AppDataSource } from '../db/index.js';
import Expense from '../entities/Expense.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

function getRepo() {
  return AppDataSource.getRepository(Expense);
}

async function createExpense(data) {
  const repo = getRepo();
  const expense = repo.create({
    expense_date: data.expense_date,
    category: data.category,
    description: data.description,
    amount: round2(data.amount),
    vendor: data.vendor || null,
    receipt_number: data.receipt_number || null,
  });
  return repo.save(expense);
}

async function updateExpense(id, data) {
  const repo = getRepo();
  const expense = await repo.findOne({ where: { id } });
  if (!expense) return null;

  if (data.expense_date !== undefined) expense.expense_date = data.expense_date;
  if (data.category !== undefined) expense.category = data.category;
  if (data.description !== undefined) expense.description = data.description;
  if (data.amount !== undefined) expense.amount = round2(data.amount);
  if (data.vendor !== undefined) expense.vendor = data.vendor || null;
  if (data.receipt_number !== undefined) expense.receipt_number = data.receipt_number || null;

  return repo.save(expense);
}

async function deleteExpense(id) {
  const res = await getRepo().delete({ id });
  return (res.affected || 0) > 0;
}

async function getExpenses({ startDate, endDate, category } = {}) {
  const qb = getRepo()
    .createQueryBuilder('e')
    .orderBy('e.expense_date', 'DESC')
    .addOrderBy('e.created_at', 'DESC');

  if (startDate) qb.andWhere('e.expense_date >= :startDate', { startDate });
  if (endDate) qb.andWhere('e.expense_date <= :endDate', { endDate });
  if (category) qb.andWhere('e.category = :category', { category });

  const expenses = await qb.getMany();
  const total = round2(expenses.reduce((s, e) => s + num(e.amount), 0));

  return {
    expenses: expenses.map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: round2(e.amount),
      vendor: e.vendor,
      receipt_number: e.receipt_number,
      created_at: e.created_at,
    })),
    total,
    count: expenses.length,
  };
}

export { createExpense, updateExpense, deleteExpense, getExpenses };
