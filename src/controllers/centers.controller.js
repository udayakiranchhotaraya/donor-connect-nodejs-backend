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
const { Center, User } = require("../models");
const {
    validateCoordinatesArray,
    validateLocation,
} = require("../validators/location.validator");

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

module.exports = {
    onboardCenter,
};
