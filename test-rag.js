require('dotenv').config();
const ragService = require('./utils/ragService');
const qdrantService = require('./utils/qdrantService');

/**
 * Test script for RAG (Retrieval-Augmented Generation) system
 * 
 * This script tests the complete RAG pipeline:
 * 1. Question embedding generation
 * 2. Vector similarity search
 * 3. Context preparation
 * 4. LLM answer generation
 */

async function testRAG() {
    console.log('=== Testing RAG System ===\n');

    try {
        // Check if Qdrant has any data
        console.log('Step 1: Checking knowledge base...');
        const collectionInfo = await qdrantService.getCollectionInfo();
        console.log(`Knowledge base has ${collectionInfo.pointsCount} chunks stored\n`);

        if (collectionInfo.pointsCount === 0) {
            console.error('❌ Knowledge base is empty!');
            console.log('Please upload some documents first using:');
            console.log('  POST http://localhost:5000/api/upload');
            console.log('\nOr use the web interface at http://localhost:5000/api/upload');
            process.exit(1);
        }

        // Test questions (modify based on your uploaded documents)
        const testQuestions = [
            "What skills are mentioned in the resume?",
            "What experience does the candidate have?",
            "What education background is mentioned?",
            "What projects are described?",
            "Summarize the main qualifications",
        ];

        console.log('\n=== Running Test Questions ===\n');

        for (let i = 0; i < testQuestions.length; i++) {
            const question = testQuestions[i];

            console.log(`\n${'='.repeat(80)}`);
            console.log(`TEST ${i + 1}/${testQuestions.length}`);
            console.log(`${'='.repeat(80)}`);

            try {
                const result = await ragService.answerQuestion(question, {
                    topK: 5,
                    minScore: 0.3,
                });

                console.log('\n📋 RESULTS:');
                console.log('─'.repeat(80));
                console.log(`\n❓ QUESTION:\n${question}\n`);
                console.log(`💡 ANSWER:\n${result.answer}\n`);
                console.log(`📚 SOURCES (${result.sources.length}):`);
                result.sources.forEach((source, idx) => {
                    console.log(`\n  ${idx + 1}. ${source.fileName} [Score: ${source.score.toFixed(3)}]`);
                    console.log(`     "${source.text.substring(0, 100)}..."`);
                });
                console.log(`\n📊 METADATA:`);
                console.log(`  - Chunks Retrieved: ${result.metadata.chunksRetrieved}`);
                console.log(`  - Chunks Used: ${result.metadata.chunksUsed}`);
                console.log(`  - Context Length: ${result.metadata.contextLength} chars`);

            } catch (error) {
                console.error(`\n❌ Error for question "${question}":`, error.message);
            }

            // Small delay between questions
            if (i < testQuestions.length - 1) {
                console.log('\nWaiting 2 seconds before next question...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('✅ RAG SYSTEM TEST COMPLETED');
        console.log('='.repeat(80));
        console.log('\nYour RAG system is working correctly! 🎉');
        console.log('\nYou can now:');
        console.log('  1. Use the API: POST http://localhost:5000/api/rag/ask');
        console.log('  2. Try different questions');
        console.log('  3. Integrate with your UI');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testRAG();