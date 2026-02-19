const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname);

function loadJson(filename) {
    try {
        const filePath = path.join(REPORTS_DIR, filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
    } catch (error) {
        console.warn(`Warning: Could not load ${filename}: ${error.message}`);
    }
    return null;
}

function formatDuration(ms) {
    if (!ms && ms !== 0) return 'N/A';
    return `${ms.toFixed(2)}ms`;
}

function printHeader(title) {
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}

function generateReport() {
    console.log('\n📊 PERFORMANCE & CAPACITY REPORT');
    console.log(`Generated at: ${new Date().toLocaleString()}`);

    // 1. Benchmark Results
    const benchmarks = loadJson('all-benchmarks-results.json');
    if (benchmarks && benchmarks.results) {
        printHeader('BENCHMARK RESULTS');

        // Embedding Benchmark
        const embedding = benchmarks.results.embedding;
        if (embedding) {
            console.log('\n🔹 Embedding Generation:');
            if (embedding.single && embedding.single.avgDuration) {
                console.log(`  Single (Avg):    ${formatDuration(embedding.single.avgDuration)}`);
            }
            if (embedding.batch && embedding.batch.embeddingsPerSec) {
                console.log(`  Batch Throughput: ${embedding.batch.embeddingsPerSec.toFixed(2)} ops/sec`);
            }
        }

        // Qdrant Benchmark
        const qdrant = benchmarks.results.qdrant;
        if (qdrant) {
            console.log('\n🔹 Qdrant Vector DB:');
            if (qdrant.search && qdrant.search.avgDuration) {
                console.log(`  Search Latency:   ${formatDuration(qdrant.search.avgDuration)}`);
                console.log(`  Ops/Sec:          ${qdrant.search.opsPerSec ? qdrant.search.opsPerSec.toFixed(2) : 'N/A'}`);
            }
        }

        // RAG Benchmark
        const rag = benchmarks.results.rag;
        if (rag) {
            console.log('\n🔹 RAG End-to-End:');
            if (rag.query && rag.query.avgDuration) {
                console.log(`  Query Latency:    ${formatDuration(rag.query.avgDuration)}`);
            }
        }
    }

    // 2. Load Test Results
    const loadTests = loadJson('all-load-tests-results.json');
    if (loadTests && loadTests.results) {
        printHeader('LOAD TEST RESULTS');

        Object.entries(loadTests.results).forEach(([name, data]) => {
            console.log(`\n🔹 ${name}:`);
            console.log(`  Requests:      ${data.totalRequests}`);
            console.log(`  Success Rate:  ${data.successRate}%`);
            console.log(`  Avg Latency:   ${formatDuration(data.meanLatency)}`);
            console.log(`  P95 Latency:   ${formatDuration(data.p95Latency)}`);
            console.log(`  Throughput:    ${data.rps ? data.rps.toFixed(2) : 'N/A'} req/sec`);
        });
    }

    // 3. Capacity Analysis
    const capacity = loadJson('capacity-analysis.json');
    if (capacity) {
        printHeader('CAPACITY ANALYSIS');

        // Read from nested concurrency object
        const concurrency = capacity.concurrency || {};
        const maxUsers = concurrency.safeConcurrentUsers || concurrency.maxConcurrentUsers || 'N/A';
        const maxThroughput = concurrency.requestsPerSecond;

        console.log(`\n🔹 Estimated Limits:`);
        console.log(`  Max Concurrent Users: ${maxUsers}`);
        console.log(`  Max Throughput:       ${maxThroughput ? maxThroughput.toFixed(2) : 'N/A'} req/sec`);

        if (capacity.bottlenecks && capacity.bottlenecks.length > 0) {
            console.log('\n⚠️  Identified Bottlenecks:');
            capacity.bottlenecks.forEach(b => console.log(`  - ${b}`));
        }

        if (capacity.recommendations && capacity.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            capacity.recommendations.forEach(r => console.log(`  - ${r.message || r}`));
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('Report generation complete.');
}

generateReport();
