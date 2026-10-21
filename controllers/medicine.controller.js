import MedicineReminder from '../models/MedicineReminder.js';

// @desc    Add medicine reminder
// @route   POST /api/medicines
// @access  Private (Patient)
export const addReminder = async (req, res, next) => {
    try {
        const { medicineName, period, time, instructions, doctorAdvised } = req.body;
        
        const reminder = await MedicineReminder.create({
            patient: req.user._id,
            medicineName,
            period,
            time,
            instructions,
            doctorAdvised
        });
        
        res.status(201).json({ success: true, data: reminder });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient reminders
// @route   GET /api/medicines/patient
// @access  Private (Patient)
export const getPatientReminders = async (req, res, next) => {
    try {
        const reminders = await MedicineReminder.find({ patient: req.user._id })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reminders });
    } catch (error) {
        next(error);
    }
};

// @desc    Update reminder
// @route   PUT /api/medicines/:id
// @access  Private (Patient)
export const updateReminder = async (req, res, next) => {
    try {
        const reminder = await MedicineReminder.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' });
        
        res.status(200).json({ success: true, data: reminder });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete reminder
// @route   DELETE /api/medicines/:id
// @access  Private (Patient)
export const deleteReminder = async (req, res, next) => {
    try {
        const reminder = await MedicineReminder.findByIdAndDelete(req.params.id);
        if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' });
        
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// @desc    Update status (taken, skipped, snoozed)
// @route   PUT /api/medicines/:id/status
// @access  Private (Patient)
export const updateReminderStatus = async (req, res, next) => {
    try {
        const { status } = req.body; // 'taken', 'skipped', 'snoozed'
        
        const reminder = await MedicineReminder.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!reminder) return res.status(404).json({ success: false, message: 'Reminder not found' });
        
        res.status(200).json({ success: true, data: reminder });
    } catch (error) {
        next(error);
    }
};
