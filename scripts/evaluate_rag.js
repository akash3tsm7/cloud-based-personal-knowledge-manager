require('dotenv').config();
const { evaluateRAG } = require('../utils/ragEvaluation');
const qdrantService = require('../utils/qdrantService');
const mongoose = require('mongoose');

async function runEvaluation() {
    console.log('=== Starting RAG Evaluation Pipeline ===\n');

    try {
        // Connect to MongoDB first
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ MongoDB Connected\n');

        // Check if DB is ready
        const collectionInfo = await qdrantService.getCollectionInfo();
        if (collectionInfo.pointsCount === 0) {
            console.error('❌ Knowledge base is empty! Please upload documents first.');
            await mongoose.connection.close();
            process.exit(1);
        }

        const testQuestions = [
            "What skills are mentioned in the resume?", // Broad
            "What is the candidate's education?", // Specific
            "What is the capital of Mars?", // Irrelevant / Hallucination trap
        ];

        const reports = [];

        for (const question of testQuestions) {
            try {
                const report = await evaluateRAG(question);
                reports.push(report);
                console.log('\n--- Evaluation Result ---');
                console.log(JSON.stringify(report, null, 2));

            } catch (error) {
                console.error(`Error evaluating question "${question}":`, error.stack);
            }
        }

        console.log('\n=== Final Summary ===');
        const summary = {
            totalQuestions: reports.length,
            averageQuality: reports.reduce((acc, r) => acc + r.overallQuality, 0) / reports.length,
            verdicts: reports.map(r => ({ question: r.question, verdict: r.verdict }))
        };
        console.log(JSON.stringify(summary, null, 2));

        // Close MongoDB connection
        await mongoose.connection.close();
        console.log('\n✓ MongoDB connection closed');

    } catch (error) {
        console.error('Evaluation failed:', error);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

runEvaluation();
