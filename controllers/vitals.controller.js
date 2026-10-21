import HealthVitals from '../models/HealthVitals.js';

// @desc    Add new vitals record
// @route   POST /api/patient/vitals
// @access  Private (Patient)
export const addVitals = async (req, res, next) => {
    try {
        const { heartRate, systolicBP, diastolicBP, temperature, oxygenLevel, weight, bloodSugar, source, recordedAt } = req.body;
        
        const patientId = req.user._id;

        const vitals = await HealthVitals.create({
            patient: patientId,
            heartRate,
            systolicBP,
            diastolicBP,
            temperature,
            oxygenLevel,
            weight,
            bloodSugar,
            source: source || 'manual',
            recordedAt: recordedAt || new Date()
        });

        res.status(201).json({
            success: true,
            message: 'Vitals recorded successfully',
            data: vitals
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get latest vitals record
// @route   GET /api/patient/vitals/latest
// @access  Private (Patient / Doctor)
export const getLatestVitals = async (req, res, next) => {
    try {
        // Patients get their own, doctors can specify patientId
        let patientId = req.user._id;
        if ((req.user.role === 'doctor' || req.user.role === 'admin') && req.query.patientId) {
            patientId = req.query.patientId;
        }

        const vitals = await HealthVitals.findOne({ patient: patientId })
            .sort({ recordedAt: -1, createdAt: -1 });

        if (!vitals) {
            return res.status(200).json({
                success: true,
                message: 'No vitals recorded yet',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            data: vitals
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get vitals history
// @route   GET /api/patient/vitals/history
// @access  Private (Patient / Doctor)
export const getVitalsHistory = async (req, res, next) => {
    try {
        // Patients get their own, doctors can specify patientId
        let patientId = req.user._id;
        if ((req.user.role === 'doctor' || req.user.role === 'admin') && req.query.patientId) {
            patientId = req.query.patientId;
        }

        const history = await HealthVitals.find({ patient: patientId })
            .sort({ recordedAt: -1, createdAt: -1 });

        res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        next(error);
    }
};
