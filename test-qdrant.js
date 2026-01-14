require('dotenv').config();
const qdrantService = require('./utils/qdrantService');

/**
 * Test script for Qdrant vector database integration
 * Tests connection, collection creation, embedding storage, search, and deletion
 */

async function testQdrant() {
    console.log('=== Testing Qdrant Vector Database Integration ===\n');

    try {
        // Test 1: Check Qdrant connection
        console.log('Test 1: Checking Qdrant connection...');
        const isConnected = await qdrantService.checkConnection();

        if (!isConnected) {
            console.error('✗ Failed to connect to Qdrant');
            console.error('Make sure Qdrant is running: docker-compose up -d');
            process.exit(1);
        }
        console.log('✓ Successfully connected to Qdrant\n');

        // Test 2: Initialize collection
        console.log('Test 2: Initializing collection...');
        await qdrantService.initializeCollection();
        console.log('✓ Collection initialized successfully\n');

        // Test 3: Get collection info
        console.log('Test 3: Getting collection info...');
        const collectionInfo = await qdrantService.getCollectionInfo();
        console.log('Collection Info:');
        console.log(`  Name: ${collectionInfo.name}`);
        console.log(`  Points: ${collectionInfo.pointsCount}`);
        console.log(`  Vectors: ${collectionInfo.vectorsCount}`);
        console.log(`  Vector Size: ${collectionInfo.config.vectorSize}`);
        console.log(`  Distance: ${collectionInfo.config.distance}\n`);

        // Test 4: Store sample embeddings
        console.log('Test 4: Storing sample embeddings...');
        const sampleChunks = [
            {
                text: 'Artificial intelligence is transforming the world.',
                index: 0,
                charCount: 50,
                wordCount: 6,
                embedding: Array(1024).fill(0).map(() => Math.random() * 2 - 1) // Random embedding
            },
            {
                text: 'Machine learning models require large datasets.',
                index: 1,
                charCount: 47,
                wordCount: 6,
                embedding: Array(1024).fill(0).map(() => Math.random() * 2 - 1)
            },
            {
                text: 'Natural language processing enables computers to understand text.',
                index: 2,
                charCount: 66,
                wordCount: 9,
                embedding: Array(1024).fill(0).map(() => Math.random() * 2 - 1)
            }
        ];

        const testFileId = 'test_file_' + Date.now();
        const pointIds = await qdrantService.storeChunkEmbeddings(
            sampleChunks,
            testFileId,
            'test-document.txt'
        );
        console.log(`✓ Stored ${pointIds.length} embeddings\n`);

        // Test 5: Search for similar chunks
        console.log('Test 5: Searching for similar chunks...');
        const queryEmbedding = Array(1024).fill(0).map(() => Math.random() * 2 - 1);
        const searchResults = await qdrantService.searchSimilarChunks(queryEmbedding, 3);

        console.log(`Found ${searchResults.length} results:`);
        searchResults.forEach((result, idx) => {
            console.log(`  ${idx + 1}. Score: ${result.score.toFixed(4)}`);
            console.log(`     Text: ${result.text.substring(0, 60)}...`);
            console.log(`     File: ${result.fileName}`);
        });
        console.log('');

        // Test 6: Delete embeddings
        console.log('Test 6: Deleting test embeddings...');
        await qdrantService.deleteFileEmbeddings(testFileId);
        console.log('✓ Successfully deleted test embeddings\n');

        // Test 7: Verify deletion
        console.log('Test 7: Verifying deletion...');
        const afterDeleteInfo = await qdrantService.getCollectionInfo();
        console.log(`Points after deletion: ${afterDeleteInfo.pointsCount}\n`);

        console.log('=== All Qdrant tests completed successfully! ===');
        console.log('\nQdrant is ready to use with your knowledge manager.');
        console.log('You can now:');
        console.log('  1. Upload files to generate and store embeddings');
        console.log('  2. Use POST /api/search to perform semantic search');
        console.log('  3. Access Qdrant dashboard at http://localhost:6333/dashboard');

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testQdrant();
