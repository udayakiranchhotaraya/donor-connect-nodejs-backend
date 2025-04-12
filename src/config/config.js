const dotenv = require("dotenv");
dotenv.config();

const TABLE_NAMES = {
    CENTER_SETUP: "CENTERS",
    USERS: "USERS",
    DONATIONS: "DONATIONS",
    REVIEWS: "REVIEWS",
    TRANSACTIONS: "TRANSACTIONS",
};

const OAUTH_PROVIDERS = {
    GOOGLE: {
        CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
        STRATEGY: require('passport-google-oauth20').Strategy,
        scope: ['profile', 'email']
    },
    // FACEBOOK: {
    //     CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
    //     CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
    //     CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL,
    //     STRATEGY: require('passport-facebook').Strategy,
    //     profileFields: ['id', 'emails', 'name']
    // },
};

const ENVIRONMENT = process.env.NODE_ENV;
const CONFIG_PARAM = {
    development: {
        PORT: "5001",
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
        JWT_VERIFICATION_SECRET: process.env.JWT_VERIFICATION_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        MONGO_DB_NAME: "HOMELY_HUB_DEV",
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_SECURE: process.env.SMTP_SECURE,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        SMTP_FROM: process.env.SMTP_FROM,
        FRONTEND_BASE_URL:
            process.env.FRONTEND_BASE_URL ?? `http://localhost:4001`,
        CENTER_DASHBOARD_URL: process.env.CENTER_DASHBOARD_URL,
        TABLE_NAMES: {
            CENTER_SETUP: TABLE_NAMES.CENTER_SETUP,
            USERS: TABLE_NAMES.USERS,
            DONATIONS: TABLE_NAMES.DONATIONS,
            REVIEWS: TABLE_NAMES.REVIEWS,
            TRANSACTIONS: TABLE_NAMES.TRANSACTIONS,
        },
        AI_API_URL: process.env.AI_API_URL,
        AI_API_KEY: process.env.AI_API_KEY,
        GOOGLE_OAUTH_CONFIG: OAUTH_PROVIDERS["GOOGLE"],
        FACEBOOK_OAUTH_CONFIG: OAUTH_PROVIDERS["FACEBOOK"],
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
        GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
        GMAIL_USER: process.env.GMAIL_USER,
        MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
        FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
        FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
        FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL,
    },
    production: {
        PORT: "4000",
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
        JWT_VERIFICATION_SECRET: process.env.JWT_VERIFICATION_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        MONGO_DB_NAME: "HOMELY_HUB_DB",
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_SECURE: process.env.SMTP_SECURE,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS,
        SMTP_FROM: process.env.SMTP_FROM,
        FRONTEND_BASE_URL:
            process.env.FRONTEND_BASE_URL ?? `http://localhost:4001`,
        CENTER_DASHBOARD_URL: process.env.CENTER_DASHBOARD_URL,
        TABLE_NAMES: {
            CENTER_SETUP: TABLE_NAMES.CENTER_SETUP,
            USERS: TABLE_NAMES.USERS,
            DONATIONS: TABLE_NAMES.DONATIONS,
            REVIEWS: TABLE_NAMES.REVIEWS,
            TRANSACTIONS: TABLE_NAMES.TRANSACTIONS,
        },
        AI_API_URL: process.env.AI_API_URL,
        AI_API_KEY: process.env.AI_API_KEY,
        GOOGLE_OAUTH_CONFIG: OAUTH_PROVIDERS["GOOGLE"],
        FACEBOOK_OAUTH_CONFIG: OAUTH_PROVIDERS["FACEBOOK"],
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
        GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
        GMAIL_USER: process.env.GMAIL_USER,
        MAIL_FROM_NAME: process.env.MAIL_FROM_NAME,
        FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID,
        FACEBOOK_CLIENT_SECRET: process.env.FACEBOOK_CLIENT_SECRET,
        FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL,
    },
};

const PORT = CONFIG_PARAM[ENVIRONMENT].PORT;
const JWT_ACCESS_SECRET = CONFIG_PARAM[ENVIRONMENT].JWT_ACCESS_SECRET;
const JWT_VERIFICATION_SECRET =
    CONFIG_PARAM[ENVIRONMENT].JWT_VERIFICATION_SECRET;
