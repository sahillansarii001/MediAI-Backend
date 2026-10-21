import mongoose from 'mongoose';

const ambulanceSchema = new mongoose.Schema({
    numberPlate: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    driverName: {
        type: String,
        required: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    drivingLicense: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['available', 'on_duty', 'maintenance'],
        default: 'available'
    },
    shift: {
        type: String,
        enum: ['morning', 'night', 'both'],
        default: 'morning'
    },
    region: {
        type: String,
        default: 'Global'
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

export default mongoose.model('Ambulance', ambulanceSchema);
