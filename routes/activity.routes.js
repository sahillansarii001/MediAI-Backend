import express from 'express';
import { getWeeklyActivity } from '../controllers/activity.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.get('/weekly', protect, authorize('patient'), getWeeklyActivity);

export default router;
