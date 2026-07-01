import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { clinic } from '../config/clinic.js';

// Faint centered logo watermark for every generated PDF. Loaded once at import;
// the `new URL(..., import.meta.url)` form lets the serverless bundler trace and
// include the asset. If it's missing/unbundled, PDFs still render without it.
let WATERMARK = null;
try {
  WATERMARK = fs.readFileSync(fileURLToPath(new URL('../assests/teethforLife_watermark.png', import.meta.url)));
} catch {
  WATERMARK = null;
}

// PDF builders for invoices, monthly reports and patient ledgers.
// Each `render*` function takes a live PDFDocument and writes into it; the
// controller owns creating the doc, piping it to the response, and calling
// doc.end(). pdfkit ships Helvetica (no external font files needed), so we keep
// all currency in ASCII ("PKR 1,234.00") to avoid glyph issues.

const MARGIN = 50;
const ACCENT = '#00A6FF'; // brand blue — matches the clinic UI theme (tailwind `primary`)
const ACCENT_SOFT = '#e8f5ff'; // light brand tint for table headers / section bands
const MUTED = '#666666';
const LINE = '#dddddd';

// Stamp a small, faint, centered logo behind the page content. Drawn first (so
// text sits on top) via createDoc's first-page call + the 'pageAdded' hook.
function drawWatermark(doc) {
  const img = doc._watermark; // opened once per doc (see createDoc) so the PNG
  if (!img) return;           // embeds a single time and is reused on every page
  const size = 200; // small centered mark (~1/3 of A4 width)
  const x = (doc.page.width - size) / 2;
  const y = (doc.page.height - size) / 2 - 170; // sit in the upper white area, above the tables
  doc.save();
  try {
    doc.opacity(0.13);
    doc.image(img, x, y, { fit: [size, size], align: 'center', valign: 'center' });
  } catch {
    // decorative only — never let a watermark failure break the PDF
  } finally {
    doc.opacity(1);
    doc.restore();
  }
}

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
  // Branded accent rule under the letterhead (clinic theme colour).
  doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).strokeColor(ACCENT).lineWidth(2).stroke();
  doc.moveDown(0.6);
}

// Small section heading in the clinic accent colour.
function sectionTitle(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(text, MARGIN, doc.y);
  doc.fillColor('#000000').moveDown(0.3);
}

// Simple table. columns: [{ label, key, width, align, fmt }]. width is a
// fraction of content width. rows: array of plain objects.
function table(doc, columns, rows, { headerFill = ACCENT_SOFT } = {}) {
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

  // Items — the invoice note is folded into the Description cell (second line)
  // rather than a separate block, so the line item carries its own context.
  const noteText = (invoice.notes || '').trim();
  const baseDesc = invoice.service_name || 'Dental services';
  const description = noteText ? `${baseDesc}\n${noteText}` : baseDesc;
  const items = [{ description, amount: invoice.subtotal }];
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

  footer(doc);
}

// ── Period report (monthly / weekly) ─────────────────────────────────────────
const METHOD_LABELS = {
  CASH: 'Cash', ONLINE: 'Online', CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer', EASYPAISA: 'EasyPaisa', JAZZCASH: 'JazzCash',
};
const CATEGORY_LABELS = {
  SUPPLIES: 'Supplies', EQUIPMENT: 'Equipment', SALARY: 'Salary',
  RENT: 'Rent', UTILITIES: 'Utilities', OTHER: 'Other',
};
const methodLabel = (m) => METHOD_LABELS[m] || m || '—';
const categoryLabel = (c) => CATEGORY_LABELS[c] || c || '—';

// Renders a monthly OR weekly report. Shape (from reportsService):
//   { report_type, period_label, summary, revenue_by_service, revenue_by_method,
//     expenses_by_category, expense_items, daily_breakdown }
function renderPeriodReport(doc, report) {
  const isWeekly = report.report_type === 'WEEKLY';
  header(doc, isWeekly ? 'WEEKLY REPORT' : 'MONTHLY REPORT');

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111')
    .text(report.period_label || '', MARGIN, doc.y);
  doc.moveDown(0.8);

  // Summary
  kv(doc, 'Total Revenue', money(report.summary.total_revenue));
  kv(doc, 'Total Expenses', money(report.summary.total_expenses));
  kv(doc, 'Net Profit', money(report.summary.net_profit), { bold: true });
  kv(doc, 'New Patients', String(report.summary.new_patients));

  // ── Revenue: each payment received (who paid what) ──────────────────────
  if (report.payment_items?.length) {
    sectionTitle(doc, 'Revenue — Payments Received');
    table(
      doc,
      [
        { label: 'Date', key: 'payment_date', width: 0.16, fmt: fmtDate },
        { label: 'Patient', key: 'patient_name', width: 0.33, fmt: (v) => v || '—' },
        { label: 'Invoice #', key: 'invoice_number', width: 0.21, fmt: (v) => v || '—' },
        { label: 'Method', key: 'method', width: 0.15, fmt: methodLabel },
        { label: 'Amount', key: 'amount', width: 0.15, align: 'right', fmt: money },
      ],
      report.payment_items
    );
  }

  // ── Expenses: each expense line ─────────────────────────────────────────
  if (report.expense_items?.length) {
    sectionTitle(doc, 'Expenses');
    table(
      doc,
      [
        { label: 'Date', key: 'expense_date', width: 0.18, fmt: fmtDate },
        { label: 'Category', key: 'category', width: 0.18, fmt: categoryLabel },
        { label: 'Description', key: 'description', width: 0.32, fmt: (v) => v || '—' },
        { label: 'Vendor', key: 'vendor', width: 0.17, fmt: (v) => v || '—' },
        { label: 'Amount', key: 'amount', width: 0.15, align: 'right', fmt: money },
      ],
      report.expense_items
    );
  }

  // Daily breakdown (only days with any activity, to stay readable)
  const activeDays = (report.daily_breakdown || []).filter((d) => d.revenue !== 0 || d.expenses !== 0);
  if (activeDays.length) {
    sectionTitle(doc, 'Daily Breakdown');
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
// Every page gets the faint centered watermark: the first page is stamped here,
// and the 'pageAdded' hook stamps any page added later (before content flows on).
function createDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  // Open the watermark PNG once per document — pdfkit then embeds the image data
  // a single time and references it on every page (a raw Buffer would re-embed).
  try {
    doc._watermark = WATERMARK ? doc.openImage(WATERMARK) : null;
  } catch {
    doc._watermark = null;
  }
  doc.on('pageAdded', () => drawWatermark(doc));
  drawWatermark(doc);
  return doc;
}

export { createDoc, renderInvoice, renderPeriodReport, renderPatientLedger };
