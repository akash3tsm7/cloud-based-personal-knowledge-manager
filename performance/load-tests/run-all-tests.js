require('dotenv').config();
const { runRAGLoadTest } = require('./rag-load-test');
const fs = require('fs');
const path = require('path');

/**
 * Run All Load Tests
 * Executes all load tests sequentially
 */

async function runAllLoadTests() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║                                                  ║');
    console.log('║          LOAD TESTING SUITE                      ║');
    console.log('║     Cloud-Based Personal Knowledge Manager       ║');
    console.log('║                                                  ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    console.log('⚠️  Make sure the server is running on http://localhost:5000\n');

    const startTime = Date.now();
    const allResults = {
        timestamp: new Date().toISOString(),
        tests: {},
        summary: {}
    };

    try {
        // Run RAG Load Test
        console.log('\n[1/1] Running RAG Query Load Test...');
        allResults.tests.ragQuery = await runRAGLoadTest();

        const totalDuration = Date.now() - startTime;

        // Generate summary
        allResults.summary = {
            totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
            testsRun: 1,
            status: 'completed',
            completedAt: new Date().toISOString()
        };

        // Save consolidated results
        const resultsDir = path.join(process.cwd(), 'performance', 'reports');

        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        const resultsFile = path.join(resultsDir, 'all-load-tests-results.json');
        fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));

        console.log('\n╔══════════════════════════════════════════════════╗');
        console.log('║                                                  ║');
        console.log('║     ✅ ALL LOAD TESTS COMPLETED SUCCESSFULLY     ║');
        console.log('║                                                  ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log(`\n⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
        console.log(`📊 Results saved to: ${resultsFile}\n`);

        return allResults;

    } catch (error) {
        console.error('\n❌ Load test suite failed:', error.message);
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
    runAllLoadTests()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { runAllLoadTests };
