import express from 'express';
import { 
    getAllUsers, addUser, editUser, deleteUser, toggleUserStatus,
    getAllDoctors, getPendingDoctors, verifyDoctor, editDoctor, deleteDoctor,
    getAllAppointments, getAllReports, getAllEmergencies, updateEmergencyStatus, archiveEmergency, getDashboardStats,
    getAllTransactions, addTransaction, updateTransactionStatus, deleteTransaction, getAllAuditLogs
} from '../controllers/admin.controller.js';
import { 
    getAllTickets, updateTicketStatus, deleteTicketAdmin 
} from '../controllers/supportTicket.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect);
router.use(authorize('admin', 'super_admin'));

// User routes
router.route('/users')
    .get(getAllUsers)
    .post(addUser);
router.route('/users/:id')
    .put(editUser)
    .delete(deleteUser);
router.put('/users/:id/status', toggleUserStatus);

// Doctor routes
router.route('/doctors')
    .get(getAllDoctors);
router.route('/doctors/pending')
    .get(getPendingDoctors);
router.put('/doctors/:id/verify', verifyDoctor);
router.route('/doctors/:id')
    .put(editDoctor)
    .delete(deleteDoctor);

// General Management
router.get('/appointments', getAllAppointments);
router.get('/reports', getAllReports);
router.get('/emergencies', getAllEmergencies);
router.patch('/emergencies/:id/status', updateEmergencyStatus);
router.patch('/emergencies/:id/archive', archiveEmergency);

// Transactions
router.route('/transactions')
    .get(getAllTransactions)
    .post(addTransaction);
router.patch('/transactions/:id/status', updateTransactionStatus);
router.delete('/transactions/:id', deleteTransaction);

// Audit Logs
router.get('/audit-logs', getAllAuditLogs);

// Support Ticket Management
router.get('/support-tickets', getAllTickets);
router.patch('/support-tickets/:id', updateTicketStatus);
router.delete('/support-tickets/:id', deleteTicketAdmin);

router.get('/stats', getDashboardStats);

export default router;
