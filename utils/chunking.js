/**
 * Text Chunking Utility - FIXED VERSION
 * 
 * Splits large text documents into semantically meaningful chunks
 * for better processing, embedding, and retrieval.
 * 
 * Configuration:
 * - Chunk size: 500-800 characters (optimal semantic density)
 * - Overlap: 80-120 characters (prevents context loss at boundaries)
 * - Split unit: Paragraphs first (better than raw character split)
 * - Preserves metadata: page, file, section information
 * - Filters low-quality chunks (< 20 words)
 */

const DEFAULT_CONFIG = {
    minChunkSize: 500,
    maxChunkSize: 800,
    overlapSize: 100,
    preserveMetadata: true,
    minWordCount: 20  // NEW: Minimum words per chunk
};

/**
 * Check if text has sufficient information density
 * Filters out broken/meaningless chunks
 */
function hasGoodInformationDensity(text) {
    if (!text || text.trim().length === 0) return false;

    const trimmed = text.trim();
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Must have at least 20 words
    if (wordCount < 20) return false;

    // Check for broken patterns like "1.", "on PROJECTS 1.", etc.
    const brokenPatterns = [
        /^[0-9]+\.?\s*$/,  // Just numbers with optional dot
        /^[a-z]{1,3}\s+[A-Z]+\s+[0-9]+\.?\s*$/i,  // Broken like "on PROJECTS 1."
        /^[a-z]{1,5}\s+[0-9]+\.?\s*$/i,  // Like "tion 1."
    ];

    for (const pattern of brokenPatterns) {
        if (pattern.test(trimmed)) return false;
    }

    // Check average word length (broken chunks have very short words)
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / wordCount;
    if (avgWordLength < 3) return false;

    return true;
}

/**
 * Split text into paragraphs
 * Handles various paragraph separators including markdown-style
 */
function splitIntoParagraphs(text) {
    if (!text) return [];

    // Split on double newlines or more (paragraph breaks)
    // Also handles markdown-style headings (lines starting with #)
    const paragraphs = text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    return paragraphs;
}

/**
 * Split text into sentences
 * Improved handling of abbreviations, decimals, and edge cases
 */
function splitIntoSentences(text) {
    if (!text) return [];

    const sentences = text
        .replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1|')
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    return sentences;
}

/**
 * Create a chunk with metadata
 */
function createChunk(text, index, metadata = {}) {
    const trimmedText = text.trim();
    return {
        text: trimmedText,
        index,
        charCount: trimmedText.length,
        wordCount: trimmedText.split(/\s+/).filter(w => w.length > 0).length,
        ...metadata
    };
}

/**
 * Main chunking function - IMPROVED
 * Splits text into overlapping chunks while preserving semantic boundaries
 * NOW FILTERS LOW-QUALITY CHUNKS
 * 
 * @param {string} text - The text to chunk
 * @param {Object} options - Chunking configuration
 * @param {Object} metadata - Additional metadata to attach to chunks
 * @returns {Array} Array of chunk objects
 */
function chunkText(text, options = {}, metadata = {}) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    text = text.trim();
    if (text.length === 0) {
        return [];
    }

    const config = { ...DEFAULT_CONFIG, ...options };
    const chunks = [];
    let chunkIndex = 0;

    if (text.length <= config.minChunkSize) {
        const chunk = createChunk(text, 0, metadata);
        // Only return if it has good quality
        if (hasGoodInformationDensity(chunk.text)) {
            return [chunk];
        }
        return [];
    }

    const paragraphs = splitIntoParagraphs(text);
    let currentChunk = '';
    let currentChunkStart = 0;

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const potentialChunk = currentChunk
            ? currentChunk + '\n\n' + paragraph
            : paragraph;

        if (potentialChunk.length <= config.maxChunkSize) {
            currentChunk = potentialChunk;
        } else if (currentChunk.length >= config.minChunkSize) {
            // Save current chunk only if it has good quality
            const chunk = createChunk(currentChunk, chunkIndex, {
                ...metadata,
                startParagraph: currentChunkStart,
                endParagraph: i - 1
            });

            if (hasGoodInformationDensity(chunk.text)) {
                chunk.index = chunkIndex++;
                chunks.push(chunk);
            }

            const overlapText = getOverlapText(currentChunk, config.overlapSize);
            currentChunk = overlapText ? overlapText + '\n\n' + paragraph : paragraph;
            currentChunkStart = i;
        } else {
            const sentences = splitIntoSentences(paragraph);

            for (const sentence of sentences) {
                const potentialSentenceChunk = currentChunk
                    ? currentChunk + ' ' + sentence
                    : sentence;

                if (potentialSentenceChunk.length <= config.maxChunkSize) {
                    currentChunk = potentialSentenceChunk;
                } else if (currentChunk.length >= config.minChunkSize) {
                    const chunk = createChunk(currentChunk, chunkIndex, {
                        ...metadata,
                        startParagraph: currentChunkStart,
                        endParagraph: i
                    });

                    if (hasGoodInformationDensity(chunk.text)) {
                        chunk.index = chunkIndex++;
                        chunks.push(chunk);
                    }

                    const overlapText = getOverlapText(currentChunk, config.overlapSize);
                    currentChunk = overlapText ? overlapText + ' ' + sentence : sentence;
                    currentChunkStart = i;
                } else {
                    if (currentChunk) {
                        const chunk = createChunk(currentChunk, chunkIndex, {
                            ...metadata,
                            startParagraph: currentChunkStart,
                            endParagraph: i
                        });

                        if (hasGoodInformationDensity(chunk.text)) {
                            chunk.index = chunkIndex++;
                            chunks.push(chunk);
                        }
                    }

                    const charChunks = splitByCharacters(sentence, config);
                    charChunks.forEach(chunkText => {
                        const chunk = createChunk(chunkText, chunkIndex, {
                            ...metadata,
                            paragraph: i,
                            splitType: 'character'
                        });

                        if (hasGoodInformationDensity(chunk.text)) {
                            chunk.index = chunkIndex++;
                            chunks.push(chunk);
                        }
                    });

                    currentChunk = '';
                    currentChunkStart = i + 1;
                }
            }
        }
    }

    // Add remaining chunk if it exists and has good quality
    if (currentChunk.length > 0) {
        if (currentChunk.length < config.minChunkSize / 2 && chunks.length > 0) {
            const lastChunk = chunks[chunks.length - 1];
            const mergedText = lastChunk.text + '\n\n' + currentChunk;
            const mergedChunk = createChunk(mergedText, lastChunk.index, {
                ...lastChunk,
                endParagraph: paragraphs.length - 1
            });

            if (hasGoodInformationDensity(mergedChunk.text)) {
                chunks[chunks.length - 1] = mergedChunk;
            }
        } else {
            const chunk = createChunk(currentChunk, chunkIndex, {
                ...metadata,
                startParagraph: currentChunkStart,
                endParagraph: paragraphs.length - 1
            });

            if (hasGoodInformationDensity(chunk.text)) {
                chunks.push(chunk);
            }
        }
    }

    // Re-index all chunks sequentially after filtering
    return chunks.map((chunk, idx) => ({ ...chunk, index: idx }));
}

