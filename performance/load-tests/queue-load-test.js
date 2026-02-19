require('dotenv').config();
const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

/**
 * Queue Load Test
 * Tests the /api/upload endpoint to measure job enqueue throughput using form-data for file uploads
 */

async function runQueueLoadTest() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║       QUEUE INGESTION LOAD TEST       ║');
    console.log('╚════════════════════════════════════════╝\n');

    // 1. Get Auth Token
    const authToken = await getAuthToken();
    if (!authToken) {
        console.error('❌ Failed to get auth token.');
        return;
    }

    // 2. Prepare test file
    const testFilePath = path.join(__dirname, 'load-test.txt');
    if (!fs.existsSync(testFilePath)) {
        fs.writeFileSync(testFilePath, 'Dummy text content for load testing the queue ingestion.');
    }

    const testScenarios = [
        { name: 'Warmup', connections: 5, duration: 10 },
        { name: 'Load Test', connections: 20, duration: 30 }
    ];

    const results = [];

    for (const scenario of testScenarios) {
        console.log(`\n📊 Running: ${scenario.name}`);
        console.log(`   Connections: ${scenario.connections}, Duration: ${scenario.duration}s`);

        // We need a custom setupRequest because we are sending multipart/form-data
        // Autocannon supports this via the `setupClient` or by pre-formatting the body if simple.
        // However, correct multipart formatting with boundaries is tricky manually.
        // A simpler approach for autocannon with files is simpler:

        // Construct a static multipart body (since content is static)
        const boundary = '--------------------------boundary' + Date.now();
        const content = fs.readFileSync(testFilePath);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="load-test.txt"\r\nContent-Type: text/plain\r\n\r\n`),
            content,
            Buffer.from(`\r\n--${boundary}--`)
        ]);

        const result = await new Promise((resolve, reject) => {
            const instance = autocannon({
                url: 'http://localhost:5000/api/upload',
                connections: scenario.connections,
                duration: scenario.duration,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                body: body,
                validStatus: [200, 201, 202]
            }, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
            autocannon.track(instance, { renderProgressBar: true });
        });

        results.push({
            scenario: scenario.name,
            requests: result.requests.total,
            rps: result.requests.average,
            latency: result.latency.p50,
            errors: result.errors,
            non2xx: result.non2xx
        });

        console.log(`   ✅ Tps (Enqueued/sec): ${result.requests.average.toFixed(2)}`);
        console.log(`   ✅ Latency (p50): ${result.latency.p50}ms`);
        if (result.non2xx > 0) console.warn(`   ⚠️  Failures: ${result.non2xx}`);
    }

    // Cleanup
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);

    // Save results
    const resultsDir = path.join(process.cwd(), 'performance', 'reports');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    fs.writeFileSync(path.join(resultsDir, 'queue-load-test-results.json'), JSON.stringify(results, null, 2));

    return results;
}

// Helper: Get Token (Reuse logic)
async function getAuthToken() {
    const axios = require('axios');
    try {
        const res = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'testuser@example.com', password: 'TestPassword123!'
        });
        return res.data.data.token;
    } catch (e) {
        console.log('Login failed, registering...');
        try {
            await axios.post('http://localhost:5000/api/auth/register', {
                name: 'Test Load User', email: 'testuser@example.com', password: 'TestPassword123!'
            });
            const res = await axios.post('http://localhost:5000/api/auth/login', {
                email: 'testuser@example.com', password: 'TestPassword123!'
            });
            return res.data.data.token;
        } catch (e2) { return null; }
    }
}

if (require.main === module) {
    runQueueLoadTest();
}

module.exports = { runQueueLoadTest };
