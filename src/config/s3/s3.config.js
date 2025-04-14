const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { AWS_S3_BUCKET_NAME } = require("../config");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function getDocumentViewUrl(documentKey, expirationSeconds = 900) {
    const command = new GetObjectCommand({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: documentKey,
    });

    try {
        const url = await getSignedUrl(s3, command, {
            expiresIn: expirationSeconds,
        });
        return url;
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        throw error;
    }
}

module.exports = { getDocumentViewUrl };
