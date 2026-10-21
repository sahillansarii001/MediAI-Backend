import SupportTicket from '../models/SupportTicket.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { createAuditLog } from '../utils/auditLogger.js';

// @desc    Create a new support ticket
// @route   POST /api/support-tickets
// @access  Private
export const createTicket = async (req, res) => {
    try {
        const { title, category, priority, message } = req.body;

        const ticket = await SupportTicket.create({
            title,
            category,
            priority,
            message,
            createdBy: req.user._id,
            role: req.user.role,
            roleModel: req.user.role === 'doctor' ? 'Doctor' : 'User'
        });

        res.status(201).json({
            success: true,
            data: ticket
        });

        // Notify Admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await Notification.create({
                recipient: admin._id,
                recipientModel: 'User',
                title: 'New Support Ticket',
                message: `New ticket: "${title}" from ${req.user.fullName}`,
                type: 'general',
                route: '/admin/support-tickets'
            });
        }
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get tickets for logged in user
// @route   GET /api/support-tickets/my
// @access  Private
export const getMyTickets = async (req, res) => {
    try {
        const tickets = await SupportTicket.find({ createdBy: req.user._id })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all tickets (Admin only)
// @route   GET /api/admin/support-tickets
// @access  Private/Admin
export const getAllTickets = async (req, res) => {
    try {
        const { status, priority, role } = req.query;
        let query = {};

        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (role) query.role = role;

        const tickets = await SupportTicket.find(query)
            .populate('createdBy', 'fullName email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: tickets.length,
            data: tickets
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update ticket status/reply (Admin only)
// @route   PATCH /api/admin/support-tickets/:id
// @access  Private/Admin
export const updateTicketStatus = async (req, res) => {
    try {
        const { status, adminReply } = req.body;

        let ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        ticket = await SupportTicket.findByIdAndUpdate(
            req.params.id,
            { status, adminReply },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: ticket
        });

        // Notify User
        await Notification.create({
            recipient: ticket.createdBy,
            recipientModel: ticket.roleModel,
            title: 'Support Ticket Update',
            message: `Your ticket "${ticket.title}" has been updated to ${status}.`,
            type: 'support_ticket_reply',
            route: ticket.role === 'doctor' ? '/doctor/support-tickets' : '/patient/support-tickets'
        });

        await createAuditLog({
            action: 'SUPPORT_TICKET_UPDATED',
            req,
            target: 'SupportTicket',
            targetId: ticket._id,
            details: { status, title: ticket.title }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Delete ticket (Admin only)
// @route   DELETE /api/admin/support-tickets/:id
// @access  Private/Admin
export const deleteTicketAdmin = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        await ticket.deleteOne();

        await createAuditLog({
            action: 'SUPPORT_TICKET_DELETED',
            req,
            target: 'SupportTicket',
            targetId: ticket._id,
            details: { title: ticket.title }
        });

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Delete own unresolved ticket
// @route   DELETE /api/support-tickets/:id
// @access  Private
export const deleteTicketUser = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check ownership
        if (ticket.createdBy.toString() !== req.user._id.toString()) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to delete this ticket'
            });
        }

        // Check status
        if (ticket.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a ticket that is already in progress or resolved'
            });
        }

        await ticket.deleteOne();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};
