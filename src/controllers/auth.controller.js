const { User } = require('../models');
const { generateUUID } = require('../utils/uuid.utils');
const { createVerificationToken } = require('../utils/tokens.util');
const { SUCCESS_MESSAGES } = require('../config/config');

async function initiateRegistration(userDetails) {
    try {
        const email = userDetails.email.toLowerCase();
        // const contactNumber = userDetails.contactNumber;

        // const existingConflicts = await User.find(
        //     {
        //         $and: [
        //             { $or: [{ email }, { contactNumber }] },
        //             { isDeleted: { $ne: true } }
        //         ]
        //     },
        //     {
        //         projection: { email: 1, contactNumber: 1, _id: 0 },
        //         limit: 2
        //     }
        // );

        // let conflictFlags = ConflictType.NONE;
        // for (const doc of existingConflicts) {
        //     if (doc.email === email) conflictFlags |= ConflictType.EMAIL;
        //     if (doc.contactNumber === contactNumber) conflictFlags |= ConflictType.CONTACT;
        //     if (conflictFlags === (ConflictType.EMAIL | ConflictType.CONTACT)) break;
        // }

        // if (conflictFlags) {
        //     const conflicts = [];
        //     if (conflictFlags & ConflictType.EMAIL) conflicts.push('Email');
        //     if (conflictFlags & ConflictType.CONTACT) conflicts.push('Contact Number');
        //     return { status: 409, conflicts };
        // }

        const creationResult = await User.create(
            {
                user_id: generateUUID(),
                ...userDetails,
                email,
                roles: ['donor'],
                isVerified: false,
            }
        );

        if (creationResult.metadata.acknowledged) {
            // const verificationToken = createVerificationToken(
            //     creationResult.insertedId,
            //     email
            // );
            // await mailService.sendVerificationEmail(
            //     email,
            //     userDetails.firstName,
            //     verificationToken
            // );
            return { status: 201, message: SUCCESS_MESSAGES.USER_REGISTRATION_INITIATED };
        }

        return { status: 500, error: 'User creation failed' };
    } catch (error) {
        console.error('Registration error:', error);
        return { status: 500, error: error.message };
    }
}

module.exports = { initiateRegistration };