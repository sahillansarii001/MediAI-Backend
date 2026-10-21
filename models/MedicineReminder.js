import mongoose from 'mongoose';

const medicineReminderSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    medicineName: { type: String, required: true },
    time: { type: String, required: true },
    period: { type: String, required: true },
    instructions: { type: String },
    doctorAdvised: { type: Boolean, default: false },
    status: { 
        type: String, 
        enum: ['pending', 'taken', 'skipped', 'snoozed'], 
        default: 'pending' 
    }
}, { timestamps: true });

const MedicineReminder = mongoose.model('MedicineReminder', medicineReminderSchema);
export default MedicineReminder;
