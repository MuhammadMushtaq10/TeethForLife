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
      status: 'PENDING',
    },
  });
  return !!existing;
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
  return repo.save(appointment);
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

  return repo.save(appointment);
}

export { isSlotBooked, createAppointment, findById, updateAppointment };
