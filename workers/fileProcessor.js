/**
 * File Processor Worker
 * 
 * Background worker that claims file processing jobs from Redis queue
 * and processes them using existing utility functions.
 * 
 * Usage: node workers/fileProcessor.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const File = require('../models/File');
const { extractText } = require('../utils/textExtractor');
const { chunkFileText, getChunkingStats } = require('../utils/chunking');
const { generateAndStoreChunkEmbeddings } = require('../utils/embeddingService');
const qdrantService = require('../utils/qdrantService');
const queueService = require('../utils/queueService');

// Worker configuration
const WORKER_ID = process.env.WORKER_ID || `file-worker-${process.pid}`;
const WORKER_TYPE = process.env.WORKER_TYPE || 'cpu';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 1000;
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 5000;

let isShuttingDown = false;
let currentJob = null;
let heartbeatInterval = null;

/**
 * Process a single file
 */
async function processFile(job) {
    const { fileId, filepath, userId, mimetype, filename } = job.payload;
    const startTime = Date.now();

    console.log(`\n📁 Processing file: ${filename} (ID: ${fileId})`);

    // Update file status to PROCESSING
    await File.findByIdAndUpdate(fileId, {
        status: 'PROCESSING',
        startedAt: new Date(),
    });

    try {
        // Step 1: Extract text
        console.log('  → Extracting text...');
        await queueService.updateJobProgress(job.job_id, 10, 0);

        const path = require('path');
        const fs = require('fs');

        const normalizedPath = filepath.replace(/\\/g, '/');
        const absolutePath = path.resolve(normalizedPath);

        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${absolutePath}`);
        }

        const extractedText = await extractText(absolutePath);


        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text could be extracted from file');
        }

        console.log(`  ✓ Extracted ${extractedText.length} characters`);
        await queueService.updateJobProgress(job.job_id, 30, 0);

        // Step 2: Chunk text
        console.log('  → Chunking text...');
        const chunks = chunkFileText(extractedText, {
            filename: filename,
            mimeType: mimetype,
        });

        const chunkStats = getChunkingStats(chunks);
        console.log(`  ✓ Created ${chunks.length} chunks (avg: ${chunkStats.avgChunkSize} chars)`);

        await File.findByIdAndUpdate(fileId, {
            extractedText,
            totalChunks: chunks.length,
        });

        await queueService.updateJobProgress(job.job_id, 50, 0);

        // Step 3: Generate embeddings and store in Qdrant
        console.log('  → Generating embeddings...');
        let qdrantIds = [];
        let embeddingResult = null;

        if (chunks.length > 0) {
            embeddingResult = await generateAndStoreChunkEmbeddings(
                chunks,
                fileId,
                filename,
                userId
            );

            qdrantIds = embeddingResult.qdrantIds;
            console.log(`  ✓ Stored ${embeddingResult.stats.successful}/${chunks.length} embeddings in Qdrant`);
        }

        await queueService.updateJobProgress(job.job_id, 90, chunks.length);

        // Step 4: Update file record with results
        const processingTime = Date.now() - startTime;

        await File.findByIdAndUpdate(fileId, {
            status: 'COMPLETED',
            chunks: embeddingResult ? embeddingResult.chunks : chunks,
            qdrantIds,
            totalChunks: chunks.length,
            chunksProcessed: chunks.length,
            processingTime,
            completedAt: new Date(),
            error: null,
        });

        console.log(`  ✓ File processed in ${processingTime}ms`);

        return {
            success: true,
            chunksCreated: chunks.length,
            embeddingsStored: embeddingResult?.stats?.successful || 0,
            processingTime,
        };

    } catch (error) {
        console.error(`  ✗ Processing failed: ${error.message}`);

        // Update file with error
        await File.findByIdAndUpdate(fileId, {
            status: 'FAILED',
            error: error.message,
            completedAt: new Date(),
            processingTime: Date.now() - startTime,
        });

        throw error;
    }
}

/**
 * Start heartbeat for current job
 */
function startHeartbeat(jobId) {
    stopHeartbeat();
    heartbeatInterval = setInterval(async () => {
        if (currentJob) {
            try {
                await queueService.sendHeartbeat(jobId, WORKER_ID);
            } catch (err) {
                console.error('Heartbeat failed:', err.message);
            }
        }
    }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

/**
 * Main worker loop
 */
async function workerLoop() {
    console.log(`\n🔄 ${WORKER_ID} polling for jobs...`);

    while (!isShuttingDown) {
        try {
            // Try to claim a job
            const job = await queueService.claimJob(WORKER_TYPE, WORKER_ID);

            if (job) {
                currentJob = job;
                startHeartbeat(job.job_id);

                try {
                    const result = await processFile(job);
                    await queueService.completeJob(job.job_id, WORKER_ID, result);
                } catch (error) {
                    await queueService.failJob(job.job_id, WORKER_ID, error.message);
                }

                stopHeartbeat();
                currentJob = null;
            } else {
                // No jobs available, wait before polling again
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            }
        } catch (error) {
            console.error('Worker loop error:', error.message);
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2));
        }
    }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
    console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
    isShuttingDown = true;
    stopHeartbeat();

    // Wait for current job to finish (with timeout)
    if (currentJob) {
        console.log('Waiting for current job to complete...');
        const timeout = setTimeout(() => {
            console.log('Timeout waiting for job, forcing shutdown');
            process.exit(1);
        }, 30000);

        while (currentJob) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        clearTimeout(timeout);
    }

    // Cleanup connections
    try {
        await queueService.disconnect();
        await mongoose.disconnect();
        console.log('✓ Connections closed');
    } catch (err) {
        console.error('Error during cleanup:', err.message);
    }

    process.exit(0);
}

/**
 * Initialize and start worker
 */
async function main() {
    console.log('═══════════════════════════════════════════');
    console.log(`  File Processor Worker`);
    console.log('═══════════════════════════════════════════');
    console.log(`  Worker ID:   ${WORKER_ID}`);
    console.log(`  Worker Type: ${WORKER_TYPE}`);
    console.log(`  Poll Interval: ${POLL_INTERVAL_MS}ms`);
    console.log(`  Heartbeat Interval: ${HEARTBEAT_INTERVAL_MS}ms`);
    console.log('═══════════════════════════════════════════\n');

    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB');

        // Initialize Qdrant
        await qdrantService.initializeCollection();
        console.log('✓ Qdrant initialized');

        // Check Redis connection
        const redisOk = await queueService.checkConnection();
        if (!redisOk) {
            throw new Error('Cannot connect to Redis');
        }
        console.log('✓ Connected to Redis');

        // Register signal handlers
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Start worker loop
        await workerLoop();

    } catch (error) {
        console.error('❌ Worker failed to start:', error.message);
        process.exit(1);
    }
}

// Start the worker
main();
