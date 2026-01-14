const { generateEmbedding } = require('./embeddingService');
const qdrantService = require('./qdrantService');
const llmService = require('./llmService');
const bm25Service = require('./bm25Service');
const rrfService = require('./rrfService');

/**
 * RAG Service with Hybrid Search (BM25 + Vector + RRF)
 */

const DEFAULT_CONFIG = {
    topK: 5,
    minScore: 0.3,
    maxContextLength: 4000,
    includeMetadata: true,
    searchMode: 'hybrid', // 'vector', 'bm25', 'hybrid'
    rrfK: 60,
    hybridWeights: { bm25: 0.3, vector: 0.7 }
};

/**
 * Answer a question using Hybrid RAG (BM25 + Vector + RRF)
 * @param {string} question - User's question
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Answer with metadata
 */
async function answerQuestion(question, options = {}) {
    try {
        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            throw new Error('Question is required');
        }

        const config = { ...DEFAULT_CONFIG, ...options };
        console.log(`\n=== Hybrid RAG Pipeline Started ===`);
        console.log(`Question: "${question}"`);
        console.log(`Search Mode: ${config.searchMode}`);

        let finalResults = [];

        // HYBRID SEARCH: BM25 + Vector + RRF
        if (config.searchMode === 'hybrid') {
            // Step 1: BM25 Keyword Search
            console.log('\n[Step 1/5] Running BM25 keyword search...');
            const bm25Results = await bm25Service.searchBM25(
                question,
                config.topK * 2 // Get more results for better fusion
            );
            console.log(`✓ BM25 found ${bm25Results.length} results`);

            // Step 2: Vector Semantic Search
            console.log('\n[Step 2/5] Running vector semantic search...');
            const questionEmbedding = await generateEmbedding(question);

            if (!questionEmbedding) {
                throw new Error('Failed to generate question embedding');
            }

            const vectorResults = await qdrantService.searchSimilarChunks(
                questionEmbedding,
                config.topK * 2
            );
            console.log(`✓ Vector search found ${vectorResults.length} results`);

            // Step 3: Apply RRF Fusion
            console.log('\n[Step 3/5] Applying Reciprocal Rank Fusion...');
            finalResults = rrfService.hybridSearch(
                bm25Results,
                vectorResults,
                config.rrfK
            );
            console.log(`✓ RRF fused ${finalResults.length} results`);

            // Optional: Apply diversity penalty
            finalResults = rrfService.applyDiversityPenalty(finalResults);

            // Take top K after fusion
            finalResults = finalResults.slice(0, config.topK);
        }
        // VECTOR ONLY SEARCH
        else if (config.searchMode === 'vector') {
            console.log('\n[Step 1/4] Generating question embedding...');
            const questionEmbedding = await generateEmbedding(question);

            if (!questionEmbedding) {
                throw new Error('Failed to generate question embedding');
            }

            console.log('\n[Step 2/4] Searching Qdrant...');
            const searchResults = await qdrantService.searchSimilarChunks(
                questionEmbedding,
                config.topK
            );

            finalResults = searchResults
                .filter(r => r.score >= config.minScore)
                .map(r => ({
                    fileId: r.fileId,
                    fileName: r.fileName,
                    chunkIndex: r.chunkIndex,
                    text: r.text,
                    score: r.score,
                    source: 'vector',
                    rrfScore: r.score
                }));
        }
        // BM25 ONLY SEARCH
        else if (config.searchMode === 'bm25') {
            console.log('\n[Step 1/4] Running BM25 search...');
            finalResults = await bm25Service.searchBM25(question, config.topK);
        }

        if (!finalResults || finalResults.length === 0) {
            console.log('✗ No relevant chunks found');
            return {
                answer: "I don't have any relevant information to answer that question.",
                sources: [],
                metadata: {
                    chunksRetrieved: 0,
                    searchMode: config.searchMode
                }
            };
        }

        console.log(`\n[Step 4/5] Found ${finalResults.length} relevant chunks`);
        finalResults.forEach((chunk, idx) => {
            const score = chunk.rrfScore || chunk.score;
            console.log(`  ${idx + 1}. [RRF: ${score.toFixed(4)}] ${chunk.fileName} - ${chunk.text.substring(0, 60)}...`);
        });

        // Prepare context
        console.log('\n[Step 5/5] Generating answer with LLM...');
        const context = prepareContext(finalResults, config.maxContextLength);

        // Get unique file names BEFORE generating answer so LLM knows about them
        const uniqueFileNames = [...new Set(finalResults.map(chunk => chunk.fileName))];

        // Create temporary metadata object to pass to LLM
        const tempMetadata = {
            chunksUsed: finalResults.length,
            uniqueFiles: uniqueFileNames.length,
            uniqueFileNames: uniqueFileNames
        };

        // Generate answer with metadata
        const answer = await llmService.generateAnswer(question, context, {
            temperature: 0.2,
            maxTokens: 500,
            result: { metadata: tempMetadata } // Pass metadata to LLM
        });

        console.log('✓ Answer generated');
        console.log('\n=== Hybrid RAG Pipeline Completed ===\n');

        return {
            answer: answer,
            context: context, // Add the actual context used for generation
            sources: finalResults.map(chunk => ({
                fileName: chunk.fileName,
                score: chunk.vectorScore || chunk.rrfScore || chunk.score, // Prefer vector score for user confidence
                text: chunk.text,
                chunkIndex: chunk.chunkIndex,
                fileId: chunk.fileId,
                sources: chunk.sources || [chunk.source],
                fusionRank: chunk.fusionRank
            })),
            metadata: {
                question: question,
                chunksRetrieved: finalResults.length,
                chunksUsed: finalResults.length, // Add this for consistency
                contextLength: context.length,
                uniqueFiles: uniqueFileNames.length,
                uniqueFileNames: uniqueFileNames,
                searchMode: config.searchMode,
                timestamp: new Date().toISOString(),
            }
        };

    } catch (error) {
        console.error('Error in Hybrid RAG pipeline:', error.message);
        throw error;
    }
}