const JWT_EXPIRES_IN = CONFIG_PARAM[ENVIRONMENT].JWT_EXPIRES_IN;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = CONFIG_PARAM[ENVIRONMENT].MONGO_DB_NAME;
const SMTP_HOST = CONFIG_PARAM[ENVIRONMENT].SMTP_HOST;
const SMTP_PORT = CONFIG_PARAM[ENVIRONMENT].SMTP_PORT;
const SMTP_SECURE = CONFIG_PARAM[ENVIRONMENT].SMTP_SECURE;
const SMTP_USER = CONFIG_PARAM[ENVIRONMENT].SMTP_USER;
const SMTP_PASS = CONFIG_PARAM[ENVIRONMENT].SMTP_PASS;
const SMTP_FROM = CONFIG_PARAM[ENVIRONMENT].SMTP_FROM;
const FRONTEND_BASE_URL = CONFIG_PARAM[ENVIRONMENT].FRONTEND_BASE_URL;
const CENTER_DASHBOARD_URL = CONFIG_PARAM[ENVIRONMENT].CENTER_DASHBOARD_URL;
const AI_API_URL = CONFIG_PARAM[ENVIRONMENT].AI_API_URL;
const AI_API_KEY = CONFIG_PARAM[ENVIRONMENT].AI_API_KEY;
const GOOGLE_OAUTH_CONFIG = CONFIG_PARAM[`${ENVIRONMENT}`].GOOGLE_OAUTH_CONFIG;
const FACEBOOK_OAUTH_CONFIG =
    CONFIG_PARAM[`${ENVIRONMENT}`].FACEBOOK_OAUTH_CONFIG;
const GMAIL_REFRESH_TOKEN = CONFIG_PARAM[`${ENVIRONMENT}`].GMAIL_REFRESH_TOKEN;
const GMAIL_USER = CONFIG_PARAM[`${ENVIRONMENT}`].GMAIL_USER;
const MAIL_FROM_NAME = CONFIG_PARAM[`${ENVIRONMENT}`].MAIL_FROM_NAME;
const GOOGLE_CLIENT_ID = CONFIG_PARAM[ENVIRONMENT].GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = CONFIG_PARAM[ENVIRONMENT].GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = CONFIG_PARAM[ENVIRONMENT].GOOGLE_CALLBACK_URL;
const FACEBOOK_CLIENT_ID = CONFIG_PARAM[ENVIRONMENT].FACEBOOK_CLIENT_ID;
const FACEBOOK_CLIENT_SECRET = CONFIG_PARAM[ENVIRONMENT].FACEBOOK_CLIENT_SECRET;
const FACEBOOK_CALLBACK_URL = CONFIG_PARAM[ENVIRONMENT].FACEBOOK_CALLBACK_URL;

const SALT_ROUNDS = 12;
const OPERABLE_CENTER_LIMIT = 12;

const SUCCESS_MESSAGES = {
    USER_CREATED: "User registered successfully.",
    USER_REGISTRATION_INITIATED: "Verification email sent",
    USER_PROFILE_FETCHED: "User profile fetched successfully.",
    USER_UPDATED: "User details updated successfully.",
    USER_DELETED: "User deleted successfully.",
    USER_SIGNED_IN: "User signed in successfully.",
    TOKEN_REFRESHED: "Token refreshed successfully.",
    PASSWORD_SET: "Password set successfully",
    DONATION_CREATED: "Donation created successfully.",
    DONATION_FETCHED: "Donations fetched successfully.",
    DONATION_UPDATED: "Donation updated successfully.",
    DONATION_DELETED: "Donation deleted successfully.",
    CENTER_CREATED: "Center onboarded successfully.",
    CENTER_FETCHED: "Center fetched successfully.",
    CENTER_UPDATED: "Center updated successfully.",
    CENTER_DELETED: "Center deleted successfully.",
    NOTIFICATION_CREATED: "Notification created successfully.",
    NOTIFICATIONS_FETCHED: "Notifications fetched successfully.",
    NOTIFICATION_UPDATED: "Notification updated successfully.",
    NOTIFICATION_DELETED: "Notification deleted successfully.",
    REVIEW_CREATED: "Review submitted successfully.",
    REVIEW_FETCHED: "Reviews fetched successfully.",
    REVIEW_UPDATED: "Review updated successfully.",
    REVIEW_DELETED: "Review deleted successfully.",
    TRANSACTION_CREATED: "Transaction recorded successfully.",
    TRANSACTION_FETCHED: "Transactions fetched successfully.",
    TRANSACTION_UPDATED: "Transaction updated successfully.",
    TRANSACTION_DELETED: "Transaction deleted successfully.",
    OPERATION_SUCCESSFUL: "Operation completed successfully.",
};

