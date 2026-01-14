const { evaluateRetrieval, evaluateAnswerRelevance } = require('../utils/ragEvaluation');
require('dotenv').config();

async function testJudge() {
    console.log('Testing Judge Logic...');

    // Dummy Data
    const question = "What is the capital of France?";
    const chunks = [{ text: "Paris is the capital of France." }];
    const answer = "Paris.";

    try {
        console.log('1. Testing evaluateRetrieval...');
        const retrieval = await evaluateRetrieval(question, chunks);
        console.log('Retrieval Result:', JSON.stringify(retrieval, null, 2));

        console.log('2. Testing evaluateAnswerRelevance...');
        const relevance = await evaluateAnswerRelevance(question, answer);
        console.log('Relevance Result:', JSON.stringify(relevance, null, 2));

    } catch (error) {
        console.error('Judge Test Failed:', error);
    }
}

testJudge();
