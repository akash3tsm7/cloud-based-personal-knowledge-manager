const fs = require('fs');
const path = require('path');

/**
 * Test Data Generator
 * Generates test data for load testing and benchmarking
 */
class TestDataGenerator {
    /**
     * Generate random text of specified length
     */
    static generateRandomText(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?\n';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Generate sample document text
     */
    static generateDocumentText(paragraphs = 10, wordsPerParagraph = 100) {
        const sentences = [
            'The quick brown fox jumps over the lazy dog.',
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            'Machine learning is transforming the way we process information.',
            'Cloud computing enables scalable and flexible infrastructure.',
            'Data science combines statistics, programming, and domain expertise.',
            'Artificial intelligence is revolutionizing various industries.',
            'Natural language processing helps computers understand human language.',
            'Vector databases enable efficient similarity search at scale.',
            'Knowledge management systems organize and retrieve information effectively.',
            'Semantic search improves information retrieval accuracy.'
        ];

        let document = '';
        for (let i = 0; i < paragraphs; i++) {
            let paragraph = '';
            for (let j = 0; j < wordsPerParagraph / 10; j++) {
                paragraph += sentences[Math.floor(Math.random() * sentences.length)] + ' ';
            }
            document += paragraph.trim() + '\n\n';
        }
        return document;
    }

    /**
     * Generate test PDF content (as text)
     */
    static generatePDFContent(pages = 5) {
        let content = '';
        for (let i = 1; i <= pages; i++) {
            content += `\n--- Page ${i} ---\n\n`;
            content += this.generateDocumentText(3, 150);
        }
        return content;
    }

    /**
     * Generate test questions for RAG
     */
    static generateTestQuestions(count = 10) {
        const questionTemplates = [
            'What is the main purpose of {topic}?',
            'How does {topic} work?',
            'What are the benefits of {topic}?',
            'Can you explain {topic} in simple terms?',
            'What are the key features of {topic}?',
            'How can I implement {topic}?',
            'What are the best practices for {topic}?',
            'What challenges does {topic} address?',
            'How does {topic} compare to alternatives?',
            'What is the future of {topic}?'
        ];

        const topics = [
            'machine learning',
            'vector databases',
            'semantic search',
            'knowledge management',
            'natural language processing',
            'cloud computing',
            'data science',
            'artificial intelligence',
            'information retrieval',
            'document processing'
        ];

        const questions = [];
        for (let i = 0; i < count; i++) {
            const template = questionTemplates[i % questionTemplates.length];
            const topic = topics[Math.floor(Math.random() * topics.length)];
            questions.push(template.replace('{topic}', topic));
        }
        return questions;
    }

    /**
     * Generate test user credentials
     */
    static generateTestUsers(count = 10) {
        const users = [];
        for (let i = 1; i <= count; i++) {
            users.push({
                username: `testuser${i}`,
                email: `testuser${i}@example.com`,
                password: `TestPass${i}!`
            });
        }
        return users;
    }

    /**
     * Create a test text file
     */
    static createTestTextFile(filename, sizeKB = 10) {
        const content = this.generateRandomText(sizeKB * 1024);
        const filepath = path.join(process.cwd(), 'performance', 'test-data', filename);

        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filepath, content);
        return filepath;
    }

    /**
     * Create a test document file
     */
    static createTestDocument(filename, paragraphs = 20) {
        const content = this.generateDocumentText(paragraphs);
        const filepath = path.join(process.cwd(), 'performance', 'test-data', filename);

        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filepath, content);
        return filepath;
    }

    /**
     * Create multiple test files of various sizes
     */
    static createTestFileSet() {
        const files = [];

        // Small files (1-10 KB)
        for (let i = 1; i <= 5; i++) {
            files.push(this.createTestTextFile(`small-${i}.txt`, Math.floor(Math.random() * 10) + 1));
        }

        // Medium files (10-100 KB)
        for (let i = 1; i <= 5; i++) {
            files.push(this.createTestTextFile(`medium-${i}.txt`, Math.floor(Math.random() * 90) + 10));
        }

        // Large files (100KB - 1MB)
        for (let i = 1; i <= 3; i++) {
            files.push(this.createTestTextFile(`large-${i}.txt`, Math.floor(Math.random() * 900) + 100));
        }

        // Document files
        for (let i = 1; i <= 5; i++) {
            files.push(this.createTestDocument(`document-${i}.txt`, Math.floor(Math.random() * 50) + 10));
        }

        return files;
    }

    /**
     * Generate test chunks for embedding
     */
    static generateTestChunks(count = 100, chunkSize = 500) {
        const chunks = [];
        for (let i = 0; i < count; i++) {
            chunks.push({
                text: this.generateRandomText(chunkSize),
                index: i,
                metadata: {
                    source: `test-document-${Math.floor(i / 10)}`,
                    page: Math.floor(i / 5) + 1
                }
            });
        }
        return chunks;
    }

    /**
     * Generate realistic file metadata
     */
    static generateFileMetadata(filename) {
        const extensions = {
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.jpg': 'image/jpeg',
            '.png': 'image/png'
        };

        const ext = path.extname(filename);
        return {
            fileName: filename,
            fileType: extensions[ext] || 'application/octet-stream',
            fileSize: Math.floor(Math.random() * 1000000) + 1000,
            uploadDate: new Date().toISOString()
        };
    }

    /**
     * Clean up test data directory
     */
    static cleanupTestData() {
        const testDataDir = path.join(process.cwd(), 'performance', 'test-data');
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
            console.log('Test data cleaned up');
        }
    }

    /**
     * Generate load test scenario data
     */
    static generateLoadTestScenario(userCount = 10, requestsPerUser = 5) {
        const users = this.generateTestUsers(userCount);
        const questions = this.generateTestQuestions(requestsPerUser * userCount);

        const scenario = {
            users,
            questions,
            duration: 60, // seconds
            rampUp: 10, // seconds
            targetRPS: userCount * requestsPerUser / 60
        };

        return scenario;
    }
}

module.exports = TestDataGenerator;
