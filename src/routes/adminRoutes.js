import { Router } from 'express';
import authMiddleware from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = Router();

// Public
router.post('/login', adminController.login);

// Protected — all routes below require JWT auth
router.use(authMiddleware);

router.get('/dashboard', adminController.getDashboard);
router.get('/appointments', adminController.listAppointments);
router.post('/appointments', adminController.addAppointment);
router.patch('/appointments/:id', adminController.updateAppointment);
router.get('/patients', adminController.listPatients);
router.get('/appointments/export', adminController.exportAppointments);

export default router;
