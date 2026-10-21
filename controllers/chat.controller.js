import Chat from '../models/Chat.js';
import Appointment from '../models/Appointment.js';
import Report from '../models/Report.js';
import Doctor from '../models/Doctor.js';
import { computeDoctorStatus } from '../utils/statusHelper.js';
import aiClient from '../utils/aiClient.js';
import Notification from '../models/Notification.js';

// @desc    Create consultation chat
// @route   POST /api/chats
// @access  Private
export const createChat = async (req, res, next) => {
    try {
        const { appointmentId } = req.body;

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) return res.status(404).json({ success: false, message: 'Appointment not found' });

        // Ensure patient has paid for chat consultation
        if (!req.user.consultationAccess?.chat) {
            return res.status(403).json({ success: false, message: 'Please pay for chat consultation first' });
        }

        // Check if chat already exists
        let chat = await Chat.findOne({ appointment: appointmentId });
        if (chat) {
            return res.status(200).json({ success: true, data: chat });
        }

        chat = await Chat.create({
            appointment: appointmentId,
            patient: appointment.patient,
            doctor: appointment.doctor,
            status: 'active',
            messages: []
        });

        res.status(201).json({ success: true, data: chat });
    } catch (error) {
        next(error);
    }
};



// @desc    Send message
// @route   POST /api/chats/:id/messages
// @access  Private
export const sendMessage = async (req, res, next) => {
    try {
        const { content, imageUrl } = req.body;
        const senderModel = req.user.role === 'doctor' ? 'Doctor' : 'User';

        if (!content && !imageUrl) {
            return res.status(400).json({ success: false, message: 'Message content or image is required' });
        }

        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.status === 'ended') {
            return res.status(400).json({ success: false, message: 'Chat has ended' });
        }

        // Message guards for patients
        if (req.user.role !== 'doctor') {
            const doctorDoc = await Doctor.findById(chat.doctor);
            if (doctorDoc) {
                const computed = await computeDoctorStatus(doctorDoc);
                
                // Guard 1: Doctor is on break
                if (computed === 'break') {
                    return res.status(400).json({
                        success: false,
                        message: `Dr. ${doctorDoc.fullName} is currently on break. Message sending is temporarily paused.`
                    });
                }

                // Guard 2: Doctor is busy in another consultation
                if (chat.status !== 'active') {
                    const activeChatForDoc = await Chat.findOne({ doctor: chat.doctor, status: 'active' });
                    if (activeChatForDoc && activeChatForDoc._id.toString() !== chat._id.toString()) {
                        return res.status(400).json({
                            success: false,
                            message: `Dr. ${doctorDoc.fullName} is busy in another consultation. Message sending is temporarily paused.`
                        });
                    }
                } else {
                    // Active session - auto-heal database by ending any other active chats for this doctor
                    await Chat.updateMany(
                        {
                            doctor: chat.doctor,
                            _id: { $ne: chat._id },
                            status: 'active'
                        },
                        {
                            $set: { status: 'ended' }
                        }
                    );
                }
            }
        }

        const message = {
            senderModel,
            senderId: req.user._id,
            content: content || "",
            imageUrl
        };

        chat.messages.push(message);
        await chat.save();

        const savedMessage = chat.messages[chat.messages.length - 1];

        // Emit socket event to the chat room for instant real-time delivery
        const io = req.app.get('io');
        if (io) {
            io.to(`chat_${chat._id}`).emit('messageReceived', {
                chatId: chat._id,
                message: {
                    senderModel: savedMessage.senderModel,
                    senderId: savedMessage.senderId,
                    content: savedMessage.content,
                    imageUrl: savedMessage.imageUrl,
                    timestamp: savedMessage.timestamp,
                    _id: savedMessage._id
                }
            });
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        next(error);
    }
};

