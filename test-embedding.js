require('dotenv').config();
const { generateEmbedding, generateBatchEmbeddings, cosineSimilarity } = require('./utils/embeddingService');

async function testEmbedding() {
    console.log('=== Testing NVIDIA BGE-M3 Embedding Service ===\n');

    try {
        // Test 1: Single embedding generation
        console.log('Test 1: Generating single embedding...');
        const sampleText = "What is the capital of France?";
        const embedding = await generateEmbedding(sampleText);

        if (embedding && embedding.length > 0) {
            console.log(`✓ Success! Generated embedding with ${embedding.length} dimensions`);
            console.log(`  First 5 values: [${embedding.slice(0, 5).join(', ')}...]`);
        } else {
            console.log('✗ Failed to generate embedding');
        }

        // Test 2: Batch embedding generation
        console.log('\nTest 2: Generating batch embeddings...');
        const texts = [
            "Artificial intelligence is transforming the world.",
            "Machine learning models require large datasets.",
            "Natural language processing enables computers to understand text."
        ];

        const embeddings = await generateBatchEmbeddings(texts);
        console.log(`✓ Generated ${embeddings.length} embeddings`);

        // Test 3: Similarity calculation
        console.log('\nTest 3: Testing similarity calculation...');
        if (embeddings.length >= 2) {
            const similarity1 = cosineSimilarity(embeddings[0], embeddings[1]);
            const similarity2 = cosineSimilarity(embeddings[0], embeddings[2]);

            console.log(`  Similarity between text 1 and 2: ${similarity1.toFixed(4)}`);
            console.log(`  Similarity between text 1 and 3: ${similarity2.toFixed(4)}`);
        }

        console.log('\n=== All tests completed successfully! ===');
    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
testEmbedding();
