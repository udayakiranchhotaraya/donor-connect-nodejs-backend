const rateLimit = require('express-rate-limit')

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    limit: 10, // 10 requests per window (1 minute here)
    keyGenerator: function (req) {
        return req.headers['x-user-id']; // using x-user-id as unique identifier
    },
    handler: function (req, res, next) {
        res.status(429).json({
            'message': "Too many request, please try later"
        });
    },
});

module.exports = limiter;