import express from 'express';
import { createGuestEmergency, createEmergencyCase, getPatientEmergencyCases, updateEmergencyStatus } from '../controllers/emergency.controller.js';
import { handleEmergencyScan, handleEmergencyScanFast } from '../controllers/emergencyScan.controller.js';
import { protect, optionalProtect } from '../middleware/auth.middleware.js';
import { guestSosRateLimiter } from '../middleware/rateLimiter.middleware.js';
import multer from 'multer';

const router = express.Router();

// Setup multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// PUBLIC route — Guest SOS (no login required)
router.post('/guest-sos', guestSosRateLimiter, createGuestEmergency);

// OPTIONAL AUTH route — Emergency face scan
router.post('/emergency-scan', optionalProtect, upload.single('image'), handleEmergencyScan);
router.post('/emergency-scan-fast', optionalProtect, express.json(), handleEmergencyScanFast);

// Protected routes below
router.use(protect);

router.post('/', createEmergencyCase);
router.get('/patient', getPatientEmergencyCases);
router.put('/:id/status', updateEmergencyStatus);

export default router;
