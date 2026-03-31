import { Router } from 'express';
import * as reviewController from '../controllers/reviewController.js';

const router = Router();

router.get('/', reviewController.listReviews);
router.post('/', reviewController.submitReview);

export default router;
