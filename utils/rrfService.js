/**
 * RRF (Reciprocal Rank Fusion) Service
 * Combines BM25 (keyword) and Vector Search (semantic) results
 */

/**
 * Reciprocal Rank Fusion algorithm
 * Combines multiple ranked lists into a single ranking
 * 
 * Formula: RRF_score = Σ (1 / (k + rank_i))
 * where k is a constant (usually 60) and rank_i is the rank in list i
 * 
 * @param {Array} rankedLists - Array of ranked result lists
 * @param {number} k - RRF constant (default: 60)
 * @returns {Array} - Fused and re-ranked results
 */
function reciprocalRankFusion(rankedLists, k = 60) {
    const scoreMap = new Map();
    const itemDetails = new Map();

    // Process each ranked list
    rankedLists.forEach((list, listIndex) => {
        list.forEach((item, rank) => {
            // Create unique key for this item (fileId + chunkIndex)
            const key = `${item.fileId}_${item.chunkIndex}`;

            // Calculate RRF score: 1 / (k + rank)
            const rrfScore = 1 / (k + rank + 1); // +1 because ranks are 0-indexed

            // Accumulate scores from different lists
            if (scoreMap.has(key)) {
                scoreMap.set(key, scoreMap.get(key) + rrfScore);
            } else {
                scoreMap.set(key, rrfScore);
                itemDetails.set(key, {
                    ...item,
                    sources: []
                });
            }

            // Track which search method found this result
            const details = itemDetails.get(key);
            details.sources.push({
                source: item.source,
                originalScore: item.score,
                rank: rank + 1
            });

            // Preserve vector score if available (this is the true confidence score)
            if (item.source === 'vector') {
                details.vectorScore = item.score;
            }
        });
    });

    // Convert to array and sort by RRF score
    const fusedResults = Array.from(scoreMap.entries()).map(([key, rrfScore]) => {
        const item = itemDetails.get(key);
        return {
            ...item,
            rrfScore: rrfScore,
            fusionRank: 0 // Will be set after sorting
        };
    });

    // Sort by RRF score (descending)
    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);

    // Assign fusion ranks
    fusedResults.forEach((item, index) => {
        item.fusionRank = index + 1;
    });

    return fusedResults;
}

/**
 * Hybrid search combining BM25 and Vector search with RRF
 * @param {Array} bm25Results - Results from BM25 keyword search
 * @param {Array} vectorResults - Results from vector semantic search
 * @param {number} k - RRF constant
 * @returns {Array} - Fused results
 */
function hybridSearch(bm25Results, vectorResults, k = 60) {
    console.log(`[RRF] Fusing ${bm25Results.length} BM25 + ${vectorResults.length} Vector results`);

    // Normalize vector results format to match BM25
    const normalizedVectorResults = vectorResults.map((result, index) => ({
        fileId: result.fileId,
        fileName: result.fileName,
        chunkIndex: result.chunkIndex,
        text: result.text,
        score: result.score,
        source: 'vector'
    }));

    // Apply RRF
    const fusedResults = reciprocalRankFusion(
        [bm25Results, normalizedVectorResults],
        k
    );

    console.log(`[RRF] Final fused results: ${fusedResults.length}`);

    return fusedResults;
}

/**
 * Weighted hybrid search (alternative to RRF)
 * Combines scores with configurable weights
 * @param {Array} bm25Results - BM25 results
 * @param {Array} vectorResults - Vector results
 * @param {Object} weights - { bm25: 0.3, vector: 0.7 }
 * @returns {Array} - Combined results
 */
function weightedHybridSearch(bm25Results, vectorResults, weights = { bm25: 0.3, vector: 0.7 }) {
    console.log(`[Weighted Hybrid] Combining with weights: BM25=${weights.bm25}, Vector=${weights.vector}`);

    const scoreMap = new Map();

    // Normalize scores to 0-1 range
    const maxBM25Score = Math.max(...bm25Results.map(r => r.score), 1);
    const maxVectorScore = Math.max(...vectorResults.map(r => r.score), 1);

    // Process BM25 results
    bm25Results.forEach(result => {
        const key = `${result.fileId}_${result.chunkIndex}`;
        const normalizedScore = result.score / maxBM25Score;
        scoreMap.set(key, {
            ...result,
            combinedScore: normalizedScore * weights.bm25,
            bm25Score: normalizedScore,
            vectorScore: 0,
            sources: ['bm25']
        });
    });

    // Process Vector results
    vectorResults.forEach(result => {
        const key = `${result.fileId}_${result.chunkIndex}`;
        const normalizedScore = result.score / maxVectorScore;

        if (scoreMap.has(key)) {
            const existing = scoreMap.get(key);
            existing.combinedScore += normalizedScore * weights.vector;
            existing.vectorScore = normalizedScore;
            existing.sources.push('vector');
        } else {
            scoreMap.set(key, {
                fileId: result.fileId,
                fileName: result.fileName,
                chunkIndex: result.chunkIndex,
                text: result.text,
                combinedScore: normalizedScore * weights.vector,
                bm25Score: 0,
                vectorScore: normalizedScore,
                sources: ['vector']
            });
        }
    });

    // Convert to array and sort
    const results = Array.from(scoreMap.values());
    results.sort((a, b) => b.combinedScore - a.combinedScore);

    console.log(`[Weighted Hybrid] Final results: ${results.length}`);

    return results;
}

/**
 * Calculate diversity score for results
 * Helps avoid returning too many chunks from the same file
 * @param {Array} results - Search results
 * @returns {Array} - Results with diversity penalty applied
 */
function applyDiversityPenalty(results, penalty = 0.9) {
    const fileSeenCount = new Map();

    return results.map(result => {
        const fileId = result.fileId;
        const seenCount = fileSeenCount.get(fileId) || 0;
        fileSeenCount.set(fileId, seenCount + 1);

        // Apply exponential penalty for repeated files
        const diversityScore = Math.pow(penalty, seenCount);

        return {
            ...result,
            originalScore: result.rrfScore || result.combinedScore,
            finalScore: (result.rrfScore || result.combinedScore) * diversityScore,
            diversityPenalty: diversityScore
        };
    }).sort((a, b) => b.finalScore - a.finalScore);
}

module.exports = {
    reciprocalRankFusion,
    hybridSearch,
    weightedHybridSearch,
    applyDiversityPenalty
};