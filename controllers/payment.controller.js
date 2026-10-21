import Appointment from '../models/Appointment.js';
import MedicineOrder from '../models/MedicineOrder.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';

import CONSULTATION_PRICING from '../config/consultationPricing.js';

// @desc    Simulate creating a checkout session
// @route   POST /api/payment/checkout
// @access  Private (Patient)
export const createCheckoutSession = async (req, res, next) => {
    try {
        const { itemId, type, mode } = req.body; // type: 'appointment', 'medicine_order', or 'chat'
        
        let item;
        let amount = 0;
        let itemName = '';

        if (type === 'appointment') {
            item = await Appointment.findById(itemId).populate('doctor', 'fullName');
            if (!item) return res.status(404).json({ success: false, message: 'Appointment not found' });
            amount = item.amount || 500;
            itemName = `Consultation with Dr. ${item.doctor.fullName}`;
        } else if (type === 'medicine_order') {
            item = await MedicineOrder.findById(itemId);
            if (!item) return res.status(404).json({ success: false, message: 'Order not found' });
            // Calculate mock amount for medicines
            amount = item.items.reduce((sum, i) => sum + (i.quantity * 100), 0) + 50; // 100 per medicine + 50 delivery
            item.totalAmount = amount;
            await item.save();
            itemName = `Pharmacy Order #${item._id.toString().substring(0, 8).toUpperCase()}`;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        // Return a simulated checkout URL
        const checkoutUrl = `/payment/checkout?type=${type}&id=${item._id}&amount=${amount}&name=${encodeURIComponent(itemName)}`;

        // Persist amount and mode for chat payments
        if (type === 'chat') {
            await Chat.findByIdAndUpdate(itemId, { amount, mode });
        }
        
        res.status(200).json({ success: true, data: { url: checkoutUrl } });
    } catch (error) {
        next(error);
    }
};

// @desc    Simulate successful payment webhook
// @route   POST /api/payment/simulate-webhook
// @access  Private
export const simulateWebhook = async (req, res, next) => {
    try {
        const { itemId, type } = req.body;
        
        let updatedItem;
        if (type === 'appointment') {
            updatedItem = await Appointment.findByIdAndUpdate(itemId, { paymentStatus: 'paid', status: 'scheduled' }, { new: true });
        } else if (type === 'medicine_order') {
            updatedItem = await MedicineOrder.findByIdAndUpdate(itemId, { paymentStatus: 'paid' }, { new: true });
        } else if (type === 'chat') {
            // Update chat payment status and store mode & amount (amount already part of chat)
            updatedItem = await Chat.findByIdAndUpdate(itemId, { paymentStatus: 'paid' }, { new: true });
            // Create notification for patient about payment
            const chat = await Chat.findById(itemId).populate('patient', 'fullName');
            if (chat && chat.patient) {
                await Notification.create({
                    recipient: chat.patient._id,
                    recipientModel: 'User',
                    title: 'Chat Payment Received',
                    message: `Payment of ₹${chat.amount || 0} received for your ${chat.mode || 'chat'} consultation.`,
                    type: 'general',
                    route: `/patient/chat?chatId=${chat._id}`
                });
                const io = req.app.get('io');
                if (io) {
                    io.to(`patient_${chat.patient._id}`).emit('new_notification', {
                        title: 'Chat Payment Received',
                        message: `Payment of ₹${chat.amount || 0} received.`,
                        route: `/patient/chat?chatId=${chat._id}`
                    });
                }
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        const admins = await User.find({ role: 'admin' });

        if (type === 'appointment') {
            const populatedApt = await Appointment.findById(itemId);
            await Transaction.create({
                patient: populatedApt.patient,
                doctor: populatedApt.doctor,
                appointment: populatedApt._id,
                amount: populatedApt.amount || 500,
                status: 'completed',
                transactionType: 'consultation'
            });

            // Notify Admins
            for (const admin of admins) {
                await Notification.create({
                    recipient: admin._id,
                    recipientModel: 'User',
                    title: 'Appointment Payment Received',
                    message: `A payment of ₹${populatedApt.amount || 500} was received for an appointment.`,
                    type: 'general',
                    route: '/admin/transactions'
                });
            }
            
            const io = req.app.get('io');
            if (io) {
                io.to('admin_room').emit('new_appointment_payment', {
                    patientName: populatedApt.patient?.fullName || 'A Patient',
                    amount: populatedApt.amount || 500
                });
                io.to('admin_room').emit('new_transaction');
            }
        } else if (type === 'medicine_order') {
            const io = req.app.get('io');
            const populatedOrder = await MedicineOrder.findById(itemId).populate('patient', 'fullName');
            
            await Transaction.create({
                patient: populatedOrder.patient._id,
                medicineOrder: populatedOrder._id,
                amount: populatedOrder.totalAmount || 0,
                status: 'completed',
                transactionType: 'pharmacy'
            });

            // Notify Admins via DB
            for (const admin of admins) {
                await Notification.create({
                    recipient: admin._id,
                    recipientModel: 'User',
                    title: 'Pharmacy Payment Received',
                    message: `Payment of ₹${populatedOrder.totalAmount} received from ${populatedOrder.patient?.fullName || 'Patient'} for Order #${populatedOrder._id.toString().substring(0, 8).toUpperCase()}.`,
                    type: 'general',
                    route: '/admin/transactions'
                });
            }

            if (io) {
                io.to('admin_room').emit('new_medicine_order', {
                    orderId: populatedOrder._id,
                    patientName: populatedOrder.patient?.fullName || 'A Patient',
                    items: populatedOrder.items.length
                });
                io.to('admin_room').emit('new_transaction');
            }
        }

        res.status(200).json({ success: true, message: 'Payment simulated successfully', data: updatedItem });
    } catch (error) {
        next(error);
    }
};

export const payForConsultation = async (req, res, next) => {
    try {
        const { type, doctorId, chatId, features } = req.body;
        
        let amount = 0;
        let finalFeatures = [];
        let typeString = type || 'chat';

        if (features && Array.isArray(features)) {
            finalFeatures = features;
            amount = finalFeatures.length * 100;
            typeString = finalFeatures.join(' + ');
        } else {
            const validTypes = ['chat', 'voice', 'video'];
            if (!validTypes.includes(type)) {
                return res.status(400).json({ success: false, message: 'Invalid consultation type' });
            }
            amount = CONSULTATION_PRICING[type];
            finalFeatures = type === 'video' ? ['chat', 'voice', 'video'] : type === 'voice' ? ['chat', 'voice'] : ['chat'];
        }
        const Chat = (await import('../models/Chat.js')).default;
        let chat = null;
        if (chatId) {
            chat = await Chat.findById(chatId);
            if (chat) {
                chat.paymentStatus = 'paid';
                chat.status = 'active';
                chat.amount = amount;
                await chat.save();
            }
        }

        // Update user's consultationAccess flags (legacy support)
        const update = { $set: {} };
        if (finalFeatures.includes('chat')) update.$set['consultationAccess.chat'] = true;
        if (finalFeatures.includes('voice')) update.$set['consultationAccess.voice'] = true;
        if (finalFeatures.includes('video')) update.$set['consultationAccess.video'] = true;
        const updatedUser = await User.findByIdAndUpdate(req.user._id, update, { new: true });
        
        // Create Transaction for admin panel
        await Transaction.create({
            patient: req.user._id,
            doctor: doctorId || (chat ? chat.doctor : null),
            amount: amount,
            status: 'completed',
            transactionType: 'consultation'
        });

        // Notify patient
        await Notification.create({
            recipient: req.user._id,
            recipientModel: 'User',
            title: 'Consultation Payment Received',
            message: `Payment of ₹${amount} received for ${typeString} consultation.`,
            type: 'general',
            route: '/patient/dashboard',
        });
        
        // Notify Admins about the transaction
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await Notification.create({
                recipient: admin._id,
                recipientModel: 'User',
                title: 'Consultation Payment',
                message: `Payment of ₹${amount} received for a ${typeString} consultation.`,
                type: 'general',
                route: '/admin/transactions'
            });
        }

        // Emit socket event to update UI
        const io = req.app.get('io');
        if (io) {
            io.to(`patient_${req.user._id}`).emit('payment_success', { type, amount, chatId });
            io.to('admin_room').emit('new_transaction');
            if (chat) {
                io.to(`chat_${chat._id}`).emit('chat_paid', chat);
                if (chat.doctor) {
                    io.to(`doctor_${chat.doctor}`).emit('chat_paid', chat);
                }
            }
        }
        res.status(200).json({ success: true, data: { amount, type, chatId }, message: 'Payment successful' });
    } catch (error) {
        next(error);
    }
};
