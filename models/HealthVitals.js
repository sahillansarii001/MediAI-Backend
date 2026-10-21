import mongoose from 'mongoose';

const healthVitalsSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    heartRate: {
        type: Number
    },
    systolicBP: {
        type: Number
    },
    diastolicBP: {
        type: Number
    },
    temperature: {
        type: Number
    },
    oxygenLevel: {
        type: Number
    },
    weight: {
        type: Number
    },
    bloodSugar: {
        type: Number
    },
    source: {
        type: String,
        enum: ['manual', 'smartwatch', 'doctor'],
        default: 'manual'
    },
    recordedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const HealthVitals = mongoose.model('HealthVitals', healthVitalsSchema);
export default HealthVitals;
