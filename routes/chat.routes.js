import express from 'express';
import { 
    createChat, 
    sendMessage, 
    getChat, 
    endConsultation, 
    requestConsultation, 
    respondToConsultation, 
    getPendingRequests,
    getPatientChatHistory,
    getDoctorChats,
    getPatientChats,
    cancelConsultation,
    deleteMessage,
    deleteChat,
    doctorRequestConsultation,
    patientRespondToConsultation,
    sendFollowUp
} from '../controllers/chat.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/', createChat);
router.post('/request', requestConsultation);
router.get('/doctor/pending', authorize('doctor'), getPendingRequests);
router.get('/doctor/all', authorize('doctor'), getDoctorChats);
router.get('/patient/all', getPatientChats);
router.get('/patient/history/:doctorId', getPatientChatHistory);
router.get('/:id', getChat);
router.post('/:id/messages', sendMessage);
router.put('/:id/respond', authorize('doctor'), respondToConsultation);
router.put('/:id/end', endConsultation);
router.put('/:id/cancel', cancelConsultation);
router.post('/doctor-request', authorize('doctor'), doctorRequestConsultation);
router.put('/:id/patient-respond', patientRespondToConsultation);
router.post('/:id/followup', authorize('doctor'), sendFollowUp);
router.delete('/:chatId/messages/:messageIndex', deleteMessage);
router.delete('/:id', deleteChat);

export default router;
