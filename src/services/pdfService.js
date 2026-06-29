import PDFDocument from 'pdfkit';
import { clinic } from '../config/clinic.js';

// PDF builders for invoices, monthly reports and patient ledgers.
// Each `render*` function takes a live PDFDocument and writes into it; the
// controller owns creating the doc, piping it to the response, and calling
// doc.end(). pdfkit ships Helvetica (no external font files needed), so we keep
// all currency in ASCII ("PKR 1,234.00") to avoid glyph issues.

const MARGIN = 50;
const ACCENT = '#0d9488'; // teal — matches the clinic brand
const MUTED = '#666666';
const LINE = '#dddddd';

function money(n) {
  const v = Number(n) || 0;
  return `PKR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

// Add a page if there isn't at least `needed` vertical space left.
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function hr(doc) {
  doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor(LINE).lineWidth(1).stroke();
  doc.moveDown(0.5);
}

// Clinic letterhead. Returns nothing; leaves the cursor below the header.
function header(doc, docType) {
  const top = doc.y;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(20).text(clinic.name, MARGIN, top);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  if (clinic.address) doc.text(clinic.address, MARGIN, doc.y + 2, { width: contentWidth(doc) * 0.6 });
  if (clinic.phone) doc.text(`Phone: ${clinic.phone}`);

  // Right-aligned document type
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(18)
    .text(docType, MARGIN, top, { width: contentWidth(doc), align: 'right' });

  doc.moveDown(1);
  doc.fillColor('#000000');
  doc.y = Math.max(doc.y, top + 60);
  hr(doc);
}

// Simple table. columns: [{ label, key, width, align, fmt }]. width is a
// fraction of content width. rows: array of plain objects.
function table(doc, columns, rows, { headerFill = '#f3f4f6' } = {}) {
  const cw = contentWidth(doc);
  const widths = columns.map((c) => c.width * cw);
  const xs = [];
  let acc = MARGIN;
  for (const w of widths) {
    xs.push(acc);
    acc += w;
  }
  const ROW_PAD = 6;

  const drawRow = (cells, { bold = false, fill = null, color = '#000000' } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const heights = cells.map((text, i) =>
      doc.heightOfString(String(text ?? ''), { width: widths[i] - ROW_PAD * 2, align: columns[i].align || 'left' })
    );
    const rowH = Math.max(...heights) + ROW_PAD * 2;
    ensureSpace(doc, rowH);
    const y = doc.y;
    if (fill) doc.rect(MARGIN, y, cw, rowH).fill(fill);
    doc.fillColor(color);
    cells.forEach((text, i) => {
      doc.text(String(text ?? ''), xs[i] + ROW_PAD, y + ROW_PAD, {
        width: widths[i] - ROW_PAD * 2,
        align: columns[i].align || 'left',
      });
    });
    doc.fillColor('#000000');
    doc.y = y + rowH;
  };

  drawRow(columns.map((c) => c.label), { bold: true, fill: headerFill });
  for (const row of rows) {
    drawRow(columns.map((c) => (c.fmt ? c.fmt(row[c.key], row) : row[c.key])));
  }
}

// Label/value summary line.
function kv(doc, label, value, { bold = false } = {}) {
  ensureSpace(doc, 18);
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, MARGIN, y);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000000')
    .text(value, MARGIN, y, { width: contentWidth(doc), align: 'right' });
  doc.moveDown(0.4);
}

function footer(doc) {
  doc.moveDown(2);
  ensureSpace(doc, 30);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`Generated ${fmtDate(new Date())} — ${clinic.name}`, MARGIN, doc.y, {
      width: contentWidth(doc),
      align: 'center',
    });
  doc.fillColor('#000000');
}

// ── Invoice ─────────────────────────────────────────────────────────────────
function renderInvoice(doc, invoice) {
  header(doc, 'INVOICE');

  // Meta + Bill To
  const topY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text('Bill To', MARGIN, topY);
  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text(invoice.patient?.full_name || '—');
  if (invoice.patient?.phone) doc.text(invoice.patient.phone);
  if (invoice.patient?.email) doc.text(invoice.patient.email);

  const rightX = MARGIN + contentWidth(doc) * 0.6;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  doc.text(`Invoice #: `, rightX, topY, { continued: true }).fillColor('#000000').text(invoice.invoice_number);
  doc.fillColor(MUTED).text(`Date: `, rightX, doc.y, { continued: true }).fillColor('#000000').text(fmtDate(invoice.created_at));
  doc.fillColor(MUTED).text(`Status: `, rightX, doc.y, { continued: true }).fillColor('#000000').text(invoice.status);

  doc.moveDown(1.5);
  doc.x = MARGIN;

  // Items
  const items = [{ description: invoice.service_name || 'Dental services', amount: invoice.subtotal }];
  table(
    doc,
    [
      { label: 'Description', key: 'description', width: 0.7, align: 'left' },
      { label: 'Amount', key: 'amount', width: 0.3, align: 'right', fmt: money },
    ],
    items
  );

  doc.moveDown(0.5);
  kv(doc, 'Subtotal', money(invoice.subtotal));
  if (Number(invoice.discount_amount) > 0) {
    kv(doc, `Discount${invoice.discount_reason ? ` (${invoice.discount_reason})` : ''}`, `- ${money(invoice.discount_amount)}`);
  }
  kv(doc, 'Total', money(invoice.total_amount), { bold: true });
  kv(doc, 'Amount Paid', money(invoice.total_paid));
  kv(doc, 'Balance Due', money(invoice.balance_due), { bold: true });

  // Payment history
  if (invoice.payments?.length) {
    doc.moveDown(1);
    ensureSpace(doc, 40);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('Payment History', MARGIN, doc.y);
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: 'Date', key: 'payment_date', width: 0.25, fmt: fmtDate },
        { label: 'Method', key: 'payment_method', width: 0.3 },
        { label: 'Received By', key: 'received_by', width: 0.25, fmt: (v) => v || '—' },
        { label: 'Amount', key: 'amount', width: 0.2, align: 'right', fmt: money },
      ],
      invoice.payments
    );
  }

  if (invoice.notes) {
    doc.moveDown(1);
    ensureSpace(doc, 40);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('Notes', MARGIN, doc.y);
    doc.font('Helvetica').fontSize(9).fillColor('#000000').text(invoice.notes, { width: contentWidth(doc) });
  }

  footer(doc);
}

