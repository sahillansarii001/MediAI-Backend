import Doctor from '../models/Doctor.js';
import Chat from '../models/Chat.js';
import { computeDoctorStatus } from '../utils/statusHelper.js';

const normalizeSpecialization = (spec) => {
    if (!spec) return '';
    let normalized = spec.toLowerCase().trim();
    
    const mapping = {
        'cardiologist': 'cardiology',
        'cardiology': 'cardiology',
        'dermatologist': 'dermatology',
        'dermatology': 'dermatology',
        'pulmonologist': 'pulmonology',
        'pulmonology': 'pulmonology',
        'general physician': 'general',
        'general doctor': 'general',
        'neurologist': 'neurology',
        'neurology': 'neurology',
        'orthopedic': 'orthopedics',
        'orthopedist': 'orthopedics',
        'gastroenterologist': 'gastroenterology',
        'gastroenterology': 'gastroenterology',
        'pediatrician': 'pediatrics',
        'psychiatrist': 'psychiatry',
        'ophthalmologist': 'ophthalmology',
        'gynecologist': 'gynecology',
        'urologist': 'urology'
    };

    return mapping[normalized] || normalized;
};

// @desc    Get all approved doctors
// @route   GET /api/doctors
// @access  Public
export const getApprovedDoctors = async (req, res, next) => {
    try {
        let query = { verificationStatus: 'approved', accountStatus: 'active' };
        
        if (req.query.specialization && req.query.specialization !== 'All') {
            const normalizedSpec = normalizeSpecialization(req.query.specialization);
            query.specialization = { $regex: new RegExp(normalizedSpec, 'i') };
        }

        const doctors = await Doctor.find(query).select('-password');
        
        // Dynamically compute 'busy' status and check break expiration
        const doctorsWithStatus = await Promise.all(doctors.map(async (doc) => {
            const computed = await computeDoctorStatus(doc);
            const docObj = doc.toObject();
            docObj.onlineStatus = computed;
            return docObj;
        }));

        res.status(200).json({ success: true, data: doctorsWithStatus });
    } catch (error) {
        console.error('getApprovedDoctors error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single doctor
// @route   GET /api/doctors/:id
// @access  Public
export const getDoctor = async (req, res, next) => {
    try {
        const doctor = await Doctor.findById(req.params.id).select('-password');
        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }
        
        const computed = await computeDoctorStatus(doctor);
        const docObj = doctor.toObject();
        docObj.onlineStatus = computed;

        res.status(200).json({ success: true, data: docObj });
    } catch (error) {
        console.error('getDoctor error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
