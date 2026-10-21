import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['patient', 'admin', 'super_admin'], default: 'patient' },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },

    // Super Admin management fields (for admin accounts)
    assignedRegion: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Patient specific fields
    age: { type: Number },
    sex: { type: String, enum: ['male', 'female', 'other'] },
    bloodGroup: { type: String },
    dob: { type: String, default: '' },
    address: { type: String, default: '' },
    allergies: [{ type: String }],
    currentMedications: [{ type: String }],
    previousDiseaseHistory: [{ type: String }],
    familyDiseaseHistory: [{ type: String }],
    documents: [{
        title: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    emergencyContact: {
        name: String,
        phone: String,
        relation: String
    },
    location: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    // Consultation access flags
    consultationAccess: {
        chat: { type: Boolean, default: false },
        voice: { type: Boolean, default: false },
        video: { type: Boolean, default: false }
    },
    emergencyLocationEnabled: { type: Boolean, default: false },

    // Emergency face scan specific
    faceEmbedding: { type: String, select: false }, // Store as encrypted string vector
    emergencyEnabled: { type: Boolean, default: false },
    familyContact: {
        name: String,
        phone: String,
        relation: String
    },

    // Region assignment
    region: { type: String, default: 'Global' },

    // Wearable Sync Source
    wearableSource: { type: String, default: "" },

    // Admin specific fields
    adminAccessCode: { type: String, select: false },
    verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    hospitalName: { type: String },
    hospitalContactNumber: { type: String },
    hospitalMapLink: { type: String },
    hospitalRegistrationNumber: { type: String },
    organizationPan: { type: String },
    hospitalRegistrationCertificate: { type: String },
    legalEntityProof: { type: String },
    authorizedRepGovId: { type: String },
    authorizationProof: { type: String },
    hospitalAddressProof: { type: String },
    nabhCertificate: { type: String },
    gstCertificate: { type: String },

    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpire: { type: Date },
    mustChangePassword: { type: Boolean, default: false },
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
