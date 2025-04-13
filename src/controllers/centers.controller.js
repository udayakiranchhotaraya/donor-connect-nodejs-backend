const {
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    OPERABLE_CENTER_LIMIT,
    TABLE_NAMES,
} = require("../config/config");
const generateUUID = require("../utils/uuid.utils");
const {
    sendCenterRegistrationInitiationEmail,
    sendCenterRegistrationAdminNotificationEmail,
} = require("../config/mail/mail.config");
const mongoose = require("mongoose");
const { Center, User, Need } = require("../models");
const {
    validateCoordinatesArray,
    validateLocation,
} = require("../validators/location.validator");
const { notifyAdmin } = require("../routes/sse-notifications.router");

async function onboardCenter(req, res) {
    const user = req.user;
    const centerData = req.body;
    const session = await mongoose.startSession();

    const rawLocation = centerData?.location;

    let formattedLocation = rawLocation;

    // If location is passed with separate longitude and latitude, convert to GeoJSON
    if (rawLocation?.longitude != null && rawLocation?.latitude != null) {
        formattedLocation = {
            type: "Point",
            coordinates: [
                parseFloat(rawLocation.longitude),
                parseFloat(rawLocation.latitude),
            ],
        };
    }

    const { isValid, errors, requiredFormat } =
        validateLocation(formattedLocation);

    if (!isValid) {
        return res.status(422).json({
            success: false,
            error: "Invalid location data.",
            details: errors,
            expectedFormat: requiredFormat,
        });
    }

    try {
        session.startTransaction();

        if (Array.isArray(centerData.verification)) {
            centerData.verification = centerData.verification.map((item) => ({
                verification_ref_id: generateUUID(),
                ...item
            }));
        }

        const centerDocument = {
            center_id: generateUUID(),
            ...centerData,
            location: formattedLocation,
            createdAt: new Date(),
            creator: {
                creator_id: user.sub,
                creator_email: user.email,
            },
            admin_id: user.sub,
        };

        const centerResult = await Center.create([centerDocument], { session });

        const userUpdate = await User.findOneAndUpdate(
            {
                user_id: user.sub,
                $expr: {
                    $and: [
                        {
                            $lt: [
                                { $ifNull: ["$centerCount", 0] },
                                OPERABLE_CENTER_LIMIT,
                            ],
                        },
                        {
                            $lt: [
                                { $size: { $ifNull: ["$centers", []] } },
                                OPERABLE_CENTER_LIMIT,
                            ],
                        },
                    ],
                },
            },
            {
                $inc: { centerCount: 1 },
                $addToSet: {
                    roles: "center-admin",
                    centers: centerDocument.center_id,
                },
                $set: { lastUpdatedAt: new Date() },
            },
            { session, new: true }
        );

        if (!userUpdate) {
            throw new Error("TOO_MANY_CENTERS");
        }

        notifyAdmin("NEW_CENTER_REGISTRATION_REQUEST_RECEIVED", {
            center_id: centerDocument.center_id,
            name: centerDocument.name,
            email: centerDocument.email,
            status: centerDocument.status,
        });

        await sendCenterRegistrationInitiationEmail({
            ...centerDocument,
            creator: {
                creator_id: user.sub,
                email: user.email,
                name: `${user.firstName} ${user.lastName}`,
            },
        });

        await sendCenterRegistrationAdminNotificationEmail({
            ...centerDocument,
            creator: {
                creator_id: user.sub,
                email: user.email,
                name: `${user.firstName} ${user.lastName}`
            }
        });
        
        await session.commitTransaction();

        return res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.CENTER_CREATED,
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Center onboarding error:", error);

        if (error.message === "TOO_MANY_CENTERS") {
            return res.status(403).json({
                success: false,
                error: ERROR_MESSAGES.OPERABLE_CENTER_LIMIT_EXCEEDED,
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                error: "Validation failed: " + error.message,
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                error: "Duplicate center ID: Center already exists",
            });
        }

        return res.status(500).json({
            success: false,
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            error: error.message,
        });
    } finally {
        session.endSession();
    }
}

async function createNeed(req, res) {
    try {
        const user = req.user;
        const centerId = req.params.center_id;
        const session = await mongoose.startSession();

        session.startTransaction();

        const center = await Center.findOne(
            { center_id: centerId },
            { session }
        );
        if (!center) {
            return res.status(404).json({
                success: false,
                message: ERROR_MESSAGES.CENTER_NOT_FOUND,
            });
        }
        const needData = req.body;
        const centerDocument = {
            donation_center: centerId,
            ...needData,
        }

        await Need.create(centerDocument, { session });
        await session.commitTransaction();

    } catch (error) {
        await session.abortTransaction();
        console.error("Need creation error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                error: "Validation failed: " + error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            error: error.message,
        });
    } finally {
        session.endSession();
    }
}


module.exports = {
    onboardCenter,
    createNeed
};
