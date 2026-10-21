import mongoose from 'mongoose';

const scanAuditLogSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String,
        required: true
    },
    scannedByRole: {
        type: String,
        enum: ['guest', 'doctor', 'patient', 'admin', 'super_admin'],
        default: 'guest'
    },
    scannedById: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Could be User or Doctor, mostly for registered doctors
        default: null
    },
    confidenceScore: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['high_confidence', 'medium_confidence', 'low_confidence', 'failed'],
        required: true
    },
    matchedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    candidatesFound: {
        type: Number,
        default: 0
    },
    errorMessage: {
        type: String,
        default: ''
    }
}, { timestamps: true });

export default mongoose.model('ScanAuditLog', scanAuditLogSchema);
