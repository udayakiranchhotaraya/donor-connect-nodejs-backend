const { ERROR_MESSAGES, SUCCESS_MESSAGES } = require("../config/config");
const {
    sendDocumentRejectionEmail,
    sendCenterVerifiedEmail,
    sendCenterStatusChangeEmail,
    sendCenterBannedNotification,
    sendCenterUnbannedNotification,
} = require("../config/mail/mail.config");
const { User, Center } = require("../models");
const { generateAccessToken } = require("../utils/tokens.util");
const { getDocumentViewUrl } = require("../config/s3/s3.config");
const bcrypt = require("bcrypt");

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
        const limit = Math.min(
            Math.max(1, parseInt(req.query.limit) || 10),
            100
        );
        const skip = (page - 1) * limit;

        const filter = {};

        // Status filter (verification.status)
        if (req.query.status) {
            filter["verification.status"] = req.query.status;
        }

        // Address filter (contactInfo.address)
        if (req.query.address) {
            filter["contactInfo.address"] = {
                $regex: req.query.address,
                $options: "i",
            };
        }

        // Name search filter
        if (req.query.name) {
            filter.name = {
                $regex: req.query.name,
                $options: "i",
            };
        }

        // Sorting configuration
        const validSortFields = [
            "name",
            "createdAt",
            "address",
            "verification.status",
        ];
        const sortBy = validSortFields.includes(req.query.sortBy)
            ? req.query.sortBy
            : "createdAt";
        const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

        // Field projection
        const selectedFields = {
            center_id: 1,
            name: 1,
            address: 1,
            createdAt: 1,
            contactInfo: 1,
            status: "$verification.status",
            _id: 0,
        };

        // Execute queries with filters
        const [centers, total] = await Promise.all([
            Center.find(filter)
                .select(selectedFields)
                .sort({ [sortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Center.countDocuments(filter), // Important: use same filter for count
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
                sortOrder: sortOrder === 1 ? "asc" : "desc",
                appliedFilters: {
                    // Optional: show active filters
                    ...(req.query.status && { status: req.query.status }),
                    ...(req.query.address && { address: req.query.address }),
                    ...(req.query.name && { name: req.query.name }),
                },
            },
        });
    } catch (error) {
        console.error("Error fetching centers:", error);
        res.status(500).json({
            message: "Server error occurred while processing your request",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
}

async function viewCenterDetails(req, res) {
    try {
        const centerID = req.params.centerID;

        if (!centerID || typeof centerID !== "string") {
            return res.status(400).json({
                success: false,
                message: "Valid centerID is required in URL parameters",
            });
        }

        const center = await Center.findOne({ center_id: centerID })
            .select("-_id -__v")
            .lean();

        if (!center) {
            return res.status(404).json({
                success: false,
                message: "Center not found with the provided ID",
            });
        }

        const creatorId = center.creator.creator_id;
        const adminId = center.admin_id;

        const [creator, admin] = await Promise.all([
            User.findOne({ user_id: creatorId })
                .select("user_id firstName lastName email contactNumber -_id")
                .lean(),
            User.findOne({ user_id: adminId })
                .select("user_id firstName lastName email contactNumber -_id")
                .lean(),
        ]);

        const responseData = {
            ...center,
            creator: {
                user_id: creator?.user_id,
                name: `${creator?.firstName} ${creator?.lastName}`,
                email: creator?.email,
                contactNumber: creator?.contactNumber,
            },
            admin: {
                user_id: admin?.user_id,
                name: `${admin?.firstName} ${admin?.lastName}`,
                email: admin?.email,
                contactNumber: admin?.contactNumber,
            },
        };

        delete responseData.admin_id;

        res.status(200).json({
            success: true,
            data: responseData,
        });
    } catch (error) {
        console.error("Error fetching center details:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined,
        });
    }
}

async function verifyDocuments(req, res) {
    try {
        const { centerID, documentRefID } = req.params;
        const { action, reason, comments } = req.body;

        if (!["approve", "reject"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Invalid action. Use 'approve' or 'reject'",
            });
        }

        const center = await Center.findOne({ center_id: centerID });
        if (!center) {
            return res.status(404).json({
                success: false,
                message: "Center not found",
            });
        }

        const admin = await User.findOne({ user_id: center.admin_id })
            .select("firstName lastName email -_id")
            .lean();

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: "Admin account not found",
            });
        }

        const adminName = `${admin.firstName} ${admin.lastName}`;

        const document = center.verification.documents.find(
            (doc) => doc.document_ref_id === documentRefID
        );

        if (!document) {
            return res.status(404).json({
                success: false,
                message: "Document not found",
            });
        }

        document.status = action === "approve" ? "verified" : "rejected";

        const allVerified = center.verification.documents.every(
            (doc) => doc.status === "verified"
        );
        const anyRejected = center.verification.documents.some(
            (doc) => doc.status === "rejected"
        );

        let verificationDate;
        if (allVerified) {
            center.verification.status = "verified";
            verificationDate = new Date();
            center.verification.verificationDate = verificationDate;
        } else if (anyRejected) {
            center.verification.status = "pending";
            center.verification.verificationDate = null;
        } else {
            center.verification.status = "pending";
        }

        await center.save();

        if (action === "reject") {
            await sendDocumentRejectionEmail({
                admin: {
                    name: adminName,
                    email: admin.email,
                },
                center: {
                    name: center.name,
                    id: center.center_id,
                },
                document: document.document.name,
                reason: reason || "No reason provided",
                comments: comments || "No comments provided",
            });
        }

        if (center.verification.status === "verified") {
            await sendCenterVerifiedEmail({
                admin: {
                    name: adminName,
                    email: admin.email,
                },
                center: {
                    name: center.name,
                    id: center.center_id,
                    verificationDate,
                },
            });
        }

        res.status(200).json({
            success: true,
            data: {
                verificationStatus: center.verification.status,
                documentStatus: document.status,
                ...(center.verification.verificationDate && {
                    verificationDate: center.verification.verificationDate,
                }),
            },
        });
    } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            ...(process.env.NODE_ENV === "development" && {
                error: error.message,
            }),
        });
    }
}

