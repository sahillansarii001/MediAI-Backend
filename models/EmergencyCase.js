import mongoose from 'mongoose';

const emergencyCaseSchema = new mongoose.Schema({
    // Source: patient (logged-in) or guest (no login)
    source: {
        type: String,
        enum: ['patient', 'guest'],
        default: 'patient'
    },

    // For registered patient emergencies
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // For guest (no-login) emergencies
    guestName: { type: String, default: '' },
    guestPhone: { type: String, default: '' },
    emergencyType: { 
        type: String, 
        enum: ['cardiac', 'accident', 'breathing', 'stroke', 'bleeding', 'burn', 'poisoning', 'other'],
        default: 'other'
    },
    description: { type: String, default: '' },

    // Shared fields
    symptoms: { type: String },
    riskLevel: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'High' },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },

    // Assignment workflow (Super Admin → Admin → Doctor)
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    assignedHospital: { type: String, default: '' },

    // Status lifecycle
    status: {
        type: String,
        enum: ['pending', 'assigned', 'dispatched', 'resolved'],
        default: 'pending'
    },

    isArchived: { type: Boolean, default: false },
    nearestDoctors: [{
        doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
        distance: Number
    }],

    // Timestamps for analytics
    assignedAt: { type: Date },
    dispatchedAt: { type: Date },
    resolvedAt: { type: Date }
}, { timestamps: true });

const EmergencyCase = mongoose.model('EmergencyCase', emergencyCaseSchema);
export default EmergencyCase;
