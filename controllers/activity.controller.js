import AuditLog from '../models/AuditLog.js';
import Appointment from '../models/Appointment.js';
import MedicineReminder from '../models/MedicineReminder.js';
import HealthVitals from '../models/HealthVitals.js';
import Report from '../models/Report.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @desc   Get weekly health activity counts for a patient
 * @route  GET /api/patient/activity/weekly
 * @access Private (Patient)
 */
export const getWeeklyActivity = async (req, res, next) => {
    try {
        const patientId = req.user._id;

        // Build a date range for the last 7 days (starting from 7 days ago at midnight)
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Run all queries in parallel for performance
        const [auditLogs, appointments, reminders, vitals, reports] = await Promise.all([
            // AI symptom checks logged in AuditLog
            AuditLog.find({
                performedBy: patientId,
                action: { $in: ['symptom_check', 'ai_chat'] },
                createdAt: { $gte: sevenDaysAgo }
            }).select('createdAt'),

            // Appointments booked or completed
            Appointment.find({
                patient: patientId,
                $or: [
                    { createdAt: { $gte: sevenDaysAgo } },
                    { status: 'completed', updatedAt: { $gte: sevenDaysAgo } }
                ]
            }).select('createdAt updatedAt status'),

            // Medicine reminders marked as taken
            MedicineReminder.find({
                patient: patientId,
                status: 'taken',
                updatedAt: { $gte: sevenDaysAgo }
            }).select('updatedAt'),

            // Vitals submitted (any source)
            HealthVitals.find({
                patient: patientId,
                recordedAt: { $gte: sevenDaysAgo }
            }).select('recordedAt'),

            // Reports viewed or generated
            Report.find({
                patient: patientId,
                $or: [
                    { createdAt: { $gte: sevenDaysAgo } },
                    { updatedAt: { $gte: sevenDaysAgo } }
                ]
            }).select('createdAt')
        ]);

        // Build a map: dayIndex (0=Sun..6=Sat) => count
        const countByDay = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo);
            d.setDate(sevenDaysAgo.getDate() + i);
            countByDay[d.toDateString()] = 0;
        }

        const bumpDay = (date) => {
            const key = new Date(date).toDateString();
            if (countByDay.hasOwnProperty(key)) {
                countByDay[key]++;
            }
        };

        auditLogs.forEach(l => bumpDay(l.createdAt));
        appointments.forEach(a => {
            bumpDay(a.createdAt);
            if (a.status === 'completed') bumpDay(a.updatedAt);
        });
        reminders.forEach(r => bumpDay(r.updatedAt));
        vitals.forEach(v => bumpDay(v.recordedAt));
        reports.forEach(r => bumpDay(r.createdAt));

        // Build ordered result starting from 7 days ago → today
        const result = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo);
            d.setDate(sevenDaysAgo.getDate() + i);
            result.push({
                day: DAYS[d.getDay()],
                activity: countByDay[d.toDateString()] || 0
            });
        }

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
