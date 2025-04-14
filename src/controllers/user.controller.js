const { User, Center, Contribution } = require("../models");
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
    sendContributionReceipt
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

async function getNeedsForDonor(req, res) {
    try {
        const { longitude, latitude } = req.query;
        
        let queryPipeline = [
            {
                $lookup: {
                    from: 'needs', // reference to the `Needs` collection
                    localField: 'center_id',
                    foreignField: 'donation_center',
                    as: 'needs'
                }
            },
            {
                $addFields: {
                    openNeeds: {
                        $filter: {
                            input: '$needs',
                            as: 'need',
                            cond: { $eq: ['$$need.status', 'open'] }
                        }
                    }
                }
            },
            {
                $project: {
                    needs: 0 // optional: hide all needs except filtered ones
                }
            }
        ];

        if (longitude && latitude) {
            const coords = [parseFloat(longitude), parseFloat(latitude)];
            const radiusInKm = 20;
            const radiusInRadians = radiusInKm / 6378.1;

            queryPipeline.unshift(
                {
                    $geoNear: {
                        near: {
                            type: 'Point',
                            coordinates: coords
                        },
                        distanceField: 'distance',
                        maxDistance: radiusInRadians * 6378.1 * 1000, // convert back to meters
                        spherical: true
                    }
                }
            );
        } 
        queryPipeline.push(
            {
                $sort: { createdAt: -1 } // Sort by created_at descending if no geo coordinates
            }
        );

        const centers = await Center.aggregate(queryPipeline);

        return res.json({ centers });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function createContributionForDonor ( req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { user_id, need_id, center_id, message } = req.body;

        if (!user_id || !need_id || !center_id) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const contribution = await Contribution.create([{
            user_id,
            need_id,
            center_id,
            message
        }], { session });

        // You can optionally add business logic here like initial checks

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({
            message: 'Contribution created successfully.',
            contribution: contribution[0]
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

async function updateContributionForCenter (req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const centerId = req.params.centerId;
        const { status, quantity, items, user_id } = req.body;

        const validStatuses = ['pending', 'confirmed', 'cancelled'];
        if (status && !validStatuses.includes(status)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Invalid status value.' });
        }

        const contribution = await Contribution.findById(centerId).session(session);
        if (!contribution) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Contribution not found.' });
        }

        // Prevent invalid status change
        if (contribution.status === 'confirmed' || contribution.status === 'cancelled') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cannot update a finalized contribution.' });
        }

        // Update fields if provided
        if (status) contribution.status = status;
        if (typeof quantity === 'number') contribution.quantity = quantity;
        if (Array.isArray(items)) contribution.items = items;

        await contribution.save({ session });

        // If confirmed, add the (new) quantity to the need
        if (status === 'confirmed') {
            const need = await Need.findOne({ need_id: contribution.need_id }).session(session);
            if (!need) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ message: 'Associated need not found.' });
            }

            const quantityDiff = contribution.quantity;
            await Need.updateOne(
                { need_id: contribution.need_id },
                { $inc: { current_received: quantityDiff } },
                { session }
            );
        }

        const user = await User.findOne({ user_id: user_id });
        await sendContributionReceipt(contribution, user);

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({
            message: 'Contribution updated successfully.',
            contribution
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function getContributionListForCenter(req, res){
    try {
        const type = req.query.type;
        const centerId = req.params.centerId;

        const list = await Contribution.find({ center_id:centerId, status: type });

        if(list.length===0){
            return res.status(200).json({message: "No contributions found."});
        }
        return res.status(200).json({ message:"List Found.", data:list });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

async function getMyContributionForDonor(req, res){
    try {
        const filter = req.query.filter;
        const userId = req.query.userId;

        const list = await Contribution.find({ user_id:userId, status: filter });
        if(list.length===0){
            return res.status(200).json({message: "No contributions found."});
        }
        return res.status(200).json({ message:"List Found.", data:list });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

module.exports = { initiateRegistration, completeRegistration, getNeeds, };
