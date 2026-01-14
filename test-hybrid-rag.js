require('dotenv').config();
const mongoose = require('mongoose');
const { answerQuestion } = require('./utils/ragService');
const qdrantService = require('./utils/qdrantService');

/**
 * Test Hybrid RAG System (BM25 + Vector + RRF)
 */

async function testHybridRAG() {
    console.log('=== Testing Hybrid RAG System ===\n');

    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB');

        // Check Qdrant
        await qdrantService.checkConnection();
        console.log('✓ Connected to Qdrant\n');

        const testQuestions = [
            {
                question: "What skills are mentioned in the resume?",
                mode: "hybrid"
            },
            {
                question: "Python programming experience",
                mode: "hybrid"
            },
            {
                question: "education background",
                mode: "hybrid"
            }
        ];

        for (let i = 0; i < testQuestions.length; i++) {
            const { question, mode } = testQuestions[i];

            console.log(`\n${'='.repeat(80)}`);
            console.log(`TEST ${i + 1}/${testQuestions.length}`);
            console.log(`${'='.repeat(80)}\n`);

            // Test with Hybrid Search
            const result = await answerQuestion(question, {
                topK: 5,
                searchMode: mode,
                rrfK: 60
            });

            console.log(`\n📋 RESULTS:`);
            console.log(`${'─'.repeat(80)}\n`);
            console.log(`❓ QUESTION:\n${question}\n`);
            console.log(`💡 ANSWER:\n${result.answer}\n`);
            console.log(`📚 SOURCES (${result.sources.length}):\n`);

            result.sources.forEach((source, idx) => {
                console.log(`  ${idx + 1}. ${source.fileName}`);
                console.log(`     RRF Score: ${source.score.toFixed(4)}`);
                console.log(`     Fusion Rank: ${source.fusionRank}`);
                console.log(`     Sources: ${source.sources.join(', ')}`);
                console.log(`     Text: "${source.text.substring(0, 100)}..."\n`);
            });

            console.log(`📊 METADATA:`);
            console.log(`  - Search Mode: ${result.metadata.searchMode}`);
            console.log(`  - Chunks Retrieved: ${result.metadata.chunksRetrieved}`);
            console.log(`  - Context Length: ${result.metadata.contextLength} chars\n`);

            // Wait before next question
            if (i < testQuestions.length - 1) {
                console.log('Waiting 2 seconds before next question...\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log('✅ HYBRID RAG SYSTEM TEST COMPLETED');
        console.log(`${'='.repeat(80)}\n`);

        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB');

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

testHybridRAG();