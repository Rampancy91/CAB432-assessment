const express = require('express');
const jwt = require('jsonwebtoken');
const { registerUser, confirmRegistration, authenticateUser } = require('../utils/cognitoAuth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'Username, email, and password are required' 
            });
        }

        await registerUser(username, email, password);

        res.json({
            message: 'User registered successfully. Please check your email to confirm registration.',
            username: username
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ 
            error: error.message || 'Registration failed' 
        });
    }
});

// Confirm registration with code from email
router.post('/confirm', async (req, res) => {
    try {
        const { username, code } = req.body;

        if (!username || !code) {
            return res.status(400).json({ 
                error: 'Username and confirmation code are required' 
            });
        }

        await confirmRegistration(username, code);

        res.json({
            message: 'Email confirmed successfully. You can now login.'
        });

    } catch (error) {
        console.error('Confirmation error:', error);
        res.status(400).json({ 
            error: error.message || 'Confirmation failed' 
        });
    }
});

// Login with Cognito
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password required' 
            });
        }

        const tokens = await authenticateUser(username, password);

        // Decode the ID token to get user info
        const decoded = jwt.decode(tokens.idToken);

        res.json({
            message: 'Login successful',
            accessToken: tokens.accessToken,
            idToken: tokens.idToken,
            user: {
                username: decoded['cognito:username'],
                email: decoded.email,
                sub: decoded.sub // Cognito user ID
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ 
            error: error.message || 'Invalid credentials' 
        });
    }
});

// Middleware to verify Cognito JWT token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        // Decode without verification
        const decoded = jwt.decode(token);
        
        if (!decoded) {
            return res.status(400).json({ error: 'Invalid token' });
        }

        // Extract user info from Cognito token
        req.user = {
            userId: decoded.sub || decoded['cognito:username'],
            username: decoded['cognito:username'] || decoded.username,
            email: decoded.email,
            role: 'user' // You can add custom attributes for roles later
        };
        
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

module.exports = { router, verifyToken };