const { Router } = require('express');
const { z } = require('zod');
const { AppDataSource } = require('../db/index');
const { Patient, Service, Appointment } = require('../db/schema');
const { bookingLimiter } = require('../middleware/rateLimiter');
const nodemailer = require('nodemailer');

const router = Router();

// Email transporter (optional)
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const bookingSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Invalid Pakistani phone number'),
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

// POST /api/appointments/book
router.post('/book', bookingLimiter, async (req, res) => {
  try {
    const result = bookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, email, service_id, appointment_date, appointment_time, notes } = result.data;

    // Check service exists
    const serviceRepo = AppDataSource.getRepository(Service);
    const service = await serviceRepo.findOne({ where: { id: service_id, is_active: true } });
    if (!service) {
      return res.status(400).json({ error: 'Invalid or inactive service' });
    }

    // Check slot availability
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const existing = await appointmentRepo.findOne({
      where: {
        appointment_date,
        appointment_time,
        status: 'PENDING',
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    // Upsert patient on phone
    const patientRepo = AppDataSource.getRepository(Patient);
    let patient = await patientRepo.findOne({ where: { phone } });
    if (patient) {
      patient.full_name = full_name;
      if (email) patient.email = email;
      await patientRepo.save(patient);
    } else {
      patient = patientRepo.create({
        full_name,
        phone,
        email: email || null,
      });
      patient = await patientRepo.save(patient);
    }

    // Create appointment
    const appointment = appointmentRepo.create({
      patient_id: patient.id,
      service_id,
      appointment_date,
      appointment_time,
      status: 'PENDING',
      source: 'ONLINE',
      notes: notes || null,
    });
    const saved = await appointmentRepo.save(appointment);

    // Send confirmation email (non-blocking)
    if (transporter && patient.email) {
      transporter.sendMail({
        from: process.env.SMTP_USER,
        to: patient.email,
        subject: 'Appointment Confirmation — Teeth For Life',
        html: `
          <h2>Appointment Confirmed!</h2>
          <p>Dear ${full_name},</p>
          <p>Your appointment has been booked:</p>
          <ul>
            <li><strong>Service:</strong> ${service.name}</li>
            <li><strong>Date:</strong> ${appointment_date}</li>
            <li><strong>Time:</strong> ${appointment_time}</li>
          </ul>
          <p>We'll confirm via WhatsApp at ${phone} within 1 hour.</p>
          <p>— Teeth For Life Dental Clinic</p>
        `,
      }).catch(err => console.error('Email send failed:', err));
    }

    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: saved.id,
        date: appointment_date,
        time: appointment_time,
        service: service.name,
      },
      phone,
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

module.exports = router;
