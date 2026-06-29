import { AppDataSource } from '../db/index.js';

// Revenue is recognised on the PAYMENT date (cash received), not invoice date —
// this keeps "revenue this month" equal to "money that actually came in".
// All NUMERIC/COUNT results from pg are strings; coerce everything.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');

// [start, endExclusive) as YYYY-MM-DD strings.
function monthBounds(year, month) {
  const start = `${year}-${pad2(month)}-01`;
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month + 1)}-01`;
  return { start, end };
}
function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

async function q(sql, params = []) {
  return AppDataSource.query(sql, params);
}

async function sumPayments(start, end) {
  const [{ total }] = await q(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_date >= $1 AND payment_date < $2`,
    [start, end]
  );
  return round2(total);
}
async function sumExpenses(start, end) {
  const [{ total }] = await q(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date >= $1 AND expense_date < $2`,
    [start, end]
  );
  return round2(total);
}

async function getDailyReport(date) {
  const [{ revenue }] = await q(
    `SELECT COALESCE(SUM(amount), 0) AS revenue FROM payments WHERE payment_date = $1`,
    [date]
  );
  const [{ appt_count }] = await q(
    `SELECT COUNT(*) AS appt_count FROM appointments WHERE appointment_date = $1`,
    [date]
  );
  const byMethod = await q(
    `SELECT payment_method, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
       FROM payments WHERE payment_date = $1
      GROUP BY payment_method ORDER BY amount DESC`,
    [date]
  );
  const expenseRows = await q(
    `SELECT id, category, description, amount, vendor
       FROM expenses WHERE expense_date = $1 ORDER BY amount DESC`,
    [date]
  );

  const appointmentsList = await q(
    `SELECT a.id, a.appointment_time, a.status,
            p.full_name AS patient_name,
            s.name AS service_name,
            (SELECT i.status FROM invoices i
              WHERE i.appointment_id = a.id AND i.status <> 'CANCELLED'
              ORDER BY i.created_at DESC LIMIT 1) AS invoice_status
       FROM appointments a
       LEFT JOIN patients p ON p.id = a.patient_id
       LEFT JOIN services s ON s.id = a.service_id
      WHERE a.appointment_date = $1
      ORDER BY a.appointment_time ASC`,
    [date]
  );

  const totalRevenue = round2(revenue);
  const totalExpenses = round2(expenseRows.reduce((s, e) => s + num(e.amount), 0));
  const netProfit = round2(totalRevenue - totalExpenses);
  const methodRows = byMethod.map((m) => ({ method: m.payment_method, amount: round2(m.amount), count: num(m.count) }));

  return {
    date,
    revenue: totalRevenue,
    expenses: totalExpenses,          // number (UI reads this directly)
    net_profit: netProfit,
    netProfit,
    appointments: num(appt_count),    // count
    appointmentsList,                 // rows for the daily appointments table
    payments_by_method: methodRows,
    paymentBreakdown: methodRows,     // alias the Reports UI reads
    total_expenses: totalExpenses,
    expense_items: expenseRows.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: round2(e.amount),
      vendor: e.vendor,
    })),
  };
}

async function getMonthlyReport(year, month) {
  const { start, end } = monthBounds(year, month);

  const totalRevenue = await sumPayments(start, end);
  const totalExpenses = await sumExpenses(start, end);

  const byService = await q(
    `SELECT COALESCE(s.name, 'Other / Unlinked') AS service_name,
            COALESCE(SUM(p.amount), 0) AS revenue,
            COUNT(p.id) AS payment_count
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN appointments a ON a.id = i.appointment_id
       LEFT JOIN services s ON s.id = a.service_id
      WHERE p.payment_date >= $1 AND p.payment_date < $2
      GROUP BY s.name
      ORDER BY revenue DESC`,
    [start, end]
  );

  const byMethod = await q(
    `SELECT payment_method, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
       FROM payments WHERE payment_date >= $1 AND payment_date < $2
      GROUP BY payment_method ORDER BY amount DESC`,
    [start, end]
  );

  const paymentsByDay = await q(
    `SELECT payment_date::text AS d, COALESCE(SUM(amount), 0) AS amount
       FROM payments WHERE payment_date >= $1 AND payment_date < $2
      GROUP BY payment_date`,
    [start, end]
  );
  const expensesByDay = await q(
    `SELECT expense_date::text AS d, COALESCE(SUM(amount), 0) AS amount
       FROM expenses WHERE expense_date >= $1 AND expense_date < $2
      GROUP BY expense_date`,
    [start, end]
  );
  const revByDay = Object.fromEntries(paymentsByDay.map((r) => [r.d, round2(r.amount)]));
  const expByDay = Object.fromEntries(expensesByDay.map((r) => [r.d, round2(r.amount)]));

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyBreakdown = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad2(month)}-${pad2(d)}`;
    const rev = revByDay[key] || 0;
    const exp = expByDay[key] || 0;
    dailyBreakdown.push({ date: key, revenue: rev, expenses: exp, profit: round2(rev - exp) });
  }

  const topPatients = await q(
    `SELECT pt.id, pt.full_name, pt.phone, COALESCE(SUM(p.amount), 0) AS spend
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
      WHERE p.payment_date >= $1 AND p.payment_date < $2
      GROUP BY pt.id, pt.full_name, pt.phone
      ORDER BY spend DESC
      LIMIT 5`,
    [start, end]
  );

  const [{ new_patients }] = await q(
    `SELECT COUNT(*) AS new_patients FROM patients WHERE created_at >= $1 AND created_at < $2`,
    [start, end]
  );

  const statusBreakdown = await q(
    `SELECT status, COUNT(*) AS count
       FROM appointments WHERE appointment_date >= $1 AND appointment_date < $2
      GROUP BY status`,
    [start, end]
  );

  const netProfit = round2(totalRevenue - totalExpenses);
  const statusRows = statusBreakdown.map((s) => ({ status: s.status, count: num(s.count) }));
  const appointmentsCompleted = statusRows.find((s) => s.status === 'COMPLETED')?.count || 0;
  const serviceRows = byService.map((r) => ({ service_name: r.service_name, revenue: round2(r.revenue), payment_count: num(r.payment_count) }));
  const methodRows = byMethod.map((r) => ({ method: r.payment_method, amount: round2(r.amount), count: num(r.count) }));
  const patientRows = topPatients.map((p) => ({ id: p.id, full_name: p.full_name, phone: p.phone, total_spend: round2(p.spend) }));

  return {
    year,
    month,
    period: { start, end },
    summary: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      new_patients: num(new_patients),
    },
    revenue_by_service: serviceRows,
    revenue_by_method: methodRows,
    daily_breakdown: dailyBreakdown,
    top_patients: patientRows,
    appointment_status_breakdown: statusRows,
    // Flat aliases the Reports UI reads.
    totalRevenue,
    totalExpenses,
    netProfit,
    newPatients: num(new_patients),
    appointmentsCompleted,
    revenueByService: serviceRows.map((r) => ({ service: r.service_name, amount: r.revenue })),
    revenueByMethod: methodRows,
    daily: dailyBreakdown,
    topPatients: patientRows.map((p) => ({ name: p.full_name, amount: p.total_spend })),
  };
}

