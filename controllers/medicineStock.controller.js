import MedicineStock from '../models/MedicineStock.js';

// Get all medicines
export const getAllMedicines = async (req, res) => {
    try {
        const medicines = await MedicineStock.find()
            .populate('addedBy', 'fullName email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: medicines });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Add new medicine
export const addMedicine = async (req, res) => {
    try {
        const medicine = await MedicineStock.create({ ...req.body, addedBy: req.user._id });
        const populated = await MedicineStock.findById(medicine._id).populate('addedBy', 'fullName email');

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('medicine_added', populated);
            io.emit('medicineStockUpdated');
        }

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update medicine (price, quantity, details)
export const updateMedicine = async (req, res) => {
    try {
        const medicine = await MedicineStock.findByIdAndUpdate(
            req.params.id, req.body, { new: true, runValidators: true }
        ).populate('addedBy', 'fullName email');

        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('medicine_updated', medicine);
            io.emit('medicineStockUpdated');
        }

        res.status(200).json({ success: true, data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Adjust stock quantity only
export const adjustStock = async (req, res) => {
    try {
        const { adjustment, type } = req.body; // type: 'add' | 'subtract' | 'set'
        const medicine = await MedicineStock.findById(req.params.id);
        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        if (type === 'add') medicine.quantity += Number(adjustment);
        else if (type === 'subtract') medicine.quantity = Math.max(0, medicine.quantity - Number(adjustment));
        else if (type === 'set') medicine.quantity = Number(adjustment);

        await medicine.save();
        await medicine.populate('addedBy', 'fullName email');

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('medicine_updated', medicine);
            io.emit('medicineStockUpdated');
        }

        res.status(200).json({ success: true, data: medicine });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete medicine
export const deleteMedicine = async (req, res) => {
    try {
        const medicine = await MedicineStock.findByIdAndDelete(req.params.id);
        if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').emit('medicine_deleted', req.params.id);
            io.emit('medicineStockUpdated');
        }

        res.status(200).json({ success: true, message: 'Medicine deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
