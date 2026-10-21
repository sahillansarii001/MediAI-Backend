import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';

export const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.role === 'doctor') {
                req.user = await Doctor.findById(decoded.id).select('-password');
            } else {
                req.user = await User.findById(decoded.id).select('-password');
            }

            if (!req.user) {
                console.warn(`[Auth] User not found for ID: ${decoded.id}, Role: ${decoded.role}`);
                return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
            }

            // Convert to object to allow role override and prevent Mongoose "hidden" role issues
            const userObj = req.user.toObject();
            
            console.log(`[Auth Middleware] Found user: ${userObj.email}, DB Role: ${userObj.role}, Token Role: ${decoded.role}`);

            // attach role to request for role checking later
            // We trust the TOKEN role for the session, but we should verify it against DB if possible
            if (userObj.role !== decoded.role) {
                console.warn(`[Auth] Role mismatch! Token: ${decoded.role}, DB: ${userObj.role}. Using token role.`);
            }
            
            req.user = userObj;
            req.user.role = decoded.role;
            
            console.log(`[Auth] Authenticated: ${req.user.email} as ${req.user.role}`);
            
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

export const optionalProtect = async (req, res, next) => {
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.role === 'doctor') {
                req.user = await Doctor.findById(decoded.id).select('-password');
            } else {
                req.user = await User.findById(decoded.id).select('-password');
            }

            if (req.user) {
                const userObj = req.user.toObject();
                req.user = userObj;
                req.user.role = decoded.role;
            }
        } catch (error) {
            console.error('[Optional Auth] Token validation failed:', error.message);
        }
    }
    next();
};