// @desc    Get chat messages
// @route   GET /api/chats/:id
// @access  Private
export const getChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id)
            .populate('patient', 'fullName')
            .populate('doctor', 'fullName specialization onlineStatus breakExpiresAt dailyBreak');

        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        const chatObj = chat.toObject();
        if (chatObj.doctor) {
            const docDoc = await Doctor.findById(chatObj.doctor._id);
            if (docDoc) {
                const computed = await computeDoctorStatus(docDoc);
                chatObj.doctor.onlineStatus = computed;
                chatObj.doctor.breakExpiresAt = docDoc.breakExpiresAt;
                chatObj.doctor.dailyBreak = docDoc.dailyBreak;
            }
        }

        res.status(200).json({ success: true, data: chatObj });
    } catch (error) {
        next(error);
    }
};

// @desc    End consultation and auto-generate draft report
// @route   PUT /api/chats/:id/end
// @access  Private (Doctor)
export const endConsultation = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        chat.status = 'ended';

        // Auto-generate summary and clinical report using AI
        let aiSummary = "Consultation completed. No significant chat history to summarize.";
        let aiPrescription = "";

        if (chat.messages.length > 0) {
            const conversationText = chat.messages.map(m => `${m.senderModel}: ${m.content}`).join('\n');

            const aiPrompt = `Analyze this medical consultation between a doctor and a patient.
            You must return strictly JSON format containing a standard consultation summary, recommended treatments/prescriptions, and a detailed AI clinical report structured exactly as:
            {
              "summary": "...",
              "prescription": "Medicines:\n1. [Medicine Name] - [Dosage] for [Duration]\n\nNearby Pharmacies to buy these medicines:\n- [Pharmacy Name 1] (at [Location/Street])\n- [Pharmacy Name 2] (at [Location/Street])",
              "aiReport": {
                "complaint": "patient's main complaint",
                "symptoms": "symptoms mentioned during chat",
                "duration": "duration of symptoms if available, else 'Not specified'",
                "severity": "severity of symptoms if available, else 'Not specified'",
                "condition": "possible condition or diagnostic suggestions",
                "nextSteps": "recommended clinical next steps",
                "followUp": "follow-up advice",
                "doctorNote": "short doctor note summary to help the doctor"
              }
            }
            
            CRITICAL REQUIREMENT for "prescription":
            You MUST explicitly structure the "prescription" string to contain:
            1. Required Medicines: List each required medicine with exact dosage and duration instructions.
            2. Nearby Medical Shops: List 2-3 specific nearby medical stores/pharmacies (with mock local pharmacy names like "MediAI Wellness Pharmacy", "Green Cross Medicals", "HealthyLife Pharmacy" and their street location) where the patient can purchase these medicines.
            
            Conversation:
            ${conversationText}`;

            try {
                const response = await aiClient.chat.completions.create({
                    model: process.env.AI_MODEL || 'grok-beta',
                    messages: [{ role: 'user', content: aiPrompt }],
                    response_format: { type: 'json_object' }
                });

                const parsed = JSON.parse(response.choices[0].message.content);
                aiSummary = parsed.summary || aiSummary;
                aiPrescription = parsed.prescription || aiPrescription;
                if (parsed.aiReport) {
                    chat.aiReport = parsed.aiReport;
                }
            } catch (err) {
                console.error("Failed to generate AI summary and clinical report:", err.message || err);
            }
        }

        await chat.save();

        // Create draft report
        const report = await Report.create({
            patient: chat.patient,
            doctor: chat.doctor,
            appointment: chat.appointment,
            chatId: chat._id,
            title: 'Consultation Report',
            summary: aiSummary,
            prescription: aiPrescription,
            content: chat.aiReport ? `Main Complaint: ${chat.aiReport.complaint}\nSymptoms: ${chat.aiReport.symptoms}\nDuration: ${chat.aiReport.duration}\nSeverity: ${chat.aiReport.severity}` : 'Consultation observations.',
            assessment: chat.aiReport ? chat.aiReport.condition : 'Consultation assessment.',
            plan: chat.aiReport ? `${chat.aiReport.nextSteps}\nFollow-up: ${chat.aiReport.followUp}` : aiPrescription,
            status: 'Draft by AI'
        });

        // Update appointment status to completed
        await Appointment.findByIdAndUpdate(chat.appointment, { status: 'completed' });

        // Notify the doctor and patient via socket that the consultation was ended
        const io = req.app.get('io');
        if (io) {
            io.to(`doctor_${chat.doctor}`).emit("consultationEnded", {
                chatId: chat._id,
                patientName: req.user?.fullName || 'Patient',
                endedBy: req.user?.role === 'doctor' ? 'doctor' : 'patient'
            });

            io.to(`chat_${chat._id}`).emit("consultationEnded", {
                chatId: chat._id,
                patientName: req.user?.fullName || 'Patient',
                endedBy: req.user?.role === 'doctor' ? 'doctor' : 'patient'
            });

            // Retrieve doctor status and broadcast status changed event to update all patient panels in real-time
            const doctorDoc = await Doctor.findById(chat.doctor);
            if (doctorDoc) {
                const computed = await computeDoctorStatus(doctorDoc);
                io.emit('doctorStatusChanged', { 
                    doctorId: chat.doctor, 
                    status: computed 
                });
            }
        }

        res.status(200).json({ success: true, data: { chat, draftReport: report } });
    } catch (error) {
        next(error);
    }
};
// @desc    Request a consultation (Patient side)
// @route   POST /api/chats/request
// @access  Private (Patient)
export const requestConsultation = async (req, res, next) => {
    try {
        const { doctorId, resume, mode, features } = req.body;
        const requestedFeatures = features || (mode ? [mode] : ['chat']);
        console.log(`[Chat Request] Patient clicked Start Chat: Patient ${req.user._id} with Doctor ${doctorId}, resume: ${resume}, features: ${requestedFeatures}`);

        // If resuming, check for an existing active chat first
        if (resume) {
            const activeChat = await Chat.findOne({
                patient: req.user._id,
                doctor: doctorId,
                status: 'active'
            });
            if (activeChat) {
                console.log(`[Chat Request] Resuming active chat for patient ${req.user._id} and doctor ${doctorId}`);
                return res.status(200).json({ success: true, data: activeChat });
            }
        }

        // Close/end any stale active or requested chat sessions between this patient-doctor pair
        console.log(`[Chat Request] Ending any stale chats between patient ${req.user._id} and doctor ${doctorId}`);
        await Chat.updateMany(
            { patient: req.user._id, doctor: doctorId, status: { $in: ['active', 'requested', 'doctor-requested', 'accepted'] } },
            { $set: { status: 'ended' } }
        );

        // Check if patient has an active appointment with this doctor (optional for spontaneous chats)
        const activeAppointment = await Appointment.findOne({
            patient: req.user._id,
            doctor: doctorId,
            status: { $in: ['pending', 'scheduled', 'confirmed'] }
        });

        // Create a fresh 'requested' pending chat request
        console.log(`[Chat Request] Creating a fresh pending requested chat session.`);
        const chatData = {
            patient: req.user._id,
            doctor: doctorId,
            status: 'requested',
            features: requestedFeatures,
            paymentStatus: 'pending',
            messages: []
        };
        
        if (activeAppointment) {
            chatData.appointment = activeAppointment._id;
        }

        const chat = await Chat.create(chatData);

        console.log(`[Chat Request] Chat request created with chatId: ${chat._id}`);

        // Immediately emit newChatRequest to the doctor room
        const populatedChat = await Chat.findById(chat._id).populate('patient', 'fullName');
        const io = req.app.get('io');
        if (io) {
            console.log(`[Chat Request] Emitting newChatRequest to doctor room: doctor_${doctorId}`);
            io.to(`doctor_${doctorId}`).emit("newChatRequest", populatedChat);
        } else {
            console.warn(`[Chat Request Warning] Socket.io server not found on app instance.`);
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        console.error(`[Chat Request Error]`, error);
        next(error);
    }
};

// @desc    Respond to consultation request (Doctor side)
// @route   PUT /api/chats/:id/respond
// @access  Private (Doctor)
export const respondToConsultation = async (req, res, next) => {
    try {
        const { status, scheduledTime } = req.body; // status: 'active' or 'rescheduled'
        console.log(`[Chat Respond] Doctor ${req.user._id} responding to Chat ${req.params.id} with status: ${status}`);
        
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.doctor.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        chat.status = status;
        if (scheduledTime) chat.scheduledTime = scheduledTime;
        await chat.save();

        // Broadcast status change to all connected clients in real-time
        const io = req.app.get('io');
        if (io) {
            io.emit('doctorStatusChanged', { 
                doctorId: chat.doctor, 
                status: status === 'active' ? 'busy' : 'available' 
            });

            io.to(`chat_${chat._id}`).emit('consultationResponded', chat);
            io.to(`patient_${chat.patient}`).emit('consultationResponded', chat);
        }

        // If the doctor accepts the chat, automatically transition any other orphaned 'requested' chats for this patient-doctor pair to 'ended'
        if (status === 'active') {
            console.log(`[Chat Respond] Chat accepted. Cleaning up other pending requested chats for patient ${chat.patient} and doctor ${chat.doctor}`);
            await Chat.updateMany(
                {
                    patient: chat.patient,
                    doctor: chat.doctor,
                    _id: { $ne: chat._id },
                    status: 'requested'
                },
                {
                    $set: { status: 'ended' }
                }
            );

            // Also auto-end any other active chats for this doctor to avoid orphaned active sessions blocking the new active session
            await Chat.updateMany(
                {
                    doctor: chat.doctor,
                    _id: { $ne: chat._id },
                    status: 'active'
                },
                {
                    $set: { status: 'ended' }
                }
            );
        }

        // If rescheduled, create a notification for the patient
        if (status === 'rescheduled') {
            console.log(`[Chat Respond] Chat was rescheduled. Creating patient notification...`);
            const Notification = (await import('../models/Notification.js')).default;
            
            await Notification.create({
                recipient: chat.patient,
                recipientModel: 'User',
                type: 'appointment_update',
                title: 'Consultation Rescheduled',
                message: `Dr. ${req.user.fullName} is busy and has rescheduled your consultation for ${scheduledTime}.`,
                route: '/patient/appointments',
                relatedId: chat.appointment || undefined
            });
            console.log(`[Chat Respond] Notification created successfully.`);
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        console.error(`[Chat Respond Error]`, error);
        next(error);
    }
};

// @desc    Get pending requests for doctor
// @route   GET /api/chats/doctor/pending
// @access  Private (Doctor)
export const getPendingRequests = async (req, res, next) => {
    try {
        // Only return requests created in the last 2 minutes to prevent stale popups
        const twoMinutesAgo = new Date(Date.now() - 120 * 1000);
        const requests = await Chat.find({ 
            doctor: req.user._id, 
            status: 'requested',
            createdAt: { $gte: twoMinutesAgo }
        }).populate('patient', 'fullName');
        
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient chat history with a specific doctor
// @route   GET /api/chats/patient/history/:doctorId
// @access  Private (Patient)
export const getPatientChatHistory = async (req, res, next) => {
    try {
        const history = await Chat.find({
            patient: req.user._id,
            doctor: req.params.doctorId,
            status: 'ended'
        }).sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all chats for a doctor (active, requested, ended, rescheduled)
// @route   GET /api/chats/doctor/all
// @access  Private (Doctor)
export const getDoctorChats = async (req, res, next) => {
    try {
        const chats = await Chat.find({ doctor: req.user._id })
            .populate('patient', 'fullName')
            .sort({ updatedAt: -1 });
        res.status(200).json({ success: true, data: chats });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all chats for a patient (active, requested, ended, rescheduled)
// @route   GET /api/chats/patient/all
// @access  Private (Patient)
export const getPatientChats = async (req, res, next) => {
    try {
        const chats = await Chat.find({ patient: req.user._id })
            .populate('doctor', 'fullName specialization onlineStatus breakExpiresAt dailyBreak')
            .sort({ updatedAt: -1 });

        const chatsWithDoctorStatus = await Promise.all(chats.map(async (c) => {
            const chatObj = c.toObject();
            if (chatObj.doctor) {
                const docDoc = await Doctor.findById(chatObj.doctor._id);
                if (docDoc) {
                    const computed = await computeDoctorStatus(docDoc);
                    chatObj.doctor.onlineStatus = computed;
                    chatObj.doctor.breakExpiresAt = docDoc.breakExpiresAt;
                    chatObj.doctor.dailyBreak = docDoc.dailyBreak;
                }
            }
            return chatObj;
        }));

        res.status(200).json({ success: true, data: chatsWithDoctorStatus });
    } catch (error) {
        next(error);
    }
};

// @desc    Cancel a consultation request (Patient side)
// @route   PUT /api/chats/:id/cancel
// @access  Private (Patient)
export const cancelConsultation = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.patient.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to cancel this request' });
        }

        if (chat.status !== 'requested') {
            return res.status(400).json({ success: false, message: 'Consultation has already been processed' });
        }

        chat.status = 'ended';
        await chat.save();

        // Emit cancel event to the doctor
        const io = req.app.get('io');
        if (io) {
            console.log(`[Chat Request] Emitting cancelChatRequest to doctor room: doctor_${chat.doctor}`);
            io.to(`doctor_${chat.doctor}`).emit("cancelChatRequest", { chatId: chat._id });
        }

        res.status(200).json({ success: true, message: 'Consultation request cancelled successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a message from a chat (Doctor or Patient)
// @route   DELETE /api/chats/:chatId/messages/:messageIndex
// @access  Private (Doctor or Patient)
export const deleteMessage = async (req, res, next) => {
    try {
        const { chatId, messageIndex } = req.params;
        const idx = parseInt(messageIndex, 10);

        const chat = await Chat.findById(chatId);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (isNaN(idx) || idx < 0 || idx >= chat.messages.length) {
            return res.status(400).json({ success: false, message: 'Invalid message index' });
        }

        // Remove the message at the given index
        chat.messages.splice(idx, 1);
        await chat.save();

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete/Archive a chat session
// @route   DELETE /api/chats/:id
// @access  Private
export const deleteChat = async (req, res, next) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found' });
        }
        
        // Ensure only the patient or doctor involved can delete it
        if (chat.patient.toString() !== req.user._id.toString() && chat.doctor.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized to delete this consultation' });
        }

        await Chat.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Consultation deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Request a consultation (Doctor side)
// @route   POST /api/chats/doctor-request
// @access  Private (Doctor)
export const doctorRequestConsultation = async (req, res, next) => {
    try {
        const { patientId } = req.body;
        console.log(`[Chat Request] Doctor ${req.user._id} initiated chat with Patient ${patientId}`);

        // Check if there is an active chat already
        const activeChat = await Chat.findOne({
            patient: patientId,
            doctor: req.user._id,
            status: 'active'
        });
        if (activeChat) {
            return res.status(200).json({ success: true, data: activeChat });
        }

        // Close any stale active chats between this patient-doctor pair
        await Chat.updateMany(
            { patient: patientId, doctor: req.user._id, status: 'active' },
            { $set: { status: 'ended' } }
        );

        // Check for an existing 'doctor-requested' chat
        const existingChat = await Chat.findOne({
            patient: patientId,
            doctor: req.user._id,
            status: 'doctor-requested'
        });
        
        let chat;
        if (existingChat) {
            chat = existingChat;
        } else {
            chat = await Chat.create({
                patient: patientId,
                doctor: req.user._id,
                status: 'doctor-requested',
                messages: []
            });
        }

        // Emit newChatRequest to the patient room
        const populatedChat = await Chat.findById(chat._id).populate('doctor', 'fullName specialization');
        const io = req.app.get('io');
        if (io) {
            console.log(`[Chat Request] Emitting doctorChatRequest to patient room: patient_${patientId}`);
            io.to(`patient_${patientId}`).emit("doctorChatRequest", populatedChat);
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        console.error(`[Chat Request Error]`, error);
        next(error);
    }
};

// @desc    Doctor sends a follow-up message to an ended chat
// @route   POST /api/chats/:id/followup
// @access  Private (Doctor)
export const sendFollowUp = async (req, res, next) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Message content is required' });
        }

        const chat = await Chat.findById(req.params.id)
            .populate('patient', 'fullName _id')
            .populate('doctor', 'fullName _id');

        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.doctor._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const message = {
            senderModel: 'Doctor',
            senderId: req.user._id,
            content: content.trim()
        };

        chat.messages.push(message);
        await chat.save();

        const savedMessage = chat.messages[chat.messages.length - 1];

        // Save notification to database so the bell icon updates
        const patientId = chat.patient._id || chat.patient;
        try {
            await Notification.create({
                recipient: patientId,
                recipientModel: 'User',
                title: `New message from Dr. ${chat.doctor?.fullName || 'Doctor'}`,
                message: savedMessage.content.length > 50 ? savedMessage.content.substring(0, 50) + '...' : savedMessage.content,
                type: 'general',
                route: `/patient/chat?chatId=${chat._id}`,
                isRead: false
            });
        } catch (notifErr) {
            console.error('[Notification] Failed to save chat notification:', notifErr);
        }

        // Emit to the patient's personal room for the notification popup + sound
        const io = req.app.get('io');
        if (io) {
            console.log(`[Follow-Up] Emitting doctorFollowUpMessage to patient_${patientId}`);
            io.to(`patient_${patientId}`).emit('doctorFollowUpMessage', {
                chatId: chat._id,
                doctorName: chat.doctor?.fullName || 'Your Doctor',
                message: {
                    senderModel: 'Doctor',
                    senderId: savedMessage.senderId,
                    content: savedMessage.content,
                    timestamp: savedMessage.timestamp,
                    _id: savedMessage._id
                }
            });
            // Also emit to the chat room in case the patient has it open
            io.to(`chat_${chat._id}`).emit('messageReceived', {
                chatId: chat._id,
                message: {
                    senderModel: 'Doctor',
                    senderId: savedMessage.senderId,
                    content: savedMessage.content,
                    timestamp: savedMessage.timestamp,
                    _id: savedMessage._id
                }
            });
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        console.error('[Follow-Up Error]', error);
        next(error);
    }
};

// @desc    Respond to doctor consultation request (Patient side)
// @route   PUT /api/chats/:id/patient-respond
// @access  Private (Patient)
export const patientRespondToConsultation = async (req, res, next) => {
    try {
        const { status } = req.body; // status: 'active' or 'declined'
        console.log(`[Chat Respond] Patient ${req.user._id} responding to Chat ${req.params.id} with status: ${status}`);
        
        const chat = await Chat.findById(req.params.id);
        if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });

        if (chat.patient.toString() !== req.user._id.toString()) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        chat.status = status;
        await chat.save();

        // If the patient accepts the chat, transition other 'requested' or 'doctor-requested' chats to ended
        if (status === 'active') {
            await Chat.updateMany(
                {
                    patient: chat.patient,
                    doctor: chat.doctor,
                    _id: { $ne: chat._id },
                    status: { $in: ['requested', 'doctor-requested'] }
                },
                {
                    $set: { status: 'ended' }
                }
            );
            await Chat.updateMany(
                {
                    doctor: chat.doctor,
                    _id: { $ne: chat._id },
                    status: 'active'
                },
                {
                    $set: { status: 'ended' }
                }
            );
        }

        // Notify the doctor about the response
        const io = req.app.get('io');
        if (io) {
            io.to(`doctor_${chat.doctor}`).emit("patientChatResponse", { chatId: chat._id, status });
        }

        res.status(200).json({ success: true, data: chat });
    } catch (error) {
        console.error(`[Chat Respond Error]`, error);
        next(error);
    }
};
