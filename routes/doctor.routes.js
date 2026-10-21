import express from 'express';
import { getApprovedDoctors, getDoctor } from '../controllers/doctor.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', getApprovedDoctors);
router.get('/:id', getDoctor);

export default router;
