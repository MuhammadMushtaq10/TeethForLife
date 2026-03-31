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

export { findByPhone, upsertByPhone, findAll, count };
