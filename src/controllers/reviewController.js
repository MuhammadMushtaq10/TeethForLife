import { reviewSchema } from '../validators/schemas.js';
import * as reviewService from '../services/reviewService.js';
import * as patientService from '../services/patientService.js';

async function listReviews(req, res) {
  try {
    const reviews = await reviewService.findVisible();
    res.json(reviews);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}

async function submitReview(req, res) {
  try {
    const result = reviewSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, rating, comment } = result.data;

    const patient = await patientService.upsertByPhone({ full_name, phone });

    const saved = await reviewService.createReview({
      patient_id: patient.id,
      rating,
      comment,
    });

    res.status(201).json({
      message: 'Review submitted successfully',
      review: { id: saved.id, rating: saved.rating },
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
}

export { listReviews, submitReview };
