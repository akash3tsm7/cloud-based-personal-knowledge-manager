require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const qdrantService = require('./utils/qdrantService');
const metricsCollector = require('./performance/utils/metrics-collector');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');

// Performance monitoring middleware
app.use((req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const success = res.statusCode < 400;
        metricsCollector.recordRequest(req.path, duration, success);
    });

    next();
});

// Serve static files (for uploaded files)
app.use('/uploads', express.static('uploads'));

// Import routes
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const ragRoutes = require('./routes/ragRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const { createTimeoutMiddleware } = require('./middlewares/timeout');

// Use routes
app.use('/api/auth', authRoutes);  // Auth routes (public)
app.use('/api', fileRoutes);       // File routes (protected)
app.use('/api/rag', createTimeoutMiddleware(30000), ragRoutes);    // RAG routes (protected) with 30s timeout
app.use('/api/performance', performanceRoutes);  // Performance monitoring routes

// Root route - redirect to login
app.get('/', (req, res) => {
    res.redirect('/api/auth/login-page');
});

const PORT = process.env.PORT || 5000;

// Initialize databases and start server
async function startServer() {
    try {
        // Connect to MongoDB with increased pool size for concurrency
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 50, // Increase from default 10 to handle concurrent requests
            minPoolSize: 5,
            socketTimeoutMS: 45000,
            serverSelectionTimeoutMS: 5000,
        });
        console.log('✓ MongoDB Connected');


        // Initialize Qdrant collection (non-blocking)
        try {
            await qdrantService.initializeCollection();
            console.log('✓ Qdrant initialized');
        } catch (qdrantError) {
            console.warn('⚠️  Qdrant not available:', qdrantError.message);
            console.warn('   Semantic search will be unavailable until Qdrant is running');
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`✓ Server running on port ${PORT}`);
            console.log(`✓ Login at: http://localhost:${PORT}/api/auth/login-page`);
            console.log(`✓ Register at: http://localhost:${PORT}/api/auth/register-page`);
        });
    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
}

startServer();