require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Import routes
const { router: authRoutes } = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const processRoutes = require('./routes/process');

const app = express();
const PORT = process.env.PORT || 3000;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';

// AWS clients
const ssmClient = new SSMClient({ region: AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });

// Function to load parameter from Parameter Store
async function getParameter(name) {
    try {
        const command = new GetParameterCommand({ Name: name });
        const response = await ssmClient.send(command);
        return response.Parameter.Value;
    } catch (error) {
        console.error(`❌ Failed to load parameter ${name}:`, error.message);
        throw error;
    }
}

// Function to load secret from Secrets Manager
async function getSecret(secretId) {
    try {
        const command = new GetSecretValueCommand({ SecretId: secretId });
        const response = await secretsClient.send(command);
        return JSON.parse(response.SecretString);
    } catch (error) {
        console.error(`❌ Failed to load secret ${secretId}:`, error.message);
        throw error;
    }
}

// Load AWS configuration
async function loadAWSConfig() {
    console.log('Loading configuration from AWS...');
    
    try {
        // Load Cognito configuration
        const cognitoClientId = await getParameter('/n11676795/video-processor/cognito-client-id');
        const cognitoUserPoolId = await getParameter('/n11676795/video-processor/cognito-user-pool-id');
        const secrets = await getSecret('n11676795/video-processor/client-secret');
        const cognitoClientSecret = secrets.client_secret;
        
        // Load S3 and DynamoDB configuration
        const s3Bucket = await getParameter('/n11676795/video-processor/s3-bucket');
        const videosTable = await getParameter('/n11676795/video-processor/videos-table');
        const jobsTable = await getParameter('/n11676795/video-processor/jobs-table');

        // Load SQS
        const queueUrl = await getParameter('/n11676795/video-processor/queue-url');

        // Store in environment variables for use by routes
        process.env.COGNITO_CLIENT_ID = cognitoClientId;
        process.env.COGNITO_CLIENT_SECRET = cognitoClientSecret;
        process.env.COGNITO_USER_POOL_ID = cognitoUserPoolId;
        process.env.S3_BUCKET_NAME = s3Bucket;
        process.env.VIDEOS_TABLE = videosTable;
        process.env.JOBS_TABLE = jobsTable;
        process.env.QUEUE_URL = queueUrl;
        
        console.log('Configuration loaded successfully from AWS');
        console.log(`  S3 Bucket: ${s3Bucket}`);
        console.log(`  Videos Table: ${videosTable}`);
        console.log(`  Jobs Table: ${jobsTable}`);
        console.log(`  Cognito User Pool: ${cognitoUserPoolId}`);
        console.log(`  Cognito Client ID: ${cognitoClientId}`);
        console.log(`  Client Secret: ${'*'.repeat(cognitoClientSecret.length)} (hidden)`);
        console.log(`  Queue URL: ${queueUrl}`);
        
        return true;
    } catch (error) {
        console.error('Failed to load AWS configuration:', error);
        console.log('Falling back to environment variables from .env file');
        return false;
    }
}

// Initialize app
async function startApp() {
    // Load AWS configuration first
    await loadAWSConfig();
    
    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Ensure upload directories exist
    const dirs = ['uploads', 'processed', 'public'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/videos', videoRoutes);
    app.use('/api/process', processRoutes);

    // Serve processed videos statically
    app.use('/processed', express.static('processed'));
    app.use('/uploads', express.static('uploads'));

    // Basic health check
    app.get('/', (req, res) => {
        res.json({ 
            message: 'Video Processing Service API',
            status: 'running',
            config_loaded_from_aws: !!process.env.COGNITO_CLIENT_SECRET,
            endpoints: [
                'POST /api/auth/login',
                'POST /api/videos/upload',
                'GET /api/videos',
                'POST /api/process/transcode/:videoId',
                'GET /api/process/status/:jobId'
            ]
        });
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            config: {
                aws_region: AWS_REGION,
                cognito_configured: !!(process.env.COGNITO_CLIENT_ID && process.env.COGNITO_CLIENT_SECRET),
                parameters_loaded: !!process.env.COGNITO_CLIENT_ID,
                secrets_loaded: !!process.env.COGNITO_CLIENT_SECRET
            }
        });
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Access at: http://54.153.171.61:${PORT}`);
        console.log(`Health check: http://54.153.171.61:${PORT}/health`);
    });
}

// Start the application
startApp().catch(error => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
});