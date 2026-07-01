import { Router } from 'express';
import authMiddleware from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';
import * as invoiceController from '../controllers/invoiceController.js';
import * as treatmentController from '../controllers/treatmentController.js';
import * as expenseController from '../controllers/expenseController.js';
import * as reportController from '../controllers/reportController.js';

const router = Router();

// Public — admin login (POST /api/admin)
router.post('/', adminController.login);

// Protected — all routes below require JWT auth
router.use(authMiddleware);

// ── Dashboard & appointments ────────────────────────────────────────────────
router.get('/dashboard', adminController.getDashboard);
router.get('/appointments', adminController.listAppointments);
router.post('/appointments', adminController.addAppointment);
router.get('/appointments/export', adminController.exportAppointments);
router.patch('/appointments/:id', adminController.updateAppointment);
router.delete('/appointments/:id', adminController.deleteAppointment);

// ── Patients (+ accounting sub-resources) ─────────────────────────────────────
router.get('/patients', adminController.listPatients);
router.get('/patients/:id/treatments', treatmentController.getPatientTreatments);
router.get('/patients/:id/ledger', invoiceController.getPatientLedger);
router.get('/patients/:id/ledger/pdf', invoiceController.getPatientLedgerPdf);

// ── Invoices & payments ───────────────────────────────────────────────────────
router.post('/invoices', invoiceController.createInvoice);
router.get('/invoices', invoiceController.listInvoices);
router.get('/invoices/:id', invoiceController.getInvoice);
router.get('/invoices/:id/pdf', invoiceController.getInvoicePdf);
router.patch('/invoices/:id', invoiceController.updateInvoice);
router.post('/invoices/:id/payments', invoiceController.addPayment);
router.delete('/invoices/:id/payments/:paymentId', invoiceController.deletePayment);
router.delete('/invoices/:id/cancel', invoiceController.cancelInvoice);
router.delete('/invoices/:id', invoiceController.deleteInvoice);

// ── Treatments ────────────────────────────────────────────────────────────────
router.post('/treatments', treatmentController.createTreatment);
router.get('/treatments/:id', treatmentController.getTreatment);
router.patch('/treatments/:id', treatmentController.updateTreatment);
router.delete('/treatments/:id', treatmentController.deleteTreatment);

// ── Expenses ──────────────────────────────────────────────────────────────────
router.post('/expenses', expenseController.createExpense);
router.get('/expenses', expenseController.listExpenses);
router.patch('/expenses/:id', expenseController.updateExpense);
router.delete('/expenses/:id', expenseController.deleteExpense);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/daily', reportController.daily);
router.get('/reports/weekly/pdf', reportController.weeklyPdf);
router.get('/reports/weekly', reportController.weekly);
router.get('/reports/monthly/pdf', reportController.monthlyPdf);
router.get('/reports/monthly', reportController.monthly);
router.get('/reports/yearly', reportController.yearly);
router.get('/reports/outstanding', reportController.outstanding);

export default router;
