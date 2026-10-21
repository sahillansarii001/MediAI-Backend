import express from 'express';
import { addReminder, getPatientReminders, updateReminder, deleteReminder, updateReminderStatus } from '../controllers/medicine.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);
router.use(authorize('patient'));

router.post('/', addReminder);
router.get('/patient', getPatientReminders);
router.route('/:id')
    .put(updateReminder)
    .delete(deleteReminder);
router.put('/:id/status', updateReminderStatus);

export default router;
