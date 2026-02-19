require('dotenv').config();
const qdrantService = require('../../utils/qdrantService');
const { generateEmbedding } = require('../../utils/embeddingService');
const performanceLogger = require('../utils/performance-logger');
const TestDataGenerator = require('../utils/test-data-generator');
const User = require('../../models/User');

/**
 * Qdrant Operations Benchmark
 * Tests the performance of Qdrant vector database operations
 */

async function getBenchmarkUserId() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI not found in .env');
    }

    const email = process.env.BENCHMARK_USER_EMAIL || 'benchmark.user@example.com';
    let user = await User.findOne({ email });

    if (!user) {
        user = new User({
            name: 'Benchmark User',
            email,
            password: process.env.BENCHMARK_USER_PASSWORD || 'BenchmarkPass123!'
        });
        await user.save();
    }

    return user._id.toString();
}

async function benchmarkInsertOperations(benchmarkUserId) {
    console.log('\n=== Qdrant Insert Benchmark ===');

    const batchSizes = [1, 10, 50, 100];
    const results = [];

    for (const batchSize of batchSizes) {
        const chunks = TestDataGenerator.generateTestChunks(batchSize, 500);
        const startTime = performanceLogger.startTimer();

        try {
            // Generate embeddings
            const embeddings = [];
            for (const chunk of chunks) {
                const embedding = await generateEmbedding(chunk.text);
                embeddings.push(embedding);
            }

            // Insert into Qdrant - use storeChunkEmbeddings instead
            const chunksWithEmbeddings = chunks.map((chunk, idx) => ({
                ...chunk,
                embedding: embeddings[idx]
            }));

            await qdrantService.storeChunkEmbeddings(
                chunksWithEmbeddings,
                'benchmark-test',
                'benchmark-file',
                benchmarkUserId
            );
            const duration = performanceLogger.endTimer(startTime);

            const insertsPerSecond = (batchSize / (duration / 1000)).toFixed(2);

            results.push({
                batchSize,
                duration: duration.toFixed(2),
                insertsPerSecond,
                avgPerInsert: (duration / batchSize).toFixed(2)
            });

            console.log(`Batch Size: ${batchSize}`);
            console.log(`  Total Duration: ${duration.toFixed(2)}ms`);
            console.log(`  Inserts/sec: ${insertsPerSecond}`);
            console.log(`  Avg per insert: ${(duration / batchSize).toFixed(2)}ms`);
        } catch (error) {
            console.error(`Error in insert benchmark (batch ${batchSize}):`, error.message);
        }
    }

    return results;
}

async function benchmarkSearchOperations() {
    console.log('\n=== Qdrant Search Benchmark ===');

    const topKValues = [5, 10, 20, 50];
    const results = [];

    // Create a test query
    const queryText = TestDataGenerator.generateRandomText(500);
    const queryEmbedding = await generateEmbedding(queryText);

    for (const topK of topKValues) {
        const iterations = 10;
        const durations = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = performanceLogger.startTimer();

            try {
                await qdrantService.searchSimilarChunks(queryEmbedding, topK, null);
                const duration = performanceLogger.endTimer(startTime);
                durations.push(duration);
            } catch (error) {
                console.error(`Error in search (topK=${topK}):`, error.message);
            }
        }

        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

        results.push({
            topK,
            iterations,
            avgDuration: avgDuration.toFixed(2),
            minDuration: Math.min(...durations).toFixed(2),
            maxDuration: Math.max(...durations).toFixed(2),
            searchesPerSecond: (1000 / avgDuration).toFixed(2)
        });

        console.log(`TopK: ${topK}`);
        console.log(`  Avg: ${avgDuration.toFixed(2)}ms`);
        console.log(`  Min: ${Math.min(...durations).toFixed(2)}ms`);
        console.log(`  Max: ${Math.max(...durations).toFixed(2)}ms`);
        console.log(`  Searches/sec: ${(1000 / avgDuration).toFixed(2)}`);
    }

    return results;
}

