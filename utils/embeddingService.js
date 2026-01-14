const OpenAI = require('openai');
const qdrantService = require('./qdrantService');

/**
 * Embedding Service using NVIDIA's BGE-M3 Model
 * 
 * This service generates text embeddings using NVIDIA's API
 * with the BGE-M3 model for semantic search capabilities.
 * Integrates with Qdrant for vector storage.
 */

// Initialize OpenAI client with NVIDIA API configuration
const openai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

const EMBEDDING_MODEL = 'baai/bge-m3';
const BATCH_SIZE = 10; // Process embeddings in batches to avoid rate limits

/**
 * Generate embedding for a single text
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<Array<number>>} - Embedding vector
 */
async function generateEmbedding(text) {
    try {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.warn('Empty or invalid text provided for embedding');
            return null;
        }

        // Truncate text if too long (BGE-M3 has a token limit)
        const maxLength = 8000; // Conservative limit
        const truncatedText = text.length > maxLength
            ? text.substring(0, maxLength)
            : text;

        const response = await openai.embeddings.create({
            input: [truncatedText],
            model: EMBEDDING_MODEL,
            encoding_format: 'float',
            truncate: 'NONE'
        });

        const embedding = response.data[0].embedding;
        console.log(`Generated embedding with ${embedding.length} dimensions`);

        return embedding;
    } catch (error) {
        console.error('Error generating embedding:', error.message);

        // Handle rate limiting
        if (error.status === 429) {
            console.log('Rate limit hit, waiting 2 seconds before retry...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return generateEmbedding(text); // Retry once
        }

        throw error;
    }
}

/**
 * Generate embeddings for multiple texts in batches
 * @param {Array<string>} texts - Array of texts to generate embeddings for
 * @returns {Promise<Array<Array<number>>>} - Array of embedding vectors
 */
async function generateBatchEmbeddings(texts) {
    try {
        if (!Array.isArray(texts) || texts.length === 0) {
            console.warn('Empty or invalid texts array provided');
            return [];
        }

        const embeddings = [];

        // Process in batches to avoid rate limits
        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);

            console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`);

            // Filter out empty texts
            const validTexts = batch.filter(text =>
                text && typeof text === 'string' && text.trim().length > 0
            );

            if (validTexts.length === 0) {
                // Add null embeddings for empty texts
                embeddings.push(...new Array(batch.length).fill(null));
                continue;
            }

            // Truncate texts if too long
            const maxLength = 8000;
            const truncatedTexts = validTexts.map(text =>
                text.length > maxLength ? text.substring(0, maxLength) : text
            );

            try {
                const response = await openai.embeddings.create({
                    input: truncatedTexts,
                    model: EMBEDDING_MODEL,
                    encoding_format: 'float',
                    truncate: 'NONE'
                });

                const batchEmbeddings = response.data.map(item => item.embedding);
                embeddings.push(...batchEmbeddings);

                console.log(`Generated ${batchEmbeddings.length} embeddings`);

                // Small delay between batches to avoid rate limiting
                if (i + BATCH_SIZE < texts.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);

                // Handle rate limiting
                if (error.status === 429) {
                    console.log('Rate limit hit, waiting 5 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    i -= BATCH_SIZE; // Retry this batch
                    continue;
                }

                // Add null embeddings for failed batch
                embeddings.push(...new Array(batch.length).fill(null));
            }
        }

        return embeddings;
    } catch (error) {
        console.error('Error in batch embedding generation:', error.message);
        throw error;
    }
}

/**
 * Generate embeddings for document chunks
 * @param {Array<Object>} chunks - Array of chunk objects with text property
 * @returns {Promise<Array<Object>>} - Chunks with embeddings added
 */
async function generateChunkEmbeddings(chunks) {
    try {
        if (!Array.isArray(chunks) || chunks.length === 0) {
            console.warn('No chunks provided for embedding generation');
            return chunks;
        }

        console.log(`Generating embeddings for ${chunks.length} chunks...`);

        // Extract text from chunks
        const texts = chunks.map(chunk => chunk.text || '');

        // Generate embeddings
        const embeddings = await generateBatchEmbeddings(texts);

        // Add embeddings to chunks
        const chunksWithEmbeddings = chunks.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings[index]
        }));

        const successCount = embeddings.filter(e => e !== null).length;
        console.log(`Successfully generated ${successCount}/${chunks.length} embeddings`);

        return chunksWithEmbeddings;
    } catch (error) {
        console.error('Error generating chunk embeddings:', error.message);
        throw error;
    }
}

/**
 * Generate embeddings and store them in Qdrant (without storing in MongoDB)
 * @param {Array<Object>} chunks - Array of chunk objects with text property
 * @param {string} fileId - MongoDB file document ID
 * @param {string} fileName - Original filename
 * @returns {Promise<Object>} - Result with chunks (without embeddings) and Qdrant IDs
 */
async function generateAndStoreChunkEmbeddings(chunks, fileId, fileName, userId) {
    try {
        if (!Array.isArray(chunks) || chunks.length === 0) {
            console.warn('No chunks provided for embedding generation');
            return { chunks: chunks, qdrantIds: [] };
        }

        console.log(`Generating and storing embeddings for ${chunks.length} chunks...`);

        // Generate embeddings
        const chunksWithEmbeddings = await generateChunkEmbeddings(chunks);

        // Store embeddings in Qdrant
        const qdrantIds = await qdrantService.storeChunkEmbeddings(
            chunksWithEmbeddings,
            fileId,
            fileName,
            userId
        );

        // Remove embeddings from chunks before returning (to avoid MongoDB storage)
        const chunksWithoutEmbeddings = chunksWithEmbeddings.map(chunk => {
            const { embedding, ...chunkWithoutEmbedding } = chunk;
            return chunkWithoutEmbedding;
        });

        const successCount = qdrantIds.length;
        console.log(`Successfully stored ${successCount}/${chunks.length} embeddings in Qdrant`);

        return {
            chunks: chunksWithoutEmbeddings,
            qdrantIds: qdrantIds,
            stats: {
                total: chunks.length,
                successful: successCount,
                failed: chunks.length - successCount,
            }
        };
    } catch (error) {
        console.error('Error generating and storing chunk embeddings:', error.message);
        throw error;
    }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param {Array<number>} embedding1 - First embedding vector
 * @param {Array<number>} embedding2 - Second embedding vector
 * @returns {number} - Cosine similarity score (0-1)
 */
function cosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
        return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

module.exports = {
    generateEmbedding,
    generateBatchEmbeddings,
    generateChunkEmbeddings,
    generateAndStoreChunkEmbeddings,
    cosineSimilarity
};
