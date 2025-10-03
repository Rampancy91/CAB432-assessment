const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-2',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'cab432-video-processor-n11676795';

// Add function exports that routes expect
function getS3Client() {
    return s3Client;
}

function getBucketName() {
    return BUCKET_NAME;
}

module.exports = { 
    s3Client, 
    BUCKET_NAME,
    getS3Client,      
    getBucketName     
};