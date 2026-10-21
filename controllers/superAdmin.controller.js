import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import Report from '../models/Report.js';
import EmergencyCase from '../models/EmergencyCase.js';
import Ambulance from '../models/Ambulance.js';
import Transaction from '../models/Transaction.js';
import AuditLog from '../models/AuditLog.js';
import SupportTicket from '../models/SupportTicket.js';
import Notification from '../models/Notification.js';
import { createAuditLog } from '../utils/auditLogger.js';

// ==========================================
// DASHBOARD
// ==========================================

export const getDashboardStats = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        const getTrend = async (Model, query = {}) => {
            const current = await Model.countDocuments({ ...query, createdAt: { $gte: thirtyDaysAgo } });
            const previous = await Model.countDocuments({ ...query, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } });
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        const [
            totalUsers, totalPatients, totalDoctors, totalAdmins,
            totalEmergencies, activeEmergencies, resolvedEmergencies, pendingEmergencies,
            guestEmergencies, patientEmergencies,
            totalAppointments, totalReports, totalSupportTickets,
            totalRevenueAgg
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: 'patient' }),
            Doctor.countDocuments(),
            User.countDocuments({ role: 'admin' }),
            EmergencyCase.countDocuments(),
            EmergencyCase.countDocuments({ status: { $in: ['pending', 'assigned', 'dispatched'] } }),
            EmergencyCase.countDocuments({ status: 'resolved' }),
            EmergencyCase.countDocuments({ status: 'pending' }),
            EmergencyCase.countDocuments({ source: 'guest' }),
            EmergencyCase.countDocuments({ source: 'patient' }),
            Appointment.countDocuments(),
            Report.countDocuments(),
            SupportTicket.countDocuments(),
            Transaction.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const [userTrend, doctorTrend, emergencyTrend, appointmentTrend] = await Promise.all([
            getTrend(User, { role: 'patient' }),
            getTrend(Doctor),
            getTrend(EmergencyCase),
            getTrend(Appointment)
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalPatients,
                totalDoctors,
                totalAdmins,
                totalEmergencies,
                activeEmergencies,
                resolvedEmergencies,
                pendingEmergencies,
                guestEmergencies,
                patientEmergencies,
                totalAppointments,
                totalReports,
                totalSupportTickets,
                revenue: totalRevenueAgg[0]?.total || 0,
                trends: {
                    users: userTrend,
                    doctors: doctorTrend,
                    emergencies: emergencyTrend,
                    appointments: appointmentTrend
                }
            }
        });
    } catch (error) {
        console.error('SuperAdmin getDashboardStats error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// ADMIN MANAGEMENT
// ==========================================

export const getAllAdmins = async (req, res) => {
    try {
        const admins = await User.find({ role: 'admin' })
            .select('-password')
            .populate('createdBy', 'fullName email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: admins });
    } catch (error) {
        console.error('getAllAdmins error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const createAdmin = async (req, res) => {
    try {
        const { fullName, email, password, adminAccessCode, assignedRegion, phone } = req.body;

        if (!fullName || !email || !password || !adminAccessCode) {
            return res.status(400).json({ success: false, message: 'Full name, email, password, and access code are required' });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        const existingDoctor = await Doctor.findOne({ email: email.toLowerCase() });
        if (existingUser || existingDoctor) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const admin = await User.create({
            fullName,
            email: email.toLowerCase(),
            password,
            role: 'admin',
            adminAccessCode,
            assignedRegion: assignedRegion || '',
            phone: phone || '',
            isVerified: true,
            isActive: true,
            createdBy: req.user._id
        });

        await createAuditLog({
            action: 'ADMIN_CREATED',
            req,
            target: 'User',
            targetId: admin._id,
            details: { email: admin.email, fullName: admin.fullName, assignedRegion: admin.assignedRegion }
        });

        const adminObj = admin.toObject();
        delete adminObj.password;
        delete adminObj.adminAccessCode;

        res.status(201).json({ success: true, data: adminObj });
    } catch (error) {
        console.error('createAdmin error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAdmin = async (req, res) => {
    try {
        const { password, adminAccessCode, ...updateData } = req.body;
        const admin = await User.findById(req.params.id);

        if (!admin || admin.role !== 'admin') {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        Object.keys(updateData).forEach(key => {
            admin[key] = updateData[key];
        });

        if (password && password.trim() !== '') {
            admin.password = password;
        }
        if (adminAccessCode && adminAccessCode.trim() !== '') {
            admin.adminAccessCode = adminAccessCode;
        }

        await admin.save();

        await createAuditLog({
            action: 'ADMIN_UPDATED',
            req,
            target: 'User',
            targetId: admin._id,
            details: { email: admin.email, updatedFields: Object.keys(updateData) }
        });

        const adminObj = admin.toObject();
        delete adminObj.password;
        delete adminObj.adminAccessCode;

        res.status(200).json({ success: true, data: adminObj });
    } catch (error) {
        console.error('updateAdmin error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const suspendAdmin = async (req, res) => {
    try {
        const admin = await User.findById(req.params.id);
        if (!admin || admin.role !== 'admin') {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        admin.isActive = !admin.isActive;
        await admin.save({ validateBeforeSave: false });

        await createAuditLog({
            action: admin.isActive ? 'ADMIN_ACTIVATED' : 'ADMIN_SUSPENDED',
            req,
            target: 'User',
            targetId: admin._id,
            details: { email: admin.email, isActive: admin.isActive }
        });

        const adminObj = admin.toObject();
        delete adminObj.password;
        delete adminObj.adminAccessCode;

        res.status(200).json({ success: true, data: adminObj });
    } catch (error) {
        console.error('suspendAdmin error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteAdmin = async (req, res) => {
    try {
        const admin = await User.findById(req.params.id);
        if (!admin || admin.role !== 'admin') {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        await User.findByIdAndDelete(req.params.id);

        await createAuditLog({
            action: 'ADMIN_DELETED',
            req,
            target: 'User',
            targetId: admin._id,
            details: { email: admin.email, fullName: admin.fullName }
        });

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        console.error('deleteAdmin error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAdminStats = async (req, res) => {
    try {
        const admin = await User.findById(req.params.id);
        if (!admin || admin.role !== 'admin') {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        let doctorQuery = {};
        let patientQuery = { role: 'patient' };
        let ambulanceQuery = {};

        // If assignedRegion is provided and not empty/Global, filter by it
        if (admin.assignedRegion && admin.assignedRegion.trim() !== '' && admin.assignedRegion.toLowerCase() !== 'global') {
            doctorQuery.region = admin.assignedRegion;
            patientQuery.region = admin.assignedRegion;
            ambulanceQuery.region = admin.assignedRegion;
        }

        const totalDoctors = await Doctor.countDocuments(doctorQuery);
        const totalPatients = await User.countDocuments(patientQuery);
        const totalAmbulances = await Ambulance.countDocuments(ambulanceQuery);

        const doctorsList = await Doctor.find(doctorQuery).select('fullName specialization -_id');
        const patientsList = await User.find(patientQuery).select('fullName email -_id');
        const ambulancesList = await Ambulance.find(ambulanceQuery).select('numberPlate driverName phoneNumber drivingLicense -_id');

        res.status(200).json({
            success: true,
            data: {
                adminName: admin.fullName,
                region: admin.assignedRegion || 'Global',
                totalDoctors,
                totalPatients,
                totalAmbulances,
                doctors: doctorsList,
                patients: patientsList,
                ambulances: ambulancesList
            }
        });
    } catch (error) {
        console.error('getAdminStats error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// EMERGENCY CONTROL CENTER
// ==========================================

export const getAllEmergencies = async (req, res) => {
    try {
        const emergencies = await EmergencyCase.find()
            .populate('patient', 'fullName email phone emergencyContact')
            .populate('assignedAdmin', 'fullName email')
            .populate('assignedDoctor', 'fullName specialization phone')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: emergencies });
    } catch (error) {
        console.error('SuperAdmin getAllEmergencies error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getEmergencyById = async (req, res) => {
    try {
        const emergency = await EmergencyCase.findById(req.params.id)
            .populate('patient', 'fullName email phone emergencyContact location')
            .populate('assignedAdmin', 'fullName email phone')
            .populate('assignedDoctor', 'fullName specialization phone clinicAddress')
            .populate('nearestDoctors.doctor', 'fullName specialization phone');

        if (!emergency) {
            return res.status(404).json({ success: false, message: 'Emergency case not found' });
        }

        res.status(200).json({ success: true, data: emergency });
    } catch (error) {
        console.error('getEmergencyById error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const assignEmergency = async (req, res) => {
    try {
        const { assignedAdmin, assignedDoctor, assignedHospital } = req.body;

        const updateData = { status: 'assigned', assignedAt: new Date() };
        if (assignedAdmin) updateData.assignedAdmin = assignedAdmin;
        if (assignedDoctor) updateData.assignedDoctor = assignedDoctor;
        if (assignedHospital) updateData.assignedHospital = assignedHospital;

        const emergency = await EmergencyCase.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        )
            .populate('patient', 'fullName email phone')
            .populate('assignedAdmin', 'fullName email')
            .populate('assignedDoctor', 'fullName specialization');

        if (!emergency) {
            return res.status(404).json({ success: false, message: 'Emergency case not found' });
        }

        // Notify the assigned admin via socket and notification
        if (assignedAdmin) {
            const io = req.app.get('io');
            if (io) {
                io.to(`admin_${assignedAdmin}`).emit('emergency_assigned', emergency);
            }
            await Notification.create({
                recipient: assignedAdmin,
                recipientModel: 'User',
                title: 'Emergency Case Assigned',
                message: `An emergency case has been assigned to you by the Super Admin. Please check the emergency monitoring page.`,
                type: 'emergency',
                route: '/admin/emergency-monitoring'
            });
        }

        await createAuditLog({
            action: 'EMERGENCY_ASSIGNED',
            req,
            target: 'EmergencyCase',
            targetId: emergency._id,
            details: { assignedAdmin, assignedDoctor, assignedHospital }
        });

        res.status(200).json({ success: true, data: emergency });
    } catch (error) {
        console.error('assignEmergency error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateEmergencyStatusSA = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'assigned', 'dispatched', 'resolved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const updateData = { status };
        if (status === 'dispatched') updateData.dispatchedAt = new Date();
        if (status === 'resolved') updateData.resolvedAt = new Date();

        const emergency = await EmergencyCase.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        )
            .populate('patient', 'fullName email phone')
            .populate('assignedAdmin', 'fullName email');

        if (!emergency) {
            return res.status(404).json({ success: false, message: 'Emergency case not found' });
        }

        await createAuditLog({
            action: 'EMERGENCY_STATUS_UPDATED',
            req,
            target: 'EmergencyCase',
            targetId: emergency._id,
            details: { status }
        });

        res.status(200).json({ success: true, data: emergency });
    } catch (error) {
        console.error('updateEmergencyStatusSA error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteEmergency = async (req, res) => {
    try {
        const emergency = await EmergencyCase.findById(req.params.id);

        if (!emergency) {
            return res.status(404).json({ success: false, message: 'Emergency case not found' });
        }

        await EmergencyCase.findByIdAndDelete(req.params.id);

        await createAuditLog({
            action: 'EMERGENCY_DELETED',
            req,
            target: 'EmergencyCase',
            targetId: emergency._id,
            details: {
                source: emergency.source,
                guestName: emergency.guestName,
                guestPhone: emergency.guestPhone,
                status: emergency.status
            }
        });

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        console.error('deleteEmergency error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// PLATFORM-WIDE READ ACCESS
// ==========================================

export const getAllPlatformUsers = async (req, res) => {
    try {
        const users = await User.find({ role: 'patient' })
            .select('-password')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        console.error('getAllPlatformUsers error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllDoctors = async (req, res) => {
    try {
        const doctors = await Doctor.find()
            .select('-password')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: doctors });
    } catch (error) {
        console.error('SuperAdmin getAllDoctors error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllAppointments = async (req, res) => {
    try {
        const appointments = await Appointment.find()
            .populate('patient', 'fullName email')
            .populate('doctor', 'fullName specialization')
            .sort({ updatedAt: -1 });
        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        console.error('SuperAdmin getAllAppointments error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllSupportTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.find()
            .populate('user', 'fullName email role')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: tickets });
    } catch (error) {
        console.error('SuperAdmin getAllSupportTickets error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAllAuditLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .populate('performedBy', 'fullName email')
            .sort({ createdAt: -1 })
            .limit(500);
        res.status(200).json({ success: true, data: logs });
    } catch (error) {
        console.error('SuperAdmin getAllAuditLogs error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// ANALYTICS
// ==========================================

export const getAnalytics = async (req, res) => {
    try {
        const [
            totalSOS, guestSOS, registeredSOS,
            resolvedCases, pendingCases,
            emergenciesWithTimes
        ] = await Promise.all([
            EmergencyCase.countDocuments(),
            EmergencyCase.countDocuments({ source: 'guest' }),
            EmergencyCase.countDocuments({ source: 'patient' }),
            EmergencyCase.countDocuments({ status: 'resolved' }),
            EmergencyCase.countDocuments({ status: 'pending' }),
            EmergencyCase.find({ resolvedAt: { $exists: true }, assignedAt: { $exists: true } })
                .select('assignedAt resolvedAt')
                .lean()
        ]);

        // Calculate average response time (assignment to resolution)
        let avgResponseTimeMinutes = 0;
        if (emergenciesWithTimes.length > 0) {
            const totalMs = emergenciesWithTimes.reduce((sum, e) => {
                return sum + (new Date(e.resolvedAt) - new Date(e.assignedAt));
            }, 0);
            avgResponseTimeMinutes = Math.round(totalMs / emergenciesWithTimes.length / 60000);
        }

        // Admin performance
        const adminPerformance = await EmergencyCase.aggregate([
            { $match: { assignedAdmin: { $exists: true, $ne: null } } },
            { $group: {
                _id: '$assignedAdmin',
                totalAssigned: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } }
            }},
            { $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'admin'
            }},
            { $unwind: { path: '$admin', preserveNullAndEmptyArrays: true } },
            { $project: {
                adminName: '$admin.fullName',
                adminEmail: '$admin.email',
                totalAssigned: 1,
                resolved: 1
            }}
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalSOS,
                guestSOS,
                registeredSOS,
                resolvedCases,
                pendingCases,
                avgResponseTimeMinutes,
                adminPerformance
            }
        });
    } catch (error) {
        console.error('getAnalytics error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ==========================================
// PLATFORM SETTINGS (placeholder for SaaS config)
// ==========================================

export const getPlatformSettings = async (req, res) => {
    try {
        // For now, return static settings. In production, this would come from a Settings model.
        res.status(200).json({
            success: true,
            data: {
                platformName: 'MediAI Healthcare',
                contactEmail: process.env.ADMIN_EMAIL || 'admin@mediai.health',
                emergencyDispatchEnabled: true,
                maxGuestSOSPerHour: 10,
                autoAssignEnabled: false
            }
        });
    } catch (error) {
        console.error('getPlatformSettings error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updatePlatformSettings = async (req, res) => {
    try {
        // Placeholder for future SaaS settings update
        await createAuditLog({
            action: 'PLATFORM_SETTINGS_UPDATED',
            req,
            target: 'PlatformSettings',
            details: req.body
        });

        res.status(200).json({
            success: true,
            message: 'Platform settings updated successfully',
            data: req.body
        });
    } catch (error) {
        console.error('updatePlatformSettings error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
