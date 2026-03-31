import { z } from 'zod';

const pakistaniPhone = z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Invalid Pakistani phone number');

const bookingSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: pakistaniPhone,
  email: z.string().email().optional().or(z.literal('')),
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

const reviewSchema = z.object({
  full_name: z.string().min(2),
  phone: pakistaniPhone,
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5).max(1000).optional(),
});

const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

export { bookingSchema, adminBookingSchema, reviewSchema, availabilityQuerySchema };
