const jwt = require('jsonwebtoken');

class JWTMiddleware {
    
    verifyToken(req, res, next) {
        if (req.headers.authorization === undefined) {
            return res.status(401).json({ "message": "Unauthorized - No token provided" });
        }

        const token = req.headers.authorization.split(' ')[1].trim();

        if (!token) {
            return res.status(401).json({ "message": "Unauthorized - No token provided" });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = decoded;

            req.headers['x-user-id'] = decoded.id;
            req.headers['x-role'] = decoded.role;
            
            return next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ "message": "Unauthorized - Token expired" });
            }

            return res.status(401).json({ "message": "Unauthorized - Invalid token" });
        }
    }

    generateToken(payload) {
        // Create and sign a new JWT token
        return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    }
}

const jwtMiddleware = new JWTMiddleware();
module.exports = jwtMiddleware;
