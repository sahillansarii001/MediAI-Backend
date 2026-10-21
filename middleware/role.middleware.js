// Authorize specific roles
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            console.warn(`Authorization failed for role: ${req.user ? req.user.role : 'unknown'}. Required roles: ${roles.join(', ')}`);
            return res.status(403).json({
                success: false,
                message: `User role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route`
            });
        }
        next();
    };
};
