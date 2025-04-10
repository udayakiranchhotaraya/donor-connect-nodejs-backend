const { User } = require("../models");
const {
    generateAccessToken,
    generateVerficationToken,
    verifyToken,
} = require("../utils/tokens.util");
const generateUUID = require('../utils/uuid.utils');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    SALT_ROUNDS,
    OAUTH_PROVIDERS,
} = require("../config/config");
const bcrypt = require("bcrypt");
const passport = require("passport");

async function legacyLogin(req, res) {
    try {
        const { candidateEmail, candidatePassword } = req.body;
        const user = await User.findOne(
            {
                email: new RegExp(`^${candidateEmail}$`, "i"),
                isDeleted: { $ne: true },
            },
        ).lean();

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

        if (!user.password) {
            const oauthMethods = user.loginMethods?.filter((m) =>
                Object.keys(OAUTH_PROVIDERS).includes(m.toUpperCase())
            );

            if (oauthMethods.length) {
                return res.status(400).json({
                    success: false,
                    status: 400,
                    error: `Account registered via ${oauthMethods.join(" or ")}. Use social login.`,
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

        return res.status(200).json({
            success: true,
            status: 200,
            message: SUCCESS_MESSAGES.USER_SIGNED_IN,
            data: formatUserResponse(user),
            tokens: {
                accessToken: generateAccessToken({
                    sub: user.user_id,
                    ...user
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

function socialLoginInitiate(req, res, next) {
    const provider = req.params.provider;
    if (!OAUTH_PROVIDERS[provider.toUpperCase()]) {
        return res.status(400).json({
            success: false,
            status: 400,
            error: ERROR_MESSAGES.UNSUPPORTED_PROVIDER,
        });
    }

    passport.authenticate(provider, {
        scope: OAUTH_PROVIDERS[provider.toUpperCase()].scopes,
        state: req.query.redirect || "",
    })(req, res, next);
}

async function socialLoginCallback(req, res, next) {
    const provider = req.params.provider;

    passport.authenticate(provider, { session: false }, async (error, user) => {
        try {
            if (error || !user) {
                return res.status(401).json({
                    success: false,
                    status: 401,
                    error: ERROR_MESSAGES.SOCIAL_LOGIN_FAILED,
                });
            }

            const existingUser = await User.findOne({ email: user.email }).lean();
            if (existingUser) {
                return handleExistingUser(existingUser, provider, res);
            }

            const newUser = await createSocialUser(user, provider);
            return res.status(200).json({
                success: true,
                status: 200,
                message: SUCCESS_MESSAGES.USER_SIGNED_IN,
                data: formatUserResponse(newUser),
                tokens: {
                    accessToken: generateAccessToken({
                        sub: newUser.user_id,
                        ...newUser
                    }),
                },
            });
        } catch (err) {
            console.error("Social login error:", err);
            return res.status(500).json({
                success: false,
                status: 500,
                error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
            });
        }
    })(req, res, next);
}

// Helper functions
async function handleExistingUser(user, provider, res) {
    if (!user?.loginMethods?.includes(provider)) {
        await User.updateOne(
            { user_id: user.user_id },
            { $push: { loginMethods: provider } }
        );
    }

    return res.status(200).json({
        success: true,
        status: 200,
        message: SUCCESS_MESSAGES.USER_SIGNED_IN,
        data: user,
        tokens: {
            accessToken: generateAccessToken({
                sub: user.user_id,
                ...user
            }),
        },
    });
}

async function createSocialUser(profile, provider) {
    const [firstName, ...lastName] = profile.name.split(" ");
    const user = await User.create({
        user_id: generateUUID(),
        email: profile.email,
        firstName,
        lastName: lastName.join(" "),
        isVerified: true,
        loginMethods: [provider],
        roles: ["donor"],
    });
    return user.toObject();
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

module.exports = {
    legacyLogin,
    socialLoginInitiate,
    socialLoginCallback,
};
