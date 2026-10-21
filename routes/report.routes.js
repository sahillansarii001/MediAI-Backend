import express from 'express';
import upload from '../middleware/upload.middleware.js';
import { createDraftReport, getPatientReports, getDoctorReports, editReport, updateReportStatus, deleteReport, getReportByChatId, uploadFile } from '../controllers/report.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/patient', authorize('patient'), getPatientReports);
router.get('/doctor', authorize('doctor'), getDoctorReports);

router.post('/draft', authorize('doctor'), createDraftReport);

router.get('/chat/:chatId', getReportByChatId);

router.route('/:id')
    .put(authorize('doctor'), editReport)
    .delete(deleteReport);

router.put('/:id/status', authorize('doctor'), updateReportStatus);

export default router;
