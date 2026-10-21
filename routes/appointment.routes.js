import express from 'express';
import { createAppointment, getPatientAppointments, getDoctorAppointments, updateAppointment, deleteAppointment, getDoctorPatients, getDoctorPatientDetail } from '../controllers/appointment.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/role.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/', createAppointment);
router.get('/patient', authorize('patient'), getPatientAppointments);
router.get('/doctor', authorize('doctor'), getDoctorAppointments);
router.get('/doctor/patients', authorize('doctor'), getDoctorPatients);
router.get('/doctor/patient/:patientId', authorize('doctor'), getDoctorPatientDetail);
router.route('/:id')
    .put(updateAppointment)
    .delete(deleteAppointment);

export default router;
