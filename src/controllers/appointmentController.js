import { bookingSchema } from '../validators/schemas.js';
import * as appointmentService from '../services/appointmentService.js';
import * as patientService from '../services/patientService.js';
import * as dentalService from '../services/dentalService.js';
import * as emailService from '../services/emailService.js';

async function bookAppointment(req, res) {
  try {
    const result = bookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, email, service_id, appointment_date, appointment_time, notes } = result.data;

    const service = await dentalService.findActiveById(service_id);
    if (!service) {
      return res.status(400).json({ error: 'Invalid or inactive service' });
    }

    const slotTaken = await appointmentService.isSlotBooked(appointment_date, appointment_time);
    if (slotTaken) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const patient = await patientService.upsertByPhone({ full_name, phone, email });

    const saved = await appointmentService.createAppointment({
      patient_id: patient.id,
      service_id,
      appointment_date,
      appointment_time,
      notes,
    });

    emailService.sendAppointmentConfirmation({
      email: patient.email,
      fullName: full_name,
      serviceName: service.name,
      date: appointment_date,
      time: appointment_time,
      phone,
    });

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
    if (err?.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
}

export { bookAppointment };
