import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const doctorSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'doctor' },
    specialization: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    yearsOfExperience: { type: Number, required: true },
    hospitalName: { type: String, required: true },
    clinicAddress: { type: String, required: true },
    phone: { type: String },
    weeklyAvailability: {
        type: [
            {
                day: { type: String },
                available: { type: Boolean, default: true },
                startTime: { type: String, default: '09:00' },
                endTime: { type: String, default: '17:00' },
                type: { type: String, default: 'Both' }
            }
        ],
        default: [
            { day: 'Monday', available: true, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Tuesday', available: true, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Wednesday', available: true, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Thursday', available: true, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Friday', available: true, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Saturday', available: false, startTime: '09:00', endTime: '17:00', type: 'Both' },
            { day: 'Sunday', available: false, startTime: '09:00', endTime: '17:00', type: 'Both' }
        ]
    },

    location: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    region: { type: String, default: 'Global' },
    verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectionReason: { type: String },
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },

    // Files (Cloudinary URLs)
    degreeCertificate: { type: String },
    governmentId: { type: String },
    medicalLicenseProof: { type: String },
    avatar: { type: String },
    
    onlineStatus: {
        type: String,
        enum: ['available', 'busy', 'break'],
        default: 'available'
    },
    breakExpiresAt: {
        type: Date
    },
    dailyBreak: {
        enabled: { type: Boolean, default: false },
        startTime: { type: String, default: '13:00' },
        endTime: { type: String, default: '14:00' }
    },
    
    // Security
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpire: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, { timestamps: true });

// Hash password before saving
doctorSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare entered password with hashed password
doctorSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const Doctor = mongoose.model('Doctor', doctorSchema);
export default Doctor;
