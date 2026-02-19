require('dotenv').config();
const { runEmbeddingBenchmark } = require('./embedding-benchmark');
const { runQdrantBenchmark } = require('./qdrant-benchmark');
const { runRAGBenchmark } = require('./rag-benchmark');

/**
 * Run All Benchmarks
 * Executes all performance benchmarks sequentially
 */

async function runAllBenchmarks() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║                                                  ║');
    console.log('║     PERFORMANCE BENCHMARK SUITE                  ║');
    console.log('║     Cloud-Based Personal Knowledge Manager       ║');
    console.log('║                                                  ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    const startTime = Date.now();
    const allResults = {
        timestamp: new Date().toISOString(),
        benchmarks: {},
        summary: {}
    };

    try {
        // Run Embedding Benchmark
        console.log('\n[1/3] Running Embedding Benchmark...');
        allResults.benchmarks.embedding = await runEmbeddingBenchmark();

        // Run Qdrant Benchmark
        console.log('\n[2/3] Running Qdrant Benchmark...');
        allResults.benchmarks.qdrant = await runQdrantBenchmark();

        // Run RAG Benchmark
        console.log('\n[3/3] Running RAG Benchmark...');
        allResults.benchmarks.rag = await runRAGBenchmark();

        const totalDuration = Date.now() - startTime;

        // Generate summary
        allResults.summary = {
            totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
            benchmarksRun: 3,
            status: 'completed',
            completedAt: new Date().toISOString()
        };

        // Save consolidated results
        const fs = require('fs');
        const path = require('path');
        const resultsDir = path.join(process.cwd(), 'performance', 'reports');

        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsFile = path.join(resultsDir, 'all-benchmarks-results.json');
        fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));

        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║                                                  ║');
        console.log('║     ✅ ALL BENCHMARKS COMPLETED SUCCESSFULLY     ║');
        console.log('║                                                  ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log(`\n⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
        console.log(`📊 Results saved to: ${resultsFile}\n`);

        return allResults;

    } catch (error) {
        console.error('\n❌ Benchmark suite failed:', error.message);
        allResults.summary = {
            status: 'failed',
            error: error.message,
            failedAt: new Date().toISOString()
        };
        throw error;
    }
}

// Run if executed directly
if (require.main === module) {
    runAllBenchmarks()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runAllBenchmarks };
