const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { createLogger, format, transports } = require("winston");
const { GMAIL_USER, CENTER_DASHBOARD_URL } = require("../config");

// Configure logger
const logger = createLogger({
    level: "info",
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [new transports.Console()],
});

class MailService {
    constructor() {
        this.mailConfig = {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: process.env.GMAIL_REFRESH_TOKEN,
            user: process.env.GMAIL_USER,
        };

        this.frontendBaseUrl = process.env.FRONTEND_BASE_URL;
        this.mailFromName = process.env.MAIL_FROM_NAME;
        this.oauth2Client = null;
        this.transporter = null;

        this.initializeTransport();
    }

    async initializeTransport() {
        try {
            this.oauth2Client = new google.auth.OAuth2(
                this.mailConfig.clientId,
                this.mailConfig.clientSecret,
                process.env.MAIL_REDIRECT_URI
            );

            this.oauth2Client.on("tokens", (tokens) => {
                if (tokens.refresh_token) {
                    this.handleNewRefreshToken(tokens.refresh_token);
                }
            });

            this.oauth2Client.setCredentials({
                refresh_token: this.mailConfig.refreshToken,
            });

            const accessToken = await this.oauth2Client.getAccessToken();

            this.transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    type: "OAuth2",
                    user: this.mailConfig.user,
                    clientId: this.mailConfig.clientId,
                    clientSecret: this.mailConfig.clientSecret,
                    refreshToken: this.mailConfig.refreshToken,
                    accessToken: accessToken.token,
                },
            });

            await this.verifyConnection();
        } catch (error) {
            logger.error(`Transport initialization failed: ${error.message}`);
            throw error;
        }
    }

    async verifyConnection() {
        try {
            await this.transporter.verify();
            logger.info("Mail server connection verified");
        } catch (error) {
            logger.error(`Connection verification failed: ${error.message}`);
            throw error;
        }
    }

    handleNewRefreshToken(refreshToken) {
        logger.info("Received new refresh token");
        this.mailConfig.refreshToken = refreshToken;
    }

    async sendEmail(to, subject, html) {
        try {
            const mailOptions = {
                from: `"${this.mailFromName}" <${this.mailConfig.user}>`,
                to,
                subject,
                html,
            };

            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`Email sent to ${to} (ID: ${info.messageId})`);
            return true;
        } catch (error) {
            logger.error(`Failed to send email to ${to}: ${error.message}`);

            if (error.code === "EAUTH" && error.command === "API") {
                await this.refreshCredentials();
                return this.sendEmail(to, subject, html);
            }

            throw new Error("EMAIL_SEND_FAILED");
        }
    }

    async refreshCredentials() {
        logger.info("Refreshing email credentials...");
        try {
            const { credentials } = await this.oauth2Client.refreshToken(
                this.mailConfig.refreshToken
            );

            this.oauth2Client.setCredentials(credentials);
            await this.initializeTransport();
        } catch (error) {
            logger.error(`Failed to refresh credentials: ${error.message}`);
            throw new Error("CREDENTIAL_REFRESH_FAILED");
        }
    }

    generateTemplate(content) {
        return `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                <div style="padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                ${content}
                <footer style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee;">
                    <p>Best regards,<br>${this.mailFromName} Team</p>
                    <p style="margin-top: 30px; color: #666;">
                    Need help? Contact support: 
                    <a href="mailto:support@donorconnect.org">support@donorconnect.org</a>
                    </p>
                </footer>
                </div>
            </div>
        `;
    }

    generateActionButton(url, text, color) {
        return `
            <div style="text-align: center; margin: 30px 0;">
                <a href="${url}"
                style="background-color: ${color}; color: white; padding: 12px 24px;
                text-decoration: none; border-radius: 4px; display: inline-block;">
                ${text}
                </a>
            </div>
        `;
    }

    registrationTemplate(data) {
        const actionUrl = `${this.frontendBaseUrl}/verify?token=${data.token}`;
        const button = this.generateActionButton(
            actionUrl,
            "Verify Email",
            "#3498db"
        );

        return this.generateTemplate(`
            <h2 style="color: #2c3e50;">Dear ${data.userName},</h2>
            <p>Thank you for creating an account with <strong>${this.mailFromName}</strong>.To activate your account and protect your information, you must set your password.</p>
            <p>Please verify your email address to complete your registration.</p>
            ${button}
            <p>This link expires in <strong>60 minutes</strong>.</p>
            <br>
            <p>If you did not initiate this request, please contact our support team immediately at <a href="mailto:support@donorconnect.org">support@donorconnect.org</a>.</p>
        `);
    }

    passwordResetTemplate(data) {
        const actionUrl = `${this.frontendBaseUrl}/reset-password?token=${data.token}`;
        const button = this.generateActionButton(
            actionUrl,
            "Reset Password",
            "#e74c3c"
        );

        return this.generateTemplate(`
            <h2 style="color: #2c3e50;">Password Reset Request</h2>
            <p>We received a request to reset your password.</p>
            ${button}
            <p>This link is valid for <strong>10 minutes</strong>.</p>
            <br>
            <p>If you did not initiate this request, please contact our support team immediately at <a href="mailto:support@donorconnect.org">support@donorconnect.org</a>.</p>
        `);
    }

    welcomeTemplate(data) {
        const button = this.generateActionButton(
            this.frontendBaseUrl,
            "Start Exploring",
            "#27ae60"
        );

        return this.generateTemplate(`
            <h2 style="color: #2c3e50;">Welcome to ${this.mailFromName}, ${data.userName}!</h2>
            <p>Your account has been successfully verified.</p>
            <p>Get started by exploring our platform:</p>
            ${button}
        `);
    }

    // private centerRegistrationInitiatedTemplate(data: any): string {
    //     return this.generateTemplate(`
    //         <h2 style="color: #2c3e50;">Registration Received for ${data.centerName}</h2>
    //         <p>Dear ${data.creatorName},</p>

    //         <p>Thank you for submitting your center registration to <strong>${this.mailFromName}</strong>.
    //         We've received your application with the following details:</p>

    //         <div style="margin: 20px 0; padding: 15px; background: #f8f9fa;">
    //             <p><strong>Center ID:</strong> ${data.referenceId}</p>
    //             <p><strong>Submission Date:</strong> ${data.createdAt.toLocaleDateString()}</p>
    //             <p><strong>Contact Email:</strong> ${data.creatorEmail}</p>
    //         </div>

    //         <p>Our team is currently reviewing your application. This process typically takes 3-5 business days.</p>

    //         <p>You'll receive another email once your registration has been approved. Please note:</p>
    //         <ul style="margin: 15px 0; padding-left: 20px;">
    //             <li>Do not submit multiple applications for the same center</li>
    //             <li>Keep your contact information up-to-date</li>
    //             <li>Check your spam folder if you don't hear from us</li>
    //         </ul>

    //         <p>For any urgent inquiries, contact our support team at
    //         <a href="mailto:centersupport@donorconnect.org">centersupport@donorconnect.org</a></p>

    //         <p style="color: #7f8c8d; margin-top: 25px;">This is an automated message - please do not reply directly to this email.</p>
    //     `);
    // }

    centerRegistrationInitiatedTemplate(centerDoc) {
        const mapLink = `https://www.google.com/maps?q=${centerDoc.location.coordinates[1]},${centerDoc.location.coordinates[0]}`;

        return this.generateTemplate(`
            <h2 style="color: #2c3e50;">Registration Received for ${
                centerDoc.name
            }</h2>
            <p>Dear ${centerDoc.creator.name},</p>
            
            <p>Thank you for submitting your center registration to <strong>${
                this.mailFromName
            }</strong>. 
            We've received your application with the following details:</p>
            
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="color: #2980b9; margin-top: 0;">Center Details</h3>
                <p><strong>Center ID:</strong> ${centerDoc.center_id}</p>
                <p><strong>Center Name:</strong> ${centerDoc.name}</p>
                ${
                    centerDoc.contactInfo.address
                        ? `<p><strong>Address:</strong> ${centerDoc.contactInfo.address}</p>`
                        : ""
                }
                <p><strong>Registered Email:</strong> ${
                    centerDoc.contactInfo.email
                }</p>
                ${
                    centerDoc.contactInfo.phone
                        ? `<p><strong>Phone:</strong> ${centerDoc.contactInfo.phone}</p>`
                        : ""
                }
                ${
                    centerDoc.website
                        ? `<p><strong>Website:</strong> <a href="${centerDoc.website}">${centerDoc.website}</a></p>`
                        : ""
                }
                <p><strong>Location:</strong> 
                <a href="${mapLink}" target="_blank">
                    ${centerDoc.location.coordinates[1].toFixed(6)}, 
                    ${centerDoc.location.coordinates[0].toFixed(6)}
                </a>
                </p>
                <p><strong>Submission Date:</strong> ${centerDoc.createdAt.toLocaleDateString()}</p>
                <br>
                <p>Request raised by: ${centerDoc.creator.name} <${
            centerDoc.creator.email
        }></p>
            </div>
        
            <div style="margin: 25px 0; padding: 15px; background: #fff3cd; border-radius: 8px;">
                <h3 style="color: #856404; margin-top: 0;">Verification Required</h3>
                <p>Please confirm these details are correct:</p>
                <ul style="margin: 15px 0; padding-left: 20px;">
                <li>Check all contact information</li>
                <li>Verify location coordinates</li>
                <li>Review center details</li>
                </ul>
                <p>If any information is incorrect, please contact us immediately at 
                <a href="mailto:centersupport@donorconnect.org">centersupport@donorconnect.org</a></p>
            </div>

            <p>Our team is currently reviewing your application. This process typically takes 3-5 business days.</p>
            
            <p>You'll receive another email once your registration has been approved. Please note:</p>
            <ul style="margin: 15px 0; padding-left: 20px;">
                <li>Do not submit multiple applications for the same center</li>
                <li>Keep your contact information up-to-date</li>
                <li>Check your spam folder if you don't hear from us</li>
            </ul>
        
            <p>For any urgent inquiries, contact our support team at 
            <a href="mailto:centersupport@donorconnect.org">centersupport@donorconnect.org</a></p>
            
            <p style="color: #7f8c8d; margin-top: 25px;">This is an automated message - please do not reply directly to this email.</p>
        `);
    }

    centerRegistrationAdminNotificationTemplate(centerDoc) {
        const mapLink = `https://www.google.com/maps?q=${centerDoc.location.coordinates[1]},${centerDoc.location.coordinates[0]}`;

        return this.generateTemplate(`
            <h2 style="color: #c0392b;">New Center Registration Pending Review</h2>
            <p>Hello Admin,</p>
            
            <p>A new center registration request has been submitted and is awaiting your review and approval. Below are the submitted details:</p>
            
            <div style="margin: 20px 0; padding: 15px; background: #f2f2f2; border-radius: 8px;">
                <h3 style="color: #34495e; margin-top: 0;">Center Information</h3>
                <p><strong>Center ID:</strong> ${centerDoc.center_id}</p>
                <p><strong>Center Name:</strong> ${centerDoc.name}</p>
                ${
                    centerDoc.contactInfo.address
                        ? `<p><strong>Address:</strong> ${centerDoc.contactInfo.address}</p>`
                        : ""
                }
                <p><strong>Registered Email:</strong> ${
                    centerDoc.contactInfo.email
                }</p>
                ${
                    centerDoc.contactInfo.phone
                        ? `<p><strong>Phone:</strong> ${centerDoc.contactInfo.phone}</p>`
                        : ""
                }
                ${
                    centerDoc.website
                        ? `<p><strong>Website:</strong> <a href="${centerDoc.website}">${centerDoc.website}</a></p>`
                        : ""
                }
                <p><strong>Location:</strong> 
                <a href="${mapLink}" target="_blank">
                    ${centerDoc.location.coordinates[1].toFixed(6)}, 
                    ${centerDoc.location.coordinates[0].toFixed(6)}
                </a>
                </p>
                <p><strong>Submitted On:</strong> ${centerDoc.createdAt.toLocaleDateString()}</p>
                <p><strong>Submitted By:</strong> ${
                    centerDoc.creator.name
                } &lt;${centerDoc.creator.email}&gt;</p>
            </div>
    
            <div style="margin: 25px 0; padding: 15px; background: #eaf2f8; border-radius: 8px;">
                <h3 style="color: #2e86c1; margin-top: 0;">Next Steps</h3>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Verify the center's contact details and address</li>
                    <li>Check the location coordinates and website link</li>
                    <li>Ensure no duplicate submissions exist</li>
                </ul>
                <p>You can approve or reject this registration in the admin dashboard.</p>
            </div>
            
            <p style="color: #7f8c8d; margin-top: 25px;">This is an automated notification for administrative purposes.</p>
        `);
    }

    documentRejectionTemplate(admin, center, documentName, reason, comments) {
        const mapLink = `https://www.google.com/maps?q=${center.location.coordinates[1]},${center.location.coordinates[0]}`;

        return this.generateTemplate(`
            <h2 style="color: #dc3545;">Document Rejected - ${documentName}</h2>
            <p>Dear ${admin.name},</p>
            
            <p>The following document for <strong>${
                center.name
            }</strong> has been rejected during verification:</p>
            
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="color: #2980b9; margin-top: 0;">Rejection Details</h3>
                <p><strong>Center:</strong> ${center.name} (ID: ${center.id})</p>
                <p><strong>Document:</strong> ${document}</p>
                <p><strong>Reason for Rejection:</strong> ${reason}</p>
                ${
                    comments
                        ? `<p><strong>Admin Comments:</strong> ${comments}</p>`
                        : ""
                }
                <p><strong>Location:</strong> 
                <a href="${mapLink}" target="_blank">
                    ${center.location.coordinates[1].toFixed(6)}, 
                    ${center.location.coordinates[0].toFixed(6)}
                </a>
                </p>
            </div>
    
            <div style="margin: 25px 0; padding: 15px; background: #fff3cd; border-radius: 8px;">
                <h3 style="color: #856404; margin-top: 0;">Next Steps</h3>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Upload a corrected version of the document</li>
                    <li>Ensure all documents meet requirements</li>
                    <li>Resubmit for verification</li>
                </ul>
                <p>Contact verification team: 
                <a href="mailto:verification@donorconnect.org">verification@donorconnect.org</a></p>
            </div>
    
            <p style="color: #7f8c8d; margin-top: 25px;">
                This rejection does not affect other submitted documents. Check your portal for full status.
            </p>
        `);
    }

    centerVerifiedTemplate(admin, center) {
        const mapLink = `https://www.google.com/maps?q=${center.location.coordinates[1]},${center.location.coordinates[0]}`;

        return this.generateTemplate(`
            <h2 style="color: #28a745;">Center Successfully Verified!</h2>
            <p>Dear ${admin.name},</p>
            
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="color: #2980b9; margin-top: 0;">Verification Details</h3>
                <p><strong>Center ID:</strong> ${center.center_id}</p>
                <p><strong>Center Name:</strong> ${center.name}</p>
                <p><strong>Verification Date:</strong> ${center.verification.verificationDate.toLocaleDateString()}</p>
                <p><strong>Location:</strong> 
                <a href="${mapLink}" target="_blank">
                    ${center.location.coordinates[1].toFixed(6)}, 
                    ${center.location.coordinates[0].toFixed(6)}
                </a>
                </p>
            </div>
    
            <div style="margin: 25px 0; padding: 15px; background: #d4edda; border-radius: 8px;">
                <h3 style="color: #155724; margin-top: 0;">Next Steps</h3>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Your center is now visible to donors</li>
                    <li>Update needs list regularly</li>
                    <li>Monitor donation requests</li>
                </ul>
                <p>Login to your dashboard: <a href="${CENTER_DASHBOARD_URL}">${CENTER_DASHBOARD_URL}</a></p>
            </div>
    
            <p style="color: #7f8c8d; margin-top: 25px;">
                Verification remains valid for 12 months. You'll receive reminders 60 days before expiration.
            </p>
        `);
    }

    centerStatusChangeTemplate(center, admin, previousStatus, reason, comments) {
        const mapLink = `https://www.google.com/maps?q=${center.location.coordinates[1]},${center.location.coordinates[0]}`;

        return this.generateTemplate(`
            <h2 style="color: ${this.getStatusColor(center.verification.status)};">
                Center Status Changed: ${center.verification.status.toUpperCase()}
            </h2>
            <p>Dear ${admin.name},</p>
            
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h3 style="color: #2980b9; margin-top: 0;">Status Details</h3>
                <p><strong>Center:</strong> ${center.name} (${center.center_id})</p>
                <p><strong>Previous Status:</strong> ${previousStatus.toUpperCase()}</p>
                <p><strong>New Status:</strong> ${center.verification.status.toUpperCase()}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                <p><strong>Location:</strong> 
                    <a href="${mapLink}" target="_blank">
                        ${center.location.coordinates[1].toFixed(6)}, 
                        ${center.location.coordinates[0].toFixed(6)}
                    </a>
                </p>
            </div>

            <div style="margin: 25px 0; padding: 15px; background: ${this.getStatusBackground(center.verification.status)}; border-radius: 8px;">
                <h3 style="color: ${this.getStatusTextColor(center.verification.status)}; margin-top: 0;">
                    Next Steps
                </h3>
                ${this.getStatusInstructions(center.verification.status)}
            </div>

            <p style="color: #7f8c8d; margin-top: 25px;">
                ${this.getStatusFooterText(center.verification.status)}
            </p>
        `);
    }

    getStatusColor(status) {
        const colors = {
            rejected: '#dc3545',
            verified: '#28a745',
            pending: '#ffc107'
        };
        return colors[status] || '#6c757d';
    }

    getStatusBackground(status) {
        const backgrounds = {
            rejected: '#fff3cd',
            verified: '#d4edda',
            pending: '#fff3cd'
        };
        return backgrounds[status] || '#f8f9fa';
    }

    getStatusInstructions(status) {
        const instructions = {
            rejected: `
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Review rejection reasons below</li>
                    <li>Address all documentation issues</li>
                    <li>Resubmit complete application</li>
                    <li>Allow 72 hours for re-review after resubmission</li>
                </ul>
                <p>Contact verification team for clarification:
                    <a href="mailto:${this.mailConfig.verificationEmail}">
                        ${this.mailConfig.verificationEmail}
                    </a>
                </p>
            `,
            verified: `
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Review and update center needs list</li>
                    <li>Verify contact information accuracy</li>
                    <li>Monitor donation requests dashboard</li>
                    <li>Schedule annual re-verification reminder</li>
                </ul>
                <p>Access center portal:
                    <a href="${this.mailConfig.portalUrl}">
                        ${this.mailConfig.portalUrl}
                    </a>
                </p>
            `,
            pending: `
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Ensure all documents are submitted</li>
                    <li>Verify contact information accuracy</li>
                    <li>Monitor email for update requests</li>
                    <li>Allow 5-7 business days for processing</li>
                </ul>
                <p>Check application status:
                    <a href="${this.mailConfig.statusUrl}">
                        ${this.mailConfig.statusUrl}
                    </a>
                </p>
            `,
            default: `
                <p>No specific instructions available for current status.
                Contact support for assistance:
                    <a href="mailto:${this.mailConfig.supportEmail}">
                        ${this.mailConfig.supportEmail}
                    </a>
                </p>
            `
        };
    
        return instructions[status] || instructions.default;
    }
    
    getStatusFooterText(status) {
        const footerMessages = {
            rejected: `This center is temporarily deactivated until resubmission and re-verification. 
                     All associated donor connections have been paused.`,
            verified: `Verification valid for 365 days from approval date. 
                      You'll receive renewal reminders starting 60 days before expiration.`,
            pending: `Application processing time may vary based on submission volume. 
                     Urgent requests? Contact our priority support team.`,
            default: `This is an automated status notification. 
                     Please do not reply to this email.`
        };
    
        return footerMessages[status] || footerMessages.default;
    }

    // Public email methods
    async sendVerificationEmail(email, userName, token) {
        const html = this.registrationTemplate({ userName, token });
        await this.sendEmail(email, "Complete Your Registration", html);
    }

    async sendPasswordResetEmail(email, userName, token) {
        const html = this.passwordResetTemplate({ userName, token });
        await this.sendEmail(email, "Password Reset Request", html);
    }

    async sendWelcomeEmail(email, userName) {
        const html = this.welcomeTemplate({ userName });
        await this.sendEmail(email, `Welcome to ${this.mailFromName}`, html);
    }

    async sendCenterRegistrationInitiationEmail(centerDoc) {
        const html = this.centerRegistrationInitiatedTemplate(centerDoc);

        await this.sendEmail(
            centerDoc.creator.email,
            `${centerDoc.name} Registration Received - Pending Approval`,
            html
        );
    }

    async sendCenterRegistrationAdminNotificationEmail(centerDoc) {
        const html =
            this.centerRegistrationAdminNotificationTemplate(centerDoc);

        await this.sendEmail(
            GMAIL_USER,
            `New Center Registration: ${centerDoc.name} - Pending Review`,
            html
        );
    }

    async sendDocumentRejectionEmail({
        admin,
        center,
        documentName,
        reason,
        comments,
    }) {
        const html = this.documentRejectionTemplate(
            admin,
            center,
            documentName,
            reason,
            comments
        );

        await this.sendEmail(
            admin.email,
            `Document Rejected - ${documentName}`,
            html
        );
    }

    async sendCenterVerifiedEmail({ admin, center }) {
        const html = this.centerVerifiedTemplate(admin, center);
        await this.sendEmail(
            admin.email,
            `Center Verified - ${center.name}`,
            html
        );
    }

    sendCenterStatusChangeEmail({ center, admin, previousStatus, reason, comments }) {
        const html = this.centerStatusChangeTemplate(center, admin, previousStatus, reason, comments);
        
        return this.sendEmail(
            admin.email,
            `Center Status Updated - ${center.name}`,
            html
        );
    }
}

const mailService = new MailService();

module.exports = {
    sendVerificationEmail: mailService.sendVerificationEmail.bind(mailService),
    sendPasswordResetEmail: mailService.sendPasswordResetEmail.bind(mailService),
    sendWelcomeEmail: mailService.sendWelcomeEmail.bind(mailService),
    sendCenterRegistrationInitiationEmail: mailService.sendCenterRegistrationInitiationEmail.bind(mailService),
    sendCenterRegistrationAdminNotificationEmail: mailService.sendCenterRegistrationAdminNotificationEmail.bind(mailService),
    sendDocumentRejectionEmail: mailService.sendDocumentRejectionEmail.bind(mailService),
    sendCenterVerifiedEmail: mailService.sendCenterVerifiedEmail.bind(mailService),
    sendCenterStatusChangeEmail: mailService.sendCenterStatusChangeEmail.bind(mailService)
};
