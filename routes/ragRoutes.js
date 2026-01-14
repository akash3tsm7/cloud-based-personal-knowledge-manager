const express = require('express');
const router = express.Router();
const { answerQuestion, answerQuestionForFile } = require('../utils/ragService');
const qdrantService = require('../utils/qdrantService');
const { authenticateToken } = require('../middlewares/auth');
const File = require('../models/File');

/**
 * @route   POST /api/rag/ask
 * @desc    Ask a question using RAG
 * @access  Protected
 */
router.post('/ask', authenticateToken, async (req, res) => {
    try {
        const { question, topK, minScore } = req.body;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Question is required'
            });
        }

        console.log(`RAG Query from user ${req.user.userId}: "${question}"`);

        // You could optionally filter by userId in Qdrant if you store userId in payload
        // For now, we search across all files (or you can implement per-user filtering)

        // Fetch user's files for context
        const userFiles = await File.find({ userId: req.user.userId }).select('fileName');
        const fileNames = userFiles.map(f => f.fileName);

        const result = await answerQuestion(question, req.user.userId, {
            topK: topK || 5,
            minScore: minScore || 0.3,
            fileContext: fileNames
        });

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('RAG query error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process question',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/rag/ask-file/:fileId
 * @desc    Ask a question about a specific file
 * @access  Protected
 */
router.post('/ask-file/:fileId', authenticateToken, async (req, res) => {
    try {
        const { question, topK, minScore } = req.body;
        const fileId = req.params.fileId;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Question is required'
            });
        }

        // Verify file exists and user owns it
        const file = await File.findOne({
            _id: fileId,
            userId: req.user.userId
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found or access denied'
            });
        }

        console.log(`RAG Query for file ${fileId}: "${question}"`);

        const result = await answerQuestionForFile(question, fileId, {
            topK: topK || 5,
            minScore: minScore || 0.3,
        });

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('RAG file query error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process question',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/rag/stats
 * @desc    Get RAG system statistics
 * @access  Protected
 */
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const collectionInfo = await qdrantService.getCollectionInfo();

        // Get user's file count
        const userFileCount = await File.countDocuments({ userId: req.user.userId });

        res.status(200).json({
            success: true,
            data: {
                totalVectors: collectionInfo.pointsCount,
                userFiles: userFileCount,
                collectionName: collectionInfo.name,
                vectorSize: collectionInfo.config.vectorSize
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch stats',
            error: error.message
        });
    }
});

module.exports = router;