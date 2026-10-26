import express from 'express';
import { addAmbulance, getAmbulances, updateAmbulance, deleteAmbulance } from '../controllers/ambulance.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

// Admin / Hospital routes (add, edit, delete)
router.route('/')
    .get(authorize('admin', 'super_admin'), getAmbulances)
    .post(authorize('admin', 'super_admin'), addAmbulance);

router.route('/:id')
    .put(authorize('admin', 'super_admin'), updateAmbulance)
    .delete(authorize('admin', 'super_admin'), deleteAmbulance);

export default router;
