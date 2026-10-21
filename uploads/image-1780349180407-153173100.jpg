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
    socket.on('callUser', (data) => {
        console.log(`[Socket] Call initiated from ${data.from} to room ${data.roomToCall}`);
        socket.to(data.roomToCall).emit('callUser', {
            signal: data.signalData,
            from: data.from,
            name: data.name,
            isVideo: data.isVideo,
            callerModel: data.callerModel,
            callerId: data.callerId,
            chatId: data.chatId
        });
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
