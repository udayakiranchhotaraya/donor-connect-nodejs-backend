const { JWT_ACCESS_SECRET, JWT_VERIFICATION_SECRET } = require('../config/config');
const jwt = require('jsonwebtoken');

function generateAccessToken(payload) {
    return jwt.sign(payload, JWT_ACCESS_SECRET)
}

function generateVerficationToken(userID, email) {
    return jwt.sign(
        {
            sub: userID,
            email: email
        },
        JWT_VERIFICATION_SECRET,
        {
            expiresIn: '1h'
        }
    );
}

function verifyToken(token, type) {
    const allowedTypes = ["access", "refresh", "verification"];
    if (!allowedTypes.includes(type)) {
        throw new Error(`Invalid token type: ${type}`);
    }

    const secret = {
        access: JWT_ACCESS_SECRET,
        // refresh: JWT_REFRESH_SECRET,
        verification: JWT_VERIFICATION_SECRET
    }[type];

    return jwt.verify(token, secret);
}

module.exports = {
    generateAccessToken,
    generateVerficationToken,
    verifyToken
}