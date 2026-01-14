const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Config - Python scripts are in 'scripts' folder, this file is in 'utils' folder
const PYTHON_EXECUTABLE = 'python'; // or 'python3' on some systems
const OCR_SCRIPT = path.join(__dirname, '..', 'scripts', 'qwen_ocr.py');
const PPTX_SCRIPT = path.join(__dirname, '..', 'scripts', 'pptextractor.py');
const MAX_CONCURRENT_JOBS = 2;

// Concurrency control
const queue = [];
let activeJobs = 0;

function processQueue() {
    if (activeJobs >= MAX_CONCURRENT_JOBS || queue.length === 0) return;

    const { fn, args, resolve, reject } = queue.shift();
    activeJobs++;

    fn(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => {
            activeJobs--;
            processQueue();
        });
}

function enqueue(fn, ...args) {
    return new Promise((resolve, reject) => {
        queue.push({ fn, args, resolve, reject });
        processQueue();
    });
}

/* ---------------- IMAGE OCR ---------------- */

function callPythonOcr(imagePath) {
    return new Promise((resolve, reject) => {
        // Convert to absolute path
        const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(imagePath);

        if (!fs.existsSync(absolutePath)) {
            return reject(new Error(`File not found: ${absolutePath}`));
        }

        // Verify the Python script exists
        if (!fs.existsSync(OCR_SCRIPT)) {
            return reject(new Error(`OCR script not found at: ${OCR_SCRIPT}`));
        }

        console.log(`Calling Python OCR: ${OCR_SCRIPT}`);
        console.log(`Image: ${absolutePath}`);

        const python = spawn(PYTHON_EXECUTABLE, [OCR_SCRIPT, absolutePath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(OCR_SCRIPT),
            env: {
                ...process.env,
                QWEN_API_KEY: process.env.QWEN_API_KEY || ''
            }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', d => {
            stdout += d.toString();
        });

        python.stderr.on('data', d => {
            stderr += d.toString();
        });

        python.on('close', code => {
            // Log what we received
            if (stderr) {
                console.log(`OCR stderr (code ${code}):`, stderr.substring(0, 200));
            }
            if (stdout) {
                console.log(`OCR stdout length: ${stdout.length} chars`);
            }

            if (code !== 0) {
                console.error(`Python OCR failed with code ${code}`);
                return reject(new Error(`Python OCR failed: ${stderr || 'Unknown error'}`));
            }

            if (!stdout || stdout.trim().length === 0) {
                console.error(`No output from Python OCR script`);
                return reject(new Error('No output from OCR script'));
            }

            try {
                const parsed = JSON.parse(stdout);
                resolve(parsed);
            } catch (err) {
                console.error(`Failed to parse OCR JSON. First 200 chars:`, stdout.substring(0, 200));
                reject(new Error(`Invalid OCR JSON: ${err.message}`));
            }
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to spawn Python: ${err.message}. Check if Python is installed and in PATH.`));
        });
    });
}

async function _runImageOcrWorker(imagePath) {
    console.log(`Running Qwen OCR for: ${path.basename(imagePath)}`);

    try {
        const results = await callPythonOcr(imagePath);

        // Handle error responses
        if (results && results[0] && results[0].error) {
            console.error(`OCR error: ${results[0].error}`);
            return '';
        }

        // Handle the response structure from Qwen
        if (!results) return '';

        if (Array.isArray(results)) {
            if (!results[0]) {
                console.log(`No text detected in image`);
                return '';
            }

            const result = results[0];

            // Qwen returns: { text: "...", detected: true/false }
            if (!result.detected || !result.text) {
                console.log(`No text detected in image`);
                return '';
            }

            return result.text;
        } else {
            if (!results.detected || !results.text) {
                console.log(`No text detected in image`);
                return '';
            }
            return results.text;
        }
    } catch (error) {
        console.error(`OCR worker error: ${error.message}`);
        throw error;
    }
}

/* ---------------- PPTX ---------------- */

function callPythonPptx(pptxPath) {
    return new Promise((resolve, reject) => {
        // Convert to absolute path
        const absolutePath = path.isAbsolute(pptxPath) ? pptxPath : path.resolve(pptxPath);

        if (!fs.existsSync(absolutePath)) {
            return reject(new Error(`File not found: ${absolutePath}`));
        }

        if (!fs.existsSync(PPTX_SCRIPT)) {
            return reject(new Error(`PPTX script not found at: ${PPTX_SCRIPT}`));
        }

        console.log(`Calling Python PPTX: ${PPTX_SCRIPT}`);
        console.log(`File: ${absolutePath}`);

        const python = spawn(PYTHON_EXECUTABLE, [PPTX_SCRIPT, absolutePath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(PPTX_SCRIPT)
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', d => {
            stdout += d.toString();
        });

        python.stderr.on('data', d => {
            stderr += d.toString();
        });

        python.on('close', code => {
            // Log what we received
            if (stderr) {
                console.log(`PPTX stderr (code ${code}):`, stderr.substring(0, 200));
            }
            if (stdout) {
                console.log(`PPTX stdout length: ${stdout.length} chars`);
                console.log(`PPTX output preview:`, stdout.substring(0, 100));
            }

            if (code !== 0) {
                console.error(`Python PPTX failed with code ${code}`);
                return reject(new Error(`PPTX extraction failed: ${stderr || stdout || 'Unknown error'}`));
            }

            if (!stdout || stdout.trim().length === 0) {
                console.error(`No output from Python PPTX script`);
                return reject(new Error('No output from PPTX script'));
            }

            // Check for ERROR prefix
            if (stdout.startsWith('ERROR:')) {
                return reject(new Error(stdout));
            }

            resolve(stdout);
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to spawn Python: ${err.message}. Check if Python is installed and in PATH.`));
        });
    });
}

async function _runPptxWorker(pptxPath) {
    console.log(`Extracting PPTX: ${path.basename(pptxPath)}`);

    try {
        const text = await callPythonPptx(pptxPath);
        return text;
    } catch (error) {
        console.error(`PPTX worker error: ${error.message}`);
        throw error;
    }
}

/* ---------------- EXPORT ---------------- */

module.exports = {
    runImageOcr: (imagePath) => enqueue(_runImageOcrWorker, imagePath),
    runPptx: (pptxPath) => enqueue(_runPptxWorker, pptxPath)
};