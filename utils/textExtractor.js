const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const { runImageOcr, runPptx } = require('./ocrService');

// Suppress specific PDF.js warnings that are irrelevant for text extraction
const originalWarn = console.warn;
console.warn = function (...args) {
    if (args.length > 0 && typeof args[0] === 'string' &&
        (args[0].includes('Cannot polyfill') || args[0].includes('DOMMatrix') || args[0].includes('Path2D'))) {
        return;
    }
    originalWarn.apply(console, args);
};

// Try to require pdfjs-dist, handling potential path differences
let pdfjsLib;
try {
    // For newer versions of pdfjs-dist in Node.js
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
} catch (e) {
    try {
        pdfjsLib = require('pdfjs-dist/es5/build/pdf.js');
    } catch (e2) {
        try {
            pdfjsLib = require('pdfjs-dist');
        } catch (e3) {
            console.error('Failed to load pdfjs-dist', e3);
        }
    }
}

/**
 * Enhanced text normalization for all document types
 * (PDF, DOCX, XLSX, PPTX, CSV, TXT, Images via OCR)
 * Removes artifacts while preserving meaningful structure
 */
function normalizeText(text) {
    if (!text) return '';

    return text
        // Normalize all line endings to \n
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')

        // Remove zero-width and invisible Unicode characters
        .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')

        // Normalize Unicode quotes and dashes (common in DOCX/PDF)
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')

        // Normalize spaces and tabs
        .replace(/[ \t]+/g, ' ')
        .replace(/ \n/g, '\n')
        .replace(/\n /g, '\n')

        // Limit excessive blank lines
        .replace(/\n{4,}/g, '\n\n\n')

        // Trim each line
        .split('\n')
        .map(line => line.trim())
        .join('\n')

        // Remove leading/trailing blank lines
        .replace(/^\n+/, '')
        .replace(/\n+$/, '')

        // Final trim
        .trim();
}


/**
 * Validate if a file exists and is readable
 */
function validateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
    }

    if (stats.size === 0) {
        throw new Error(`File is empty: ${filePath}`);
    }

    return true;
}

/**
 * Extract text from PDF files using pdfjs-dist
 * Handles corrupted PDFs and preserves text order
 */
/**
 * Extract text from PDF files using pdfjs-dist
 * Handles corrupted PDFs and preserves text order
 */
async function extractTextFromPdf(filePath) {
    if (!pdfjsLib) {
        throw new Error('pdfjs-dist library not loaded');
    }

    try {
        validateFile(filePath);

        // Read file
        const data = new Uint8Array(fs.readFileSync(filePath));

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({
            data: data,
            disableFontFace: true,
            useSystemFonts: true
        });

        const doc = await loadingTask.promise;
        const numPages = doc.numPages;
        let fullText = '';

        // Extract text from each page
        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await doc.getPage(i);
                const textContent = await page.getTextContent();

                // Sort items by vertical position (top to bottom), then horizontal (left to right)
                // transform[5] is y, transform[4] is x
                textContent.items.sort((a, b) => {
                    const yDiff = b.transform[5] - a.transform[5];
                    if (Math.abs(yDiff) > 5) return yDiff; // Different lines
                    return a.transform[4] - b.transform[4]; // Same line, sort by x
                });

                const pageText = textContent.items
                    .map(item => item.str)
                    .filter(str => str !== undefined && str !== null)
                    .join(' ')
                    .replace(/\s+/g, ' ');

                if (pageText.trim().length > 0) {
                    fullText += `Page ${i}:\n${pageText}\n\n`;
                }
            } catch (pageError) {
                console.warn(`Error extracting text from page ${i} of ${filePath}:`, pageError.message);
            }
        }

        const result = normalizeText(fullText);
        if (!result) {
            console.log(`Note: No text layer found in ${path.basename(filePath)}. This PDF might be image-only.`);
            return `[Image-only PDF or no text layer found in ${path.basename(filePath)}]`;
        }

        return result;

    } catch (error) {
        throw new Error(`PDF extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from DOCX files
 */
async function extractTextFromDocx(filePath) {
    try {
        validateFile(filePath);

        const result = await mammoth.extractRawText({ path: filePath });

        if (!result.value || result.value.trim().length === 0) {
            console.warn(`DOCX appears to be empty: ${filePath}`);
            return '';
        }

        // Log any conversion messages/warnings
        if (result.messages && result.messages.length > 0) {
            console.log(`DOCX conversion messages for ${filePath}:`, result.messages);
        }

        return normalizeText(result.value);

    } catch (error) {
        throw new Error(`DOCX extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from XLSX files
 */
function extractTextFromXlsx(filePath) {
    try {
        validateFile(filePath);

        const workbook = XLSX.readFile(filePath, {
            cellText: true,
            cellDates: true
        });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            console.warn(`XLSX has no sheets: ${filePath}`);
            return '';
        }

        let text = '';

        workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];

            if (!worksheet) {
                console.warn(`Sheet ${sheetName} is empty`);
                return;
            }

            // Convert sheet to CSV format for better readability
            const sheetData = XLSX.utils.sheet_to_csv(worksheet, {
                FS: ',',
                RS: '\n',
                blankrows: false
            });

            if (sheetData && sheetData.trim().length > 0) {
                text += `Sheet ${index + 1}: ${sheetName}\n${sheetData}\n\n`;
            }
        });

        return normalizeText(text);

    } catch (error) {
        throw new Error(`XLSX extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from PPTX files
 */
/**
 * Extract text from PPTX files
 */
async function extractTextFromPptx(filePath) {
    try {
        validateFile(filePath);
        console.log(`Starting PPTX extraction for: ${filePath}`);
        const text = await runPptx(filePath);
        return normalizeText(text);
    } catch (error) {
        console.error('PPTX extraction failed:', error);
        throw new Error(`PPTX extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from CSV files
 */
function extractTextFromCsv(filePath) {
    try {
        validateFile(filePath);

        const fileContent = fs.readFileSync(filePath, 'utf-8');

        if (!fileContent || fileContent.trim().length === 0) {
            console.warn(`CSV is empty: ${filePath}`);
            return '';
        }

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_quotes: true,
            relax_column_count: true
        });

        if (!records || records.length === 0) {
            console.warn(`CSV has no records: ${filePath}`);
            return '';
        }

        // Convert to JSON string for better readability
        const text = records.map(record => JSON.stringify(record)).join('\n');

        return normalizeText(text);

    } catch (error) {
        throw new Error(`CSV extraction failed: ${error.message}`);
    }
}

