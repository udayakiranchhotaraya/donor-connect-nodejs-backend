const {
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    OPERABLE_CENTER_LIMIT,
    TABLE_NAMES,
    AWS_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_S3_BUCKET_NAME,
} = require("../config/config");
const { generateUUID } = require("../utils/uuid.utils");
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
const bcrypt = require("bcrypt");
const { generateAccessToken } = require("../utils/tokens.util");

const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

// Initialize AWS S3
const s3 = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
});

// Configure Multer for S3 upload
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: AWS_S3_BUCKET_NAME,
        acl: "private",
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const filename = `${new Date()
                .toISOString()
                .split(".")[0]
                .replace(/T/, "_")
                .replace(/:/g, "-")}_${file.originalname.replace(/\s+/g, "-")}`;
            cb(null, `${req.centerId}/documents/${filename}`);
        },
    }),
    fileFilter: function (req, file, cb) {
        const allowedMimes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];

        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Invalid file type. Only PDF and Word documents are allowed"
                ),
                false
            );
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

async function onboardCenter(req, res) {
    const user = req.user;
    const centerData = req.body;
    const session = await mongoose.startSession();
    let uploadedFiles = [];

    const rawLocation = centerData?.location;
    let formattedLocation = rawLocation;

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
        const centerId = req.centerId;

        const processedDocuments = req.files.map((file) => ({
            document_ref_id: generateUUID(),
            document: {
                name: file.originalname,
                url: file.location,
                s3_key: file.key,
                bucket: file.bucket
            },
            status: "pending",
        }));

        uploadedFiles = req.files.map((file) => file.key);

        const centerDocument = {
            center_id: centerId,
            ...centerData,
            verification: {
                ...centerData.verification,
                documents: processedDocuments,
            },
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
                    centers: centerId,
                },
                $set: { lastUpdatedAt: new Date() },
            },
            { session, new: true }
        );

        if (!userUpdate) {
            throw new Error("TOO_MANY_CENTERS");
        }

        await session.commitTransaction();

        await Promise.all([
            notifyAdmin("NEW_CENTER_REGISTRATION_REQUEST_RECEIVED", {
                center_id: centerId,
                name: centerDocument.name,
                email: centerDocument.contactInfo.email,
                status: centerDocument.verification.status,
            }),
            sendCenterRegistrationInitiationEmail({
                ...centerDocument,
                creator: {
                    creator_id: user.sub,
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`,
                },
            }),
            sendCenterRegistrationAdminNotificationEmail({
                ...centerDocument,
                creator: {
                    creator_id: user.sub,
                    email: user.email,
                    name: `${user.firstName} ${user.lastName}`,
                },
            }),
        ]);

        return res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.CENTER_CREATED,
        });
    } catch (error) {
        await session.abortTransaction();

        // Cleanup all uploaded files if any error occurs
        if (uploadedFiles.length > 0) {
            try {
                const deleteParams = {
                    Bucket: AWS_S3_BUCKET_NAME,
                    Delete: {
                        Objects: uploadedFiles.map((Key) => ({ Key })),
                        Quiet: false,
                    },
                };
        
                const command = new DeleteObjectsCommand(deleteParams);
                await s3.send(command);
            } catch (cleanupError) {
                console.error("S3 cleanup failed:", cleanupError);
            }
        }

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

        if (error.message.includes("Invalid file type")) {
            return res.status(400).json({
                success: false,
                error: error.message,
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
    const session = await mongoose.startSession();

    try {
        const user = req.user;
        const centerId = req.params.centerId;

        session.startTransaction();

        const center = await Center.findOne({ center_id: centerId }).session(
            session
        );
        if (!center) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: ERROR_MESSAGES.CENTER_NOT_FOUND,
            });
        }

        const needData = req.body;
        const centerDocument = {
            donation_center: centerId,
            ...needData,
        };

        await Need.create([centerDocument], { session });
        await session.commitTransaction();

        return res
            .status(201)
            .json({ success: true, message: "Need created successfully" });
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

async function centerAdminLogin(req, res) {
    try {
        const { candidateEmail, candidatePassword } = req.body;
        const user = await User.findOne({
            email: new RegExp(`^${candidateEmail}$`, "i"),
            isDeleted: { $ne: true },
        }).lean();

        if (!user) {
            return res.status(401).json({
                success: false,
                status: 401,
                error: ERROR_MESSAGES.INVALID_CREDENTIALS,
            });
        }

        if (!user.isVerified) {
            return res.status(403).json({
                success: false,
                status: 403,
                error: ERROR_MESSAGES.USER_NOT_VERIFIED,
            });
        }

        if (!user.roles.includes("center-admin")) {
            return res.status(403).json({
                success: false,
                status: 403,
                error: ERROR_MESSAGES.USER_NOT_CENTER_ADMIN,
            });
        }

        if (!user.password) {
            const oauthMethods = user.loginMethods?.filter((m) =>
                Object.keys(OAUTH_PROVIDERS).includes(m.toUpperCase())
            );

            if (oauthMethods.length) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    error: `Account registered via ${oauthMethods.join(
                        " or "
                    )}. Use social login.`,
                });
            }
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

        const userCenters = user.centers || [];
        const centers = await Center.find(
            { center_id: { $in: userCenters } },
            {
                center_id: 1,
                name: 1,
                _id: 0,
            }
        ).lean();

        return res.status(200).json({
            success: true,
            status: 200,
            message: SUCCESS_MESSAGES.USER_SIGNED_IN,
            data: {
                user: {
                    id: user.user_id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    verified: user.isVerified,
                    roles: user.roles,
                },
                centers,
            },
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

module.exports = {
    upload,
    onboardCenter,
    centerAdminLogin,
    createNeed,
};
