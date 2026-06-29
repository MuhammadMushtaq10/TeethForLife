// Shared test helpers: DB lifecycle + small factories. Not a *.test.js file, so
// the runner won't execute it directly.
import { AppDataSource } from '../src/db/index.js';
import * as patientService from '../src/services/patientService.js';
import * as appointmentService from '../src/services/appointmentService.js';
import Service from '../src/entities/Service.js';

export { AppDataSource };

export async function initDb() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
}

export async function closeDb() {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

// Wipe everything except the seeded `services` catalogue.
export async function resetDb() {
  await AppDataSource.query(
    'TRUNCATE payments, invoices, treatments, expenses, appointments, reviews, patients RESTART IDENTITY CASCADE'
  );
}

export async function firstService() {
  return AppDataSource.getRepository(Service).findOne({ where: { is_active: true }, order: { name: 'ASC' } });
}

let phoneSeq = 0;
function nextPhone() {
  phoneSeq += 1;
  // +92 followed by exactly 10 digits (matches the Pakistani-phone regex).
  return `+92300${String(1000000 + phoneSeq).slice(-7)}`;
}

export async function makePatient(over = {}) {
  return patientService.upsertByPhone({
    full_name: over.full_name || 'Test Patient',
    phone: over.phone || nextPhone(),
    email: over.email,
  });
}

export async function makeAppointment(over = {}) {
  const patient = over.patient || (await makePatient());
  const service = over.service || (await firstService());
  const appt = await appointmentService.createAppointment({
    patient_id: patient.id,
    service_id: service.id,
    appointment_date: over.date || '2026-06-15',
    appointment_time: over.time || '10:00',
    status: over.status || 'CONFIRMED',
    source: 'MANUAL',
  });
  return { appt, patient, service };
}
