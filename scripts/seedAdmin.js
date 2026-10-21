import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import connectDB from '../config/db.js';

dotenv.config();

const seedAdmin = async () => {
    try {
        await connectDB();
        
        const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ACCESS_CODE } = process.env;
        
        if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_ACCESS_CODE) {
            console.error('Missing Admin env variables');
            process.exit(1);
        }

        const adminExists = await User.findOne({ email: ADMIN_EMAIL });
        
        if (adminExists) {
            console.log('Admin already exists. Updating credentials...');
            adminExists.password = ADMIN_PASSWORD;
            adminExists.adminAccessCode = ADMIN_ACCESS_CODE;
            await adminExists.save();
            console.log('Admin credentials updated successfully');
            process.exit(0);
        }
        
        await User.create({
            fullName: 'Super Admin',
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
            role: 'admin',
            adminAccessCode: ADMIN_ACCESS_CODE
        });
        
        console.log('Admin created successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
};

seedAdmin();
