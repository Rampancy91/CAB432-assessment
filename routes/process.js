const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, BUCKET_NAME } = require('../utils/s3Client');
const { verifyToken } = require('./auth');
const { videos } = require('./videos');

const router = express.Router();

let processingJobs = [];
let jobIdCounter = 1;

// Download from S3 to temp file
async function downloadFromS3(s3Key, localPath) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
    });
    
    const response = await s3Client.send(command);
    const stream = response.Body;
    
    return new Promise((resolve, reject) => {
        const writeStream = fsSync.createWriteStream(localPath);
        stream.pipe(writeStream);
        stream.on('error', reject);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}

// Upload to S3 from temp file
async function uploadToS3(localPath, s3Key) {
    const fileContent = await fs.readFile(localPath);
    
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'video/mp4'
    });
    
    await s3Client.send(command);
}

// CPU-intensive processing function
const transcodeVideo = async (s3InputKey, s3OutputKey, options, jobId) => {
    const tempDir = '/tmp';
    const tempInputPath = path.join(tempDir, `input-${jobId}.mp4`);
    const tempOutputPath = path.join(tempDir, `output-${jobId}.mp4`);

    try {
        console.log(`Job ${jobId}: Downloading from S3...`);
        await downloadFromS3(s3InputKey, tempInputPath);

        console.log(`Job ${jobId}: Starting transcoding...`);
        const job = processingJobs.find(j => j.id === jobId);
        if (job) job.status = 'processing';

        await new Promise((resolve, reject) => {
            const command = ffmpeg(tempInputPath)
                .videoCodec(options.videoCodec || 'libx264')
                .audioCodec(options.audioCodec || 'aac')
                .size(options.resolution || '720x480')
                .videoBitrate(options.videoBitrate || '1000k')
                .audioBitrate(options.audioBitrate || '128k')
                .fps(options.fps || 30)
                .output(tempOutputPath);

            if (options.preset) {
                command.addOption('-preset', options.preset);
            }
            if (options.crf) {
                command.addOption('-crf', options.crf);
            }

            command
                .on('start', (commandLine) => {
                    console.log(`Job ${jobId}: FFmpeg command: ${commandLine}`);
                    if (job) job.startedAt = new Date();
                })
                .on('progress', (progress) => {
                    console.log(`Job ${jobId}: ${progress.percent}%`);
                    if (job) {
                        job.progress = Math.round(progress.percent) || 0;
                        job.timeProcessed = progress.timemark;
                    }
                })
                .on('end', () => {
                    console.log(`Job ${jobId}: Transcoding completed`);
                    resolve();
                })
                .on('error', (err) => {
                    console.error(`Job ${jobId}: FFmpeg error:`, err.message);
                    reject(err);
                })
                .run();
        });

        console.log(`Job ${jobId}: Uploading to S3...`);
        await uploadToS3(tempOutputPath, s3OutputKey);

        // Cleanup temp files
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});

        if (job) {
            job.status = 'completed';
            job.completedAt = new Date();
            job.progress = 100;
        }

        return { success: true, s3Key: s3OutputKey };

    } catch (error) {
        // Cleanup on error
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});

        const job = processingJobs.find(j => j.id === jobId);
        if (job) {
            job.status = 'failed';
            job.error = error.message;
            job.failedAt = new Date();
        }

        throw error;
    }
};

// Start video processing
router.post('/transcode/:videoId', verifyToken, async (req, res) => {
    try {
        const videoId = parseInt(req.params.videoId);
        const video = videos.find(v => v.id === videoId);

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const {
            resolution = '720x480',
            videoCodec = 'libx264',
            audioCodec = 'aac',
            videoBitrate = '1000k',
            audioBitrate = '128k',
            preset = 'slow',
            crf = '23',
            fps = 30
        } = req.body;

        const jobId = jobIdCounter++;
        const s3OutputKey = `processed/${req.user.userId}/processed_${jobId}_${Date.now()}.mp4`;

        const job = {
            id: jobId,
            videoId: video.id,
            userId: req.user.userId,
            s3InputKey: video.s3Key,
            s3OutputKey: s3OutputKey,
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
        transcodeVideo(video.s3Key, s3OutputKey, job.options, jobId)
            .then(() => {
                video.processedVersions.push({
                    jobId: jobId,
                    s3Key: s3OutputKey,
                    s3Bucket: BUCKET_NAME,
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

        if (job.userId !== req.user.userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ job });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
});

// Get all processing jobs
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