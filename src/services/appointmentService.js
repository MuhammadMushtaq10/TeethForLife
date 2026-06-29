import { In, Between } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Appointment from '../entities/Appointment.js';

function getRepo() {
  return AppDataSource.getRepository(Appointment);
}

// YYYY-MM-DD for a Date, in UTC (callers pass clinic-local calendar dates).
function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function isSlotBooked(date, time) {
  const existing = await getRepo().findOne({
    where: {
      appointment_date: date,
      appointment_time: time,
      status: In(['PENDING', 'CONFIRMED']),
    },
  });
  return !!existing;
}

// Thrown when the (date, time) active-slot unique index rejects an insert/update.
// Lets controllers respond 409 instead of a generic 500.
class SlotTakenError extends Error {
  constructor() {
    super('This time slot is already booked');
    this.code = 'SLOT_TAKEN';
  }
}

// Postgres unique-violation error code for the active-slot index.
function isActiveSlotViolation(err) {
  return err?.code === '23505' && String(err?.detail || err?.constraint || '').includes('appointment');
}

async function createAppointment({ patient_id, service_id, appointment_date, appointment_time, status = 'PENDING', source = 'ONLINE', notes = null, booked_via = 'website' }) {
  const repo = getRepo();
  const appointment = repo.create({
    patient_id,
    service_id,
    appointment_date,
    appointment_time,
    status,
    source,
    notes,
    booked_via,
  });
  try {
    return await repo.save(appointment);
  } catch (err) {
    if (isActiveSlotViolation(err)) throw new SlotTakenError();
    throw err;
  }
}

async function findById(id) {
  return getRepo().findOne({ where: { id } });
}

async function updateAppointment(id, { status, notes, showed_up }) {
  const repo = getRepo();
  const appointment = await repo.findOne({ where: { id } });

  if (!appointment) return null;

  if (status) appointment.status = status;
  if (notes !== undefined) appointment.notes = notes;
  if (showed_up !== undefined) appointment.showed_up = showed_up;

  try {
    return await repo.save(appointment);
  } catch (err) {
    // e.g. confirming a PENDING appointment onto a slot another CONFIRMED one holds
    if (isActiveSlotViolation(err)) throw new SlotTakenError();
    throw err;
  }
}

// ── Phase 4 (WhatsApp) helpers ───────────────────────────────────────────

// Candidate appointments for the reminder cron: active status, on or after
// `fromDate`, up to `days` ahead. Relations are loaded so the WhatsApp
// messages can read patient phone/name and service name. The exact 24h / 2h
// windowing (in Asia/Karachi) is done in JS by the reminder job — this just
// narrows the rows to a small set.
async function findRemindable({ fromDate = new Date(), days = 2 } = {}) {
  const start = ymd(fromDate);
  const end = ymd(new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000));
  return getRepo().find({
    where: {
      appointment_date: Between(start, end),
      status: In(['PENDING', 'CONFIRMED']),
    },
    relations: ['patient', 'service'],
    order: { appointment_date: 'ASC', appointment_time: 'ASC' },
  });
}

// Most recent appointment for a phone number (DB stores '+92…' / '0…') in one
// of the given statuses. Used by the inbound CONFIRM / CANCEL webhook.
// `phone` may be a single string or an array of equivalent formats.
async function findLatestByPhone(phone, statuses) {
  const phones = Array.isArray(phone) ? phone : [phone];
  const qb = getRepo()
    .createQueryBuilder('a')
    .innerJoinAndSelect('a.patient', 'p')
    .leftJoinAndSelect('a.service', 's')
    .where('p.phone IN (:...phones)', { phones })
    .orderBy('a.appointment_date', 'DESC')
    .addOrderBy('a.appointment_time', 'DESC')
    .addOrderBy('a.created_at', 'DESC');

  if (statuses?.length) {
    qb.andWhere('a.status IN (:...statuses)', { statuses });
  }
  return qb.getOne();
}

// Set a single reminder idempotency flag. Returns the updated row count.
async function markReminderSent(id, field) {
  if (field !== 'reminder_sent_24h' && field !== 'reminder_sent_2h') {
    throw new Error(`Invalid reminder field: ${field}`);
  }
  const res = await getRepo().update({ id }, { [field]: true });
  return res.affected || 0;
}

export {
  isSlotBooked,
  createAppointment,
  findById,
  updateAppointment,
  SlotTakenError,
  findRemindable,
  findLatestByPhone,
  markReminderSent,
};
