import { invoiceCreateSchema, invoiceUpdateSchema, paymentSchema } from '../validators/schemas.js';
import * as invoiceService from '../services/invoiceService.js';
import * as patientService from '../services/patientService.js';
import * as pdfService from '../services/pdfService.js';

async function createInvoice(req, res) {
  try {
    const result = invoiceCreateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const { appointment_id, patient_id, full_name, phone, subtotal, discount_amount, discount_reason, notes } = result.data;

    // Resolve the patient: an explicit id, or upsert-by-phone from name + phone.
    let resolvedPatientId = patient_id;
    if (!resolvedPatientId) {
      const patient = await patientService.upsertByPhone({ full_name, phone });
      resolvedPatientId = patient.id;
    }

    const created = await invoiceService.createInvoice(appointment_id, resolvedPatientId, {
      subtotal,
      discountAmount: discount_amount,
      discountReason: discount_reason,
      notes,
    });
    const invoice = await invoiceService.getInvoiceWithPayments(created.id);
    res.status(201).json({ message: 'Invoice created', invoice });
  } catch (err) {
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'Invalid patient or appointment reference' });
    }
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
}

async function listInvoices(req, res) {
  try {
    const { status, patientId, from, to } = req.query;
    const invoices = await invoiceService.listInvoices({ status, patientId, from, to });
    res.json(invoices);
  } catch (err) {
    console.error('List invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
}

async function getInvoice(req, res) {
  try {
    const invoice = await invoiceService.getInvoiceWithPayments(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
}

async function updateInvoice(req, res) {
  try {
    const result = invoiceUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const { discount_amount, discount_reason, notes, status } = result.data;

    const updated = await invoiceService.updateInvoice(req.params.id, {
      discountAmount: discount_amount,
      discountReason: discount_reason,
      notes,
      status,
    });
    if (!updated) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = await invoiceService.getInvoiceWithPayments(req.params.id);
    res.json({ message: 'Invoice updated', invoice });
  } catch (err) {
    console.error('Update invoice error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
}

async function addPayment(req, res) {
  try {
    const result = paymentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const { amount, payment_method, payment_date, received_by, notes } = result.data;

    const outcome = await invoiceService.addPayment(req.params.id, {
      amount,
      paymentMethod: payment_method,
      paymentDate: payment_date,
      receivedBy: received_by,
      notes,
    });
    if (!outcome) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = await invoiceService.getInvoiceWithPayments(req.params.id);
    res.status(201).json({ message: 'Payment recorded', invoice });
  } catch (err) {
    if (err?.code === 'INVOICE_CANCELLED') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Add payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
}

async function cancelInvoice(req, res) {
  try {
    const cancelled = await invoiceService.cancelInvoice(req.params.id);
    if (!cancelled) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice cancelled', id: cancelled.id, status: cancelled.status });
  } catch (err) {
    console.error('Cancel invoice error:', err);
    res.status(500).json({ error: 'Failed to cancel invoice' });
  }
}

async function deleteInvoice(req, res) {
  try {
    const force = req.query.force === 'true';
    const result = await invoiceService.deleteInvoice(req.params.id, { force });
    if (!result) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted', id: result.id, payments_deleted: result.paymentsDeleted });
  } catch (err) {
    if (err?.code === 'HAS_PAYMENTS') {
      return res.status(409).json({ error: err.message, payment_count: err.paymentCount });
    }
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
}

async function deletePayment(req, res) {
  try {
    const removed = await invoiceService.deletePayment(req.params.id, req.params.paymentId);
    if (!removed) return res.status(404).json({ error: 'Payment not found' });
    const invoice = await invoiceService.getInvoiceWithPayments(req.params.id);
    res.json({ message: 'Payment deleted', invoice });
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
}

async function getInvoicePdf(req, res) {
  try {
    const invoice = await invoiceService.getInvoiceWithPayments(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoice_number}.pdf`);

    const doc = pdfService.createDoc();
    doc.pipe(res);
    pdfService.renderInvoice(doc, invoice);
    doc.end();
  } catch (err) {
    console.error('Invoice PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
}

async function getPatientLedger(req, res) {
  try {
    const ledger = await invoiceService.getPatientLedger(req.params.id);
    if (!ledger) return res.status(404).json({ error: 'Patient not found' });
    res.json(ledger);
  } catch (err) {
    console.error('Patient ledger error:', err);
    res.status(500).json({ error: 'Failed to fetch patient ledger' });
  }
}

async function getPatientLedgerPdf(req, res) {
  try {
    const ledger = await invoiceService.getPatientLedger(req.params.id);
    if (!ledger) return res.status(404).json({ error: 'Patient not found' });

    const safeName = (ledger.patient.full_name || 'patient').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ledger-${safeName}.pdf`);

    const doc = pdfService.createDoc();
    doc.pipe(res);
    pdfService.renderPatientLedger(doc, ledger);
    doc.end();
  } catch (err) {
    console.error('Patient ledger PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate ledger PDF' });
  }
}

export {
  createInvoice,
  listInvoices,
  getInvoice,
  updateInvoice,
  addPayment,
  cancelInvoice,
  deleteInvoice,
  deletePayment,
  getInvoicePdf,
  getPatientLedger,
  getPatientLedgerPdf,
};
