import express from 'express';
import { symptomCheck } from '../controllers/ai.controller.js';
import { prescriptionOCR } from '../controllers/prescriptionOCR.controller.js';
import { uploadSymptomImage } from '../controllers/upload.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/symptom-check', symptomCheck);
router.post('/upload-symptom-image', upload.single('image'), uploadSymptomImage);
router.post('/prescription-ocr', upload.single('prescription'), prescriptionOCR);

export default router;

