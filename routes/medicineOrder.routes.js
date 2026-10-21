import express from 'express';
import { 
    createOrder, 
    getPatientOrders, 
    getAllOrders, 
    updateOrderStatus,
    deleteOrder
} from '../controllers/medicineOrder.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize('patient'), createOrder);
router.get('/patient', authorize('patient'), getPatientOrders);

router.get('/', authorize('admin'), getAllOrders);
router.put('/:id/status', authorize('admin'), updateOrderStatus);

// Both patient and admin can delete (controller handles ownership check)
router.delete('/:id', deleteOrder);

export default router;
