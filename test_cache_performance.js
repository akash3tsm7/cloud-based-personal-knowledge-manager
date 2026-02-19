// Using native fetch (Node 18+)

async function testCaching() {
    const testText = "This is a test document about machine learning and artificial intelligence.";

    console.log("Testing Embedding Service Caching Performance\n");
    console.log("=".repeat(60));

    // First request (cache miss)
    console.log("\n1️⃣ First request (cache miss):");
    const start1 = Date.now();
    const response1 = await fetch('http://localhost:8001/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText })
    });
    const data1 = await response1.json();
    const time1 = Date.now() - start1;
    console.log(`   Time: ${time1}ms`);
    console.log(`   Cached: ${data1.cached || false}`);
    console.log(`   Embedding length: ${data1.embedding ? data1.embedding.length : 'null'}`);

    // Second request (cache hit)
    console.log("\n2️⃣ Second request (cache hit):");
    const start2 = Date.now();
    const response2 = await fetch('http://localhost:8001/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText })
    });
    const data2 = await response2.json();
    const time2 = Date.now() - start2;
    console.log(`   Time: ${time2}ms`);
    console.log(`   Cached: ${data2.cached || false}`);
    console.log(`   Embedding length: ${data2.embedding ? data2.embedding.length : 'null'}`);

    // Calculate speedup
    const speedup = (time1 / time2).toFixed(1);
    console.log("\n" + "=".repeat(60));
    console.log(`\n🚀 Speedup: ${speedup}x faster (${time1}ms → ${time2}ms)`);
    console.log(`💾 Cache working: ${data2.cached === true ? '✅ YES' : '❌ NO'}`);
}

testCaching().catch(console.error);
