import express from 'express';
import { addVitals, getLatestVitals, getVitalsHistory } from '../controllers/vitals.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.post('/', addVitals);
router.get('/latest', getLatestVitals);
router.get('/history', getVitalsHistory);

export default router;
