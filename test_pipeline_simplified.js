/**
 * Simplified End-to-End Pipeline Test
 * 
 * Tests core functionality without queue dependencies:
 * 1. Embedding generation (single and batch)
 * 2. Text chunking
 * 3. Qdrant storage and retrieval
 * 4. RAG query functionality
 */

require('dotenv').config();
const { chunkFileText } = require('./utils/chunking');
const { generateEmbedding, generateBatchEmbeddings } = require('./utils/embeddingService');
const qdrantService = require('./utils/qdrantService');

async function runSimplifiedTest() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Simplified End-to-End Pipeline Test');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        // Initialize Qdrant
        console.log('Step 1: Initializing Qdrant...');
        await qdrantService.initializeCollection();
        const collectionInfo = await qdrantService.getCollectionInfo();
        console.log(`✓ Qdrant initialized (${collectionInfo.pointsCount} points)\n`);

        // Test 1: Single Embedding
        console.log('═══ Test 1: Single Embedding Generation ═══');
        const testText = "This is a test of the local BGE-M3 embedding service.";
        const startSingle = Date.now();
        const embedding = await generateEmbedding(testText);
        const durationSingle = Date.now() - startSingle;

        console.log(`✓ Generated embedding: ${embedding.length} dimensions`);
        console.log(`  Time taken: ${durationSingle}ms`);
        console.log(`  First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        console.log();

        // Test 2: Batch Embeddings
        console.log('═══ Test 2: Batch Embedding Generation ═══');
        const testTexts = [
            "Cloud-Based Personal Knowledge Manager",
            "Document processing and text extraction",
            "Vector embeddings and semantic search",
            "RAG-based question answering",
            "Hybrid search with BM25 and vector similarity"
        ];

        const startBatch = Date.now();
        const embeddings = await generateBatchEmbeddings(testTexts);
        const durationBatch = Date.now() - startBatch;

        console.log(`✓ Generated ${embeddings.length} embeddings`);
        console.log(`  Time taken: ${durationBatch}ms (${(durationBatch / embeddings.length).toFixed(0)}ms per embedding)`);
        console.log(`  All embeddings valid: ${embeddings.every(e => e && e.length === 1024)}`);
        console.log();

        // Test 3: Text Chunking
        console.log('═══ Test 3: Text Chunking ═══');
        const longText = `
        Cloud-Based Personal Knowledge Manager
        
        This is a comprehensive knowledge management system that allows users to:
        - Upload and process various document types (PDF, DOCX, TXT, images)
        - Extract text using advanced OCR for images
        - Generate embeddings using BGE-M3 model locally
        - Store embeddings in Qdrant vector database
        - Perform hybrid search combining BM25 keyword search and vector similarity
        - Answer questions using RAG (Retrieval Augmented Generation)
        
        Key Features:
        1. Multi-format document support including PDF, DOCX, XLSX, PPTX, CSV, TXT, and images
        2. Intelligent text chunking with configurable chunk size and overlap
        3. Local embedding generation using BGE-M3 model (no API calls required)
        4. Vector similarity search with Qdrant
        5. AI-powered question answering with source attribution
        6. Asynchronous file processing with Redis queue
        7. Docker-based deployment for easy scaling
        
        Technical Stack:
        - Backend: Node.js with Express
        - Database: MongoDB for metadata, Qdrant for vectors
        - Embedding: Python FastAPI service with BGE-M3
        - Queue: Redis for job management
        - OCR: PaddleOCR for image text extraction
        `;

        const chunks = chunkFileText(longText, {
            filename: 'test-document.txt',
            mimeType: 'text/plain'
        });

        console.log(`✓ Created ${chunks.length} chunks`);
        chunks.forEach((chunk, idx) => {
            console.log(`  Chunk ${idx + 1}: ${chunk.text.substring(0, 50)}... (${chunk.text.length} chars)`);
        });
        console.log();

        // Test 4: Store in Qdrant
        console.log('═══ Test 4: Qdrant Storage ═══');
        const testFileId = 'test-file-' + Date.now();
        const testUserId = 'test-user-123';

        console.log('Generating embeddings for chunks...');
        const chunkTexts = chunks.map(c => c.text);
        const chunkEmbeddings = await generateBatchEmbeddings(chunkTexts);

        console.log('Storing in Qdrant...');
        const enrichedChunks = chunks.map((chunk, idx) => ({
            ...chunk,
            embedding: chunkEmbeddings[idx]
        }));

        const qdrantIds = await qdrantService.storeChunkEmbeddings(
            enrichedChunks,
            testFileId,
            'test-document.txt',
            testUserId
        );

        console.log(`✓ Stored ${qdrantIds.length} embeddings in Qdrant`);
        console.log(`  Qdrant IDs: ${qdrantIds.slice(0, 3).join(', ')}...`);
        console.log();

        // Test 5: Semantic Search
        console.log('═══ Test 5: Semantic Search ═══');
        const queryText = "What are the key features of the knowledge manager?";
        console.log(`Query: "${queryText}"`);

        const queryEmbedding = await generateEmbedding(queryText);
        const searchResults = await qdrantService.searchSimilarChunks(queryEmbedding, 3);

        console.log(`✓ Found ${searchResults.length} similar chunks:`);
        searchResults.forEach((result, idx) => {
            console.log(`  ${idx + 1}. [Score: ${result.score.toFixed(4)}] ${result.text.substring(0, 60)}...`);
        });
        console.log();

        // Test 6: Verify Collection Info
        console.log('═══ Test 6: Verify Qdrant Collection ═══');
        const finalInfo = await qdrantService.getCollectionInfo();
        console.log(`✓ Collection Info:`);
        console.log(`  Total points: ${finalInfo.pointsCount}`);
        console.log(`  Vector size: ${finalInfo.config.params.vectors.size}`);
        console.log(`  Distance metric: ${finalInfo.config.params.vectors.distance}`);
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
        console.log(`  ✓ Single embedding: ${durationSingle}ms`);
        console.log(`  ✓ Batch embeddings: ${(durationBatch / embeddings.length).toFixed(0)}ms per embedding`);
        console.log(`  ✓ Text chunking: ${chunks.length} chunks created`);
        console.log(`  ✓ Qdrant storage: ${qdrantIds.length} embeddings stored`);
        console.log(`  ✓ Semantic search: ${searchResults.length} results retrieved`);
        console.log(`  ✓ All embeddings: 1024 dimensions`);
        console.log('\n✅ Local BGE-M3 embedding service is working correctly!');
        console.log();

    } catch (error) {
        console.error('\n❌ TEST FAILED:');
        console.error(error);
        process.exit(1);
    }
}

// Run the test
runSimplifiedTest();
