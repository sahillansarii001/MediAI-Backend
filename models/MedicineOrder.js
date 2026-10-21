import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineStock' },
    medicineName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, default: 0 }
});

const medicineOrderSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [orderItemSchema],
    deliveryAddress: {
        type: String,
        required: true
    },
    prescriptionUrl: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    totalAmount: {
        type: Number,
        default: 0 
    }
}, { timestamps: true });

const MedicineOrder = mongoose.model('MedicineOrder', medicineOrderSchema);
export default MedicineOrder;
