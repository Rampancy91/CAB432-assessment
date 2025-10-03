const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutCommand, GetCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { getS3Client, getBucketName } = require('../utils/s3Client');
const { getDocClient, getTablesNames } = require('../utils/dynamoClient');
const { verifyToken } = require('./auth');

const router = express.Router();

// Get initialized clients
const getClients = () => {
    return {
        s3Client: getS3Client(),
        BUCKET_NAME: getBucketName(),
        docClient: getDocClient(),
        VIDEOS_TABLE: getTablesNames().VIDEOS_TABLE
    };
};

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only video files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

// Get pre-signed URL for upload
router.get('/upload-url', verifyToken, async (req, res) => {
    try {
        const { filename, contentType } = req.query;
        
        if (!filename || !contentType) {
            return res.status(400).json({ error: 'filename and contentType required' });
        }

        const { s3Client, BUCKET_NAME } = getClients();
        const videoId = uuidv4();
        const s3Key = `uploads/${req.user.userId}/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(filename)}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        res.json({
            uploadUrl,
            videoId,
            s3Key,
            filename
        });

    } catch (error) {
        console.error('Generate upload URL error:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

// Confirm upload and save metadata
router.post('/confirm-upload', verifyToken, async (req, res) => {
    try {
        const { videoId, s3Key, originalName, size, mimetype } = req.body;

        if (!videoId || !s3Key || !originalName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const { docClient, VIDEOS_TABLE, BUCKET_NAME } = getClients();

        const videoMetadata = {
            videoId,
            userId: req.user.userId.toString(),
            originalName,
            s3Key,
            s3Bucket: BUCKET_NAME,
            size: size || 0,
            mimetype: mimetype || 'video/mp4',
            uploadedAt: new Date().toISOString(),
            processedVersions: []
        };

        await docClient.send(new PutCommand({
            TableName: VIDEOS_TABLE,
            Item: videoMetadata
        }));

        res.json({
            message: 'Video upload confirmed',
            video: videoMetadata
        });

    } catch (error) {
        console.error('Confirm upload error:', error);
        res.status(500).json({ error: 'Failed to confirm upload' });
    }
});

// Get pre-signed URL for download
router.get('/:videoId/download-url', verifyToken, async (req, res) => {
    try {
        const { s3Client, BUCKET_NAME, docClient, VIDEOS_TABLE } = getClients();
        
        const result = await docClient.send(new GetCommand({
            TableName: VIDEOS_TABLE,
            Key: { videoId: req.params.videoId }
        }));

        const video = result.Item;

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: video.s3Key
        });

        const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        res.json({
            downloadUrl,
            filename: video.originalName
        });

    } catch (error) {
        console.error('Generate download URL error:', error);
        res.status(500).json({ error: 'Failed to generate download URL' });
    }
});

// Kept the old upload method for backwards compatibility
router.post('/upload', verifyToken, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        const { s3Client, BUCKET_NAME, docClient, VIDEOS_TABLE } = getClients();
        const videoId = uuidv4();
        const s3Key = `uploads/${req.user.userId}/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;

        // Upload to S3
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };
        await s3Client.send(new PutObjectCommand(uploadParams));

        // Save metadata to DynamoDB
        const videoMetadata = {
            videoId: videoId,
            userId: req.user.userId.toString(),
            originalName: req.file.originalname,
            s3Key: s3Key,
            s3Bucket: BUCKET_NAME,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
            processedVersions: []
        };

        await docClient.send(new PutCommand({
            TableName: VIDEOS_TABLE,
            Item: videoMetadata
        }));

        res.json({
            message: 'Video uploaded successfully',
            video: videoMetadata
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Get user's videos from DynamoDB
router.get('/', verifyToken, async (req, res) => {
    try {
        const { docClient, VIDEOS_TABLE } = getClients();
        const params = {
            TableName: VIDEOS_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': req.user.userId.toString()
            }
        };

        const result = await docClient.send(new QueryCommand(params));
        
        res.json({ videos: result.Items || [] });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Get specific video from DynamoDB
router.get('/:videoId', verifyToken, async (req, res) => {
    try {
        const { docClient, VIDEOS_TABLE } = getClients();
        const result = await docClient.send(new GetCommand({
            TableName: VIDEOS_TABLE,
            Key: { videoId: req.params.videoId }
        }));

        const video = result.Item;

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ video });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Delete video from S3 and DynamoDB
router.delete('/:videoId', verifyToken, async (req, res) => {
    try {
        const { s3Client, BUCKET_NAME, docClient, VIDEOS_TABLE } = getClients();
        const result = await docClient.send(new GetCommand({
            TableName: VIDEOS_TABLE,
            Key: { videoId: req.params.videoId }
        }));

        const video = result.Item;

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete from S3
        await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: video.s3Key
        }));

        // Delete processed versions
        for (const processed of (video.processedVersions || [])) {
            await s3Client.send(new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: processed.s3Key
            }));
        }

        // Delete from DynamoDB
        await docClient.send(new DeleteCommand({
            TableName: VIDEOS_TABLE,
            Key: { videoId: req.params.videoId }
        }));

        res.json({ message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

module.exports = router;