require('dotenv').config();
const ragService = require('./utils/ragService');
const qdrantService = require('./utils/qdrantService');

async function verify() {
    console.log('Verifying Confidence Scores...');
    try {
        const question = "What skills are mentioned in the resume?";
        const result = await ragService.answerQuestion(question, { topK: 3 });

        console.log('\n--- Results ---');
        result.sources.forEach((source, i) => {
            console.log(`Source ${i + 1}: ${source.fileName}`);
            console.log(`Score: ${source.score}`);
            console.log(`Text snippet: ${source.text.substring(0, 50)}...`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verify();
