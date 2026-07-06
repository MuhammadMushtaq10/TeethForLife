import { adminBookingSchema, appointmentUpdateSchema, patientUpdateSchema } from '../validators/schemas.js';
import * as adminService from '../services/adminService.js';
import * as appointmentService from '../services/appointmentService.js';
import * as patientService from '../services/patientService.js';
import * as dentalService from '../services/dentalService.js';
import * as invoiceService from '../services/invoiceService.js';

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await adminService.login(email, password);
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(result);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function getDashboard(req, res) {
  try {
    const data = await adminService.getDashboardData();
    res.json(data);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

async function listAppointments(req, res) {
  try {
    const { date, status, search } = req.query;
    const appointments = await adminService.getAppointments({ date, status, search });
    res.json(appointments);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
}

async function addAppointment(req, res) {
  try {
    const result = adminBookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, email, service_id, appointment_date, appointment_time, notes, date_of_birth } = result.data;

    // Service is optional (e.g. a follow-up with no service decided yet). Only
    // validate it when one was supplied.
    let service = null;
    if (service_id) {
      service = await dentalService.findActiveById(service_id);
      if (!service) {
        return res.status(400).json({ error: 'Invalid service' });
      }
    }

    const patient = await patientService.upsertByPhone({ full_name, phone, email, date_of_birth });

    const saved = await appointmentService.createAppointment({
      patient_id: patient.id,
      service_id: service_id || null,
      appointment_date,
      appointment_time,
      status: 'CONFIRMED',
      source: 'MANUAL',
      notes,
    });

    res.status(201).json({
      message: 'Appointment added successfully',
      appointment: {
        id: saved.id,
        date: appointment_date,
        time: appointment_time,
        service: service?.name || null,
        patient: full_name,
      },
    });
  } catch (err) {
    if (err?.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }
    console.error('Admin booking error:', err);
    res.status(500).json({ error: 'Failed to add appointment' });
  }
}

async function updateAppointment(req, res) {
  try {
    const { id } = req.params;
    const result = appointmentUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const { status, notes, showed_up, appointment_date, appointment_time, service_id } = result.data;

    const saved = await appointmentService.updateAppointment(id, {
      status,
      notes,
      showed_up,
      appointment_date,
      appointment_time,
      service_id,
    });
    if (!saved) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // On completion, auto-create an invoice from the booked service price so the
    // admin doesn't have to do it by hand. Idempotent (skips if one exists) and
    // never fails the status update — invoicing is a side effect, not the point.
    let invoice;
    if (saved.status === 'COMPLETED') {
      try {
        const inv = await invoiceService.autoCreateForAppointment(saved.id);
        if (inv) {
          invoice = {
            id: inv.id,
            invoice_number: inv.invoice_number,
            status: inv.status,
            total_amount: Number(inv.total_amount),
          };
        }
      } catch (invErr) {
        console.error('Auto-invoice on completion failed:', invErr);
      }
    }

    res.json({ message: 'Appointment updated', appointment: saved, invoice });
  } catch (err) {
    if (err?.code === 'SLOT_TAKEN') {
      return res.status(409).json({ error: 'Another active appointment already holds this slot' });
    }
    if (err?.code === '23503') {
      return res.status(400).json({ error: 'Invalid service reference' });
    }
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
}

async function deleteAppointment(req, res) {
  try {
    const force = req.query.force === 'true';
    const result = await appointmentService.deleteAppointment(req.params.id, { force });
    if (result === null) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ message: 'Appointment deleted' });
  } catch (err) {
    if (err?.code === 'HAS_INVOICE') {
      return res.status(409).json({ error: err.message, invoice_count: err.invoiceCount });
    }
    console.error('Delete appointment error:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
}

async function listPatients(req, res) {
  try {
    const { search } = req.query;
    const patients = await patientService.findAll({ search });
    res.json(patients);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
}

async function getPatient(req, res) {
  try {
    const patient = await patientService.getById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch (err) {
    console.error('Get patient error:', err);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
}

async function updatePatient(req, res) {
  try {
    const result = patientUpdateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }
    const updated = await patientService.updatePatient(req.params.id, result.data);
    if (!updated) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Patient updated', patient: updated });
  } catch (err) {
    // Unique-violation on phone — another patient already uses this number.
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'Another patient already uses this phone number' });
    }
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
}

async function exportAppointments(req, res) {
  try {
    const { from, to } = req.query;
    const { csv } = await adminService.exportAppointments({ from, to });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=appointments-${from || 'all'}-${to || 'all'}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export appointments' });
  }
}

export { login, getDashboard, listAppointments, addAppointment, updateAppointment, deleteAppointment, listPatients, getPatient, updatePatient, exportAppointments };
