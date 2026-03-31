import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { In, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Appointment from '../entities/Appointment.js';
import Patient from '../entities/Patient.js';

async function login(email, password) {
  if (email !== process.env.ADMIN_EMAIL) {
    return null;
  }

  const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!isValid) {
    return null;
  }

  const token = jwt.sign(
    { email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return { token, email };
}

async function getDashboardData() {
  const appointmentRepo = AppDataSource.getRepository(Appointment);
  const patientRepo = AppDataSource.getRepository(Patient);

  const today = new Date().toISOString().split('T')[0];

  const todayCount = await appointmentRepo.count({
    where: { appointment_date: today },
  });

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

  const totalPatients = await patientRepo.count();

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

  return { todayCount, weekCount, totalPatients, noShowRate, upcoming: upcomingMapped };
}

async function getAppointments({ date, status, search }) {
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

  return appointments.map(a => ({
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
}

async function exportAppointments({ from, to }) {
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

  return { csv, from, to };
}

export { login, getDashboardData, getAppointments, exportAppointments };
