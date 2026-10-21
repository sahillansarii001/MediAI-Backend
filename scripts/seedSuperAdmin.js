import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../config/db.js';

const seedSuperAdmin = async () => {
    try {
        await connectDB();

        const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@mediai.health';
        const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';
        const accessCode = process.env.SUPER_ADMIN_ACCESS_CODE || 'master';

        // Check if super admin already exists
        const existing = await User.findOne({ email });
        if (existing) {
            console.log(`\n✅ Super Admin already exists: ${email}`);
            console.log(`   Role: ${existing.role}`);
            console.log(`   Active: ${existing.isActive}`);
            
            // If the user exists but isn't a super_admin, update their role
            if (existing.role !== 'super_admin') {
                existing.role = 'super_admin';
                existing.adminAccessCode = accessCode;
                existing.isVerified = true;
                existing.isActive = true;
                await existing.save({ validateBeforeSave: false });
                console.log(`   ⚠️  Updated role to super_admin`);
            }
            
            process.exit(0);
        }

        const superAdmin = await User.create({
            fullName: 'Super Admin',
            email,
            password,
            role: 'super_admin',
            adminAccessCode: accessCode,
            isVerified: true,
            isActive: true,
            phone: ''
        });

        console.log(`\n🚀 Super Admin created successfully!`);
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        console.log(`   Access Code: ${accessCode}`);
        console.log(`   ID: ${superAdmin._id}`);
        console.log(`\n   Login at: http://localhost:3000/auth/login?role=super_admin\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        process.exit(1);
    }
};

seedSuperAdmin();
