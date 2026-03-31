import { Router } from 'express';
import * as availabilityController from '../controllers/availabilityController.js';

const router = Router();

router.get('/', availabilityController.getAvailability);

export default router;
