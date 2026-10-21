import Ambulance from '../models/Ambulance.js';

// --- Admin: Add Ambulance ---
export const addAmbulance = async (req, res) => {
    try {
        const { numberPlate, driverName, phoneNumber, drivingLicense, status, shift } = req.body;
        if (!numberPlate || !driverName || !phoneNumber || !drivingLicense) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        const ambulance = await Ambulance.create({
            numberPlate,
            driverName,
            phoneNumber,
            drivingLicense,
            status: status || 'available',
            shift: shift || 'morning',
            addedBy: req.user._id
        });

        const populated = await Ambulance.findById(ambulance._id).populate('addedBy', 'fullName email');

        // Emit real-time event to admin and super_admin rooms
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').to('super_admin').emit('ambulance_added', populated);
        }

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Number plate already exists' });
        }
        console.error('addAmbulance error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Admin: Get All Ambulances ---
export const getAmbulances = async (req, res) => {
    try {
        const ambulances = await Ambulance.find()
            .populate('addedBy', 'fullName email')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: ambulances });
    } catch (error) {
        console.error('getAmbulances error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Admin: Update Ambulance ---
export const updateAmbulance = async (req, res) => {
    try {
        const ambulance = await Ambulance.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('addedBy', 'fullName email');

        if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').to('super_admin').emit('ambulance_updated', ambulance);
        }

        res.status(200).json({ success: true, data: ambulance });
    } catch (error) {
        console.error('updateAmbulance error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Admin: Delete Ambulance ---
export const deleteAmbulance = async (req, res) => {
    try {
        const ambulance = await Ambulance.findByIdAndDelete(req.params.id);
        if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });

        // Emit real-time delete
        const io = req.app.get('io');
        if (io) {
            io.to('admin_room').to('super_admin').emit('ambulance_deleted', req.params.id);
        }

        res.status(200).json({ success: true, message: 'Ambulance deleted successfully' });
    } catch (error) {
        console.error('deleteAmbulance error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
