import express from 'express';
import { getAllMedicines, addMedicine, updateMedicine, adjustStock, deleteMedicine } from '../controllers/medicineStock.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAllMedicines) // Can be accessed by patients, doctors, admins
    .post(authorize('admin', 'super_admin'), addMedicine);

router.route('/:id')
    .put(authorize('admin', 'super_admin'), updateMedicine)
    .delete(authorize('admin', 'super_admin'), deleteMedicine);

router.patch('/:id/stock', authorize('admin', 'super_admin'), adjustStock);

export default router;
