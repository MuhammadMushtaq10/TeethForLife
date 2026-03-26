const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AppDataSource } = require('../db/index');
const { Patient, Service, Appointment, Review } = require('../db/schema');
const authMiddleware = require('../middleware/auth');
const { In, Like, Between, MoreThanOrEqual, LessThanOrEqual } = require('typeorm');

const router = Router();

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// All routes below require auth
router.use(authMiddleware);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const patientRepo = AppDataSource.getRepository(Patient);

    const today = new Date().toISOString().split('T')[0];

    // Today's appointments count
    const todayCount = await appointmentRepo.count({
      where: { appointment_date: today },
    });

    // This week's count
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const weekCount = await appointmentRepo
      .createQueryBuilder('a')
      .where('a.appointment_date >= :weekStart', { weekStart: weekStartStr })
      .andWhere('a.appointment_date <= :today', { today })
      .getCount();

    // Total patients
    const totalPatients = await patientRepo.count();

    // No-show rate (last 30 days)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const completedOrNoShow = await appointmentRepo
      .createQueryBuilder('a')
      .where('a.appointment_date >= :start', { start: thirtyDaysAgoStr })
      .andWhere('a.status IN (:...statuses)', { statuses: ['COMPLETED', 'NO_SHOW'] })
      .getCount();

    const noShowCount = await appointmentRepo
      .createQueryBuilder('a')
      .where('a.appointment_date >= :start', { start: thirtyDaysAgoStr })
      .andWhere('a.status = :status', { status: 'NO_SHOW' })
      .getCount();

    const noShowRate = completedOrNoShow > 0
      ? Math.round((noShowCount / completedOrNoShow) * 100)
      : 0;

    // Next 5 upcoming appointments
    const upcoming = await appointmentRepo.find({
      where: {
        appointment_date: MoreThanOrEqual(today),
        status: In(['PENDING', 'CONFIRMED']),
      },
      relations: ['patient', 'service'],
      order: { appointment_date: 'ASC', appointment_time: 'ASC' },
      take: 5,
    });

    const upcomingMapped = upcoming.map(a => ({
      id: a.id,
      patient_name: a.patient?.full_name,
      patient_phone: a.patient?.phone,
      service_name: a.service?.name,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      status: a.status,
      source: a.source,
    }));

    res.json({
      todayCount,
      weekCount,
      totalPatients,
      noShowRate,
      upcoming: upcomingMapped,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/admin/appointments
router.get('/appointments', async (req, res) => {
  try {
    const { date, status, search } = req.query;
    const appointmentRepo = AppDataSource.getRepository(Appointment);

    const qb = appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'p')
      .leftJoinAndSelect('a.service', 's')
      .orderBy('a.appointment_date', 'DESC')
      .addOrderBy('a.appointment_time', 'ASC');

    if (date) {
      qb.andWhere('a.appointment_date = :date', { date });
    }

    if (status) {
      qb.andWhere('a.status = :status', { status });
    }

    if (search) {
      qb.andWhere('(p.full_name ILIKE :search OR p.phone ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const appointments = await qb.getMany();

    const mapped = appointments.map(a => ({
      id: a.id,
      patient_name: a.patient?.full_name,
      patient_phone: a.patient?.phone,
      patient_email: a.patient?.email,
      service_name: a.service?.name,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time,
      status: a.status,
      source: a.source,
      notes: a.notes,
      showed_up: a.showed_up,
      created_at: a.created_at,
      updated_at: a.updated_at,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// POST /api/admin/appointments — manually add
const adminBookingSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Invalid Pakistani phone number'),
  email: z.string().email().optional().or(z.literal('')),
  service_id: z.string().uuid(),
  appointment_date: z.string(),
  appointment_time: z.string(),
  notes: z.string().optional(),
  date_of_birth: z.string().optional(),
});

router.post('/appointments', async (req, res) => {
  try {
    const result = adminBookingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, email, service_id, appointment_date, appointment_time, notes, date_of_birth } = result.data;

    // Verify service
    const serviceRepo = AppDataSource.getRepository(Service);
    const service = await serviceRepo.findOne({ where: { id: service_id, is_active: true } });
    if (!service) {
      return res.status(400).json({ error: 'Invalid service' });
    }

    // Upsert patient
    const patientRepo = AppDataSource.getRepository(Patient);
    let patient = await patientRepo.findOne({ where: { phone } });
    if (patient) {
      patient.full_name = full_name;
      if (email) patient.email = email;
      if (date_of_birth) patient.date_of_birth = date_of_birth;
      await patientRepo.save(patient);
    } else {
      patient = patientRepo.create({
        full_name,
        phone,
        email: email || null,
        date_of_birth: date_of_birth || null,
      });
      patient = await patientRepo.save(patient);
    }

    // Create appointment
    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const appointment = appointmentRepo.create({
      patient_id: patient.id,
      service_id,
      appointment_date,
      appointment_time,
      status: 'CONFIRMED',
      source: 'MANUAL',
      notes: notes || null,
    });
    const saved = await appointmentRepo.save(appointment);

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
    console.error('Admin booking error:', err);
    res.status(500).json({ error: 'Failed to add appointment' });
  }
});

// PATCH /api/admin/appointments/:id
router.patch('/appointments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, showed_up } = req.body;

    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const appointment = await appointmentRepo.findOne({ where: { id } });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (status) appointment.status = status;
    if (notes !== undefined) appointment.notes = notes;
    if (showed_up !== undefined) appointment.showed_up = showed_up;

    const saved = await appointmentRepo.save(appointment);
    res.json({ message: 'Appointment updated', appointment: saved });
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// GET /api/admin/patients
router.get('/patients', async (req, res) => {
  try {
    const { search } = req.query;
    const patientRepo = AppDataSource.getRepository(Patient);

    const qb = patientRepo
      .createQueryBuilder('p')
      .orderBy('p.created_at', 'DESC');

    if (search) {
      qb.where('(p.full_name ILIKE :search OR p.phone ILIKE :search OR p.email ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const patients = await qb.getMany();
    res.json(patients);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/admin/appointments/export?from=&to=
router.get('/appointments/export', async (req, res) => {
  try {
    const { from, to } = req.query;

    const appointmentRepo = AppDataSource.getRepository(Appointment);
    const qb = appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'p')
      .leftJoinAndSelect('a.service', 's')
      .orderBy('a.appointment_date', 'ASC')
      .addOrderBy('a.appointment_time', 'ASC');

    if (from) {
      qb.andWhere('a.appointment_date >= :from', { from });
    }
    if (to) {
      qb.andWhere('a.appointment_date <= :to', { to });
    }

    const appointments = await qb.getMany();

    // Build CSV
    const headers = ['Date', 'Time', 'Patient', 'Phone', 'Email', 'Service', 'Status', 'Source', 'Notes', 'Showed Up'];
    const rows = appointments.map(a => [
      a.appointment_date,
      a.appointment_time,
      a.patient?.full_name || '',
      a.patient?.phone || '',
      a.patient?.email || '',
      a.service?.name || '',
      a.status,
      a.source,
      (a.notes || '').replace(/"/g, '""'),
      a.showed_up ? 'Yes' : 'No',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=appointments-${from || 'all'}-${to || 'all'}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export appointments' });
  }
});

module.exports = router;
