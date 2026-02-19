require('dotenv').config();
const { generateEmbedding, generateBatchEmbeddings } = require('../../utils/embeddingService');
const performanceLogger = require('../utils/performance-logger');
const TestDataGenerator = require('../utils/test-data-generator');

/**
 * Embedding Generation Benchmark
 * Tests the performance of embedding generation for various scenarios
 */

async function benchmarkSingleEmbedding() {
    console.log('\n=== Single Embedding Benchmark ===');

    const textLengths = [100, 500, 1000, 2000];
    const results = [];

    for (const length of textLengths) {
        const text = TestDataGenerator.generateRandomText(length);
        const iterations = 5;
        const durations = [];

        for (let i = 0; i < iterations; i++) {
            const startTime = performanceLogger.startTimer();
            try {
                await generateEmbedding(text);
                const duration = performanceLogger.endTimer(startTime);
                durations.push(duration);
            } catch (error) {
                console.error(`Error generating embedding for ${length} chars:`, error.message);
            }
        }

        // Handle empty durations array to prevent NaN/Infinity
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : null;
        const minDuration = durations.length > 0 ? Math.min(...durations) : null;
        const maxDuration = durations.length > 0 ? Math.max(...durations) : null;

        results.push({
            textLength: length,
            avgDuration: avgDuration !== null ? avgDuration.toFixed(2) : 'N/A',
            minDuration: minDuration !== null ? minDuration.toFixed(2) : 'N/A',
            maxDuration: maxDuration !== null ? maxDuration.toFixed(2) : 'N/A',
            iterations,
            successfulIterations: durations.length
        });

        console.log(`Text Length: ${length} chars`);
        console.log(`  Avg: ${avgDuration !== null ? avgDuration.toFixed(2) + 'ms' : 'N/A (service unavailable)'}`);
        console.log(`  Min: ${minDuration !== null ? minDuration.toFixed(2) + 'ms' : 'N/A'}`);
        console.log(`  Max: ${maxDuration !== null ? maxDuration.toFixed(2) + 'ms' : 'N/A'}`);
    }

    return results;
}

async function benchmarkBatchEmbedding() {
    console.log('\n=== Batch Embedding Benchmark ===');

    const batchSizes = [10, 50, 100];
    const chunkSize = 500;
    const results = [];

    for (const batchSize of batchSizes) {
        const chunks = TestDataGenerator.generateTestChunks(batchSize, chunkSize);
        const texts = chunks.map(c => c.text);

        const startTime = performanceLogger.startTimer();
        try {
            await generateBatchEmbeddings(texts);
            const duration = performanceLogger.endTimer(startTime);

            const embeddingsPerSecond = (batchSize / (duration / 1000)).toFixed(2);

            results.push({
                batchSize,
                duration: duration.toFixed(2),
                embeddingsPerSecond,
                avgPerEmbedding: (duration / batchSize).toFixed(2)
            });

            console.log(`Batch Size: ${batchSize}`);
            console.log(`  Total Duration: ${duration.toFixed(2)}ms`);
            console.log(`  Embeddings/sec: ${embeddingsPerSecond}`);
            console.log(`  Avg per embedding: ${(duration / batchSize).toFixed(2)}ms`);
        } catch (error) {
            console.error(`Error in batch embedding (size ${batchSize}):`, error.message);
        }
    }

    return results;
}

async function benchmarkConcurrentEmbeddings() {
    console.log('\n=== Concurrent Embedding Benchmark ===');

    const concurrencyLevels = [1, 5, 10, 20];
    const text = TestDataGenerator.generateRandomText(500);
    const results = [];

    for (const concurrency of concurrencyLevels) {
        const startTime = performanceLogger.startTimer();

        try {
            const promises = [];
            for (let i = 0; i < concurrency; i++) {
                promises.push(generateEmbedding(text));
            }

            await Promise.all(promises);
            const duration = performanceLogger.endTimer(startTime);

            const throughput = (concurrency / (duration / 1000)).toFixed(2);

            results.push({
                concurrency,
                duration: duration.toFixed(2),
                throughput,
                avgLatency: (duration / concurrency).toFixed(2)
            });

            console.log(`Concurrency: ${concurrency}`);
            console.log(`  Total Duration: ${duration.toFixed(2)}ms`);
            console.log(`  Throughput: ${throughput} req/sec`);
            console.log(`  Avg Latency: ${(duration / concurrency).toFixed(2)}ms`);
        } catch (error) {
            console.error(`Error in concurrent test (${concurrency}):`, error.message);
        }
    }

    return results;
}

async function runEmbeddingBenchmark() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   EMBEDDING GENERATION BENCHMARK      ║');
    console.log('╚════════════════════════════════════════╝');

    // Check embedding service health first
    const { checkServiceHealth } = require('../../utils/embeddingService');
    const isHealthy = await checkServiceHealth();
    if (!isHealthy) {
        console.log('\n⚠️  WARNING: Embedding service at ' + (process.env.EMBEDDING_API_URL || 'http://127.0.0.1:8001') + ' is not responding.');
        console.log('   Results may be incomplete. Start the service with: python embedding_service.py');
    }

    const results = {
        timestamp: new Date().toISOString(),
        serviceAvailable: isHealthy,
        benchmarks: {}
    };

    try {
        results.benchmarks.single = await benchmarkSingleEmbedding();
        results.benchmarks.batch = await benchmarkBatchEmbedding();
        results.benchmarks.concurrent = await benchmarkConcurrentEmbeddings();

        // Save results
        const fs = require('fs');
        const path = require('path');
        const resultsDir = path.join(process.cwd(), 'performance', 'reports');

        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsFile = path.join(resultsDir, 'embedding-benchmark-results.json');
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

        console.log('\n✅ Embedding benchmark completed!');
        console.log(`📊 Results saved to: ${resultsFile}`);

        return results;
    } catch (error) {
        console.error('\n❌ Embedding benchmark failed:', error.message);
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    runEmbeddingBenchmark()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runEmbeddingBenchmark };
