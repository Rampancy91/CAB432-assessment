require('dotenv').config();
const express = require('express');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes
const { router: authRoutes } = require('./routes/auth');
const { router: videoRoutes } = require('./routes/videos');
const processRoutes = require('./routes/process');

const app = express();
const PORT = process.env.PORT || 3000;

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
        endpoints: [
            'POST /api/auth/login',
            'POST /api/videos/upload',
            'GET /api/videos',
            'POST /api/process/transcode/:videoId',
            'GET /api/process/status/:jobId'
        ]
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access at: http://localhost:${PORT}`);
});