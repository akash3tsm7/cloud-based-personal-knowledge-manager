const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    fileName: String,
    fileType: String,
    summary: String,
    embedding: [Number],
    fileUrl: String,
    extractedText: {
        type: String,
        index: 'text'  // Enable text search on extractedText
    },
    chunks: [{
        text: {
            type: String,
            index: 'text'  // Enable text search on chunk text
        },
        index: Number,
        charCount: Number,
        wordCount: Number,
        startParagraph: Number,
        endParagraph: Number,
    }],
    qdrantIds: [String],
    
    // Async processing status fields
    status: {
        type: String,
        enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'QUEUED',
        index: true
    },
    jobId: {
        type: String,
        index: true
    },
    totalChunks: {
        type: Number,
        default: 0
    },
    chunksProcessed: {
        type: Number,
        default: 0
    },
    processingTime: {
        type: Number  // milliseconds
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
}, {
    timestamps: true
});

// Create compound text index for better BM25 search
FileSchema.index({
    fileName: 'text',
    extractedText: 'text',
    'chunks.text': 'text'
}, {
    weights: {
        fileName: 10,        // Highest weight for filename matches
        extractedText: 5,    // Medium weight for full text
        'chunks.text': 3     // Lower weight for chunk text
    },
    name: 'file_text_search'
});

module.exports = mongoose.model('File', FileSchema);