import { adminBookingSchema } from '../validators/schemas.js';
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

    const service = await dentalService.findActiveById(service_id);
    if (!service) {
      return res.status(400).json({ error: 'Invalid service' });
    }

    const patient = await patientService.upsertByPhone({ full_name, phone, email, date_of_birth });

    const saved = await appointmentService.createAppointment({
      patient_id: patient.id,
      service_id,
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
        service: service.name,
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
    const { status, notes, showed_up } = req.body;

    const saved = await appointmentService.updateAppointment(id, { status, notes, showed_up });
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
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
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

export { login, getDashboard, listAppointments, addAppointment, updateAppointment, listPatients, exportAppointments };
