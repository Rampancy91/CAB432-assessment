const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('./auth');
const { videos } = require('./videos');

const router = express.Router();

// In-memory job storage (in real app, this would be a database)
let processingJobs = [];
let jobIdCounter = 1;

// CPU-intensive processing function
const transcodeVideo = (inputPath, outputPath, options, jobId) => {
    return new Promise((resolve, reject) => {
        console.log(`Starting transcoding job ${jobId}: ${inputPath} -> ${outputPath}`);
        
        const job = processingJobs.find(j => j.id === jobId);
        if (job) job.status = 'processing';

        const command = ffmpeg(inputPath)
            .videoCodec(options.videoCodec || 'libx264')
            .audioCodec(options.audioCodec || 'aac')
            .size(options.resolution || '720x480')
            .videoBitrate(options.videoBitrate || '1000k')
            .audioBitrate(options.audioBitrate || '128k')
            .fps(options.fps || 30)
            .output(outputPath);

        // Add CPU-intensive settings for better load testing
        if (options.preset) {
            command.addOption('-preset', options.preset); // 'slow' or 'veryslow' for more CPU usage
        }
        if (options.crf) {
            command.addOption('-crf', options.crf); // Lower values = higher quality = more CPU usage
        }

        command
            .on('start', (commandLine) => {
                console.log('FFmpeg command: ' + commandLine);
                if (job) job.startedAt = new Date();
            })
            .on('progress', (progress) => {
                console.log(`Job ${jobId} progress: ${progress.percent}%`);
                if (job) {
                    job.progress = Math.round(progress.percent) || 0;
                    job.timeProcessed = progress.timemark;
                }
            })
            .on('end', () => {
                console.log(`Job ${jobId} completed successfully`);
                if (job) {
                    job.status = 'completed';
                    job.completedAt = new Date();
                    job.progress = 100;
                }
                resolve({ success: true, outputPath });
            })
            .on('error', (err) => {
                console.error(`Job ${jobId} failed:`, err.message);
                if (job) {
                    job.status = 'failed';
                    job.error = err.message;
                    job.failedAt = new Date();
                }
                reject(err);
            })
            .run();
    });
};

// Start video processing
router.post('/transcode/:videoId', verifyToken, async (req, res) => {
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

        const {
            resolution = '720x480',
            videoCodec = 'libx264',
            audioCodec = 'aac',
            videoBitrate = '1000k',
            audioBitrate = '128k',
            preset = 'slow', // slow/veryslow for more CPU usage
            crf = '23', // Lower = higher quality = more CPU
            fps = 30
        } = req.body;

        // Create processing job
        const jobId = jobIdCounter++;
        const outputFilename = `processed_${jobId}_${Date.now()}.mp4`;
        const outputPath = path.join('processed', outputFilename);

        const job = {
            id: jobId,
            videoId: video.id,
            userId: req.user.userId,
            inputPath: video.path,
            outputPath: outputPath,
            options: {
                resolution,
                videoCodec,
                audioCodec,
                videoBitrate,
                audioBitrate,
                preset,
                crf,
                fps
            },
            status: 'queued',
            progress: 0,
            createdAt: new Date(),
            startedAt: null,
            completedAt: null
        };

        processingJobs.push(job);

        // Start processing asynchronously
        transcodeVideo(video.path, outputPath, job.options, jobId)
            .then((result) => {
                // Add processed version to video metadata
                video.processedVersions.push({
                    jobId: jobId,
                    filename: outputFilename,
                    path: outputPath,
                    options: job.options,
                    createdAt: new Date()
                });
            })
            .catch((error) => {
                console.error('Processing failed:', error);
            });

        res.json({
            message: 'Processing started',
            jobId: jobId,
            status: 'queued'
        });

    } catch (error) {
        console.error('Transcode start error:', error);
        res.status(500).json({ error: 'Failed to start processing' });
    }
});

// Get processing status
router.get('/status/:jobId', verifyToken, (req, res) => {
    try {
        const jobId = parseInt(req.params.jobId);
        const job = processingJobs.find(j => j.id === jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Check permissions
        if (job.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ job });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
});

// Get all processing jobs for user
router.get('/jobs', verifyToken, (req, res) => {
    try {
        const userJobs = processingJobs.filter(job => 
            job.userId === req.user.userId || req.user.role === 'admin'
        );
        
        res.json({ jobs: userJobs });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

module.exports = router;