async function updateCenterVerificationStatus(req, res) {
    try {
        const { centerID } = req.params;
        const { status, reason, comments } = req.body;

        const allowedStatuses = ["rejected"]; // Add future statuses here
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Allowed values: ${allowedStatuses.join(
                    ", "
                )}`,
            });
        }

        const center = await Center.findOne({ center_id: centerID });
        if (!center) {
            return res.status(404).json({
                success: false,
                message: "Center not found",
            });
        }

        const admin = await User.findOne({ user_id: center.admin_id })
            .select("firstName lastName email -_id")
            .lean();

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: "Admin account not found",
            });
        }

        const previousStatus = center.verification.status;
        center.verification.status = status;

        switch (status) {
            case "rejected":
                center.verification.documents.forEach((doc) => {
                    doc.status = "rejected";
                });
                center.verification.verificationDate = null;
                break;
            // Add future status cases here
        }

        await center.save();

        await sendCenterStatusChangeEmail({
            center: {
                ...center.toObject(),
                verification: center.verification,
            },
            admin: {
                name: `${admin.firstName} ${admin.lastName}`,
                email: admin.email,
            },
            previousStatus,
            reason,
            comments,
        });

        res.status(200).json({
            success: true,
            data: {
                status: center.verification.status,
                previousStatus,
                ...(center.verification.verificationDate && {
                    verificationDate: center.verification.verificationDate,
                }),
            },
        });
    } catch (error) {
        console.error("Status change error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            ...(process.env.NODE_ENV === "development" && {
                error: error.message,
            }),
        });
    }
}

async function banCenter (req, res) {
    try {
        const { centerID } = req.params;
        const { reason, comments } = req.body;
        const adminUser = req.user;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: "Reason is required for banning"
            });
        }

        const center = await Center.findOne({ center_id: centerID });
        if (!center) {
            return res.status(404).json({ 
                success: false, 
                message: "Center not found" 
            });
        }

        if (center.isBanned) {
            return res.status(400).json({
                success: false,
                message: "Center is already banned"
            });
        }

        const banDetails = {
            reason,
            comments: comments || '',
            bannedAt: new Date(),
            bannedBy: adminUser.sub,
            previousVerificationStatus: center.verification.status,
            documentStatuses: center.verification.documents.map(doc => ({
                document_ref_id: doc.document_ref_id,
                previousStatus: doc.status
            }))
        };

        center.isBanned = true;
        center.verification.status = 'suspended';
        center.banDetails = banDetails;
        
        center.verification.documents.forEach(doc => {
            doc.status = 'suspended';
        });

        await center.save();

        await sendCenterBannedNotification({
            center: center.toObject(),
            admin: {
                name: adminUser.name ?? `${adminUser.firstName} ${adminUser.lastName}`,
                email: adminUser.email
            },
            banDetails
        });

        res.status(200).json({
            success: true,
            data: {
                isBanned: true,
                bannedAt: center.banDetails.bannedAt
            }
        });

    } catch (error) {
        console.error('Ban error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

async function unbanCenter(req, res) {
    try {
        const { centerID } = req.params;
        const adminUser = req.user;

        const center = await Center.findOne({ center_id: centerID });
        if (!center) {
            return res.status(404).json({
                success: false,
                message: "Center not found"
            });
        }

        if (!center.isBanned) {
            return res.status(400).json({
                success: false,
                message: "Center is not banned"
            });
        }

        center.verification.status = center.banDetails.previousVerificationStatus;
        center.verification.documents.forEach((doc, index) => {
            doc.status = center.banDetails.documentStatuses[index].previousStatus;
        });

        delete center.isBanned;
        delete center.banDetails;

        await center.save();

        await sendCenterUnbannedNotification({
            center: center.toObject(),
            admin: {
                name: adminUser.name ?? `${adminUser.firstName} ${adminUser.lastName}`,
                email: adminUser.email
            }
        });

        res.status(200).json({
            success: true,
            data: {
                isBanned: false
            }
        });

    } catch (error) {
        console.error('Unban error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

async function viewDocument(req, res) {
    try {
        const { documentRefID } = req.params;
        const { expiresIn } = req.query; // optional expiration time in seconds

        if (!documentRefID) {
            return res.status(400).json({
                success: false,
                message: "Document reference ID is required."
            });
        }

        const center = await Center.findOne({
            "verification.documents.document_ref_id": documentRefID
        });

        if (!center) {
            return res.status(404).json({
                success: false,
                message: "Document not found."
            });
        }

        const documentEntry = center.verification.documents.find(doc => doc.document_ref_id === documentRefID);

        if (!documentEntry || !documentEntry.document || !documentEntry.document.s3_key) {
            return res.status(404).json({
                success: false,
                message: "Document information incomplete or missing."
            });
        }

        const expirationTime = expiresIn ? parseInt(expiresIn, 10) : 900; // Default to 900s (15 mins)
        
        const presignedUrl = await getDocumentViewUrl(documentEntry.document.s3_key, expirationTime);

        return res.status(200).json({
            success: true,
            url: presignedUrl
        });
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

module.exports = {
    login,
    listAllCenters,
    viewCenterDetails,
    verifyDocuments,
    updateCenterVerificationStatus,
    banCenter,
    unbanCenter,
    viewDocument
};
