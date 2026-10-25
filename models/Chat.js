import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    senderModel: {
        type: String,
        required: true,
        enum: ['User', 'Doctor']
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'messages.senderModel'
    },
    content: {
        type: String,
        required: false
    },
    imageUrl: {
        type: String,
        required: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['delivered', 'seen'],
        default: 'delivered'
    }
});

const chatSchema = new mongoose.Schema({
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: false // Optional for spontaneous chats
    },
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
    messages: [messageSchema],
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid'],
        default: 'pending'
    },
    amount: {
        type: Number,
        default: 0
    },
    features: {
        type: [String],
        enum: ['chat', 'voice', 'video'],
        default: ['chat']
    },
    status: {
        type: String,
        enum: ['requested', 'accepted', 'doctor-requested', 'active', 'ended', 'rescheduled', 'declined'],
        default: 'requested'
    },
    scheduledTime: {
        type: String // For rescheduling
    },
    aiReport: {
        complaint: { type: String },
        symptoms: { type: String },
        duration: { type: String },
        severity: { type: String },
        condition: { type: String },
        nextSteps: { type: String },
        followUp: { type: String },
        doctorNote: { type: String }
    }
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
