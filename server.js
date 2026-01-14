require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const qdrantService = require('./utils/qdrantService');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');

// Serve static files (for uploaded files)
app.use('/uploads', express.static('uploads'));

// Import routes
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const ragRoutes = require('./routes/ragRoutes');

// Use routes
app.use('/api/auth', authRoutes);  // Auth routes (public)
app.use('/api', fileRoutes);       // File routes (protected)
app.use('/api/rag', ragRoutes);    // RAG routes (protected)

// Root route - redirect to login
app.get('/', (req, res) => {
    res.redirect('/api/auth/login-page');
});

const PORT = process.env.PORT || 5000;

// Initialize databases and start server
async function startServer() {
    try {
        // Connect to MongoDB
        const mongoose = require('mongoose');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ MongoDB Connected');

        // Initialize Qdrant collection
        await qdrantService.initializeCollection();
        console.log('✓ Qdrant initialized');

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