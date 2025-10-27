require('dotenv').config();
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { getS3Client, getBucketName } = require('./utils/s3Client');
const { getDocClient, getTablesNames } = require('./utils/dynamoClient');
const { receiveMessages, deleteMessage } = require('./utils/sqsClient');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const ssmClient = new SSMClient({ region: AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });

// Load parameter from Parameter Store
async function getParameter(name) {
    const command = new GetParameterCommand({ Name: name });
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
}

// Load secret from Secrets Manager
async function getSecret(secretId) {
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await secretsClient.send(command);
    return JSON.parse(response.SecretString);
}

//Load AWS configuration
async function loadAWSConfig() {
    console.log('Loading worker configuration from AWS...');
    
    try {
        const s3Bucket = await getParameter('/n11676795/video-processor/s3-bucket');
        const videosTable = await getParameter('/n11676795/video-processor/videos-table');
        const jobsTable = await getParameter('/n11676795/video-processor/jobs-table');
        const queueUrl = await getParameter('/n11676795/video-processor/queue-url');
        const dlqUrl = await getParameter('/n11676795/video-processor/dlq-url');  // ADD THIS
        
        process.env.S3_BUCKET_NAME = s3Bucket;
        process.env.VIDEOS_TABLE = videosTable;
        process.env.JOBS_TABLE = jobsTable;
        process.env.QUEUE_URL = queueUrl;
        process.env.DLQ_URL = dlqUrl;  // ADD THIS
        
        console.log('Worker configuration loaded successfully');
        console.log(`  S3 Bucket: ${s3Bucket}`);
        console.log(`  Jobs Table: ${jobsTable}`);
        console.log(`  Queue URL: ${queueUrl}`);
        console.log(`  DLQ URL: ${dlqUrl}`);  // ADD THIS
        
        return true;
    } catch (error) {
        console.error('Failed to load AWS configuration:', error);
        return false;
    }
}

// Download from S3 to temp file
async function downloadFromS3(s3Client, bucketName, s3Key, localPath) {
    const command = new GetObjectCommand({
        Bucket: bucketName,
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
async function uploadToS3(s3Client, bucketName, localPath, s3Key) {
    const fileContent = await fs.readFile(localPath);
    
    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'video/mp4'
    });
    
    await s3Client.send(command);
}

// Update job status in DynamoDB
async function updateJobStatus(docClient, jobsTable, jobId, updates) {
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
        TableName: jobsTable,
        Key: { jobId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
}

// CPU-intensive processing function
async function transcodeVideo(s3InputKey, s3OutputKey, options, jobId) {
    const s3Client = getS3Client();
    const BUCKET_NAME = getBucketName();
    const docClient = getDocClient();
    const JOBS_TABLE = getTablesNames().JOBS_TABLE;
    
    const tempDir = '/tmp';
    const tempInputPath = path.join(tempDir, `input-${jobId}.mp4`);
    const tempOutputPath = path.join(tempDir, `output-${jobId}.mp4`);

    try {
        console.log(`Job ${jobId}: Downloading from S3...`);
        await downloadFromS3(s3Client, BUCKET_NAME, s3InputKey, tempInputPath);

        console.log(`Job ${jobId}: Starting transcoding...`);
        await updateJobStatus(docClient, JOBS_TABLE, jobId, { 
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
                    await updateJobStatus(docClient, JOBS_TABLE, jobId, {
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
        await uploadToS3(s3Client, BUCKET_NAME, tempOutputPath, s3OutputKey);

        // Cleanup temp files
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});

        await updateJobStatus(docClient, JOBS_TABLE, jobId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            progress: 100
        });

        return { success: true, s3Key: s3OutputKey };

    } catch (error) {
        // Cleanup on error
        await fs.unlink(tempInputPath).catch(() => {});
        await fs.unlink(tempOutputPath).catch(() => {});

        await updateJobStatus(docClient, JOBS_TABLE, jobId, {
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
        });

        throw error;
    }
}

// Process messages from Dead Letter Queue
async function processDLQ() {
    const DLQ_URL = process.env.DLQ_URL;
    
    if (!DLQ_URL) {
        console.log('DLQ URL not configured, skipping DLQ processing');
        return;
    }

    console.log('Checking DLQ for failed messages...');
    
    const { receiveMessages, deleteMessage } = require('./utils/sqsClient');
    const docClient = getDocClient();
    const JOBS_TABLE = getTablesNames().JOBS_TABLE;
    
    // Temporarily override queue URL to read from DLQ
    const originalQueueUrl = process.env.QUEUE_URL;
    process.env.QUEUE_URL = DLQ_URL;
    
    try {
        const messages = await receiveMessages(1, 5); // Short poll
        
        if (messages.length > 0) {
            for (const message of messages) {
                try {
                    const job = JSON.parse(message.Body);
                    console.log(`DLQ: Found failed job ${job.jobId}`);
                    
                    // Mark job as permanently failed in DynamoDB
                    await updateJobStatus(docClient, JOBS_TABLE, job.jobId, {
                        status: 'permanently_failed',
                        error: 'Job failed after maximum retries (moved to DLQ)',
                        failedAt: new Date().toISOString(),
                        retriedCount: 3
                    });
                    
                    console.log(`DLQ: Marked job ${job.jobId} as permanently failed in DynamoDB`);
                    
                    // Delete from DLQ after handling
                    await deleteMessage(message.ReceiptHandle);
                    console.log(`DLQ: Removed job ${job.jobId} from DLQ`);
                    
                } catch (error) {
                    console.error('Error processing DLQ message:', error);
                }
            }
        }
    } finally {
        // Restore original queue URL
        process.env.QUEUE_URL = originalQueueUrl;
    }
}

// Main worker loop
async function processQueue() {
    console.log('Worker started. Polling for messages...');
    
    let dlqCheckCounter = 0;
    
    while (true) {
        try {
            // Check DLQ every 10 iterations (~every 3-4 minutes)
            if (dlqCheckCounter >= 10) {
                await processDLQ();
                dlqCheckCounter = 0;
            }
            dlqCheckCounter++;
            
            // Normal queue processing
            const messages = await receiveMessages(1, 20);
            
            if (messages.length === 0) {
                console.log('No messages. Continuing to poll...');
                continue;
            }
            
            for (const message of messages) {
                try {
                    const job = JSON.parse(message.Body);
                    console.log(`Received job: ${job.jobId}`);
                    
                    // Process the video
                    await transcodeVideo(
                        job.s3InputKey,
                        job.s3OutputKey,
                        job.options || {},
                        job.jobId
                    );
                    
                    console.log(`Job ${job.jobId} completed successfully`);
                    
                    // Delete message from queue
                    await deleteMessage(message.ReceiptHandle);
                    console.log(`Deleted message for job ${job.jobId}`);
                    
                } catch (error) {
                    console.error('Error processing message:', error);
                    // Don't delete - message will retry and eventually go to DLQ
                }
            }
            
        } catch (error) {
            console.error('Error in worker loop:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

//Start worker
async function startWorker() {
    await loadAWSConfig();
    console.log('DEBUG - Queue URL loaded:', process.env.QUEUE_URL);
    console.log('Starting video processing worker...');
    await processQueue();
}

startWorker().catch(error => {
    console.error('Worker failed to start:', error);
    process.exit(1);
});