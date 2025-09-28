const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('./auth');

const router = express.Router();

// In-memory storage for video metadata (in real app, this would be a database)
let videos = [];
let videoIdCounter = 1;

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Accept video files only
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
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Upload video endpoint
router.post('/upload', verifyToken, upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        const videoMetadata = {
            id: videoIdCounter++,
            userId: req.user.userId,
            originalName: req.file.originalname,
            filename: req.file.filename,
            path: req.file.path,
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
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get user's videos
router.get('/', verifyToken, (req, res) => {
    try {
        // Return videos owned by the current user
        const userVideos = videos.filter(video => 
            video.userId === req.user.userId || req.user.role === 'admin'
        );
        
        res.json({ videos: userVideos });
    } catch (error) {
        console.error('Get videos error:', error);
        res.status(500).json({ error: 'Failed to fetch videos' });
    }
});

// Get specific video details
router.get('/:videoId', verifyToken, (req, res) => {
    try {
        const videoId = parseInt(req.params.videoId);
        const video = videos.find(v => v.id === videoId);

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Check permissions
        if (video.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ video });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Failed to fetch video' });
    }
});

// Delete video
router.delete('/:videoId', verifyToken, (req, res) => {
    try {
        const videoId = parseInt(req.params.videoId);
        const videoIndex = videos.findIndex(v => v.id === videoId);

        if (videoIndex === -1) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const video = videos[videoIndex];

        // Check permissions
        if (video.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Delete file from disk
        if (fs.existsSync(video.path)) {
            fs.unlinkSync(video.path);
        }

        // Delete processed versions
        video.processedVersions.forEach(processed => {
            if (fs.existsSync(processed.path)) {
                fs.unlinkSync(processed.path);
            }
        });

        // Remove from memory
        videos.splice(videoIndex, 1);

        res.json({ message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

module.exports = { router, videos };