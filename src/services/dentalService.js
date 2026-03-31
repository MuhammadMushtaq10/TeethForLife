import { AppDataSource } from '../db/index.js';
import Service from '../entities/Service.js';

function getRepo() {
  return AppDataSource.getRepository(Service);
}

async function findAllActive() {
  return getRepo().find({
    where: { is_active: true },
    order: { name: 'ASC' },
  });
}

async function findActiveById(id) {
  return getRepo().findOne({ where: { id, is_active: true } });
}

export { findAllActive, findActiveById };
