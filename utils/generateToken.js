import jwt from 'jsonwebtoken';

export const generateAccessToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: '15m',
    });
};

export const generateRefreshToken = (id, role) => {
    // In production, consider using a separate JWT_REFRESH_SECRET
    return jwt.sign({ id, role, isRefreshToken: true }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// Kept for backward compatibility if missed elsewhere, but generally we should use the named exports
const generateToken = generateAccessToken;
export default generateToken;
