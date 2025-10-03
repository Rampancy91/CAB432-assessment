const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { s3Client, BUCKET_NAME } = require('../utils/s3Client');
const { docClient, VIDEOS_TABLE, JOBS_TABLE } = require('../utils/dynamoClient');
const { verifyToken } = require('./auth');

const router = express.Router();

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

// Update job status in DynamoDB
async function updateJobStatus(jobId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    let index = 0;
    for (const [key, value] of Object.entries(updates)) {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
        index++;
    }
    
    await docClient.send(new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
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
        await updateJobStatus(jobId, { 
            status: 'processing',
            startedAt: new Date().toISOString()
        });

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
                })
                .on('progress', async (progress) => {
                    console.log(`Job ${jobId}: ${progress.percent}%`);
                    await updateJobStatus(jobId, {
                        progress: Math.round(progress.percent) || 0,
                        timeProcessed: progress.timemark || 'N/A'
                    });
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

        await updateJobStatus(jobId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            progress: 100
        });

        return { success: true, s3Key: s3OutputKey };

    } catch (error) {
        // Cleanup on error
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});

        await updateJobStatus(jobId, {
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
        });

        throw error;
    }
};

// Start video processing
router.post('/transcode/:videoId', verifyToken, async (req, res) => {
    try {
        const videoId = req.params.videoId;
        
        // Get video from DynamoDB
        const videoResult = await docClient.send(new GetCommand({
            TableName: VIDEOS_TABLE,
            Key: { videoId }
        }));

        const video = videoResult.Item;

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (video.userId !== req.user.userId.toString() && req.user.role !== 'admin') {
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

        const jobId = uuidv4();
        const s3OutputKey = `processed/${req.user.userId}/processed_${jobId}_${Date.now()}.mp4`;

        const job = {
            jobId: jobId,
            videoId: video.videoId,
            userId: req.user.userId.toString(),
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
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null
        };

        // Save job to DynamoDB
        await docClient.send(new PutCommand({
            TableName: JOBS_TABLE,
            Item: job
        }));

        // Start processing asynchronously
        transcodeVideo(video.s3Key, s3OutputKey, job.options, jobId)
            .then(async () => {
                // Update video with processed version
                const updatedProcessedVersions = [
                    ...(video.processedVersions || []),
                    {
                        jobId: jobId,
                        s3Key: s3OutputKey,
                        s3Bucket: BUCKET_NAME,
                        options: job.options,
                        createdAt: new Date().toISOString()
                    }
                ];

                await docClient.send(new UpdateCommand({
                    TableName: VIDEOS_TABLE,
                    Key: { videoId: video.videoId },
                    UpdateExpression: 'SET processedVersions = :versions',
                    ExpressionAttributeValues: {
                        ':versions': updatedProcessedVersions
                    }
                }));
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

// Get processing status from DynamoDB
router.get('/status/:jobId', verifyToken, async (req, res) => {
    try {
        const result = await docClient.send(new GetCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: req.params.jobId }
        }));

        const job = result.Item;

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (job.userId !== req.user.userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ job });
    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
});

// Get all processing jobs from DynamoDB
router.get('/jobs', verifyToken, async (req, res) => {
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: JOBS_TABLE,
            IndexName: 'UserIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': req.user.userId.toString()
            }
        }));
        
        res.json({ jobs: result.Items || [] });
    } catch (error) {
        console.error('Get jobs error:', error);
        res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

module.exports = router;