async function benchmarkFilteredSearch(benchmarkUserId) {
    console.log('\n=== Qdrant Filtered Search Benchmark ===');

    const results = [];
    const queryText = TestDataGenerator.generateRandomText(500);
    const queryEmbedding = await generateEmbedding(queryText);
    const iterations = 10;

    // Test with userId filter
    const durations = [];
    for (let i = 0; i < iterations; i++) {
        const startTime = performanceLogger.startTimer();

        try {
            const filter = {
                must: [
                    {
                        key: 'userId',
                        match: { value: benchmarkUserId }
                    }
                ]
            };
            await qdrantService.searchSimilarChunks(queryEmbedding, 10, filter);
            const duration = performanceLogger.endTimer(startTime);
            durations.push(duration);
        } catch (error) {
            console.error('Error in filtered search:', error.message);
        }
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    results.push({
        filterType: 'userId',
        topK: 10,
        iterations,
        avgDuration: avgDuration.toFixed(2),
        minDuration: Math.min(...durations).toFixed(2),
        maxDuration: Math.max(...durations).toFixed(2)
    });

    console.log('Filtered Search (userId):');
    console.log(`  Avg: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${Math.min(...durations).toFixed(2)}ms`);
    console.log(`  Max: ${Math.max(...durations).toFixed(2)}ms`);

    return results;
}

async function benchmarkDeleteOperations(benchmarkUserId) {
    console.log('\n=== Qdrant Delete Benchmark ===');

    const results = [];

    // Create test points to delete
    const testPoints = 50;
    const chunks = TestDataGenerator.generateTestChunks(testPoints, 500);
    const pointIds = [];

    // Insert test points
    for (let i = 0; i < testPoints; i++) {
        const embedding = await generateEmbedding(chunks[i].text);
        chunks[i].embedding = embedding;
    }

    // Store all chunks at once
    await qdrantService.storeChunkEmbeddings(
        chunks,
        'benchmark-delete-test',
        'benchmark-file',
        benchmarkUserId
    );

    // Benchmark deletion
    const startTime = performanceLogger.startTimer();

    try {
        await qdrantService.deleteFileEmbeddings('benchmark-delete-test');
        const duration = performanceLogger.endTimer(startTime);

        results.push({
            pointsDeleted: testPoints,
            duration: duration.toFixed(2),
            deletesPerSecond: (testPoints / (duration / 1000)).toFixed(2)
        });

        console.log(`Points Deleted: ${testPoints}`);
        console.log(`  Duration: ${duration.toFixed(2)}ms`);
        console.log(`  Deletes/sec: ${(testPoints / (duration / 1000)).toFixed(2)}`);
    } catch (error) {
        console.error('Error in delete benchmark:', error.message);
    }

    return results;
}

async function getQdrantStats() {
    console.log('\n=== Qdrant Collection Stats ===');

    try {
        const collectionInfo = await qdrantService.getCollectionInfo();

        console.log(`Collection: ${collectionInfo.name}`);
        console.log(`Total Points: ${collectionInfo.pointsCount}`);
        console.log(`Vector Size: ${collectionInfo.config.vectorSize}`);
        console.log(`Distance: ${collectionInfo.config.distance}`);

        return collectionInfo;
    } catch (error) {
        console.error('Error getting collection stats:', error.message);
        return null;
    }
}

async function runQdrantBenchmark() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║      QDRANT OPERATIONS BENCHMARK      ║');
    console.log('╚════════════════════════════════════════╝');

    const results = {
        timestamp: new Date().toISOString(),
        benchmarks: {},
        collectionStats: null
    };

    const mongoose = require('mongoose');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const benchmarkUserId = await getBenchmarkUserId();

        results.collectionStats = await getQdrantStats();
        results.benchmarks.insert = await benchmarkInsertOperations(benchmarkUserId);
        results.benchmarks.search = await benchmarkSearchOperations();
        results.benchmarks.filteredSearch = await benchmarkFilteredSearch(benchmarkUserId);
        results.benchmarks.delete = await benchmarkDeleteOperations(benchmarkUserId);

        // Save results
        const fs = require('fs');
        const path = require('path');
        const resultsDir = path.join(process.cwd(), 'performance', 'reports');

        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsFile = path.join(resultsDir, 'qdrant-benchmark-results.json');
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

        console.log('\n✅ Qdrant benchmark completed!');
        console.log(`📊 Results saved to: ${resultsFile}`);

        return results;
    } catch (error) {
        console.error('\n❌ Qdrant benchmark failed:', error.message);
        throw error;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    }
}

// Run if executed directly
if (require.main === module) {
    runQdrantBenchmark()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runQdrantBenchmark };
