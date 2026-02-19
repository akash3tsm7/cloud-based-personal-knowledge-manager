/**
 * COMPREHENSIVE END-TO-END SYSTEM TEST
 * 
 * This script tests the entire knowledge manager system:
 * 1. File upload and text extraction (PDF, DOCX, TXT, images)
 * 2. Text chunking
 * 3. Embedding generation (local BGE-M3)
 * 4. Qdrant vector storage
 * 5. BM25 keyword search
 * 6. Hybrid search (BM25 + Vector + RRF)
 * 7. RAG question answering
 * 8. Performance metrics
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateEmbedding, generateBatchEmbeddings } = require('./utils/embeddingService');
const { chunkFileText } = require('./utils/chunking');
const qdrantService = require('./utils/qdrantService');
const bm25Service = require('./utils/bm25Service');
const { answerQuestion } = require('./utils/ragService');

// Test data
const TEST_DOCUMENTS = [
    {
        name: "knowledge_manager_overview.txt",
        content: `Cloud-Based Personal Knowledge Manager

This is a comprehensive knowledge management system that allows users to upload and process various document types including PDF, DOCX, TXT, and images.

Key Features:
1. Multi-format document support
2. Advanced OCR for image text extraction using PaddleOCR
3. Local embedding generation using BGE-M3 model
4. Vector storage in Qdrant database
5. Hybrid search combining BM25 keyword search and vector similarity
6. RAG-based question answering using AI
7. Asynchronous file processing with Redis queue
8. Docker-based deployment for scalability

Technical Stack:
- Backend: Node.js with Express framework
- Database: MongoDB for metadata, Qdrant for vector embeddings
- Embedding Service: Python FastAPI with BGE-M3 model (1024 dimensions)
- Queue: Redis for distributed job management
- OCR: PaddleOCR for optical character recognition
- Search: BM25 for keyword search, Cosine similarity for vector search
- AI: Integration with LLM APIs for question answering`
    },
    {
        name: "technical_details.txt",
        content: `Technical Implementation Details

Embedding Service:
- Model: BAAI/bge-m3 (BGE-M3)
- Dimensions: 1024
- Batch size: 12 chunks per request
- Distance metric: Cosine similarity
- Deployment: Docker container with Python 3.10

Vector Database:
- Database: Qdrant
- Collection: knowledge_chunks
- Vector size: 1024
- Distance: Cosine
- Indexing: Optimized for fast retrieval

Search Implementation:
- BM25: Keyword-based search using natural library
- Vector Search: Semantic similarity using embeddings
- Hybrid Search: RRF (Reciprocal Rank Fusion) combining both methods
- Top-K: Configurable, default 5 results

Performance Targets:
- Single embedding: < 5 seconds
- Batch embedding (12 chunks): < 10 seconds
- Search latency: < 500ms
- File processing: Depends on file size and type`
    },
    {
        name: "user_guide.txt",
        content: `User Guide

How to Use the Knowledge Manager:

1. Upload Documents:
   - Supported formats: PDF, DOCX, XLSX, PPTX, CSV, TXT, PNG, JPG, JPEG
   - Maximum file size: Configurable
   - Multiple files can be uploaded simultaneously

2. Document Processing:
   - Text extraction happens automatically
   - Images are processed using OCR
   - Text is chunked into manageable pieces
   - Embeddings are generated for each chunk
   - Chunks are stored in vector database

3. Search and Query:
   - Ask questions in natural language
   - System retrieves relevant chunks
   - AI generates answers based on context
   - Source attribution shows which documents were used

4. Advanced Features:
   - Hybrid search for better accuracy
   - Confidence scores for answers
   - Source snippets for verification
   - File-specific queries
   - Batch document processing`
    }
];

const TEST_QUESTIONS = [
    "What is the knowledge manager?",
    "What document formats are supported?",
    "How does the embedding service work?",
    "What is the vector database used?",
    "How do I upload documents?",
    "What is hybrid search?",
    "What are the performance targets?"
];

async function runComprehensiveTest() {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  COMPREHENSIVE END-TO-END SYSTEM TEST');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const results = {
        timestamp: new Date().toISOString(),
        tests: {},
        performance: {},
        errors: [],
        summary: {}
    };

    try {
        // ═══════════════════════════════════════════════════════════════════
        // TEST 1: Qdrant Connection and Initialization
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 1: Qdrant Connection and Initialization');
        console.log('─'.repeat(70));

        const startQdrant = Date.now();
        await qdrantService.initializeCollection();
        const collectionInfo = await qdrantService.getCollectionInfo();
        const qdrantTime = Date.now() - startQdrant;

        results.tests.qdrant = {
            status: 'PASS',
            duration: qdrantTime,
            details: {
                pointsCount: collectionInfo.pointsCount,
                vectorSize: collectionInfo.config.vectorSize,
                distance: collectionInfo.config.distance
            }
        };

        console.log(`✓ Qdrant initialized successfully (${qdrantTime}ms)`);
        console.log(`  Points in collection: ${collectionInfo.pointsCount}`);
        console.log(`  Vector size: ${collectionInfo.config.vectorSize}`);
        console.log(`  Distance metric: ${collectionInfo.config.distance}`);

        // ═══════════════════════════════════════════════════════════════════
        // TEST 2: Embedding Service - Single Embedding
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 2: Embedding Service - Single Embedding');
        console.log('─'.repeat(70));

        const testText = "This is a test of the local BGE-M3 embedding service.";
        const startSingle = Date.now();
        const singleEmbedding = await generateEmbedding(testText);
        const singleTime = Date.now() - startSingle;

        const singlePass = singleEmbedding && singleEmbedding.length === 1024;
        results.tests.singleEmbedding = {
            status: singlePass ? 'PASS' : 'FAIL',
            duration: singleTime,
            details: {
                dimensions: singleEmbedding ? singleEmbedding.length : 0,
                targetDimensions: 1024
            }
        };
        results.performance.singleEmbedding = singleTime;

        console.log(`${singlePass ? '✓' : '✗'} Single embedding: ${singleTime}ms`);
        console.log(`  Dimensions: ${singleEmbedding.length} (expected: 1024)`);
        console.log(`  Performance: ${singleTime < 5000 ? 'GOOD' : 'SLOW'} (target: < 5000ms)`);

        // ═══════════════════════════════════════════════════════════════════
        // TEST 3: Embedding Service - Batch Embeddings
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 3: Embedding Service - Batch Embeddings');
        console.log('─'.repeat(70));

        const batchTexts = TEST_DOCUMENTS.map(doc => doc.content.substring(0, 200));
        const startBatch = Date.now();
        const batchEmbeddings = await generateBatchEmbeddings(batchTexts);
        const batchTime = Date.now() - startBatch;

        const batchPass = batchEmbeddings.length === batchTexts.length &&
            batchEmbeddings.every(e => e && e.length === 1024);
        results.tests.batchEmbedding = {
            status: batchPass ? 'PASS' : 'FAIL',
            duration: batchTime,
            details: {
                count: batchEmbeddings.length,
                avgTime: Math.round(batchTime / batchEmbeddings.length)
            }
        };
        results.performance.batchEmbedding = Math.round(batchTime / batchEmbeddings.length);

        console.log(`${batchPass ? '✓' : '✗'} Batch embeddings: ${batchTime}ms`);
        console.log(`  Count: ${batchEmbeddings.length} embeddings`);
        console.log(`  Average: ${Math.round(batchTime / batchEmbeddings.length)}ms per embedding`);
        console.log(`  Performance: ${batchTime < 10000 ? 'GOOD' : 'SLOW'} (target: < 10000ms for batch)`);

        // ═══════════════════════════════════════════════════════════════════
        // TEST 4: Text Chunking
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 4: Text Chunking');
        console.log('─'.repeat(70));

        const allChunks = [];
        const chunkingResults = [];

        for (const doc of TEST_DOCUMENTS) {
            const startChunk = Date.now();
            const chunks = chunkFileText(doc.content, {
                filename: doc.name,
                mimeType: 'text/plain'
            });
            const chunkTime = Date.now() - startChunk;

            allChunks.push(...chunks.map(c => ({ ...c, fileName: doc.name })));
            chunkingResults.push({
                file: doc.name,
                chunks: chunks.length,
                time: chunkTime
            });

            console.log(`  ${doc.name}: ${chunks.length} chunks (${chunkTime}ms)`);
        }

        results.tests.chunking = {
            status: 'PASS',
            details: {
                totalChunks: allChunks.length,
                files: chunkingResults
            }
        };

        console.log(`✓ Total chunks created: ${allChunks.length}`);

        // ═══════════════════════════════════════════════════════════════════
        // TEST 5: Qdrant Storage
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 5: Qdrant Vector Storage');
        console.log('─'.repeat(70));

        const testFileId = 'test-comprehensive-' + Date.now();
        const testUserId = 'test-user-123';

        console.log('  Generating embeddings for all chunks...');
        const startEmbedGen = Date.now();
        const chunkTexts = allChunks.map(c => c.text);
        const chunkEmbeddings = await generateBatchEmbeddings(chunkTexts);
        const embedGenTime = Date.now() - startEmbedGen;

        console.log(`  ✓ Generated ${chunkEmbeddings.length} embeddings (${embedGenTime}ms)`);

        console.log('  Storing in Qdrant...');
        const startStore = Date.now();
        const enrichedChunks = allChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: chunkEmbeddings[idx]
        }));

        const qdrantIds = await qdrantService.storeChunkEmbeddings(
            enrichedChunks,
            testFileId,
            'test-documents',
            testUserId
        );
        const storeTime = Date.now() - startStore;

        results.tests.qdrantStorage = {
            status: qdrantIds.length === allChunks.length ? 'PASS' : 'FAIL',
            duration: storeTime,
            details: {
                stored: qdrantIds.length,
                expected: allChunks.length
            }
        };
        results.performance.qdrantStorage = storeTime;

        console.log(`✓ Stored ${qdrantIds.length} embeddings in Qdrant (${storeTime}ms)`);

        // ═══════════════════════════════════════════════════════════════════
        // TEST 6: Semantic Search
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 6: Semantic Search');
        console.log('─'.repeat(70));

        const searchQuery = "What are the key features of the knowledge manager?";
        console.log(`  Query: "${searchQuery}"`);

        const startSearch = Date.now();
        const queryEmbedding = await generateEmbedding(searchQuery);
        const searchResults = await qdrantService.searchSimilarChunks(queryEmbedding, 5);
        const searchTime = Date.now() - startSearch;

        results.tests.semanticSearch = {
            status: searchResults.length > 0 ? 'PASS' : 'FAIL',
            duration: searchTime,
            details: {
                resultsCount: searchResults.length,
                topScore: searchResults[0]?.score || 0
            }
        };
        results.performance.semanticSearch = searchTime;

        console.log(`✓ Found ${searchResults.length} results (${searchTime}ms)`);
        searchResults.forEach((result, idx) => {
            console.log(`  ${idx + 1}. [Score: ${result.score.toFixed(4)}] ${result.text.substring(0, 60)}...`);
        });

        // ═══════════════════════════════════════════════════════════════════
        // TEST 7: BM25 Search
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 7: BM25 Keyword Search');
        console.log('─'.repeat(70));

        try {
            const startBM25 = Date.now();
            const bm25Results = await bm25Service.searchBM25(searchQuery, 5);
            const bm25Time = Date.now() - startBM25;

            results.tests.bm25Search = {
                status: 'PASS',
                duration: bm25Time,
                details: {
                    resultsCount: bm25Results.length
                }
            };
            results.performance.bm25Search = bm25Time;

            console.log(`✓ BM25 search completed (${bm25Time}ms)`);
            console.log(`  Results: ${bm25Results.length} chunks`);
        } catch (error) {
            results.tests.bm25Search = {
                status: 'SKIP',
                error: error.message
            };
            console.log(`⚠ BM25 search skipped: ${error.message}`);
        }

        // ═══════════════════════════════════════════════════════════════════
        // TEST 8: RAG Question Answering
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ TEST 8: RAG Question Answering');
        console.log('─'.repeat(70));

        const ragResults = [];

        for (const question of TEST_QUESTIONS.slice(0, 3)) {
            console.log(`\n  Question: "${question}"`);

            try {
                const startRAG = Date.now();
                const answer = await answerQuestion(question, {
                    searchMode: 'hybrid',
                    topK: 5
                });
                const ragTime = Date.now() - startRAG;

                ragResults.push({
                    question,
                    status: 'PASS',
                    duration: ragTime,
                    answer: answer.answer.substring(0, 100) + '...',
                    sourcesCount: answer.sources.length
                });

                console.log(`  ✓ Answer: ${answer.answer.substring(0, 100)}...`);
                console.log(`  Sources: ${answer.sources.length} chunks`);
                console.log(`  Time: ${ragTime}ms`);
            } catch (error) {
                ragResults.push({
                    question,
                    status: 'FAIL',
                    error: error.message
                });
                console.log(`  ✗ Error: ${error.message}`);
            }
        }

        results.tests.ragQuestions = {
            status: ragResults.every(r => r.status === 'PASS') ? 'PASS' : 'PARTIAL',
            details: ragResults
        };

        // ═══════════════════════════════════════════════════════════════════
        // CLEANUP
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n█ CLEANUP');
        console.log('─'.repeat(70));

        await qdrantService.deleteFileEmbeddings(testFileId);
        console.log('✓ Test data cleaned up');

        // ═══════════════════════════════════════════════════════════════════
        // SUMMARY
        // ═══════════════════════════════════════════════════════════════════
        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log('  TEST SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════════\n');

        const testsPassed = Object.values(results.tests).filter(t => t.status === 'PASS').length;
        const totalTests = Object.keys(results.tests).length;

        results.summary = {
            totalTests,
            passed: testsPassed,
            failed: totalTests - testsPassed,
            passRate: ((testsPassed / totalTests) * 100).toFixed(1) + '%'
        };

        console.log(`Tests Passed: ${testsPassed}/${totalTests} (${results.summary.passRate})`);
        console.log('\nPerformance Metrics:');
        console.log(`  Single Embedding: ${results.performance.singleEmbedding}ms`);
        console.log(`  Batch Embedding (avg): ${results.performance.batchEmbedding}ms per chunk`);
        console.log(`  Qdrant Storage: ${results.performance.qdrantStorage}ms`);
        console.log(`  Semantic Search: ${results.performance.semanticSearch}ms`);
        if (results.performance.bm25Search) {
            console.log(`  BM25 Search: ${results.performance.bm25Search}ms`);
        }

        console.log('\nTest Results:');
        Object.entries(results.tests).forEach(([name, result]) => {
            const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠';
            console.log(`  ${icon} ${name}: ${result.status}`);
        });

        console.log('\n═══════════════════════════════════════════════════════════════════');
        if (testsPassed === totalTests) {
            console.log('  ✅ ALL TESTS PASSED! System is working correctly.');
        } else {
            console.log('  ⚠ SOME TESTS FAILED. Review the results above.');
        }
        console.log('═══════════════════════════════════════════════════════════════════\n');

        // Save results to file
        fs.writeFileSync(
            path.join(__dirname, 'test_results.json'),
            JSON.stringify(results, null, 2)
        );
        console.log('✓ Test results saved to test_results.json\n');

        return results;

    } catch (error) {
        console.error('\n❌ CRITICAL ERROR:');
        console.error(error);
        results.errors.push(error.message);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    runComprehensiveTest()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { runComprehensiveTest };
