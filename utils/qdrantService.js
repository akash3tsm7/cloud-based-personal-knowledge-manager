const { QdrantClient } = require('@qdrant/js-client-rest');
const crypto = require('crypto'); // Add at top of file

/**
 * Qdrant Vector Database Service
 * 
 * Manages vector storage and semantic search operations using Qdrant.
 * Stores document chunk embeddings with metadata for efficient retrieval.
 */

// Initialize Qdrant client
const client = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
});

const COLLECTION_NAME = 'knowledge_chunks';
const VECTOR_SIZE = 1024; // BGE-M3 embedding dimensions

/**
 * Initialize Qdrant collection
 * Creates the collection if it doesn't exist
 */
async function initializeCollection() {
    try {
        // Check if collection exists
        const collections = await client.getCollections();
        const collectionExists = collections.collections.some(
            col => col.name === COLLECTION_NAME
        );

        if (!collectionExists) {
            console.log(`Creating Qdrant collection: ${COLLECTION_NAME}`);
            await client.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: VECTOR_SIZE,
                    distance: 'Cosine',
                },
                optimizers_config: {
                    default_segment_number: 2,
                },
                replication_factor: 1,
            });
            console.log('Collection created successfully');
        } else {
            console.log(`Collection ${COLLECTION_NAME} already exists`);
        }

        return true;
    } catch (error) {
        console.error('Error initializing Qdrant collection:', error.message);
        throw error;
    }
}

/**
 * Store chunk embeddings in Qdrant
 * @param {Array<Object>} chunks - Array of chunks with embeddings
 * @param {string} fileId - MongoDB file document ID
 * @param {string} fileName - Original filename
 * @param {string} userId - User ID who owns the file
 * @returns {Promise<Array<string>>} - Array of Qdrant point IDs
 */
async function storeChunkEmbeddings(chunks, fileId, fileName, userId) {
    try {
        if (!chunks || chunks.length === 0) {
            console.warn('No chunks provided for storage');
            return [];
        }

        // Filter chunks that have valid embeddings
        const validChunks = chunks.filter(chunk =>
            chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length === VECTOR_SIZE
        );

        if (validChunks.length === 0) {
            console.warn('No valid embeddings found in chunks');
            return [];
        }

        console.log(`Storing ${validChunks.length} chunk embeddings in Qdrant...`);

        // In storeChunkEmbeddings function:
        const points = validChunks.map((chunk, idx) => ({
            id: crypto.randomUUID(), // Standard UUID format
            vector: chunk.embedding,
            payload: {
                fileId: fileId,
                fileName: fileName,
                userId: userId, // Add userId to payload
                chunkIndex: chunk.index || idx,
                text: chunk.text,
                charCount: chunk.charCount || 0,
                wordCount: chunk.wordCount || 0,
                createdAt: new Date().toISOString(),
            },
        }));

        // Upsert points to Qdrant
        await client.upsert(COLLECTION_NAME, {
            wait: true,
            points: points,
        });

        const pointIds = points.map(p => p.id);
        console.log(`Successfully stored ${pointIds.length} embeddings in Qdrant`);

        return pointIds;
    } catch (error) {
        console.error('Error storing embeddings in Qdrant:', error.message);
        throw error;
    }
}

/**
 * Search for similar chunks using semantic search
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {number} limit - Maximum number of results to return
 * @param {Object} filter - Optional filter conditions
 * @returns {Promise<Array<Object>>} - Array of search results with scores
 */
async function searchSimilarChunks(queryEmbedding, limit = 10, filter = null) {
    try {
        if (!queryEmbedding || queryEmbedding.length !== VECTOR_SIZE) {
            throw new Error(`Invalid query embedding. Expected ${VECTOR_SIZE} dimensions`);
        }

        console.log(`Searching for top ${limit} similar chunks...`);

        const searchParams = {
            vector: queryEmbedding,
            limit: limit,
            with_payload: true,
            with_vector: false, // Don't return vectors in results to save bandwidth
        };

        // Add filter if provided
        if (filter) {
            searchParams.filter = filter;
        }

        const searchResults = await client.search(COLLECTION_NAME, searchParams);

        console.log(`Found ${searchResults.length} similar chunks`);

        // Format results
        const formattedResults = searchResults.map(result => ({
            id: result.id,
            score: result.score,
            fileId: result.payload.fileId,
            fileName: result.payload.fileName,
            chunkIndex: result.payload.chunkIndex,
            text: result.payload.text,
            charCount: result.payload.charCount,
            wordCount: result.payload.wordCount,
            createdAt: result.payload.createdAt,
        }));

        return formattedResults;
    } catch (error) {
        console.error('Error searching in Qdrant:', error.message);
        throw error;
    }
}

/**
 * Delete embeddings for a specific file
 * @param {string} fileId - MongoDB file document ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteFileEmbeddings(fileId) {
    try {
        console.log(`Deleting embeddings for file: ${fileId}`);

        await client.delete(COLLECTION_NAME, {
            wait: true,
            filter: {
                must: [
                    {
                        key: 'fileId',
                        match: { value: fileId },
                    },
                ],
            },
        });

        console.log(`Successfully deleted embeddings for file: ${fileId}`);
        return true;
    } catch (error) {
        console.error('Error deleting embeddings from Qdrant:', error.message);
        throw error;
    }
}

/**
 * Delete specific embeddings by point IDs
 * @param {Array<string>} pointIds - Array of Qdrant point IDs
 * @returns {Promise<boolean>} - Success status
 */
async function deleteEmbeddingsByIds(pointIds) {
    try {
        if (!pointIds || pointIds.length === 0) {
            console.warn('No point IDs provided for deletion');
            return true;
        }

        console.log(`Deleting ${pointIds.length} embeddings by ID...`);

        await client.delete(COLLECTION_NAME, {
            wait: true,
            points: pointIds,
        });

        console.log(`Successfully deleted ${pointIds.length} embeddings`);
        return true;
    } catch (error) {
        console.error('Error deleting embeddings by IDs:', error.message);
        throw error;
    }
}

/**
 * Get collection info and stats
 * @returns {Promise<Object>} - Collection information
 */
async function getCollectionInfo() {
    try {
        const info = await client.getCollection(COLLECTION_NAME);
        return {
            name: COLLECTION_NAME,
            vectorsCount: info.vectors_count,
            pointsCount: info.points_count,
            status: info.status,
            config: {
                vectorSize: info.config.params.vectors.size,
                distance: info.config.params.vectors.distance,
            },
        };
    } catch (error) {
        console.error('Error getting collection info:', error.message);
        throw error;
    }
}

/**
 * Check Qdrant connection health
 * @returns {Promise<boolean>} - Connection status
 */
async function checkConnection() {
    try {
        await client.getCollections();
        console.log('Qdrant connection successful');
        return true;
    } catch (error) {
        console.error('Qdrant connection failed:', error.message);
        return false;
    }
}

module.exports = {
    initializeCollection,
    storeChunkEmbeddings,
    searchSimilarChunks,
    deleteFileEmbeddings,
    deleteEmbeddingsByIds,
    getCollectionInfo,
    checkConnection,
    COLLECTION_NAME,
    VECTOR_SIZE,
};
