import { In } from 'typeorm';
import { AppDataSource } from '../db/index.js';
import Appointment from '../entities/Appointment.js';

function getRepo() {
  return AppDataSource.getRepository(Appointment);
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

async function createAppointment({ patient_id, service_id, appointment_date, appointment_time, status = 'PENDING', source = 'ONLINE', notes = null }) {
  const repo = getRepo();
  const appointment = repo.create({
    patient_id,
    service_id,
    appointment_date,
    appointment_time,
    status,
    source,
    notes,
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

export { isSlotBooked, createAppointment, findById, updateAppointment, SlotTakenError };
