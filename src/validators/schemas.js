import { z } from 'zod';

const pakistaniPhone = z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Invalid Pakistani phone number');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format (HH:MM)');

const PAYMENT_METHODS = ['CASH', 'ONLINE', 'CARD', 'BANK_TRANSFER', 'EASYPAISA', 'JAZZCASH'];
const EXPENSE_CATEGORIES = ['SUPPLIES', 'EQUIPMENT', 'SALARY', 'RENT', 'UTILITIES', 'OTHER'];
const INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'];

const bookingSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: pakistaniPhone,
  email: z.string().email('A valid email is required'),
  service_id: z.string().uuid('Invalid service ID'),
  appointment_date: z.string().refine((val) => {
    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }, 'Date must be today or in the future').refine((val) => {
    const [y, m, d] = val.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getDay() !== 0;
  }, 'Cannot book on Sundays'),
  appointment_time: z.string().refine((val) => {
    const [h, m] = val.split(':').map(Number);
    return h >= 9 && (h < 19) && (m === 0 || m === 30);
  }, 'Time must be between 09:00 and 18:30 in 30-min intervals'),
  notes: z.string().optional(),
});

// Same rules as bookingSchema but email is optional (WhatsApp patients may not
// provide one). Used by the inbound WhatsApp booking flow before insert.
const isFutureDate = (val) => {
  const [y, m, d] = val.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
};
const isNotSunday = (val) => {
  const [y, m, d] = val.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() !== 0;
};

const whatsappBookingSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: pakistaniPhone,
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  service_id: z.string().uuid('Invalid service ID'),
  appointment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .refine(isFutureDate, 'Date must be today or in the future')
    .refine(isNotSunday, 'Cannot book on Sundays'),
  appointment_time: z.string().refine((val) => {
    const [h, m] = val.split(':').map(Number);
    return h >= 9 && h < 19 && (m === 0 || m === 30);
  }, 'Time must be between 09:00 and 18:30 in 30-min intervals'),
  notes: z.string().optional(),
});

const adminBookingSchema = z.object({
  full_name: z.string().min(2),
  phone: pakistaniPhone,
  email: z.string().email().optional().or(z.literal('')),
  service_id: z.string().uuid(),
  appointment_date: z.string(),
  appointment_time: z.string(),
  notes: z.string().optional(),
  date_of_birth: z.string().optional(),
});

// Admin edit of an existing appointment. All fields optional. Unlike booking,
// the date is NOT restricted to future/non-Sunday — an admin must be able to
// backdate or fix an appointment (e.g. logging a visit from two days ago).
const appointmentUpdateSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  notes: z.string().optional().nullable(),
  showed_up: z.boolean().optional(),
  appointment_date: dateStr.optional(),
  appointment_time: timeStr.optional(),
  service_id: z.string().uuid('Invalid service ID').optional(),
});

// Admin edit of a patient's details (all optional). Phone still must match the
// Pakistani format; a duplicate phone is caught at the DB layer (unique constraint).
const patientUpdateSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  phone: pakistaniPhone.optional(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  date_of_birth: z.string().optional().nullable().or(z.literal('')),
});

const reviewSchema = z.object({
  full_name: z.string().min(2),
  phone: pakistaniPhone,
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5).max(1000).optional(),
});

const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  phone: pakistaniPhone.optional().or(z.literal('')),
  subject: z.string().min(2, 'Subject is required'),
  message: z.string().min(5, 'Message must be at least 5 characters').max(2000),
});

// ── POS / Accounting (Phase 5) ───────────────────────────────────────────────

// A patient may be identified two ways: an existing `patient_id`, OR a
// `full_name` + `phone` pair (the app's canonical identity — upserted by phone).
// `appointment_id` is optional — invoices can be raised for walk-ins with no
// prior appointment.
const invoiceCreateSchema = z
  .object({
    appointment_id: z.string().uuid('Invalid appointment ID').optional().nullable(),
    patient_id: z.string().uuid('Invalid patient ID').optional(),
    full_name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    phone: pakistaniPhone.optional(),
    subtotal: z.coerce.number().nonnegative('Subtotal must be 0 or more'),
    discount_amount: z.coerce.number().nonnegative('Discount must be 0 or more').optional(),
    discount_reason: z.string().max(255).optional(),
    notes: z.string().optional(),
  })
  .refine((d) => (d.discount_amount ?? 0) <= d.subtotal, {
    message: 'Discount cannot exceed subtotal',
    path: ['discount_amount'],
  })
  .refine((d) => !!d.patient_id || (!!d.full_name && !!d.phone), {
    message: 'Provide a patient, or a name and phone number',
    path: ['phone'],
  });

// Admin correction of an invoice — every money field and the invoice date can
// be fixed. subtotal/discount re-derive total_amount and payment status in the
// service. invoice_date rewrites created_at (the date shown on the invoice).
const invoiceUpdateSchema = z.object({
  subtotal: z.coerce.number().nonnegative().optional(),
  discount_amount: z.coerce.number().nonnegative().optional(),
  discount_reason: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(INVOICE_STATUSES).optional(),
  invoice_date: dateStr.optional(),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  payment_method: z.enum(PAYMENT_METHODS),
  payment_date: dateStr,
  received_by: z.string().max(100).optional(),
  notes: z.string().optional(),
});

// Admin correction of a recorded payment (all fields optional). Editing the
// amount re-derives the parent invoice's paid/unpaid status.
const paymentUpdateSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  payment_date: dateStr.optional(),
  received_by: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const treatmentCreateSchema = z.object({
  appointment_id: z.string().uuid('Invalid appointment ID').optional().nullable(),
  patient_id: z.string().uuid('Invalid patient ID'),
  service_id: z.string().uuid('Invalid service ID').optional().nullable(),
  treatment_date: dateStr,
  tooth_numbers: z.string().max(100).optional(),
  diagnosis: z.string().optional(),
  treatment_notes: z.string().optional(),
  next_visit_notes: z.string().optional(),
});

const treatmentUpdateSchema = z.object({
  service_id: z.string().uuid('Invalid service ID').optional().nullable(),
  treatment_date: dateStr.optional(),
  tooth_numbers: z.string().max(100).optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  treatment_notes: z.string().optional().nullable(),
  next_visit_notes: z.string().optional().nullable(),
});

const expenseCreateSchema = z.object({
  expense_date: dateStr,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  vendor: z.string().max(100).optional(),
  receipt_number: z.string().max(100).optional(),
});

const expenseUpdateSchema = z.object({
  expense_date: dateStr.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  vendor: z.string().max(100).optional().nullable(),
  receipt_number: z.string().max(100).optional().nullable(),
});

export {
  bookingSchema,
  whatsappBookingSchema,
  adminBookingSchema,
  appointmentUpdateSchema,
  patientUpdateSchema,
  reviewSchema,
  availabilityQuerySchema,
  contactSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  paymentSchema,
  paymentUpdateSchema,
  treatmentCreateSchema,
  treatmentUpdateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
};
