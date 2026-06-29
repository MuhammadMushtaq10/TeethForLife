import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { In, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Appointment from '../entities/Appointment.js';
import Patient from '../entities/Patient.js';
import * as invoiceService from './invoiceService.js';

// The clinic operates in Karachi (Asia/Karachi, UTC+5). Computing "today" via
// Date#toISOString() would use UTC and be a day behind for the first ~5 hours
// after local midnight, under-counting the dashboard. These helpers keep all
// date-boundary math in clinic-local time, as YYYY-MM-DD strings (matching how
// appointment_date is stored and compared).
const KARACHI_TZ = 'Asia/Karachi';

function karachiDateStr(date = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KARACHI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Pure calendar arithmetic on a YYYY-MM-DD string (UTC anchor avoids DST drift).
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

// Quote a CSV cell: double internal quotes and wrap in quotes, escaping commas,
// quotes and newlines in any field. Also neutralise spreadsheet formula
// injection (a leading =,+,-,@ can execute when opened in Excel/Sheets) by
// prefixing such values with a single quote.
function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

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

  const today = karachiDateStr();

  const todayCount = await appointmentRepo.count({
    where: { appointment_date: today },
  });

  const dow = dayOfWeek(today);
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const weekStartStr = addDays(today, -mondayOffset);

  const weekCount = await appointmentRepo
    .createQueryBuilder('a')
    .where('a.appointment_date >= :weekStart', { weekStart: weekStartStr })
    .andWhere('a.appointment_date <= :today', { today })
    .getCount();

  const totalPatients = await patientRepo.count();

  const thirtyDaysAgoStr = addDays(today, -30);

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

  // Attach invoice status / amount paid / balance due (non-cancelled invoice
  // for the appointment, if any) so the list doubles as a billing overview.
  const invoiceMap = await invoiceService.summarizeByAppointmentIds(appointments.map(a => a.id));

  return appointments.map(a => ({
    id: a.id,
    patient_id: a.patient_id,
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
    invoice: invoiceMap[a.id] || null,
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
    a.notes || '',
    a.showed_up ? 'Yes' : 'No',
  ]);

  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map(r => r.map(csvCell).join(',')),
  ].join('\r\n');

  return { csv, from, to };
}

export { login, getDashboardData, getAppointments, exportAppointments };
