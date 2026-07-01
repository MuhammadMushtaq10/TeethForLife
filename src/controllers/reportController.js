import * as reportsService from '../services/reportsService.js';
import * as pdfService from '../services/pdfService.js';

// Clinic-local "today" (Asia/Karachi) for sensible report defaults.
function karachiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseYear(raw) {
  const y = parseInt(raw, 10);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  return y;
}
function parseMonth(raw) {
  const m = parseInt(raw, 10);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  return m;
}
function parseDateStr(raw) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : raw;
}
// Monday of the ISO week containing `dateStr` (calendar-date math, UTC-anchored).
function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  dt.setUTCDate(dt.getUTCDate() - mondayOffset);
  return dt.toISOString().slice(0, 10);
}

async function daily(req, res) {
  try {
    const date = req.query.date || karachiToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });
    }
    const report = await reportsService.getDailyReport(date);
    res.json(report);
  } catch (err) {
    console.error('Daily report error:', err);
    res.status(500).json({ error: 'Failed to build daily report' });
  }
}

async function monthly(req, res) {
  try {
    const today = karachiToday();
    const year = parseYear(req.query.year ?? today.slice(0, 4));
    const month = parseMonth(req.query.month ?? today.slice(5, 7));
    if (year === null || month === null) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    const report = await reportsService.getMonthlyReport(year, month);
    res.json(report);
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Failed to build monthly report' });
  }
}

async function weekly(req, res) {
  try {
    const raw = req.query.start || req.query.date || karachiToday();
    const dateStr = parseDateStr(raw);
    if (!dateStr) {
      return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });
    }
    const report = await reportsService.getWeeklyReport(weekStartOf(dateStr));
    res.json(report);
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(500).json({ error: 'Failed to build weekly report' });
  }
}

async function yearly(req, res) {
  try {
    const today = karachiToday();
    const year = parseYear(req.query.year ?? today.slice(0, 4));
    if (year === null) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    const report = await reportsService.getYearlyReport(year);
    res.json(report);
  } catch (err) {
    console.error('Yearly report error:', err);
    res.status(500).json({ error: 'Failed to build yearly report' });
  }
}

async function outstanding(req, res) {
  try {
    const data = await reportsService.getOutstandingBalances();
    res.json(data);
  } catch (err) {
    console.error('Outstanding balances error:', err);
    res.status(500).json({ error: 'Failed to fetch outstanding balances' });
  }
}

async function monthlyPdf(req, res) {
  try {
    const today = karachiToday();
    const year = parseYear(req.query.year ?? today.slice(0, 4));
    const month = parseMonth(req.query.month ?? today.slice(5, 7));
    if (year === null || month === null) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }
    const report = await reportsService.getMonthlyReport(year, month);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=monthly-report-${year}-${String(month).padStart(2, '0')}.pdf`);

    const doc = pdfService.createDoc();
    doc.pipe(res);
    pdfService.renderPeriodReport(doc, report);
    doc.end();
  } catch (err) {
    console.error('Monthly report PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate monthly report PDF' });
  }
}

async function weeklyPdf(req, res) {
  try {
    const raw = req.query.start || req.query.date || karachiToday();
    const dateStr = parseDateStr(raw);
    if (!dateStr) {
      return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });
    }
    const start = weekStartOf(dateStr);
    const report = await reportsService.getWeeklyReport(start);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=weekly-report-${start}.pdf`);

    const doc = pdfService.createDoc();
    doc.pipe(res);
    pdfService.renderPeriodReport(doc, report);
    doc.end();
  } catch (err) {
    console.error('Weekly report PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate weekly report PDF' });
  }
}

export { daily, monthly, weekly, yearly, outstanding, monthlyPdf, weeklyPdf };
