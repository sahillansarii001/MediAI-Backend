import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: false
    },
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    },
    medicineOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MedicineOrder'
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'USD'
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'paypal', 'bank_transfer', 'insurance'],
        default: 'credit_card'
    },
    transactionType: {
        type: String,
        enum: ['consultation', 'lab_test', 'prescription', 'subscription', 'pharmacy'],
        default: 'consultation'
    },
    paymentDate: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
