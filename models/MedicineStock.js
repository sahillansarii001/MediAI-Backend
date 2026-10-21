import mongoose from 'mongoose';

const medicineStockSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    genericName: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        enum: ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other'],
        default: 'tablet'
    },
    mg: {
        type: String,
        trim: true,
        default: ''
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    unit: {
        type: String,
        enum: ['strip', 'bottle', 'tube', 'vial', 'box', 'piece'],
        default: 'strip'
    },
    expiryDate: {
        type: Date,
        default: null
    },
    lowStockThreshold: {
        type: Number,
        default: 10
    },
    discount: {
        type: Number,
        default: 10,
        min: 0,
        max: 100
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

export default mongoose.model('MedicineStock', medicineStockSchema);
