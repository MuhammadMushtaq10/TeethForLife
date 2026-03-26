const { Router } = require('express');
const { z } = require('zod');
const { AppDataSource } = require('../db/index');
const { Patient, Review } = require('../db/schema');

const router = Router();

// GET /api/reviews — visible reviews
router.get('/', async (req, res) => {
  try {
    const reviewRepo = AppDataSource.getRepository(Review);
    const reviews = await reviewRepo.find({
      where: { is_visible: true },
      relations: ['patient'],
      order: { created_at: 'DESC' },
      take: 50,
    });

    const mapped = reviews.map(r => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      patient_name: r.patient ? r.patient.full_name : 'Anonymous',
      created_at: r.created_at,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

const reviewSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().regex(/^(\+92|0)[0-9]{10}$/, 'Invalid Pakistani phone number'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5).max(1000).optional(),
});

// POST /api/reviews — submit review
router.post('/', async (req, res) => {
  try {
    const result = reviewSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.errors });
    }

    const { full_name, phone, rating, comment } = result.data;

    // Look up patient by phone
    const patientRepo = AppDataSource.getRepository(Patient);
    let patient = await patientRepo.findOne({ where: { phone } });

    if (!patient) {
      // Create patient for the review
      patient = patientRepo.create({ full_name, phone });
      patient = await patientRepo.save(patient);
    }

    const reviewRepo = AppDataSource.getRepository(Review);
    const review = reviewRepo.create({
      patient_id: patient.id,
      rating,
      comment: comment || null,
      is_visible: true,
    });
    const saved = await reviewRepo.save(review);

    res.status(201).json({
      message: 'Review submitted successfully',
      review: { id: saved.id, rating: saved.rating },
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

module.exports = router;