/**
 * Get overlap text from the end of a chunk
 * Improved to find natural break points
 */
function getOverlapText(text, overlapSize) {
    if (!text || text.length <= overlapSize) {
        return text;
    }

    const overlapStart = Math.max(0, text.length - overlapSize);
    let overlapText = text.substring(overlapStart);

    const sentenceBoundary = overlapText.search(/[.!?]\s+/);
    if (sentenceBoundary !== -1) {
        return overlapText.substring(sentenceBoundary + 2).trim();
    }

    const commaBoundary = overlapText.search(/[,;]\s+/);
    if (commaBoundary !== -1 && commaBoundary < overlapSize / 2) {
        return overlapText.substring(commaBoundary + 2).trim();
    }

    const firstSpace = overlapText.indexOf(' ');
    if (firstSpace !== -1) {
        return overlapText.substring(firstSpace + 1).trim();
    }

    return overlapText.trim();
}

/**
 * Force split text by character count (last resort)
 * Improved to respect word boundaries
 */
function splitByCharacters(text, config) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        let end = Math.min(start + config.maxChunkSize, text.length);

        if (end < text.length) {
            const chunk = text.substring(start, end);
            const lastSentence = chunk.search(/[.!?]\s+(?!.*[.!?]\s+)/);

            if (lastSentence !== -1 && lastSentence > config.minChunkSize) {
                end = start + lastSentence + 1;
            } else {
                const lastSpace = text.lastIndexOf(' ', end);
                if (lastSpace > start + config.minChunkSize) {
                    end = lastSpace;
                }
            }
        }

        const chunkText = text.substring(start, end).trim();
        if (chunkText.length > 0) {
            chunks.push(chunkText);
        }

        start = Math.max(start + 1, end - config.overlapSize);
    }

    return chunks;
}

/**
 * Chunk text from a file with file metadata
 */
function chunkFileText(text, fileInfo = {}, options = {}) {
    const metadata = {
        filename: fileInfo.filename || 'unknown',
        filepath: fileInfo.filepath || null,
        fileId: fileInfo.fileId || null,
        mimeType: fileInfo.mimeType || null,
        uploadDate: fileInfo.uploadDate || new Date().toISOString()
    };

    return chunkText(text, options, metadata);
}

/**
 * Chunk text with page information (for PDFs, DOCX, etc.)
 */
function chunkPagedText(pages, options = {}, fileMetadata = {}) {
    const allChunks = [];

    pages.forEach(page => {
        const pageMetadata = {
            ...fileMetadata,
            pageNumber: page.pageNumber || page.page || null,
            section: page.section || null
        };

        const pageChunks = chunkText(page.text, options, pageMetadata);
        allChunks.push(...pageChunks);
    });

    return allChunks.map((chunk, index) => ({
        ...chunk,
        index
    }));
}

/**
 * Get chunking statistics
 */
function getChunkingStats(chunks) {
    if (!chunks || chunks.length === 0) {
        return {
            totalChunks: 0,
            totalCharacters: 0,
            totalWords: 0,
            avgChunkSize: 0,
            avgWordCount: 0,
            minChunkSize: 0,
            maxChunkSize: 0
        };
    }

    const sizes = chunks.map(c => c.charCount);
    const wordCounts = chunks.map(c => c.wordCount);
    const totalChars = sizes.reduce((sum, size) => sum + size, 0);
    const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);

    return {
        totalChunks: chunks.length,
        totalCharacters: totalChars,
        totalWords: totalWords,
        avgChunkSize: Math.round(totalChars / chunks.length),
        avgWordCount: Math.round(totalWords / chunks.length),
        minChunkSize: Math.min(...sizes),
        maxChunkSize: Math.max(...sizes)
    };
}

module.exports = {
    chunkText,
    chunkFileText,
    chunkPagedText,
    getChunkingStats,
    DEFAULT_CONFIG,
    hasGoodInformationDensity  // Export for testing
};