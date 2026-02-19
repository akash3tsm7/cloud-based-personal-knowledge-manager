const { generateEmbedding, generateBatchEmbeddings } = require('./utils/embeddingService');

async function test() {
    console.log("Starting verification of local embedding service...");

    try {
        console.log("\n--- Test 1: Single Embedding ---");
        const text = "Hello world, this is a test for the local embedding service.";
        const start1 = Date.now();
        const emb = await generateEmbedding(text);
        const duration1 = Date.now() - start1;

        if (emb && emb.length > 0) {
            console.log(`[SUCCESS] Generated embedding with dimensions: ${emb.length}`);
            console.log(`Time taken: ${duration1}ms`);
        } else {
            console.error("[FAILURE] Single embedding generation returned null or empty.");
        }

        console.log("\n--- Test 2: Batch Embedding ---");
        const texts = [
            "Apple",
            "Banana",
            "The quick brown fox jumps over the lazy dog.",
            "Artificial Intelligence is changing the world."
        ];
        const start2 = Date.now();
        const batch = await generateBatchEmbeddings(texts);
        const duration2 = Date.now() - start2;

        if (batch && batch.length === texts.length) {
            console.log(`[SUCCESS] Generated ${batch.length} embeddings.`);
            console.log(`Time taken: ${duration2}ms`);
            console.log(`Average time per embedding: ${duration2 / texts.length}ms`);

            const valid = batch.every(e => e && e.length > 0);
            if (valid) {
                console.log("[SUCCESS] All batch embeddings have data.");
            } else {
                console.error("[FAILURE] Some batch embeddings are missing.");
            }
        } else {
            console.error(`[FAILURE] Expected ${texts.length} embeddings, got ${batch ? batch.length : 0}`);
        }

    } catch (error) {
        console.error("\n[CRITICAL ERROR] Test failed with exception:", error);
    }
}

test();