async function getYearlyReport(year) {
  const { start, end } = yearBounds(year);

  const revRows = await q(
    `SELECT EXTRACT(MONTH FROM payment_date)::int AS m, COALESCE(SUM(amount), 0) AS amount
       FROM payments WHERE payment_date >= $1 AND payment_date < $2 GROUP BY m`,
    [start, end]
  );
  const expRows = await q(
    `SELECT EXTRACT(MONTH FROM expense_date)::int AS m, COALESCE(SUM(amount), 0) AS amount
       FROM expenses WHERE expense_date >= $1 AND expense_date < $2 GROUP BY m`,
    [start, end]
  );
  const revByMonth = Object.fromEntries(revRows.map((r) => [r.m, round2(r.amount)]));
  const expByMonth = Object.fromEntries(expRows.map((r) => [r.m, round2(r.amount)]));

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  for (let m = 1; m <= 12; m++) {
    const revenue = revByMonth[m] || 0;
    const expenses = expByMonth[m] || 0;
    const profit = round2(revenue - expenses);
    totalRevenue += revenue;
    totalExpenses += expenses;
    monthly.push({ month: m, month_name: MONTH_NAMES[m - 1], revenue, expenses, profit });
  }
  totalRevenue = round2(totalRevenue);
  totalExpenses = round2(totalExpenses);

  const active = monthly.filter((m) => m.revenue !== 0 || m.expenses !== 0);
  let best = null;
  let worst = null;
  if (active.length) {
    best = active.reduce((a, b) => (b.profit > a.profit ? b : a));
    worst = active.reduce((a, b) => (b.profit < a.profit ? b : a));
  }

  // Year-over-year vs prior year (only reported if the prior year had activity).
  const prior = yearBounds(year - 1);
  const priorRevenue = await sumPayments(prior.start, prior.end);
  const priorExpenses = await sumExpenses(prior.start, prior.end);
  const priorProfit = round2(priorRevenue - priorExpenses);
  const pct = (curr, prev) => (prev === 0 ? null : round2(((curr - prev) / Math.abs(prev)) * 100));

  const [{ total_patients }] = await q(`SELECT COUNT(*) AS total_patients FROM patients`);

  return {
    year,
    monthly_breakdown: monthly,
    summary: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: round2(totalRevenue - totalExpenses),
      best_month: best ? { month: best.month, month_name: best.month_name, profit: best.profit } : null,
      worst_month: worst ? { month: worst.month, month_name: worst.month_name, profit: worst.profit } : null,
    },
    // Flat aliases the Reports UI reads.
    annualRevenue: totalRevenue,
    annualExpenses: totalExpenses,
    annualProfit: round2(totalRevenue - totalExpenses),
    totalPatients: num(total_patients),
    bestMonth: best ? best.month_name : null,
    monthly: monthly.map((m) => ({ month: m.month, label: m.month_name, revenue: m.revenue, expenses: m.expenses })),
    year_over_year:
      priorRevenue || priorExpenses
        ? {
            prior_year: year - 1,
            prior_revenue: priorRevenue,
            prior_expenses: priorExpenses,
            prior_profit: priorProfit,
            revenue_change_pct: pct(totalRevenue, priorRevenue),
            profit_change_pct: pct(round2(totalRevenue - totalExpenses), priorProfit),
          }
        : null,
  };
}

