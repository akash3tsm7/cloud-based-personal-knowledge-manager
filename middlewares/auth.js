const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        let token = authHeader && authHeader.split(' ')[1];

        // Fallback to cookie if no header
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            // Check if it's a browser request (Accept: text/html)
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.redirect('/api/auth/login-page');
            }

            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // 🔐 CHECK USER STILL EXISTS
        const user = await User.findById(decoded.userId).select('_id email name');

        if (!user) {
            // User deleted or doesn't exist
            // Check if it's a browser request
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                // Clear cookie if exists
                if (req.cookies && req.cookies.token) {
                    res.clearCookie('token');
                }
                return res.redirect('/api/auth/login-page?error=user_not_found');
            }

            // For API requests, return JSON error
            return res.status(401).json({
                success: false,
                errorCode: 'USER_DELETED',
                message: 'User no longer exists. Please log in again.'
            });
        }

        // Attach safe user object
        req.user = {
            userId: user._id.toString(),
            email: user.email,
            name: user.name
        };

        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            // Check if it's a browser request
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.redirect('/api/auth/login-page?error=invalid_token');
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid token.'
            });
        }

        if (error.name === 'TokenExpiredError') {
            // Check if it's a browser request
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                // Clear cookie if exists
                if (req.cookies && req.cookies.token) {
                    res.clearCookie('token');
                }
                return res.redirect('/api/auth/login-page?error=token_expired');
            }

            return res.status(401).json({
                success: false,
                message: 'Token expired.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Authentication error.',
            error: error.message
        });
    }
}

function generateToken(userId, email) {
    return jwt.sign(
        { userId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

module.exports = {
    authenticateToken,
    generateToken,
    JWT_SECRET
};