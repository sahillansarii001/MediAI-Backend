import express from 'express';
import { getApprovedDoctors, getDoctor, getDoctorDashboardStats } from '../controllers/doctor.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.get('/dashboard/stats', protect, authorize('doctor'), getDoctorDashboardStats);
router.get('/', getApprovedDoctors);
router.get('/:id', getDoctor);

export default router;
