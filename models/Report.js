import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    },
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat'
    },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    prescription: { type: String }, // text or AI generated instructions
    content: { type: String },
    assessment: { type: String },
    plan: { type: String },
    prescriptionImage: { type: String }, // cloudinary url if image uploaded
    status: {
        type: String,
        enum: ['Draft by AI', 'Under Doctor Review', 'Edited', 'Approved', 'Sent to Patient'],
        default: 'Draft by AI'
    },
    reportUploads: [{ type: String }] // multiple cloudinary urls
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);
export default Report;
