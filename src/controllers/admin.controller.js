const { ERROR_MESSAGES, SUCCESS_MESSAGES } = require("../config/config");
const { User, Center } = require("../models");
const { generateAccessToken } = require("../utils/tokens.util");
const bcrypt = require('bcrypt');

async function login(req, res) {
    try {
        const { candidateEmail, candidatePassword } = req.body;
        const user = await User.findOne({
            email: new RegExp(`^${candidateEmail}$`, "i"),
            isSuperAdmin: { $eq: true },
            isDeleted: { $ne: true },
        }).lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                status: 401,
                error: ERROR_MESSAGES.INVALID_CREDENTIALS,
            });
        }

        const validPassword = await bcrypt.compare(
            candidatePassword,
            user.password
        );
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                status: 401,
                error: ERROR_MESSAGES.INVALID_CREDENTIALS,
            });
        }

        delete user.password;

        return res.status(200).json({
            success: true,
            status: 200,
            message: SUCCESS_MESSAGES.USER_SIGNED_IN,
            data: formatUserResponse(user),
            tokens: {
                accessToken: generateAccessToken({
                    sub: user.user_id,
                    ...user,
                }),
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            status: 500,
            error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    }
}

function formatUserResponse(user) {
    return {
        id: user.user_id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        verified: user.isVerified,
        roles: user.roles,
    };
}

async function listAllCenters(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 100);
        const skip = (page - 1) * limit;

        const selectedFields = {
            name: 1,
            address: 1,
            createdAt: 1,
            contactInfo: 1,
            '_id': 0 // Include _id if needed
        };

        const [centers, total] = await Promise.all([
            Center.find()
                .select(selectedFields)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Center.countDocuments()
        ]);

        const totalPages = Math.ceil(total / limit);

        res.status(200).json({
            data: centers,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1  
            }
        });
    } catch (error) {
        console.error('Error fetching centers:', error);
        res.status(500).json({ 
            message: 'Server error occurred while processing your request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

module.exports = {
    login,
    listAllCenters
};