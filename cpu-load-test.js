const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration - UPDATE THESE
const BASE_URL = process.env.BASE_URL || 'http://16.176.160.216:3000';
const USERNAME = 'admin';
const PASSWORD = 'admin123';
const TEST_VIDEOS = ['test-video-1.mp4', 'test-video-2.mp4', 'test-video-3.mp4'];

// CPU-intensive transcoding configurations
const TRANSCODING_JOBS = [
    {
        name: 'Ultra High Quality',
        config: {
            resolution: '1920x1080',
            preset: 'veryslow',
            crf: '16',
            videoBitrate: '8000k',
            fps: 60
        }
    },
    {
        name: 'High Quality',
        config: {
            resolution: '1280x720',
            preset: 'veryslow',
            crf: '18',
            videoBitrate: '4000k',
            fps: 30
        }
    },
    {
        name: 'Medium Quality Intensive',
        config: {
            resolution: '854x480',
            preset: 'slow',
            crf: '20',
            videoBitrate: '2000k',
            fps: 30
        }
    }
];

let authToken = '';
let uploadedVideos = [];

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const httpModule = options.protocol === 'https:' ? https : http;
        
        const req = httpModule.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${jsonData.error || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${data}`));
                }
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Helper function to create multipart form data
function createMultipartFormData(fields, files) {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2, 15);
    let body = '';
    
    // Add text fields
    for (const [key, value] of Object.entries(fields)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += `${value}\r\n`;
    }
    
    // Add files
    for (const [key, filePath] of Object.entries(files)) {
        const fileName = path.basename(filePath);
        const fileData = fs.readFileSync(filePath);
        
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"; filename="${fileName}"\r\n`;
        body += `Content-Type: video/mp4\r\n\r\n`;
        body += fileData;
        body += '\r\n';
    }
    
    body += `--${boundary}--\r\n`;
    
    return {
        body: Buffer.from(body, 'binary'),
        contentType: `multipart/form-data; boundary=${boundary}`
    };
}

// Login function
async function login() {
    try {
        console.log('Logging in...');
        
        const url = new URL(`${BASE_URL}/api/auth/login`);
        const postData = JSON.stringify({
            username: USERNAME,
            password: PASSWORD
        });
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const response = await makeRequest(options, postData);
        authToken = response.token;
        console.log('Login successful');
        return true;
    } catch (error) {
        console.error('Login failed:', error.message);
        return false;
    }
}

// Upload video function
async function uploadVideo(videoPath) {
    try {
        console.log(`Uploading ${videoPath}...`);
        
        if (!fs.existsSync(videoPath)) {
            console.error(`File not found: ${videoPath}`);
            return null;
        }
        
        const url = new URL(`${BASE_URL}/api/videos/upload`);
        const formData = createMultipartFormData({}, { video: videoPath });
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': formData.contentType,
                'Content-Length': formData.body.length
            }
        };
        
        const response = await makeRequest(options, formData.body);
        console.log(`Uploaded ${videoPath} - Video ID: ${response.video.id}`);
        return response.video.id;
    } catch (error) {
        console.error(`Upload failed for ${videoPath}:`, error.message);
        return null;
    }
}

// Start transcoding job
async function startTranscodingJob(videoId, jobConfig, jobName) {
    try {
        console.log(`Starting ${jobName} job for video ${videoId}...`);
        
        const url = new URL(`${BASE_URL}/api/process/transcode/${videoId}`);
        const postData = JSON.stringify(jobConfig.config);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const response = await makeRequest(options, postData);
        console.log(`Started ${jobName} - Job ID: ${response.jobId}`);
        return {
            jobId: response.jobId,
            name: jobName,
            videoId: videoId
        };
    } catch (error) {
        console.error(`Failed to start ${jobName}:`, error.message);
        return null;
    }
}

// Monitor job status
async function monitorJob(job) {
    try {
        const url = new URL(`${BASE_URL}/api/process/status/${job.jobId}`);
        
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        };
        
        const response = await makeRequest(options);
        const jobData = response.job;
        console.log(`${job.name} (Job ${job.jobId}): ${jobData.status} - ${jobData.progress || 0}%`);
        
        return jobData.status;
    } catch (error) {
        console.error(`Error checking job ${job.jobId}:`, error.message);
        return 'error';
    }
}

// Main load test function
async function runCPULoadTest() {
    console.log('🚀 Starting CPU Load Test...');
    console.log(`📡 Target: ${BASE_URL}`);
    
    // Step 1: Login
    if (!(await login())) {
        console.error('Cannot proceed without authentication');
        return;
    }

    // Step 2: Upload all test videos
    console.log('\n📤 Uploading test videos...');
    for (const videoFile of TEST_VIDEOS) {
        const videoId = await uploadVideo(videoFile);
        if (videoId) {
            uploadedVideos.push({ file: videoFile, id: videoId });
        }
    }

    if (uploadedVideos.length === 0) {
        console.error('❌ No videos uploaded successfully');
        return;
    }

    // Step 3: Start multiple transcoding jobs
    console.log('\n🔄 Starting CPU-intensive transcoding jobs...');
    const activeJobs = [];
    
    for (let i = 0; i < uploadedVideos.length && i < TRANSCODING_JOBS.length; i++) {
        const video = uploadedVideos[i];
        const jobConfig = TRANSCODING_JOBS[i];
        
        const job = await startTranscodingJob(video.id, jobConfig, jobConfig.name);
        if (job) {
            activeJobs.push(job);
        }
        
        // Small delay between starting jobs
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 4: Monitor jobs
    console.log('\n📊 Monitoring job progress...');
    console.log('🔥 CPU should be at 80-100% now! Check your EC2 monitoring!');
    
    const monitoringInterval = setInterval(async () => {
        console.log('\n--- Job Status Update ---');
        
        let activeCount = 0;
        for (const job of activeJobs) {
            const status = await monitorJob(job);
            if (status === 'processing' || status === 'queued') {
                activeCount++;
            }
        }
        
        if (activeCount === 0) {
            console.log('\n🎉 All jobs completed!');
            clearInterval(monitoringInterval);
        }
    }, 15000); // Check every 15 seconds

    console.log('\nLoad test running... Press Ctrl+C to stop monitoring');
}

// Handle errors and run
if (require.main === module) {
    // Check if video files exist
    const missingFiles = TEST_VIDEOS.filter(file => !fs.existsSync(file));
    if (missingFiles.length > 0) {
        console.error('❌ Missing video files:', missingFiles);
        console.log('📝 Please run the create-test-videos script first');
        process.exit(1);
    }

    runCPULoadTest().catch(console.error);
}