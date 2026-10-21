// In-memory rate limiter for Guest SOS endpoint
// Prevents spam by limiting requests per phone number and per IP

const rateLimitStore = new Map();

const cleanupExpired = () => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > data.windowMs) {
            rateLimitStore.delete(key);
        }
    }
};

// Cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

const checkLimit = (key, maxRequests, windowMs) => {
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now - record.windowStart > windowMs) {
        rateLimitStore.set(key, { count: 1, windowStart: now, windowMs });
        return true;
    }

    if (record.count >= maxRequests) {
        return false;
    }

    record.count++;
    return true;
};

export const guestSosRateLimiter = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const phone = req.body?.guestPhone || 'no-phone';

    // Max 3 requests per phone number per 10 minutes
    const phoneKey = `sos_phone:${phone}`;
    if (!checkLimit(phoneKey, 3, 10 * 60 * 1000)) {
        return res.status(429).json({
            success: false,
            message: 'Too many SOS requests from this phone number. Please wait 10 minutes before trying again.'
        });
    }

    // Max 10 requests per IP per 10 minutes
    const ipKey = `sos_ip:${ip}`;
    if (!checkLimit(ipKey, 10, 10 * 60 * 1000)) {
        return res.status(429).json({
            success: false,
            message: 'Too many SOS requests from this network. Please wait before trying again.'
        });
    }

    next();
};
