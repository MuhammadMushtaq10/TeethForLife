import { Router } from 'express';
import * as contactController from '../controllers/contactController.js';

const router = Router();

router.post('/', contactController.submitContact);

export default router;
