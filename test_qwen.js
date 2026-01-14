require('dotenv').config();
const { runImageOcr } = require('./utils/ocrService');

async function test() {
    console.log('Environment check:');
    console.log('  QWEN_API_KEY:', process.env.QWEN_API_KEY ? 'Set ✓' : 'Missing ✗');
    console.log('');

    try {
        const testImage = './uploads/your-test-image.jpg'; // Update this path
        console.log('Testing Qwen OCR with:', testImage);
        const text = await runImageOcr(testImage);

        console.log('\n✓ SUCCESS!');
        console.log('Extracted text:');
        console.log(text);
    } catch (error) {
        console.error('\n✗ FAILED:', error.message);
    }
}

test();