const ERROR_MESSAGES = {
    USER_NOT_FOUND: "User not found.",
    INVALID_CREDENTIALS: "Invalid credentials provided.",
    EMAIL_ALREADY_IN_USE: "Email already in use.",
    USER_CREATION_FAILED: "Failed to create user.",
    USER_UPDATE_FAILED: "Failed to update user.",
    USER_DELETION_FAILED: "Failed to delete user.",
    USER_NOT_VERIFIED: "Please verify your account to continue",
    UNAUTHORIZED: "You are not authorized to perform this action.",
    DONATION_NOT_FOUND: "Donation not found.",
    DONATION_CREATION_FAILED: "Failed to create donation.",
    DONATION_UPDATE_FAILED: "Failed to update donation.",
    DONATION_DELETION_FAILED: "Failed to delete donation.",
    CENTER_NOT_FOUND: "Center not found.",
    CENTER_CREATION_FAILED: "Failed to create center.",
    CENTER_UPDATE_FAILED: "Failed to update center.",
    CENTER_DELETION_FAILED: "Failed to delete center.",
    OPERABLE_CENTER_LIMIT_EXCEEDED:
        "You have reached the maximum limit of centers",
    NOTIFICATION_NOT_FOUND: "Notification not found.",
    NOTIFICATION_CREATION_FAILED: "Failed to create notification.",
    NOTIFICATION_UPDATE_FAILED: "Failed to update notification.",
    NOTIFICATION_DELETION_FAILED: "Failed to delete notification.",
    REVIEW_NOT_FOUND: "Review not found.",
    REVIEW_CREATION_FAILED: "Failed to submit review.",
    REVIEW_UPDATE_FAILED: "Failed to update review.",
    REVIEW_DELETION_FAILED: "Failed to delete review.",
    TRANSACTION_NOT_FOUND: "Transaction not found.",
    TRANSACTION_CREATION_FAILED: "Failed to record transaction.",
    TRANSACTION_UPDATE_FAILED: "Failed to update transaction.",
    TRANSACTION_DELETION_FAILED: "Failed to delete transaction.",
    MISSING_REQUIRED_FIELDS: "Missing required fields.",
    INVALID_EMAIL: "Invalid email format",
    WEAK_PASSWORD:
        "Password must be at least 8 characters with uppercase, lowercase, number and special character",
    VALIDATION_ERROR: "Validation error occurred.",
    INTERNAL_SERVER_ERROR: "Internal server error occurred.",
    BAD_REQUEST: "Bad request.",
    FORBIDDEN: "Access is forbidden.",
    NOT_FOUND: "The requested resource was not found.",
    TOKEN_UNAVAILABLE: "JWT token not available!",
    TOKEN_INVALID_OR_EXPIRED: "Invalid or expired token.",
};

module.exports = {
    TABLE_NAMES,
    OAUTH_PROVIDERS,
    ENVIRONMENT,
    CONFIG_PARAM,
    PORT,
    JWT_ACCESS_SECRET,
    JWT_VERIFICATION_SECRET,
    JWT_EXPIRES_IN,
    MONGO_URI,
    MONGO_DB_NAME,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
    FRONTEND_BASE_URL,
    CENTER_DASHBOARD_URL,
    AI_API_URL,
    AI_API_KEY,
    GOOGLE_OAUTH_CONFIG,
    FACEBOOK_OAUTH_CONFIG,
    GMAIL_REFRESH_TOKEN,
    GMAIL_USER,
    MAIL_FROM_NAME,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,
    FACEBOOK_CLIENT_ID,
    FACEBOOK_CLIENT_SECRET,
    FACEBOOK_CALLBACK_URL,
    SALT_ROUNDS,
    OPERABLE_CENTER_LIMIT,
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
};
