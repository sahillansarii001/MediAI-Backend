import dotenv from 'dotenv';
// Load env vars FIRST before any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import { errorHandler } from './middleware/error.middleware.js';
import http from 'http';
import { Server } from 'socket.io';

// Route files
import authRoutes from './routes/auth.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import adminRoutes from './routes/admin.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import reportRoutes from './routes/report.routes.js';
import medicineRoutes from './routes/medicine.routes.js';
import emergencyRoutes from './routes/emergency.routes.js';
import aiRoutes from './routes/ai.routes.js';
import chatRoutes from './routes/chat.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import supportTicketRoutes from './routes/supportTicket.routes.js';
import vitalsRoutes from './routes/vitals.routes.js';
import activityRoutes from './routes/activity.routes.js';
import medicineOrderRoutes from './routes/medicineOrder.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import superAdminRoutes from './routes/superAdmin.routes.js';
import medicineStockRoutes from './routes/medicineStock.routes.js';
import ambulanceRoutes from './routes/ambulance.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'https://medi-ai-frontend.vercel.app', process.env.FRONTEND_URL],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        credentials: true
    }
});

app.set('io', io);

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected with socketId: ${socket.id}`);

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`[Socket] Client joined room: ${room}`);
    });

    // WebRTC Signaling Events
    socket.on('callUser', async (data) => {
        console.log(`[Socket] Call initiated from ${data.from} to room ${data.roomToCall}`);
        const payload = {
            signal: data.signalData,
            from: data.from,
            name: data.name,
            isVideo: data.isVideo,
            callerModel: data.callerModel,
            callerId: data.callerId,
            chatId: data.chatId
        };
        socket.to(data.roomToCall).emit('callUser', payload);
        
        // Broadcast to personal room so user gets notification even if not on chat page
        try {
            const Chat = (await import('./models/Chat.js')).default;
            const chat = await Chat.findById(data.chatId);
            if (chat) {
                if (data.callerModel === 'User') {
                    socket.to(`doctor_${chat.doctor}`).emit('callUser', payload);
                } else if (data.callerModel === 'Doctor') {
                    socket.to(`patient_${chat.patient}`).emit('callUser', payload);
                }
            }
        } catch (err) {
            console.error("Error looking up chat for global call routing", err);
        }
    });

    socket.on('answerCall', (data) => {
        console.log(`[Socket] Call answered, sending to ${data.to} and ${data.callerSocketId || 'N/A'}`);
        socket.to(data.to).emit('callAccepted', data.signal);
        if (data.callerSocketId) {
            socket.to(data.callerSocketId).emit('callAccepted', data.signal);
        }
    });

    socket.on('rejectCall', (data) => {
        console.log(`[Socket] Call rejected, notifying ${data.to}`);
        socket.to(data.to).emit('callRejected');
    });

    socket.on('iceCandidate', (data) => {
        socket.to(data.to).emit('iceCandidate', data.candidate);
    });

    socket.on('endCall', (data) => {
        console.log(`[Socket] Call ended, notifying ${data.to}`);
        socket.to(data.to).emit('callEnded');
    });

    socket.on('typing', (data) => {
        if (data && data.chatId) {
            socket.to(`chat_${data.chatId}`).emit('typing', data);
        }
    });

    socket.on('stopTyping', (data) => {
        if (data && data.chatId) {
            socket.to(`chat_${data.chatId}`).emit('stopTyping', data);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[Socket] Disconnected socketId: ${socket.id}`);
        // Notify others in rooms that this user disconnected (optional, for handling abrupt drops)
        // A full implementation might track which room the user is in and emit 'callEnded'
    });
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parser
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    if (req.method !== 'GET') {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Enable CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', 'https://medi-ai-frontend.vercel.app', process.env.FRONTEND_URL], // Frontend URL
    credentials: true,
}));

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/patient/vitals', vitalsRoutes);
app.use('/api/patient/activity', activityRoutes);
app.use('/api/medicine-orders', medicineOrderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/medicine-stock', medicineStockRoutes);
app.use('/api/ambulances', ambulanceRoutes);
// Root route for testing deployment
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Medi AI Backend is running successfully!' });
});

// Error middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Periodic Video Call Reminder Job (Checks every 30 seconds)
setInterval(async () => {
    try {
        const Chat = (await import('./models/Chat.js')).default;
        const Notification = (await import('./models/Notification.js')).default;
        
        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

        // Find chats with scheduled video calls whose target time is coming up (within 10 mins or due now) and reminder not yet sent
        const upcomingChats = await Chat.find({
            features: 'video',
            status: { $in: ['active', 'requested', 'rescheduled'] },
            reminderSent: false,
            $or: [
                { doctorCallTime: { $lte: tenMinutesFromNow, $gte: new Date(now.getTime() - 30 * 60 * 1000) } },
                { patientScheduledTime: { $lte: tenMinutesFromNow, $gte: new Date(now.getTime() - 30 * 60 * 1000) } }
            ]
        }).populate('patient', 'fullName').populate('doctor', 'fullName');

        for (const chat of upcomingChats) {
            chat.reminderSent = true;
            await chat.save();

            const targetTime = chat.doctorCallTime || chat.patientScheduledTime;
            const timeStr = new Date(targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Notify Doctor
            await Notification.create({
                recipient: chat.doctor._id,
                recipientModel: 'Doctor',
                type: 'appointment_update',
                title: 'Video Call Reminder',
                message: `Reminder: You have a scheduled video call with ${chat.patient?.fullName || 'Patient'} around ${timeStr}.`,
                route: `/doctor/video-call?chatId=${chat._id}&isVideo=true`
            });

            // Notify Patient
            await Notification.create({
                recipient: chat.patient._id,
                recipientModel: 'User',
                type: 'appointment_update',
                title: 'Video Call Reminder',
                message: `Reminder: Your video consultation with Dr. ${chat.doctor?.fullName || 'Doctor'} is scheduled for ${timeStr}.`,
                route: `/patient/video-call?chatId=${chat._id}&isVideo=true`
            });

            // Emit live socket reminder
            io.to(`doctor_${chat.doctor._id}`).emit('videoCallReminder', {
                chatId: chat._id,
                patientName: chat.patient?.fullName,
                timeStr
            });
            io.to(`patient_${chat.patient._id}`).emit('videoCallReminder', {
                chatId: chat._id,
                doctorName: chat.doctor?.fullName,
                timeStr
            });
            console.log(`[Video Call Reminder] Sent reminder for Chat ${chat._id} scheduled at ${timeStr}`);
        }
    } catch (reminderErr) {
        // Silently capture errors so the server interval doesn't break
    }
}, 30000);

 
 
