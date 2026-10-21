import AuditLog from '../models/AuditLog.js';

export const createAuditLog = async ({ action, req, target, targetId, details }) => {
    try {
        const logData = {
            action,
            performedBy: req.user?._id || req.doctor?._id,
            performedByModel: req.user ? 'User' : 'Doctor',
            role: req.user?.role || 'doctor',
            target,
            targetId,
            details,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        await AuditLog.create(logData);
    } catch (error) {
        console.error('Audit log creation failed:', error.message);
    }
};
