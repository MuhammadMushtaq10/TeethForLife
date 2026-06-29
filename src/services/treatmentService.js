import { AppDataSource } from '../db/index.js';
import Treatment from '../entities/Treatment.js';

function getRepo() {
  return AppDataSource.getRepository(Treatment);
}

async function createTreatment(data) {
  const repo = getRepo();
  const treatment = repo.create({
    appointment_id: data.appointment_id || null,
    patient_id: data.patient_id,
    service_id: data.service_id || null,
    treatment_date: data.treatment_date,
    tooth_numbers: data.tooth_numbers || null,
    diagnosis: data.diagnosis || null,
    treatment_notes: data.treatment_notes || null,
    next_visit_notes: data.next_visit_notes || null,
  });
  return repo.save(treatment);
}

async function updateTreatment(id, data) {
  const repo = getRepo();
  const treatment = await repo.findOne({ where: { id } });
  if (!treatment) return null;

  const fields = ['service_id', 'treatment_date', 'tooth_numbers', 'diagnosis', 'treatment_notes', 'next_visit_notes'];
  for (const f of fields) {
    if (data[f] !== undefined) treatment[f] = data[f];
  }
  return repo.save(treatment);
}

async function getById(id) {
  const t = await getRepo().findOne({
    where: { id },
    relations: ['service', 'patient'],
  });
  if (!t) return null;
  return shape(t);
}

async function getPatientTreatmentHistory(patientId) {
  const treatments = await getRepo().find({
    where: { patient_id: patientId },
    relations: ['service'],
    order: { treatment_date: 'DESC', created_at: 'DESC' },
  });
  return treatments.map(shape);
}

async function getByAppointment(appointmentId) {
  const treatments = await getRepo().find({
    where: { appointment_id: appointmentId },
    relations: ['service'],
    order: { treatment_date: 'DESC' },
  });
  return treatments.map(shape);
}

function shape(t) {
  return {
    id: t.id,
    appointment_id: t.appointment_id,
    patient_id: t.patient_id,
    service_id: t.service_id,
    service_name: t.service?.name || null,
    patient_name: t.patient?.full_name || undefined,
    treatment_date: t.treatment_date,
    tooth_numbers: t.tooth_numbers,
    diagnosis: t.diagnosis,
    treatment_notes: t.treatment_notes,
    next_visit_notes: t.next_visit_notes,
    created_at: t.created_at,
  };
}

export {
  createTreatment,
  updateTreatment,
  getById,
  getPatientTreatmentHistory,
  getByAppointment,
};
