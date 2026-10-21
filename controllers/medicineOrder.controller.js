import MedicineOrder from '../models/MedicineOrder.js';
import MedicineStock from '../models/MedicineStock.js';

// @desc    Create new order
// @route   POST /api/medicine-orders
// @access  Private (Patient)
export const createOrder = async (req, res, next) => {
    try {
        const { items, deliveryAddress, prescriptionUrl } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'No items in order' });
        }

        let totalAmount = 0;
        const processedItems = [];

        // Verify stock and calculate total amount
        for (const item of items) {
            if (item.medicineId) {
                const stock = await MedicineStock.findById(item.medicineId);
                if (!stock) {
                    return res.status(404).json({ success: false, message: `Medicine not found: ${item.medicineName}` });
                }
                if (stock.quantity < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.medicineName}. Only ${stock.quantity} available.` });
                }
                const discount = stock.discount || 0;
                const discountedPrice = Math.round(stock.price * (1 - discount / 100));
                
                processedItems.push({
                    medicineId: stock._id,
                    medicineName: stock.name,
                    quantity: item.quantity,
                    price: discountedPrice
                });
                totalAmount += (discountedPrice * item.quantity);
            } else {
                // Backward compatibility for items without medicineId
                processedItems.push({
                    medicineName: item.medicineName,
                    quantity: item.quantity,
                    price: 0
                });
            }
        }

        // Deduct stock
        const io = req.app.get('io');
        for (const pItem of processedItems) {
            if (pItem.medicineId) {
                const updatedStock = await MedicineStock.findByIdAndUpdate(
                    pItem.medicineId,
                    { $inc: { quantity: -pItem.quantity } },
                    { new: true }
                );
                if (io) {
                    io.to('admin_room').emit('medicine_updated', updatedStock);
                    io.emit('medicineStockUpdated');
                }
            }
        }

        const order = await MedicineOrder.create({
            patient: req.user._id,
            items: processedItems,
            deliveryAddress,
            prescriptionUrl,
            totalAmount
        });

        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// @desc    Get logged in patient orders
// @route   GET /api/medicine-orders/patient
// @access  Private (Patient)
export const getPatientOrders = async (req, res, next) => {
    try {
        const orders = await MedicineOrder.find({ patient: req.user._id })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all orders
// @route   GET /api/medicine-orders
// @access  Private (Admin)
export const getAllOrders = async (req, res, next) => {
    try {
        const orders = await MedicineOrder.find()
            .populate('patient', 'fullName email phone')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
};

// @desc    Update order status
// @route   PUT /api/medicine-orders/:id/status
// @access  Private (Admin)
export const updateOrderStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        
        const validStatuses = ['pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const order = await MedicineOrder.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        ).populate('patient', 'fullName email phone');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Emit real-time Socket event to patient
        const io = req.app.get('io');
        if (io) {
            io.to(`patient_${order.patient._id.toString()}`).emit('orderStatusUpdated', order);
            console.log(`[Socket] Emitted orderStatusUpdated to patient room: patient_${order.patient._id.toString()}`);
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete order
// @route   DELETE /api/medicine-orders/:id
// @access  Private (Patient/Admin)
export const deleteOrder = async (req, res, next) => {
    try {
        const order = await MedicineOrder.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Only Admin or the Patient who placed the order can delete it
        if (req.user.role !== 'admin' && order.patient.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this order' });
        }

        // Refund stock if applicable
        const io = req.app.get('io');
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
            for (const item of order.items) {
                if (item.medicineId) {
                    const updatedStock = await MedicineStock.findByIdAndUpdate(
                        item.medicineId,
                        { $inc: { quantity: item.quantity } },
                        { new: true }
                    );
                    if (io) {
                        io.to('admin_room').emit('medicine_updated', updatedStock);
                        io.emit('medicineStockUpdated');
                    }
                }
            }
        }

        await order.deleteOne();

        // Emit real-time Socket event to sync deletion
        if (io) {
            io.to('admin_room').emit('orderDeletedAdmin', order._id);
            io.to(`patient_${order.patient.toString()}`).emit('orderDeletedPatient', order._id);
            console.log(`[Socket] Emitted order deletion sync for order ID: ${order._id}`);
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