// ── Monthly report ───────────────────────────────────────────────────────────
function renderMonthlyReport(doc, report) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  header(doc, 'MONTHLY REPORT');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111')
    .text(`${MONTHS[report.month - 1]} ${report.year}`, MARGIN, doc.y);
  doc.moveDown(0.8);

  // Summary
  kv(doc, 'Total Revenue', money(report.summary.total_revenue));
  kv(doc, 'Total Expenses', money(report.summary.total_expenses));
  kv(doc, 'Net Profit', money(report.summary.net_profit), { bold: true });
  kv(doc, 'New Patients', String(report.summary.new_patients));

  // Revenue by service
  if (report.revenue_by_service?.length) {
    doc.moveDown(1);
    ensureSpace(doc, 40);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('Revenue by Service', MARGIN, doc.y);
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: 'Service', key: 'service_name', width: 0.6 },
        { label: 'Payments', key: 'payment_count', width: 0.2, align: 'right' },
        { label: 'Revenue', key: 'revenue', width: 0.2, align: 'right', fmt: money },
      ],
      report.revenue_by_service
    );
  }

  // Daily breakdown (only days with any activity, to stay readable)
  const activeDays = (report.daily_breakdown || []).filter((d) => d.revenue !== 0 || d.expenses !== 0);
  if (activeDays.length) {
    doc.moveDown(1);
    ensureSpace(doc, 40);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text('Daily Breakdown', MARGIN, doc.y);
    doc.moveDown(0.3);
    table(
      doc,
      [
        { label: 'Date', key: 'date', width: 0.3, fmt: fmtDate },
        { label: 'Revenue', key: 'revenue', width: 0.24, align: 'right', fmt: money },
        { label: 'Expenses', key: 'expenses', width: 0.23, align: 'right', fmt: money },
        { label: 'Profit', key: 'profit', width: 0.23, align: 'right', fmt: money },
      ],
      activeDays
    );
  }

  footer(doc);
}

// ── Patient ledger ────────────────────────────────────────────────────────────
function renderPatientLedger(doc, ledger) {
  header(doc, 'PATIENT LEDGER');

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(ledger.patient.full_name, MARGIN, doc.y);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  if (ledger.patient.phone) doc.text(ledger.patient.phone);
  if (ledger.patient.email) doc.text(ledger.patient.email);
  doc.fillColor('#000000').moveDown(1);

  // Build flat rows with a running balance (oldest first for a sensible running total).
  const invoicesOldestFirst = [...ledger.invoices].reverse();
  let running = 0;
  const rows = invoicesOldestFirst
    .filter((inv) => inv.status !== 'CANCELLED')
    .map((inv) => {
      running = Math.round((running + inv.balance_due) * 100) / 100;
      return {
        invoice_number: inv.invoice_number,
        created_at: inv.created_at,
        total_amount: inv.total_amount,
        total_paid: inv.total_paid,
        balance_due: inv.balance_due,
        running,
        status: inv.status,
      };
    });

  table(
    doc,
    [
      { label: 'Invoice', key: 'invoice_number', width: 0.22 },
      { label: 'Date', key: 'created_at', width: 0.16, fmt: fmtDate },
      { label: 'Total', key: 'total_amount', width: 0.16, align: 'right', fmt: money },
      { label: 'Paid', key: 'total_paid', width: 0.15, align: 'right', fmt: money },
      { label: 'Balance', key: 'balance_due', width: 0.15, align: 'right', fmt: money },
      { label: 'Running', key: 'running', width: 0.16, align: 'right', fmt: money },
    ],
    rows
  );

  doc.moveDown(0.8);
  kv(doc, 'Total Charged', money(ledger.summary.total_charged));
  kv(doc, 'Total Paid', money(ledger.summary.total_paid));
  kv(doc, 'Outstanding Balance', money(ledger.summary.outstanding_balance), { bold: true });

  footer(doc);
}

// Convenience: create a doc, hand it to the caller for piping, return it.
function createDoc() {
  return new PDFDocument({ size: 'A4', margin: MARGIN });
}

export { createDoc, renderInvoice, renderMonthlyReport, renderPatientLedger };
