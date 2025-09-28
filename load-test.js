const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT_REQUESTS = 4; // Adjust based on your needs
const TEST_DURATION_MS = 5 * 60 * 1000; // 5 minutes

let authToken = '';

// Login function
async function login() {
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        authToken = response.data.token;
        console.log('Logged in successfully');
        return true;
    } catch (error) {
        console.error('Login failed:', error.response?.data || error.message);
        return false;
    }
}

// Create a test video file (generates a simple test video using FFmpeg)
async function createTestVideo() {
    const { spawn } = require('child_process');
    const testVideoPath = 'test-video.mp4';
    
    if (fs.existsSync(testVideoPath)) {
        console.log('Test video already exists');
        return testVideoPath;
    }

    console.log('Creating test video...');
    
    return new Promise((resolve, reject) => {
        // Create a 30-second test video with moving pattern
        const ffmpegProcess = spawn('ffmpeg', [
            '-f', 'lavfi',
            '-i', 'testsrc=duration=30:size=640x480:rate=30',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            testVideoPath,
            '-y' // Overwrite if exists
        ]);

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Test video created successfully');
                resolve(testVideoPath);
            } else {
                reject(new Error(`FFmpeg process exited with code ${code}`));
            }
        });

        ffmpegProcess.on('error', reject);
    });
}

// Upload a video
async function uploadVideo(videoPath) {
    try {
        const form = new FormData();
        form.append('video', fs.createReadStream(videoPath));

        const response = await axios.post(`${BASE_URL}/api/videos/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('Video uploaded:', response.data.video.id);
        return response.data.video.id;
    } catch (error) {
        console.error('Upload failed:', error.response?.data || error.message);
        return null;
    }
}

// Start CPU-intensive transcoding
async function startTranscoding(videoId, jobNumber) {
    try {
        // Use CPU-intensive settings
        const processingOptions = {
            resolution: '1280x720', // Higher resolution
            preset: 'veryslow', // Most CPU-intensive preset
            crf: '18', // Higher quality = more CPU usage
            videoBitrate: '2000k',
            fps: 30
        };

        const response = await axios.post(
            `${BASE_URL}/api/process/transcode/${videoId}`,
            processingOptions,
            {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`Started transcoding job ${jobNumber}: Job ID ${response.data.jobId}`);
        return response.data.jobId;
    } catch (error) {
        console.error(`Transcoding ${jobNumber} failed:`, error.response?.data || error.message);
        return null;
    }
}

// Monitor job status
async function monitorJob(jobId, jobNumber) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < TEST_DURATION_MS) {
        try {
            const response = await axios.get(`${BASE_URL}/api/process/status/${jobId}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            const job = response.data.job;
            console.log(`Job ${jobNumber} (${jobId}): ${job.status} - ${job.progress}%`);

            if (job.status === 'completed' || job.status === 'failed') {
                console.log(`Job ${jobNumber} finished with status: ${job.status}`);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
        } catch (error) {
            console.error(`Error checking job ${jobNumber}:`, error.response?.data || error.message);
            break;
        }
    }
}

// Main load testing function
async function runLoadTest() {
    console.log('Starting CPU load test...');
    
    // Login
    if (!(await login())) {
        console.error('Cannot proceed without authentication');
        return;
    }

    // Create test video
    let testVideoPath;
    try {
        testVideoPath = await createTestVideo();
    } catch (error) {
        console.error('Failed to create test video:', error.message);
        return;
    }

    // Upload video once
    const videoId = await uploadVideo(testVideoPath);
    if (!videoId) {
        console.error('Failed to upload test video');
        return;
    }

    console.log(`Starting ${CONCURRENT_REQUESTS} concurrent transcoding jobs...`);
    console.log(`Test will run for ${TEST_DURATION_MS / 1000} seconds`);
    console.log('Monitor your EC2 CPU usage in AWS Console!');

    // Start multiple concurrent transcoding jobs
    const jobPromises = [];
    for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
        const jobPromise = startTranscoding(videoId, i)
            .then(jobId => {
                if (jobId) {
                    return monitorJob(jobId, i);
                }
            });
        jobPromises.push(jobPromise);
        
        // Small delay between starting jobs
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Wait for all jobs to complete or timeout
    await Promise.all(jobPromises);
    
    console.log('Load test completed!');
}

// Run the test
if (require.main === module) {
    runLoadTest().catch(console.error);
}

module.exports = { runLoadTest, login, uploadVideo, startTranscoding };