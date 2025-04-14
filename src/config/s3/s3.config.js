const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { AWS_S3_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = require("../config");

const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
});

async function getDocumentViewUrl(documentKey, expirationSeconds = 900) {
    const command = new GetObjectCommand({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: documentKey,
    });

    try {
        const url = await getSignedUrl(s3Client, command, {
            expiresIn: expirationSeconds,
        });
        return url;
    } catch (error) {
        console.error("Error generating presigned URL:", error);
        throw error;
    }
}

module.exports = { getDocumentViewUrl };
