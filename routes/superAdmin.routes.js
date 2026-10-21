import express from 'express';
import {
    getDashboardStats,
    getAllAdmins, createAdmin, updateAdmin, suspendAdmin, deleteAdmin,
    getAllEmergencies, getEmergencyById, assignEmergency, updateEmergencyStatusSA, deleteEmergency,
    getAllPlatformUsers, getAllDoctors, getAllAppointments, getAllSupportTickets, getAllAuditLogs,
    getAnalytics,
    getPlatformSettings, updatePlatformSettings,
    getAdminStats
} from '../controllers/superAdmin.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

// All routes require super_admin role
router.use(protect);
router.use(authorize('super_admin'));

// Dashboard
router.get('/dashboard/stats', getDashboardStats);

// Admin Management
router.route('/admins')
    .get(getAllAdmins)
    .post(createAdmin);
router.route('/admins/:id')
    .put(updateAdmin)
    .delete(deleteAdmin);
router.patch('/admins/:id/suspend', suspendAdmin);
router.get('/admins/:id/stats', getAdminStats);

// Emergency Control Center
router.get('/emergencies', getAllEmergencies);
router.get('/emergencies/:id', getEmergencyById);
router.patch('/emergencies/:id/assign', assignEmergency);
router.patch('/emergencies/:id/status', updateEmergencyStatusSA);
router.delete('/emergencies/:id', deleteEmergency);

// Platform-wide Read Access
router.get('/users', getAllPlatformUsers);
router.get('/doctors', getAllDoctors);
router.get('/appointments', getAllAppointments);
router.get('/support-tickets', getAllSupportTickets);
router.get('/audit-logs', getAllAuditLogs);

// Analytics
router.get('/analytics', getAnalytics);

// Platform Settings
router.route('/settings')
    .get(getPlatformSettings)
    .put(updatePlatformSettings);

export default router;
