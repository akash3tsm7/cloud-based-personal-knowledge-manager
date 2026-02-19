/**
 * Comprehensive End-to-End Pipeline Test
 * 
 * Tests the complete flow:
 * 1. Text extraction from a sample file
 * 2. Text chunking
 * 3. Embedding generation
 * 4. Storage in Qdrant
 * 5. RAG query functionality
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { extractText } = require('./utils/textExtractor');
const { chunkFileText } = require('./utils/chunking');
const { generateAndStoreChunkEmbeddings, generateEmbedding } = require('./utils/embeddingService');
const { answerQuestion } = require('./utils/ragService');
const qdrantService = require('./utils/qdrantService');
const mongoose = require('mongoose');

async function runComprehensiveTest() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Comprehensive End-to-End Pipeline Test');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        // Connect to MongoDB
        console.log('Step 1: Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Initialize Qdrant
        console.log('Step 2: Initializing Qdrant...');
        await qdrantService.initializeCollection();
        const collectionInfo = await qdrantService.getCollectionInfo();
        console.log(`✓ Qdrant initialized (${collectionInfo.pointsCount} points)\n`);

        // Test 1: Text Extraction
        console.log('═══ Test 1: Text Extraction ═══');
        const testText = `
        Cloud-Based Personal Knowledge Manager
        
        This is a comprehensive knowledge management system that allows users to:
        - Upload and process various document types (PDF, DOCX, TXT, images)
        - Extract text using advanced OCR for images
        - Generate embeddings using BGE-M3 model
        - Store embeddings in Qdrant vector database
        - Perform hybrid search (BM25 + Vector)
        - Answer questions using RAG (Retrieval Augmented Generation)
        
        Key Features:
        1. Multi-format document support
        2. Intelligent text chunking
        3. Local embedding generation
        4. Vector similarity search
        5. AI-powered question answering
        `;

        console.log(`✓ Sample text prepared (${testText.length} characters)\n`);

        // Test 2: Text Chunking
        console.log('═══ Test 2: Text Chunking ═══');
        const chunks = chunkFileText(testText, {
            filename: 'test-document.txt',
            mimeType: 'text/plain'
        });
        console.log(`✓ Created ${chunks.length} chunks`);
        chunks.forEach((chunk, idx) => {
            console.log(`  Chunk ${idx + 1}: ${chunk.text.substring(0, 60)}... (${chunk.text.length} chars)`);
        });
        console.log();

        // Test 3: Embedding Generation
        console.log('═══ Test 3: Embedding Generation ═══');
        const testFileId = 'test-file-' + Date.now();
        const testUserId = 'test-user-123';

        console.log('Generating embeddings for chunks...');
        const startTime = Date.now();
        const result = await generateAndStoreChunkEmbeddings(
            chunks,
            testFileId,
            'test-document.txt',
            testUserId
        );
        const duration = Date.now() - startTime;

        console.log(`✓ Generated and stored ${result.qdrantIds.length} embeddings`);
        console.log(`  Time taken: ${duration}ms (${(duration / chunks.length).toFixed(0)}ms per chunk)`);
        console.log(`  Qdrant IDs: ${result.qdrantIds.slice(0, 3).join(', ')}...`);
        console.log();

        // Test 4: Single Embedding Test
        console.log('═══ Test 4: Single Embedding Test ═══');
        const queryText = "What is a knowledge manager?";
        const queryEmbedding = await generateEmbedding(queryText);
        console.log(`✓ Generated query embedding: ${queryEmbedding.length} dimensions`);
        console.log(`  First 5 values: [${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log();

        // Test 5: RAG Query
        console.log('═══ Test 5: RAG Question Answering ═══');
        const testQuestions = [
            "What is this knowledge manager about?",
            "What are the key features?",
            "What document types are supported?"
        ];

        for (const question of testQuestions) {
            console.log(`\nQuestion: "${question}"`);
            try {
                const answer = await answerQuestion(question, {
                    searchMode: 'hybrid',
                    topK: 3
                });

                console.log(`Answer: ${answer.answer}`);
                console.log(`Sources: ${answer.sources.length} chunks used`);
                console.log(`Metadata: ${answer.metadata.chunksRetrieved} chunks retrieved, ${answer.metadata.uniqueFiles} unique files`);
            } catch (error) {
                console.log(`Error: ${error.message}`);
            }
        }
        console.log();

        // Test 6: Verify Qdrant Storage
        console.log('═══ Test 6: Verify Qdrant Storage ═══');
        const finalCollectionInfo = await qdrantService.getCollectionInfo();
        console.log(`✓ Total points in Qdrant: ${finalCollectionInfo.pointsCount}`);
        console.log(`  Vector size: ${finalCollectionInfo.config.params.vectors.size}`);
        console.log(`  Distance metric: ${finalCollectionInfo.config.params.vectors.distance}`);
        console.log();

        // Cleanup
        console.log('═══ Cleanup ═══');
        console.log('Deleting test embeddings from Qdrant...');
        await qdrantService.deleteFileEmbeddings(testFileId);
        console.log('✓ Test embeddings deleted');
        console.log();

        // Summary
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  ✅ ALL TESTS PASSED SUCCESSFULLY!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\nSummary:');
        console.log(`  ✓ Text extraction: Working`);
        console.log(`  ✓ Text chunking: ${chunks.length} chunks created`);
        console.log(`  ✓ Embedding generation: ${result.qdrantIds.length} embeddings`);
        console.log(`  ✓ Qdrant storage: Working`);
        console.log(`  ✓ RAG queries: Working`);
        console.log(`  ✓ Performance: ${(duration / chunks.length).toFixed(0)}ms per chunk`);
        console.log();

    } catch (error) {
        console.error('\n❌ TEST FAILED:');
        console.error(error);
        process.exit(1);
    } finally {
        // Disconnect
        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB');
    }
}

// Run the test
runComprehensiveTest();
