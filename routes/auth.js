const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Simple in-memory user storage (hardcoded for this assignment)
const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2b$10$iicVrxvAbTHXE4ndLXUJweVvE/1e3Hb9NHDhjik6cIhBTkg5DezT6', // 'admin123'
        role: 'admin'
    },
    {
        id: 2,
        username: 'user',
        password: '$2b$10$Cp/IkEz3f5E5Zj8sBIqJ4.C5lCUek36hx3g6SVZ5YO0DQe7I/1zHq', // 'user123'
        role: 'user'
    }
];

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Find user
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Test protected route
router.get('/profile', verifyToken, (req, res) => {
    res.json({ user: req.user });
});

module.exports = { router, verifyToken };