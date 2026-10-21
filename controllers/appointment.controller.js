import Appointment from '../models/Appointment.js';
import sendEmail from '../utils/sendEmail.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import Doctor from '../models/Doctor.js';
import Report from '../models/Report.js';
import HealthVitals from '../models/HealthVitals.js';

// @desc    Create new appointment
// @route   POST /api/appointments
// @access  Private
export const createAppointment = async (req, res, next) => {
    try {
        const { doctor, date, time, consultationType, reason } = req.body;

        // Check doctor availability for the requested day
        const doc = await Doctor.findById(doctor);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const appointmentDate = new Date(date);
        const requestedDayName = weekdays[appointmentDate.getDay()]; // e.g. "Wednesday"

        const dayAvailability = doc.weeklyAvailability?.find(d => d.day === requestedDayName);
        
        if (dayAvailability && !dayAvailability.available) {
            // Find all days where doctor is available
            const availableDays = doc.weeklyAvailability
                .filter(d => d.available)
                .map(d => d.day);

            const standardOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            const activeDays = standardOrder.filter(d => availableDays.includes(d));

            let availabilityString = "";
            if (activeDays.length === 0) {
                availabilityString = "no days";
            } else if (activeDays.length === 1) {
                availabilityString = activeDays[0];
            } else {
                const indices = activeDays.map(d => standardOrder.indexOf(d));
                let isContinuous = true;
                for (let k = 1; k < indices.length; k++) {
                    if (indices[k] !== indices[k - 1] + 1) {
                        isContinuous = false;
                        break;
                    }
                }
                if (isContinuous && activeDays.length > 1) {
                    availabilityString = `${activeDays[0]} till ${activeDays[activeDays.length - 1]}`;
                } else {
                    availabilityString = `${activeDays.slice(0, -1).join(', ')} and ${activeDays[activeDays.length - 1]}`;
                }
            }

            return res.status(400).json({
                success: false,
                message: `doctor is not availabe at ${requestedDayName.toLowerCase()} doctor is available at ${availabilityString.toLowerCase()}`
            });
        }
        
        // Check if doctor has daily break enabled and if the requested time falls within it
        if (doc.dailyBreak && doc.dailyBreak.enabled) {
            const requestedTime = time; // format "HH:mm"
            const breakStart = doc.dailyBreak.startTime; // format "HH:mm"
            const breakEnd = doc.dailyBreak.endTime; // format "HH:mm"
            
            // Basic string comparison works for HH:mm format
            if (requestedTime >= breakStart && requestedTime < breakEnd) {
                return res.status(400).json({
                    success: false,
                    message: `Doctor is on break between ${breakStart} and ${breakEnd}. Please select another time.`
                });
            }
        }
        
        const appointment = await Appointment.create({
            patient: req.user._id,
            doctor,
            date,
            time,
            consultationType,
            reason,
            paymentStatus: 'pending'
        });
        
        res.status(201).json({ success: true, data: appointment });

        // Notify Doctor
        await Notification.create({
            recipient: doctor,
            recipientModel: 'Doctor',
            title: 'New Appointment Booking',
            message: `You have a new appointment request from ${req.user.fullName} on ${new Date(date).toLocaleDateString()}.`,
            type: 'general',
            route: '/doctor/appointments'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all unique patients for a doctor (from appointments)
// @route   GET /api/appointments/doctor/patients
// @access  Private (Doctor)
export const getDoctorPatients = async (req, res, next) => {
    try {
        const doctorId = req.user._id;

        // Get all appointments for this doctor (not cancelled)
        const appointments = await Appointment.find({ 
            doctor: doctorId 
        }).populate('patient', 'fullName email phone age sex bloodGroup allergies currentMedications previousDiseaseHistory familyDiseaseHistory address dob avatar emergencyContact createdAt').sort({ updatedAt: -1 });

        // Get unique patients
        const patientMap = new Map();
        for (const apt of appointments) {
            if (apt.patient && apt.patient._id) {
                const pid = apt.patient._id.toString();
                if (!patientMap.has(pid)) {
                    patientMap.set(pid, {
                        ...apt.patient.toObject(),
                        lastVisit: apt.date,
                        appointmentCount: 1,
                        lastReason: apt.reason,
                        lastStatus: apt.status
                    });
                } else {
                    const existing = patientMap.get(pid);
                    existing.appointmentCount += 1;
                    // Keep the most recent visit date
                    if (new Date(apt.date) > new Date(existing.lastVisit)) {
                        existing.lastVisit = apt.date;
                        existing.lastReason = apt.reason;
                        existing.lastStatus = apt.status;
                    }
                    patientMap.set(pid, existing);
                }
            }
        }

        const patients = Array.from(patientMap.values()).sort((a, b) => new Date(b.lastVisit) - new Date(a.lastVisit));

        res.status(200).json({ success: true, data: patients });
    } catch (error) {
        next(error);
    }
};

// @desc    Get a specific patient full profile + history for a doctor
// @route   GET /api/appointments/doctor/patient/:patientId
// @access  Private (Doctor)
export const getDoctorPatientDetail = async (req, res, next) => {
    try {
        const doctorId = req.user._id;
        const { patientId } = req.params;

        // Verify doctor has had appointment with this patient
        const hasAppointment = await Appointment.findOne({ doctor: doctorId, patient: patientId });
        if (!hasAppointment) {
            return res.status(403).json({ success: false, message: 'You do not have access to this patient.' });
        }

        const [patient, appointments, reports, vitals] = await Promise.all([
            User.findById(patientId).select('-password -resetPasswordToken -resetPasswordExpire -adminAccessCode'),
            Appointment.find({ doctor: doctorId, patient: patientId }).sort({ date: -1 }),
            Report.find({ doctor: doctorId, patient: patientId }).sort({ createdAt: -1 }),
            HealthVitals.find({ patient: patientId }).sort({ recordedAt: -1, createdAt: -1 }).limit(20)
        ]);

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found.' });
        }

        res.status(200).json({ 
            success: true, 
            data: { patient, appointments, reports, vitals } 
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient appointments
// @route   GET /api/appointments/patient
// @access  Private (Patient)
export const getPatientAppointments = async (req, res, next) => {
    try {
        const appointments = await Appointment.find({ patient: req.user._id })
            .populate('doctor', 'fullName specialization')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor appointments
// @route   GET /api/appointments/doctor
// @access  Private (Doctor)
export const getDoctorAppointments = async (req, res, next) => {
    try {
        const appointments = await Appointment.find({ 
            doctor: req.user._id,
            status: { $ne: 'cancelled' }
        }).populate('patient', 'fullName email age sex').sort({ updatedAt: -1 });
        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        next(error);
    }
};

// @desc    Update appointment
// @route   PUT /api/appointments/:id
// @access  Private
export const updateAppointment = async (req, res, next) => {
    try {
        let appointment = await Appointment.findById(req.params.id)
            .populate('patient', 'fullName email')
            .populate('doctor', 'fullName email');
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        
        const oldDate = appointment.date;
        const oldTime = appointment.time;
        const oldStatus = appointment.status;

        // Determine transitions based on who is updating and what they are updating
        let updatedData = { ...req.body };

        const isDateOrTimeChanged = 
            (req.body.date && new Date(req.body.date).getTime() !== new Date(oldDate).getTime()) ||
            (req.body.time && req.body.time !== oldTime);

        if (isDateOrTimeChanged) {
            if (req.user.role === 'doctor') {
                updatedData.status = 'pending_reschedule_by_doctor';
            } else if (req.user.role === 'patient') {
                updatedData.status = 'pending_reschedule_by_patient';
            }
        }

        // Apply updates
        appointment = await Appointment.findByIdAndUpdate(req.params.id, updatedData, { new: true, runValidators: true })
            .populate('patient', 'fullName email')
            .populate('doctor', 'fullName email');

        const io = req.app.get('io');

        // Notification and Socket triggering based on the new status
        if (appointment.status === 'pending_reschedule_by_doctor') {
            // Notify Patient
            await Notification.create({
                recipient: appointment.patient._id,
                recipientModel: 'User',
                title: 'Appointment Rescheduled by Doctor',
                message: `Dr. ${appointment.doctor.fullName} suggested a new timing: ${new Date(appointment.date).toLocaleDateString()} at ${appointment.time}.`,
                type: 'appointment_update',
                route: '/patient/appointments'
            });

            if (appointment.patient.email) {
                try {
                    await sendEmail({
                        email: appointment.patient.email,
                        subject: 'MediAI Appointment Rescheduled by Doctor',
                        message: `Hello ${appointment.patient.fullName},\n\nDr. ${appointment.doctor.fullName} suggested a new timing for your appointment:\nDate: ${new Date(appointment.date).toLocaleDateString()}\nTime: ${appointment.time}\n\nPlease visit your dashboard to accept the reschedule or suggest another slot.\n\nMediAI Healthcare`
                    });
                } catch (err) {
                    console.error("Failed to send reschedule email to patient:", err.message);
                }
            }

            if (io) {
                io.to(`patient_${appointment.patient._id}`).emit('appointmentRescheduled', {
                    appointmentId: appointment._id,
                    message: `Dr. ${appointment.doctor.fullName} has suggested a new time.`
                });
            }
        } else if (appointment.status === 'pending_reschedule_by_patient') {
            // Notify Doctor
            await Notification.create({
                recipient: appointment.doctor._id,
                recipientModel: 'Doctor',
                title: 'Appointment Rescheduled by Patient',
                message: `${appointment.patient.fullName} suggested a new timing: ${new Date(appointment.date).toLocaleDateString()} at ${appointment.time}.`,
                type: 'appointment_update',
                route: '/doctor/appointments'
            });

            if (appointment.doctor.email) {
                try {
                    await sendEmail({
                        email: appointment.doctor.email,
                        subject: 'MediAI Appointment Rescheduled by Patient',
                        message: `Dear Dr. ${appointment.doctor.fullName},\n\nYour patient ${appointment.patient.fullName} has suggested a new timing for their appointment:\nDate: ${new Date(appointment.date).toLocaleDateString()}\nTime: ${appointment.time}\n\nPlease visit your dashboard to accept the reschedule or suggest another slot.\n\nMediAI Healthcare`
                    });
                } catch (err) {
                    console.error("Failed to send reschedule email to doctor:", err.message);
                }
            }

            if (io) {
                io.to(`doctor_${appointment.doctor._id}`).emit('appointmentRescheduled', {
                    appointmentId: appointment._id,
                    message: `${appointment.patient.fullName} has suggested a new time.`
                });
            }
        } else if (appointment.status === 'scheduled') {
            // Notify Patient
            await Notification.create({
                recipient: appointment.patient._id,
                recipientModel: 'User',
                title: 'Appointment Schedule Approved',
                message: `Your appointment schedule with Dr. ${appointment.doctor.fullName} has been approved and is now scheduled!`,
                type: 'appointment_update',
                route: '/patient/appointments'
            });

            if (appointment.patient.email) {
                try {
                    await sendEmail({
                        email: appointment.patient.email,
                        subject: 'MediAI Appointment Schedule Approved',
                        message: `Hello ${appointment.patient.fullName},\n\nYour appointment schedule with Dr. ${appointment.doctor.fullName} on ${new Date(appointment.date).toLocaleDateString()} at ${appointment.time} has been approved and is now scheduled!\n\nMediAI Healthcare`
                    });
                } catch (err) {
                    console.error("Failed to send approval email:", err.message);
                }
            }

            if (io) {
                io.to(`patient_${appointment.patient._id}`).emit('appointmentApproved', {
                    appointmentId: appointment._id,
                    message: `Dr. ${appointment.doctor.fullName} has approved the schedule.`
                });
            }
        } else if (appointment.status === 'cancelled') {
            if (appointment.patient && appointment.patient.email) {
                const message = `Hello ${appointment.patient.fullName},\n\nYour appointment with Dr. ${appointment.doctor?.fullName || 'Doctor'} has been cancelled.\n\nMediAI Healthcare`;
                try {
                    await sendEmail({
                        email: appointment.patient.email,
                        subject: 'MediAI Appointment Cancellation',
                        message
                    });
                } catch (err) {
                    console.error("Failed to send cancellation email:", err.message);
                }
            }
            
            await Notification.create({
                recipient: appointment.patient._id,
                recipientModel: 'User',
                title: 'Appointment Cancelled',
                message: `Your appointment with Dr. ${appointment.doctor?.fullName || 'Doctor'} has been cancelled.`,
                type: 'appointment_cancel',
                route: '/patient/appointments'
            });

            if (io) {
                io.to(`patient_${appointment.patient._id}`).emit("appointmentCancelled", {
                    appointmentId: appointment._id,
                    message: `Your appointment has been cancelled.`
                });
            }
        }

        res.status(200).json({ success: true, data: appointment });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete/Cancel appointment
// @route   DELETE /api/appointments/:id
// @access  Private
export const deleteAppointment = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.id).populate('patient', 'fullName email');
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });
        
        // Notify patient before deleting
        if (appointment.patient && appointment.patient.email && (req.user.role === 'doctor' || req.user.role === 'admin')) {
            const message = `Hello ${appointment.patient.fullName},\n\nYour appointment on ${new Date(appointment.date).toLocaleDateString()} at ${appointment.time} has been cancelled by the doctor/admin.\n\nMediAI Healthcare`;
            
            try {
                await sendEmail({
                    email: appointment.patient.email,
                    subject: 'MediAI Appointment Cancellation',
                    message
                });
            } catch (err) {
                console.error("Failed to send cancellation email:", err.message);
            }

            try {
                await Notification.create({
                    recipient: appointment.patient._id,
                    recipientModel: 'User',
                    title: 'Appointment Cancelled',
                    message: `Your appointment on ${new Date(appointment.date).toLocaleDateString()} has been cancelled.`,
                    type: 'appointment_cancel',
                    route: '/patient/appointments'
                });
            } catch (err) {
                console.error("Failed to create cancellation notification:", err.message);
            }
        }

        await appointment.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
