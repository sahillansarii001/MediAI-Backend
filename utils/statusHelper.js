import Chat from '../models/Chat.js';

/**
 * Dynamically computes a doctor's status based on active chat sessions,
 * temporary break timers, and standard daily break schedules.
 * @param {Object} doctor - Mongoose doctor document
 * @returns {String} - 'available' | 'busy' | 'break'
 */
export const computeDoctorStatus = async (doctor) => {
    if (!doctor) return 'available';

    // 1. Check if the doctor has an active chat session
    const activeChat = await Chat.findOne({ doctor: doctor._id, status: 'active' });
    if (activeChat) {
        return 'busy';
    }

    // 2. Manual Temporary Break Expiration Check (Timer-based)
    if (doctor.onlineStatus === 'break' && doctor.breakExpiresAt) {
        if (new Date() > new Date(doctor.breakExpiresAt)) {
            doctor.onlineStatus = 'available';
            doctor.breakExpiresAt = undefined;
            await doctor.save({ validateBeforeSave: false });
        } else {
            return 'break';
        }
    }

    // 2. Automated Daily Scheduled Break Check
    if (doctor.dailyBreak && doctor.dailyBreak.enabled) {
        const now = new Date();
        const currentHourMin = now.toTimeString().slice(0, 5); // "HH:MM" format
        const start = doctor.dailyBreak.startTime; // e.g. "13:00"
        const end = doctor.dailyBreak.endTime;     // e.g. "14:00"
        
        if (start && end) {
            if (start <= end) {
                // Break is within the same calendar day (e.g., 13:00 to 14:00)
                if (currentHourMin >= start && currentHourMin <= end) {
                    return 'break';
                }
            } else {
                // Break spans midnight (e.g., 23:00 to 01:00)
                if (currentHourMin >= start || currentHourMin <= end) {
                    return 'break';
                }
            }
        }
    }

    // 3. Manual Indefinite Break Check
    if (doctor.onlineStatus === 'break') {
        return 'break';
    }

    return doctor.onlineStatus || 'available';
};
