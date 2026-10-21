import express from 'express';
import { registerPatient, registerDoctor, registerHospital, login, getMe, forgotPassword, resetPassword, changePassword, reverifyDoctor, updateProfile, updateAvatar, verifyOtp, resendOtp, updateEmergencyProfile, refreshAccessToken } from '../controllers/auth.controller.js';
import upload from '../middleware/upload.middleware.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', upload.single('profilePhoto'), registerPatient);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// Doctor registration might include file uploads
router.post('/doctor/register', upload.fields([
    { name: 'degreeCertificate', maxCount: 1 },
    { name: 'governmentId', maxCount: 1 },
    { name: 'medicalLicenseProof', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]), registerDoctor);

router.put('/doctor/reverify', protect, upload.fields([
    { name: 'degreeCertificate', maxCount: 1 },
    { name: 'governmentId', maxCount: 1 },
    { name: 'medicalLicenseProof', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]), reverifyDoctor);

// Hospital registration
router.post('/hospital/register', upload.fields([
    { name: 'hospitalRegistrationCertificate', maxCount: 1 },
    { name: 'legalEntityProof', maxCount: 1 },
    { name: 'authorizedRepGovId', maxCount: 1 },
    { name: 'authorizationProof', maxCount: 1 },
    { name: 'hospitalAddressProof', maxCount: 1 },
    { name: 'nabhCertificate', maxCount: 1 },
    { name: 'gstCertificate', maxCount: 1 }
]), registerHospital);

router.post('/login', login);
router.post('/refresh', refreshAccessToken);
router.get('/me', protect, getMe);

// Password Management
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.put('/change-password', protect, changePassword);
router.patch('/profile', protect, updateProfile);
router.patch('/avatar', protect, upload.single('avatar'), updateAvatar);
router.patch('/emergency-profile', protect, upload.single('faceImage'), updateEmergencyProfile);

export default router;
