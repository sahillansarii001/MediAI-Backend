import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'recipientModel',
        required: true
    },
    recipientModel: {
        type: String,
        required: true,
        enum: ['User', 'Doctor']
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['appointment_update', 'appointment_cancel', 'general', 'account_approved', 'account_rejected', 'support_ticket_reply', 'emergency', 'report_ready'],
        default: 'general'
    },
    route: {
        type: String,
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