/**
 * Prepare context string from retrieved chunks
 */
function prepareContext(chunks, maxLength) {
    let context = '';
    let currentLength = 0;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const formattedChunk = `[Source ${i + 1}: ${chunk.fileName}]\n${chunk.text}\n\n`;

        if (currentLength + formattedChunk.length > maxLength) {
            console.log(`Context length limit reached. Using ${i} out of ${chunks.length} chunks.`);
            break;
        }

        context += formattedChunk;
        currentLength += formattedChunk.length;
    }

    return context.trim();
}

/**
 * Answer question with file filtering
 */
async function answerQuestionForFile(question, fileId, options = {}) {
    try {
        console.log(`\n=== Hybrid RAG Pipeline (File-specific) ===`);
        console.log(`Question: "${question}"`);
        console.log(`File ID: ${fileId}`);

        const config = { ...DEFAULT_CONFIG, ...options };

        // For file-specific search, use vector search with filter
        const questionEmbedding = await generateEmbedding(question);

        if (!questionEmbedding) {
            throw new Error('Failed to generate question embedding');
        }

        const filter = {
            must: [{ key: 'fileId', match: { value: fileId } }]
        };

        const searchResults = await qdrantService.searchSimilarChunks(
            questionEmbedding,
            config.topK,
            filter
        );

        if (!searchResults || searchResults.length === 0) {
            return {
                answer: "I couldn't find relevant information in this specific document.",
                sources: [],
                metadata: { fileId, chunksRetrieved: 0 }
            };
        }

        const context = prepareContext(searchResults, config.maxContextLength);
        const answer = await llmService.generateAnswer(question, context);

        return {
            answer: answer,
            sources: searchResults.map(chunk => ({
                fileName: chunk.fileName,
                score: chunk.score,
                text: chunk.text,
            })),
            metadata: {
                question,
                fileId,
                chunksRetrieved: searchResults.length,
                contextLength: context.length,
            }
        };

    } catch (error) {
        console.error('Error in file-specific RAG:', error.message);
        throw error;
    }
}

/**
 * Get suggested questions
 */
async function getSuggestedQuestions(limit = 5) {
    try {
        const collectionInfo = await qdrantService.getCollectionInfo();

        if (collectionInfo.pointsCount === 0) {
            return ["Upload some documents first to get started!"];
        }

        return [
            "What are the main topics covered in the documents?",
            "Can you summarize the key points?",
            "What skills or qualifications are mentioned?",
            "Are there any specific dates or timelines mentioned?",
            "What are the important details I should know?",
        ];

    } catch (error) {
        console.error('Error getting suggestions:', error.message);
        return [];
    }
}

module.exports = {
    answerQuestion,
    answerQuestionForFile,
    getSuggestedQuestions,
    prepareContext,
};