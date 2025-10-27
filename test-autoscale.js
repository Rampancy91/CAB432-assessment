const axios = require('axios');

const BASE_URL = 'http://3.106.238.34:3000'
const USERNAME = 'testuser';
const PASSWORD = 'TestPassword123!';

let authToken = '';

// Login
async function login() {
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            username: USERNAME,
            password: PASSWORD
        });
        authToken = response.data.idToken;
        console.log('✓ Logged in successfully');
        return true;
    } catch (error) {
        console.error('✗ Login failed:', error.response?.data || error.message);
        return false;
    }
}

// Get list of videos
async function getVideos() {
    try {
        const response = await axios.get(`${BASE_URL}/api/videos`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        return response.data.videos;
    } catch (error) {
        console.error('✗ Failed to get videos:', error.response?.data || error.message);
        return [];
    }
}

// Start CPU-intensive transcoding job
async function startTranscoding(videoId, jobNumber) {
    try {
        const options = {
            resolution: '1280x720',
            preset: 'veryslow',  // Most CPU intensive
            crf: '18',
            videoBitrate: '2000k',
            fps: 30
        };

        const response = await axios.post(
            `${BASE_URL}/api/process/transcode/${videoId}`,
            options,
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );

        console.log(`✓ Job ${jobNumber}: Queued (${response.data.jobId})`);
        return response.data.jobId;
    } catch (error) {
        console.error(`✗ Job ${jobNumber} failed:`, error.response?.data || error.message);
        return null;
    }
}

// Main load test
async function runLoadTest() {
    console.log('=== Starting Auto-scale Load Test ===\n');

    // Login
    if (!await login()) {
        return;
    }

    // Get available videos
    console.log('Fetching videos...');
    const videos = await getVideos();
    
    if (videos.length === 0) {
        console.error('No videos found. Upload a video first!');
        return;
    }

    console.log(`Found ${videos.length} video(s)\n`);

    // Queue multiple CPU-intensive jobs
    console.log('Queueing 6 CPU-intensive transcoding jobs...');
    console.log('(This should trigger scaling from 1 → 2 → 3 workers)\n');

    const jobPromises = [];
    for (let i = 1; i <= 6; i++) {
        // Use first video for all jobs
        jobPromises.push(startTranscoding(videos[0].videoId, i));
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    await Promise.all(jobPromises);

    console.log('\n=== All jobs queued! ===');
    console.log('Now watch your ECS Service:');
    console.log('1. Go to AWS Console → ECS → Your Service');
    console.log('2. Watch the "Desired tasks" count increase');
    console.log('3. Go to CloudWatch → Alarms to see CPU metrics');
    console.log('4. Tasks should scale: 1 → 2 → 3 over the next few minutes');
}

runLoadTest().catch(console.error);