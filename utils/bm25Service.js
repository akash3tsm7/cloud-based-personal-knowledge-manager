const File = require('../models/File');
const natural = require('natural');
const TfIdf = natural.TfIdf;

/**
 * BM25 Service for Keyword-Based Search
 * Uses MongoDB text search with BM25-like ranking
 */

/**
 * Search files using BM25 keyword search
 * @param {string} query - Search query
 * @param {number} limit - Maximum results to return
 * @param {string} userId - Optional user ID filter
 * @returns {Promise<Array>} - Search results with scores
 */
async function searchBM25(query, limit = 10, userId = null) {
    try {
        console.log(`[BM25] Searching for: "${query}"`);

        // Quick check: if userId provided, check if user has any files first
        if (userId) {
            const fileCount = await File.countDocuments({ userId });
            if (fileCount === 0) {
                console.log('[BM25] No files found for user, skipping search');
                return [];
            }
        }

        // Build MongoDB text search query
        const searchQuery = {
            $text: { $search: query }
        };

        // Add user filter if provided
        if (userId) {
            searchQuery.userId = userId;
        }

        // Execute text search with score projection
        const results = await File.find(
            searchQuery,
            {
                score: { $meta: 'textScore' },
                fileName: 1,
                fileType: 1,
                chunks: 1,
                userId: 1,
                createdAt: 1
            }
        )
            .sort({ score: { $meta: 'textScore' } })
            .limit(limit);

        console.log(`[BM25] Found ${results.length} results`);

        // Extract matching chunks with text snippets
        const formattedResults = [];

        for (const file of results) {
            // Find chunks that match the query keywords
            const queryTokens = query.toLowerCase().split(/\s+/);

            for (let i = 0; i < file.chunks.length; i++) {
                const chunk = file.chunks[i];
                const chunkText = chunk.text.toLowerCase();

                // Calculate relevance score for this chunk
                let chunkScore = 0;
                let matchCount = 0;

                for (const token of queryTokens) {
                    if (chunkText.includes(token)) {
                        matchCount++;
                        // Count occurrences
                        const occurrences = (chunkText.match(new RegExp(token, 'g')) || []).length;
                        chunkScore += occurrences;
                    }
                }

                // Only include chunks with at least one match
                if (matchCount > 0) {
                    formattedResults.push({
                        fileId: file._id.toString(),
                        fileName: file.fileName,
                        chunkIndex: chunk.index || i,
                        text: chunk.text,
                        score: file.score * (chunkScore / queryTokens.length), // Normalize score
                        matchedTerms: matchCount,
                        source: 'bm25'
                    });
                }
            }
        }

        // Sort by score descending
        formattedResults.sort((a, b) => b.score - a.score);

        // Return top N results
        return formattedResults.slice(0, limit);

    } catch (error) {
        console.error('[BM25] Search error:', error);
        throw error;
    }
}

/**
 * Search chunks using TF-IDF (alternative to MongoDB text search)
 * Useful for more fine-grained control
 * @param {string} query - Search query
 * @param {Array} chunks - Array of chunk objects with text
 * @param {number} limit - Maximum results
 * @returns {Array} - Ranked results
 */
function searchWithTfIdf(query, chunks, limit = 10) {
    try {
        const tfidf = new TfIdf();

        // Add all chunks to TF-IDF
        chunks.forEach(chunk => {
            tfidf.addDocument(chunk.text);
        });

        // Get relevance scores
        const results = [];
        tfidf.tfidfs(query, (i, score) => {
            if (score > 0) {
                results.push({
                    ...chunks[i],
                    score: score,
                    source: 'tfidf'
                });
            }
        });

        // Sort by score
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, limit);

    } catch (error) {
        console.error('[TF-IDF] Search error:', error);
        return [];
    }
}

/**
 * Get BM25 statistics
 * @returns {Promise<Object>} - Collection statistics
 */
async function getBM25Stats() {
    try {
        const totalFiles = await File.countDocuments();
        const indexInfo = await File.collection.getIndexes();

        return {
            totalFiles,
            textIndexes: Object.keys(indexInfo).filter(key =>
                indexInfo[key].some(idx => idx[0] === '_fts')
            )
        };
    } catch (error) {
        console.error('[BM25] Stats error:', error);
        return null;
    }
}

module.exports = {
    searchBM25,
    searchWithTfIdf,
    getBM25Stats
};