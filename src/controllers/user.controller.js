const { User, Center, Contribution, Need } = require("../models");
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
    sendContributionReceipt,
} = require("../config/mail/mail.config");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

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
        const { sub: userId } = verifyToken(req.query.token, "verification");

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
            { returnDocument: "after" }
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

async function getNeeds(req, res) {
    try {
        const { longitude, latitude } = req.query;

        let queryPipeline = [
            {
                $lookup: {
                    from: "needs", // reference to the `Needs` collection
                    localField: "center_id",
                    foreignField: "donation_center",
                    as: "needs",
                },
            },
            {
                $addFields: {
                    openNeeds: {
                        $filter: {
                            input: "$needs",
                            as: "need",
                            cond: { $eq: ["$$need.status", "open"] },
                        },
                    },
                },
            },
            {
                $project: {
                    needs: 0, // optional: hide all needs except filtered ones
                },
            },
        ];

        if (longitude && latitude) {
            const coords = [parseFloat(longitude), parseFloat(latitude)];
            const radiusInKm = 20;
            const radiusInRadians = radiusInKm / 6378.1;

            queryPipeline.unshift({
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: coords,
                    },
                    distanceField: "distance",
                    maxDistance: radiusInRadians * 6378.1 * 1000, // convert back to meters
                    spherical: true,
                },
            });
        }
        queryPipeline.push({
            $sort: { createdAt: -1 }, // Sort by created_at descending if no geo coordinates
        });

        const centers = await Center.aggregate(queryPipeline);

        return res.json({ success: true, centers });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

// deprecated
// async function createContribution(req, res) {
//     const session = await mongoose.startSession();
//     session.startTransaction();
//     try {
//         const { user_id, need_id, center_id, message } = req.body;

//         if (!user_id || !need_id || !center_id) {
//             await session.abortTransaction();
//             session.endSession();
//             return res
//                 .status(400)
//                 .json({ message: "Missing required fields." });
//         }

//         const contribution = await Contribution.create(
//             [
//                 {
//                     user_id,
//                     need_id,
//                     center_id,
//                     message,
//                 },
//             ],
//             { session }
//         );

//         // You can optionally add business logic here like initial checks

//         await session.commitTransaction();
//         session.endSession();

//         res.status(201).json({
//             message: "Contribution created successfully.",
//             contribution: contribution[0],
//         });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         console.error(error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// }

async function createContribution(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { message } = req.body;
        const { need_id } = req.params;
        const user_id = req.user.sub;

        if (!need_id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: "Need ID is required." });
        }

        const need = await Need.findOne({ need_id }).session(session);
        if (!need) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "Need not found." });
        }

        if (need.status !== 'open') {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ 
                success: false,
                message: "Cannot contribute to a closed or fulfilled need."
            });
        }

        const contribution = await Contribution.create(
            {
                user_id,
                need_id: need.need_id,
                center_id: need.donation_center,
                message
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(201).json({
            success: true,
            message: "Contribution created successfully.",
            contribution
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Contribution creation error:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

async function getMyContributions(req, res) {
    try {
        const userId = req.user.sub;
        if (!userId) {
            return res.status(400).json({ success: false, message: "Missing required parameter: userId" });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 100);
        const skip = (page - 1) * limit;

        const validSortFields = ["createdAt", "quantity", "status"];
        const sortBy = validSortFields.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        const matchStage = { user_id: userId };
        if (req.query.status) {
            matchStage.status = req.query.status;
        }

        const aggregationPipeline = [
            { $match: matchStage },
            {
                $lookup: {
                    from: "centers",
                    localField: "center_id",
                    foreignField: "center_id",
                    as: "center"
                }
            },
            { $unwind: { path: "$center", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    centerName: "$center.name",
                    quantity: 1,
                    status: 1,
                    message: 1,
                    rejection_reason: 1
                }
            },
            { $sort: { [sortBy]: sortOrder } },
            { $skip: skip },
            { $limit: limit }
        ];

        const [list, totalResult] = await Promise.all([
            Contribution.aggregate(aggregationPipeline),
            Contribution.countDocuments(matchStage)
        ]);

        const totalPages = Math.ceil(totalResult / limit);

        return res.status(200).json({
            message: list.length > 0 ? "Contributions found." : "No contributions found.",
            data: list,
            pagination: {
                page,
                limit,
                total: totalResult,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                sortBy,
                sortOrder: sortOrder === 1 ? "asc" : "desc",
                appliedFilters: {
                    user_id: userId,
                    ...(req.query.status && { status: req.query.status })
                }
            }
        });
    } catch (error) {
        console.error("Error in getting contributions:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

async function cancelContribution(req, res) {
    try {
        const contributionId = req.params.contributionId;

        const contribution = await Contribution.findOne({ contribution_id: contributionId });

        if (!contribution) {
            return res.status(404).json({ success: false, message: "Contribution not found." });
        }

        if (contribution.status === "cancelled") {
            return res.status(400).json({ success: false, message: "Contribution is already cancelled." });
        }

        contribution.status = "cancelled";
        await contribution.save();

        return res.status(200).json({ success: true, message: "Contribution cancelled successfully." });
    } catch (error) {
        console.error("Error in cancelling contribution: ", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

async function updateUserProfile(req, res) {
    try {
        const userId = req.user.sub;
        const { firstName, lastName, email } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "Missing user identifier." });
        }

        const updateFields = {};
        if (firstName) updateFields.firstName = firstName.trim();
        if (lastName) updateFields.lastName = lastName.trim();
        if (email) updateFields.email = email.trim().toLowerCase();

        const updatedUser = await User.findOneAndUpdate(
            { user_id: userId },
            { $set: updateFields },
            { new: true, runValidators: true }
        ).select('-password -__v -_id');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            data: updatedUser
        });
    } catch (error) {
        console.error("Error updating user profile: ", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

async function updateUserPassword(req, res) {
    try {
        const userId = req.user.sub;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Both current and new passwords are required." });
        }

        const user = await User.findOne({ user_id: userId });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (!user.password) {
            return res.status(400).json({ success: false, message: "Password update not allowed for social login users." });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Current password is incorrect." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("Error updating user password: ", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

module.exports = {
    initiateRegistration,
    completeRegistration,
    getNeeds,
    createContribution,
    getMyContributions,
    cancelContribution,
    updateUserProfile,
    updateUserPassword
};
