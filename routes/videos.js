const express = require('express');
const multer = require('multer');
const path = require('path');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../utils/s3Client');
const { verifyToken } = require('./auth');

const router = express.Router();

let videos = [];
let videoIdCounter = 1;

// Change to memory storage for S3
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

// Upload video to S3
router.post('/upload', verifyToken, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        const s3Key = `uploads/${req.user.userId}/${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;

        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        await s3Client.send(new PutObjectCommand(uploadParams));

        const videoMetadata = {
            id: videoIdCounter++,
            userId: req.user.userId,
            originalName: req.file.originalname,
            s3Key: s3Key,
            s3Bucket: BUCKET_NAME,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date(),
            processedVersions: []
        };

        videos.push(videoMetadata);

        res.json({
            message: 'Video uploaded successfully',
            video: videoMetadata
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Get user's videos
router.get('/', verifyToken, (req, res) => {
    try {
        const userVideos = videos.filter(video => 
            video.userId === req.user.userId || req.user.role === 'admin'
        );
        
        res.json({ videos: userVideos });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Get specific video
router.get('/:videoId', verifyToken, (req, res) => {
    try {
        const videoId = parseInt(req.params.videoId);
        const video = videos.find(v => v.id === videoId);

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ video });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Delete video from S3
router.delete('/:videoId', verifyToken, async (req, res) => {
    try {
        const videoId = parseInt(req.params.videoId);
        const videoIndex = videos.findIndex(v => v.id === videoId);

        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videos[videoIndex];

        if (video.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete from S3
        const deleteParams = {
            Bucket: BUCKET_NAME,
            Key: video.s3Key
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));

        // Delete processed versions
        for (const processed of video.processedVersions) {
            const deleteProcessed = {
                Bucket: BUCKET_NAME,
                Key: processed.s3Key
            };
            await s3Client.send(new DeleteObjectCommand(deleteProcessed));
        }

        videos.splice(videoIndex, 1);

        res.json({ message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

module.exports = { router, videos };