import { AppDataSource } from '../db/index.js';
import Patient from '../entities/Patient.js';

function getRepo() {
  return AppDataSource.getRepository(Patient);
}

async function findByPhone(phone) {
  return getRepo().findOne({ where: { phone } });
}

async function upsertByPhone({ full_name, phone, email, date_of_birth }) {
  const repo = getRepo();
  let patient = await repo.findOne({ where: { phone } });

  if (patient) {
    patient.full_name = full_name;
    if (email) patient.email = email;
    if (date_of_birth) patient.date_of_birth = date_of_birth;
    return repo.save(patient);
  }

  patient = repo.create({
    full_name,
    phone,
    email: email || null,
    date_of_birth: date_of_birth || null,
  });
  return repo.save(patient);
}

async function findAll({ search } = {}) {
  const qb = getRepo()
    .createQueryBuilder('p')
    .orderBy('p.created_at', 'DESC');

  if (search) {
    qb.where('(p.full_name ILIKE :search OR p.phone ILIKE :search OR p.email ILIKE :search)', {
      search: `%${search}%`,
    });
  }

  return qb.getMany();
}

async function count() {
  return getRepo().count();
}

async function getById(id) {
  return getRepo().findOne({ where: { id } });
}

// Admin correction of a patient's details. All fields optional; only provided
// ones are changed. Returns null if the patient doesn't exist. A duplicate phone
// surfaces as a Postgres 23505 (unique violation) for the controller to map.
async function updatePatient(id, { full_name, phone, email, date_of_birth } = {}) {
  const repo = getRepo();
  const patient = await repo.findOne({ where: { id } });
  if (!patient) return null;

  if (full_name !== undefined) patient.full_name = full_name;
  if (phone !== undefined) patient.phone = phone;
  if (email !== undefined) patient.email = email || null;
  if (date_of_birth !== undefined) patient.date_of_birth = date_of_birth || null;

  return repo.save(patient);
}

export { findByPhone, upsertByPhone, findAll, count, getById, updatePatient };