async function getOutstandingBalances() {
  const rows = await q(
    `SELECT i.id, i.invoice_number, i.created_at, i.total_amount, i.status,
            pt.full_name, pt.phone,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
       FROM invoices i
       JOIN patients pt ON pt.id = i.patient_id
      WHERE i.status IN ('UNPAID', 'PARTIALLY_PAID')`
  );

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const list = rows.map((r) => {
    const total = round2(r.total_amount);
    const paid = round2(r.paid);
    const daysOverdue = Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / DAY));
    const balance = round2(total - paid);
    return {
      invoice_id: r.id,
      invoice_number: r.invoice_number,
      patient_name: r.full_name,
      patient_phone: r.phone,
      phone: r.phone, // alias the Reports UI reads
      status: r.status,
      total_amount: total,
      amount_paid: paid,
      balance_due: balance,
      balance, // alias the Reports UI reads
      created_at: r.created_at,
      days_overdue: daysOverdue,
    };
  });

  list.sort((a, b) => b.days_overdue - a.days_overdue);

  const totalOutstanding = round2(list.reduce((s, r) => s + r.balance_due, 0));
  return { invoices: list, count: list.length, total_outstanding: totalOutstanding };
}

export {
  getDailyReport,
  getMonthlyReport,
  getYearlyReport,
  getOutstandingBalances,
};
