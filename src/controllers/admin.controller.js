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

        const filter = {};
        
        // Status filter (verification.status)
        if (req.query.status) {
            filter['verification.status'] = req.query.status;
        }

        // Address filter (contactInfo.address)
        if (req.query.address) {
            filter['contactInfo.address'] = {
                $regex: req.query.address,
                $options: 'i'
            };
        }

        // Name search filter
        if (req.query.name) {
            filter.name = {
                $regex: req.query.name,
                $options: 'i'
            };
        }

        // Sorting configuration
        const validSortFields = ['name', 'createdAt', 'address', 'verification.status'];
        const sortBy = validSortFields.includes(req.query.sortBy) 
            ? req.query.sortBy 
            : 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        // Field projection
        const selectedFields = {
            center_id: 1,
            name: 1,
            address: 1,
            createdAt: 1,
            contactInfo: 1,
            status: '$verification.status', // Corrected nested field projection
            _id: 0
        };

        // Execute queries with filters
        const [centers, total] = await Promise.all([
            Center.find(filter)
                .select(selectedFields)
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Center.countDocuments(filter) // Important: use same filter for count
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
                hasPrevPage: page > 1,
                sortBy,
                sortOrder: sortOrder === 1 ? 'asc' : 'desc',
                appliedFilters: { // Optional: show active filters
                    ...(req.query.status && { status: req.query.status }),
                    ...(req.query.address && { address: req.query.address }),
                    ...(req.query.name && { name: req.query.name })
                }
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