import Report from '../models/Report.js';
import cloudinary from '../config/cloudinary.js';
import upload from '../middleware/upload.middleware.js';
import Notification from '../models/Notification.js';
import { createAuditLog } from '../utils/auditLogger.js';

// @desc    Create a draft report (usually called by AI service at end of chat)
// @route   POST /api/reports/draft
// @access  Private (Doctor)
export const createDraftReport = async (req, res, next) => {
    try {
        const { patient, appointment, title, summary, prescription } = req.body;
        
        const report = await Report.create({
            patient,
            doctor: req.user._id,
            appointment,
            title,
            summary,
            prescription,
            status: 'Draft by AI'
        });
        
        res.status(201).json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient reports (only approved ones)
// @route   GET /api/reports/patient
// @access  Private (Patient)
export const getPatientReports = async (req, res, next) => {
    try {
        // Patient only sees reports that are "Sent to Patient" or "Approved"
        const reports = await Report.find({ 
            patient: req.user._id, 
            status: { $in: ['Approved', 'Sent to Patient'] } 
        }).populate('doctor', 'fullName specialization').sort({ createdAt: -1 });
        
        await createAuditLog({
            action: 'view_reports',
            req,
            target: 'Reports List',
            details: { count: reports.length }
        });

        res.status(200).json({ success: true, data: reports });
    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor reports
// @route   GET /api/reports/doctor
// @access  Private (Doctor)
export const getDoctorReports = async (req, res, next) => {
    try {
        const reports = await Report.find({ doctor: req.user._id })
            .populate('patient', 'fullName')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reports });
    } catch (error) {
        next(error);
    }
};

// @desc    Edit report
// @route   PUT /api/reports/:id
// @access  Private (Doctor)
export const editReport = async (req, res, next) => {
    try {
        let report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
        
        if (report.doctor.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this report' });
        }
        
        report = await Report.findByIdAndUpdate(
            req.params.id, 
            { ...req.body, status: 'Edited' }, 
            { new: true, runValidators: true }
        );
        
        res.status(200).json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
};

// @desc    Approve / Send report to patient
// @route   PUT /api/reports/:id/status
// @access  Private (Doctor)
export const updateReportStatus = async (req, res, next) => {
    try {
        const { status } = req.body; // 'Approved' or 'Sent to Patient'
        
        const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
        
        res.status(200).json({ success: true, data: report });

        if (status === 'Approved' || status === 'Sent to Patient') {
            await Notification.create({
                recipient: report.patient,
                recipientModel: 'User',
                title: 'Medical Report Ready',
                message: `Your medical report "${report.title}" is now available.`,
                type: 'report_ready',
                route: '/patient/reports'
            });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private (Doctor or Admin)
export const deleteReport = async (req, res, next) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
        
        await report.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// @desc    Get report by chat ID
// @route   GET /api/reports/chat/:chatId
// @access  Private (Doctor or Patient)
export const getReportByChatId = async (req, res, next) => {
    try {
        const report = await Report.findOne({ chatId: req.params.chatId });
        if (!report) return res.status(404).json({ success: false, message: 'Report not found for this chat' });
        
        // Ensure user is authorized to view this report
        if (req.user.role === 'patient' && report.patient.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this report' });
        }
        if (req.user.role === 'doctor' && report.doctor.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this report' });
        }

        res.status(200).json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
};

// @desc    Upload media file to a report (store in Cloudinary)
// @route   POST /api/reports/:id/upload
// @access  Private (Doctor)
export const uploadFile = async (req, res, next) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
        if (report.doctor.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to upload to this report' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const result = await cloudinary.uploader.upload(req.file.path, { folder: 'reports' });
        report.reportUploads.push(result.secure_url);
        await report.save();
        res.status(200).json({ success: true, url: result.secure_url });
    } catch (error) {
        next(error);
    }
};
