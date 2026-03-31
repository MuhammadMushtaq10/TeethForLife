import { Router } from 'express';
import * as serviceController from '../controllers/serviceController.js';

const router = Router();

router.get('/', serviceController.listServices);

export default router;
