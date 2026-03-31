import { AppDataSource } from '../db/index.js';
import Review from '../entities/Review.js';

function getRepo() {
  return AppDataSource.getRepository(Review);
}

async function findVisible() {
  const reviews = await getRepo().find({
    where: { is_visible: true },
    relations: ['patient'],
    order: { created_at: 'DESC' },
    take: 50,
  });

  return reviews.map(r => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    patient_name: r.patient ? r.patient.full_name : 'Anonymous',
    created_at: r.created_at,
  }));
}

async function createReview({ patient_id, rating, comment }) {
  const repo = getRepo();
  const review = repo.create({
    patient_id,
    rating,
    comment: comment || null,
    is_visible: true,
  });
  return repo.save(review);
}

export { findVisible, createReview };
