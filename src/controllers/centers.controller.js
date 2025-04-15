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
    sendContributionReceipt,
} = require("../config/mail/mail.config");
const mongoose = require("mongoose");
const { Center, User, Need, Contribution } = require("../models");
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
            message: SUCCESS_MESSAGES.CENTER_REGISTRATION_INITIATED,
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

async function getMyCreatedNeeds(req, res) {
    try {
        const centerId = req.params.centerId;
        // Set up pagination parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 100);
        const skip = (page - 1) * limit;

        // Build up filter criteria. The donation_center filter is mandatory.
        const filter = { donation_center: centerId };

        // Optional status filter
        if (req.query.status) {
            filter.status = req.query.status;
        }
        
        // Optional item filter (with partial, case-insensitive matching)
        if (req.query.item) {
            filter.item = {
                $regex: req.query.item,
                $options: "i"
            };
        }
        
        // Optional urgency filter
        if (req.query.urgency) {
            filter.urgency = req.query.urgency;
        }
        
        // Optional description filter (e.g., to search by keywords in the description)
        if (req.query.description) {
            filter.description = {
                $regex: req.query.description,
                $options: "i"
            };
        }

        // Sorting configuration. Only allow valid fields.
        const validSortFields = ["item", "createdAt", "urgency", "status"];
        const sortBy = validSortFields.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        // Execute the paginated query and count in parallel.
        const [needs, total] = await Promise.all([
            Need.find(filter)
                .select('-_id')
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Need.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            message: needs.length > 0 ? "Needs found." : "No needs created.",
            data: needs,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                sortBy,
                sortOrder: sortOrder === 1 ? "asc" : "desc",
                appliedFilters: {
                    donation_center: centerId,
                    ...(req.query.status && { status: req.query.status }),
                    ...(req.query.item && { item: req.query.item }),
                    ...(req.query.urgency && { urgency: req.query.urgency }),
                    ...(req.query.description && { description: req.query.description })
                }
            }
        });
    } catch (error) {
        console.error("Error fetching needs:", error);
        return res.status(500).json({
            success: false,
            message: "Server error occurred while processing your request",
            error: error.message
        });
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

// deprecated
async function updateContribution(req, res) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Use contributionId from the route parameters for clarity
        const contributionId = req.params.contributionId;
        const { status, quantity, items, user_id } = req.body;
        const validStatuses = ['pending', 'confirmed', 'cancelled'];

        // Normalize and validate the status if provided
        const normalizedStatus = status ? status.toLowerCase() : undefined;
        if (normalizedStatus && !validStatuses.includes(normalizedStatus)) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid status value.' });
        }

        // Retrieve contribution within the session
        const contribution = await Contribution.findById(contributionId).session(session);
        if (!contribution) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Contribution not found.' });
        }

        // Prevent updating if the contribution is already finalized
        if (contribution.status === 'confirmed' || contribution.status === 'cancelled') {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Cannot update a finalized contribution.' });
        }

        // Save the original quantity to compute any difference later
        const originalQuantity = contribution.quantity;

        // Update the status if provided
        if (normalizedStatus) contribution.status = normalizedStatus;

        // Parse and update quantity if provided; ensure it is a valid number
        if (quantity !== undefined) {
            const parsedQuantity = Number(quantity);
            if (isNaN(parsedQuantity)) {
                await session.abortTransaction();
                return res.status(400).json({ message: 'Invalid quantity value. Must be a number.' });
            }
            contribution.quantity = parsedQuantity;
        }

        // Update items if provided
        if (Array.isArray(items)) {
            contribution.items = items;
        }

        // Save the updated contribution
        await contribution.save({ session });

        // If the contribution has just been confirmed, update the associated need
        if (normalizedStatus === 'confirmed') {
            const need = await Need.findOne({ need_id: contribution.need_id }).session(session);
            if (!need) {
                await session.abortTransaction();
                return res.status(404).json({ message: 'Associated need not found.' });
            }
            const quantityDiff = contribution.quantity - originalQuantity;
            await Need.updateOne(
                { need_id: contribution.need_id },
                { $inc: { current_received: quantityDiff } },
                { session }
            );
        }

        // Retrieve the user within the session
        const user = await User.findOne({ user_id }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'User not found.' });
        }

        // Commit the transaction as all database operations succeeded
        await session.commitTransaction();

        // After commit, send the receipt for the contribution.
        await sendContributionReceipt(contribution, user);

        return res.status(200).json({
            message: 'Contribution updated successfully.',
            contribution
        });

    } catch (error) {
        console.error(error);
        await session.abortTransaction();
        return res.status(500).json({ message: 'Internal server error' });
    } finally {
        session.endSession();
    }
}

