import express from 'express';
import {
    createTicket,
    getMyTickets,
    getAllTickets,
    updateTicketStatus,
    deleteTicketAdmin,
    deleteTicketUser
} from '../controllers/supportTicket.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes require protection
router.use(protect);

// Public (authenticated) routes
router.post('/', createTicket);
router.get('/my', getMyTickets);
router.delete('/:id', deleteTicketUser);

export default router;
