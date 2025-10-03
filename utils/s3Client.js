const { S3Client } = require('@aws-sdk/client-s3');

// S3 client configuration
const s3Client = new S3Client({ 
    region: process.env.AWS_REGION || 'ap-southeast-2',
    // For local development, AWS SDK will use your local credentials
    // On EC2, it will automatically use the IAM role
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'cab432-video-processor-n11676795';

module.exports = { s3Client, BUCKET_NAME };