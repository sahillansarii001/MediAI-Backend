import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a title']
    },
    category: {
        type: String,
        required: [true, 'Please select a category']
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
    },
    message: {
        type: String,
        required: [true, 'Please add a message']
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'resolved'],
        default: 'pending'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'roleModel'
    },
    role: {
        type: String,
        enum: ['patient', 'doctor'],
        required: true
    },
    roleModel: {
        type: String,
        required: true,
        enum: ['User', 'Doctor']
    },
    adminReply: {
        type: String
    }
}, {
    timestamps: true
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