/**
 * Extract text from plain text files
 */
function extractTextFromPlain(filePath) {
    try {
        validateFile(filePath);

        const content = fs.readFileSync(filePath, 'utf-8');

        if (!content || content.trim().length === 0) {
            console.warn(`Plain text file is empty: ${filePath}`);
            return '';
        }

        return normalizeText(content);

    } catch (error) {
        throw new Error(`Plain text extraction failed: ${error.message}`);
    }
}

/**
 * Get supported file types
 */
function getSupportedFileTypes() {
    return ['.txt', '.md', '.yaml', '.yml', '.json', '.csv', '.pdf', '.docx', '.xlsx', '.pptx', '.png', '.jpg', '.jpeg'];
}

/**
 * Main extraction function - routes to appropriate extractor based on file extension
 */
async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    // Validate file exists before attempting extraction
    try {
        validateFile(filePath);
    } catch (error) {
        console.error(`File validation failed: ${error.message}`);
        return null;
    }

    try {
        let extractedText = '';

        switch (ext) {
            case '.pdf':
                extractedText = await extractTextFromPdf(filePath);
                break;

            case '.docx':
                extractedText = await extractTextFromDocx(filePath);
                break;

            case '.xlsx':
                extractedText = extractTextFromXlsx(filePath);
                break;

            case '.pptx':
                extractedText = await extractTextFromPptx(filePath);
                break;

            case '.csv':
                extractedText = extractTextFromCsv(filePath);
                break;

            case '.png':
            case '.jpg':
            case '.jpeg':
                extractedText = await runImageOcr(filePath);
                break;

            case '.txt':
            case '.md':
            case '.yaml':
            case '.yml':
            case '.json':
                extractedText = extractTextFromPlain(filePath);
                break;

            default:
                console.warn(`Unsupported file type: ${ext} for file: ${filePath}`);
                return null;
        }

        // Final validation of extracted text
        if (extractedText === null) {
            console.warn(`Text extraction returned null for: ${filePath}`);
            return null;
        }

        if (extractedText.trim().length === 0) {
            console.warn(`No text extracted from: ${filePath}`);
            return '';
        }

        return extractedText;

    } catch (error) {
        console.error(`Text extraction error for ${filePath}:`, error.message);
        return null;
    }
}

module.exports = {
    extractText,
    getSupportedFileTypes,
    extractTextFromPdf,
    extractTextFromDocx,
    extractTextFromXlsx,
    extractTextFromPptx,
    extractTextFromCsv,
    extractTextFromPlain,
    normalizeText
};
