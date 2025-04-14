const { User } = require("../models");
const { generateUUID } = require("../utils/uuid.utils");
const {
    generateVerficationToken,
    verifyToken,
    generateAccessToken,
} = require("../utils/tokens.util");
const {
    SUCCESS_MESSAGES,
    SALT_ROUNDS,
    ERROR_MESSAGES,
} = require("../config/config");
const {
    sendVerificationEmail,
    sendWelcomeEmail,
} = require("../config/mail/mail.config");
const bcrypt = require('bcrypt');

async function initiateRegistration(req, res) {
    try {
        const userDetails = req.body;
        const email = userDetails.email.toLowerCase();

        const user = await User.create({
            user_id: generateUUID(),
            ...userDetails,
            email,
            roles: ["donor"],
            isVerified: false,
        });

        if (user) {
            const verificationToken = generateVerficationToken(
                user.user_id,
                user.email
            );
            await sendVerificationEmail(
                user.email,
                user.firstName,
                verificationToken
            );
            return res.status(201).json({
                success: true,
                status: 201,
                message: SUCCESS_MESSAGES.USER_REGISTRATION_INITIATED,
            });
        }

        return res.status(500).json({
            success: false,
            status: 500,
            error: "User creation failed",
        });
    } catch (error) {
        console.error("Registration error:", error);
        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                status: 400,
                error: "Invalid input data: " + error.message,
            });
        }
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                status: 409,
                error:
                    "Duplicate field value: " +
                    Object.keys(error.keyValue)[0] +
                    " is already in use.",
            });
        }
        return res
            .status(500)
            .json({ success: false, status: 500, error: error.message });
    }
}

async function completeRegistration(req, res) {
    try {
        const { password } = req.body;
        const { sub: userId } = verifyToken(req.query.token, 'verification');

        const user = await User.findOneAndUpdate(
            {
                user_id: userId,
                isVerified: false,
                isDeleted: { $ne: true },
            },
            {
                $set: {
                    password: await bcrypt.hash(password, SALT_ROUNDS),
                    isVerified: true,
                    lastUpdatedAt: new Date(),
                },
            },
            { returnDocument: 'after' }
        );

        if (user) {
            await sendWelcomeEmail(user.email, user.firstName);
            return res.status(200).json({
                success: true,
                status: 200,
                tokens: {
                    accessToken: generateAccessToken({
                        sub: user.user_id,
                        user,
                    }),
                },
            });
        }
        return res.status(500).json({
            success: false,
            status: 500,
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        });
    } catch (error) {
        return res
            .status(500)
            .json({ success: false, status: 500, error: error.message });
    }
}

module.exports = { initiateRegistration, completeRegistration };