async function handleCenterAdminContributionDecision(req, res) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const contributionId = req.params.contributionId;
        const { status, quantity, rejectionReason } = req.body;

        const validStatuses = ['confirmed', 'rejected'];
        if (!status || !validStatuses.includes(status.toLowerCase())) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Invalid status. Allowed statuses: confirmed rejected.' });
        }
        const normalizedStatus = status.toLowerCase();

        const contribution = await Contribution.findOne({ contribution_id: contributionId }).session(session);
        if (!contribution) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'Contribution not found.' });
        }

        if (contribution.status !== 'pending') {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: 'Contribution already processed.' });
        }

        let updatedQuantity = contribution.quantity;

        if (normalizedStatus === 'confirmed') {
            if (quantity !== undefined) {
                const parsedQuantity = Number(quantity);
                if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
                    await session.abortTransaction();
                    return res.status(400).json({ success: false, message: 'Quantity must be a positive number.' });
                }
                updatedQuantity = parsedQuantity;
            }
        }

        contribution.status = normalizedStatus;
        contribution.quantity = updatedQuantity;
        if (normalizedStatus === 'rejected' && rejectionReason) {
            contribution.rejection_reason = rejectionReason;
        }
        await contribution.save({ session });

        if (normalizedStatus === 'confirmed') {
            const need = await Need.findOne({ need_id: contribution.need_id }).session(session);
            if (!need) {
                await session.abortTransaction();
                return res.status(404).json({ success: false, message: 'Associated need not found.' });
            }

            await Need.updateOne(
                { need_id: contribution.need_id },
                { $inc: { current_received: updatedQuantity } },
                { session }
            );
        }

        const user = await User.findOne({ user_id: contribution.user_id }).session(session);
        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        await session.commitTransaction();
        session.endSession();

        await sendContributionReceipt(contribution, user);

        return res.status(200).json({
            success: true,
            message: `Contribution ${normalizedStatus} successfully.`,
            contribution
        });
    } catch (error) {
        console.error(error);
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

async function getContributionsList(req, res) {
    try {
        const centerId = req.params.centerId;

        // Pagination parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 100);
        const skip = (page - 1) * limit;

        // Build filter
        const filter = { center_id: centerId };
        if (req.query.status) {
            filter.status = req.query.status;
        }

        // Sorting configuration
        const validSortFields = ["createdAt", "quantity", "status"];
        const sortBy = validSortFields.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        // Execute query and count
        const [list, total] = await Promise.all([
            Contribution.find(filter)
                .populate({
                    path: 'user_id',
                    select: 'firstName lastName email contactNumber -_id'
                })
                .select('-_id')
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Contribution.countDocuments(filter)
        ]);

        // Transform contributions to include user details
        const transformedList = list.map(({ user_id, ...rest }) => ({
            ...rest,
            user_id: user_id?.user_id || user_id,
            name: `${user_id.firstName} ${user_id.lastName}`,
            email: user_id?.email,
            contactNumber: user_id?.contactNumber
        }));        

        const totalPages = Math.ceil(total / limit);

        if (transformedList.length === 0) {
            return res.status(200).json({ success: true, message: "No contributions found." });
        }

        return res.status(200).json({
            success: true,
            message: "List Found.",
            data: transformedList,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                sortBy,
                sortOrder: sortOrder === 1 ? "asc" : "desc",
                appliedFilters: {
                    center_id: centerId,
                    ...(req.query.status && { status: req.query.status })
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

async function updateCenterDetails(req, res) {
    const centerId = req.params.centerId;
    const updateData = req.body;

    try {
        const updatedCenter = await Center.findOneAndUpdate(
            { center_id: centerId },
            { $set: updateData },
            { new: true }
        );

        if (!updatedCenter) {
            return res.status(404).json({
                success: false,
                message: ERROR_MESSAGES.CENTER_NOT_FOUND,
            });
        }

        return res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.CENTER_UPDATED,
            data: updatedCenter,
        });
    } catch (error) {
        console.error("Error updating center:", error);
        return res.status(500).json({
            success: false,
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            error: error.message,
        });
    }
}

async function deleteCenter(req, res) {
    const centerId = req.params.centerId;
    const session = await mongoose.startSession();

    try {
        const centerUpdate = await Center.findOneAndUpdate(
            { center_id: centerId },
            { $set: { isDeleted: true } },
            { new: true, session }
        );
        if (!centerUpdate) {
            session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: ERROR_MESSAGES.CENTER_NOT_FOUND,
            });
        }
        if (centerUpdate.isDeleted) {
            return res.status(400).json({
                success: false,
                message: "Center already deleted.",
            });
        }
        await User.updateMany(
            { centers: centerId },
            { $pull: { centers: centerId }, $inc: { centerCount: -1 } },
            { session }
        );
        await Need.updateMany(
            { donation_center: centerId },
            { $set: { isDeleted: true } },
            { session }
        );
        res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.CENTER_DELETED,
        });
        await notifyAdmin("CENTER_DELETED", {
            center_id: centerId,
            name: centerUpdate.name,
            email: centerUpdate.contactInfo.email,
        });
        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        console.error("Error deleting center:", error);
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
    upload,
    onboardCenter,
    centerAdminLogin,
    createNeed,
    getMyCreatedNeeds,
    handleCenterAdminContributionDecision,
    getContributionsList,
    updateCenterDetails,
    deleteCenter,
};
