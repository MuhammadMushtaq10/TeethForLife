import { Router } from 'express';
import { bookingLimiter } from '../middleware/rateLimiter.js';
import * as appointmentController from '../controllers/appointmentController.js';

const router = Router();

router.post('/book', bookingLimiter, appointmentController.bookAppointment);

export default router;
