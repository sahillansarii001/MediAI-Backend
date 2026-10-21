import express from 'express';
import { createCheckoutSession, simulateWebhook, payForConsultation } from '../controllers/payment.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/checkout', createCheckoutSession);
router.post('/simulate-webhook', simulateWebhook);
router.post('/consultation', payForConsultation);

export default router;
