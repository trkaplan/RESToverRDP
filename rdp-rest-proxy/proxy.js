// rdp-client.js - Client that runs on Remote Desktop
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const config = require('./config');

// Configuration
const TARGET_API = config.targetApi.url; // Full URL of the target API
const SHARED_FOLDER_PATH = config.sharedFolder.path;
const REQUESTS_DIR = path.join(SHARED_FOLDER_PATH, 'requests');
const RESPONSES_DIR = path.join(SHARED_FOLDER_PATH, 'responses');
const POLL_INTERVAL = 50; // Reduced from 100ms to 50ms
const BATCH_SIZE = 20; // Increased from 10 to 20
const MAX_CONCURRENT_REQUESTS = 40; // Increased from 40 to 41
const MAX_RETRIES = 3; // Number of retries for failed requests

// Track processed files to avoid re-processing
const processedFiles = new Set();
const MAX_PROCESSED_FILES = 1000; // Keep track of last 1000 files

// Logging configuration
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
const LOG_LEVEL_NUM = LOG_LEVELS[LOG_LEVEL];

function log(level, message, data = {}) {
    if (LOG_LEVELS[level] >= LOG_LEVEL_NUM) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        console.log(logMessage);
        if (Object.keys(data).length > 0) {
            console.log('Data:', JSON.stringify(data, null, 2));
        }
    }
}

// File locking mechanism
async function lockFile(filePath) {
    const lockPath = `${filePath}.lock`;
    try {
        await fs.writeFile(lockPath, '');
        return true;
    } catch (error) {
        return false;
    }
}

async function unlockFile(filePath) {
    const lockPath = `${filePath}.lock`;
    try {
        await fs.unlink(lockPath);
        return true;
    } catch (error) {
        return false;
    }
}

// Check if directories exist
async function checkDirs() {
    try {
        await fs.access(REQUESTS_DIR);
        await fs.access(RESPONSES_DIR);
        return true;
    } catch (error) {
        log('ERROR', `Directories not accessible`, { error: error.message });
        return false;
    }
}

// Initialize directories
async function initializeDirs() {
    try {
        // Delete existing directories if they exist
        await fs.rm(REQUESTS_DIR, { recursive: true, force: true }).catch(() => {});
        await fs.rm(RESPONSES_DIR, { recursive: true, force: true }).catch(() => {});
        
        // Create new directories
        await fs.mkdir(REQUESTS_DIR, { recursive: true });
        await fs.mkdir(RESPONSES_DIR, { recursive: true });
        log('INFO', `Created directories`, { 
            requests: REQUESTS_DIR,
            responses: RESPONSES_DIR
        });
    } catch (error) {
        log('ERROR', `Error initializing directories`, { error: error.message });
        process.exit(1);
    }
}

// Process requests
async function processRequests() {
    try {
        // Read requests directory
        const files = await fs.readdir(REQUESTS_DIR);
        
        // Filter out processed files and get only new ones
        const newFiles = files.filter(f => 
            f.endsWith('.json') && 
            !f.endsWith('.lock') && 
            !processedFiles.has(f)
        );
        
        if (newFiles.length === 0) {
            return;
        }

        log('INFO', `Found new requests`, { count: newFiles.length });
        
        // Add new files to processed set
        newFiles.forEach(f => processedFiles.add(f));
        
        // Clean up old processed files if set is too large
        if (processedFiles.size > MAX_PROCESSED_FILES) {
            const filesToRemove = Array.from(processedFiles).slice(0, processedFiles.size - MAX_PROCESSED_FILES);
            filesToRemove.forEach(f => processedFiles.delete(f));
        }
        
        // Process requests in batches
        const batches = [];
        for (let i = 0; i < newFiles.length; i += BATCH_SIZE) {
            batches.push(newFiles.slice(i, i + BATCH_SIZE));
        }
        
        // Process each batch
        for (const batch of batches) {
            // Process requests in parallel with concurrency limit
            const semaphore = new Semaphore(MAX_CONCURRENT_REQUESTS);
            await Promise.all(batch.map(async (file) => {
                await semaphore.acquire();
                try {
                    const requestFile = path.join(REQUESTS_DIR, file);
                    
                    // Try to lock the request file
                    if (!await lockFile(requestFile)) {
                        return;
                    }
                    
                    try {
                        // Read request
                        const requestData = JSON.parse(await fs.readFile(requestFile, 'utf8'));
                        
                        if (requestData.status !== 'pending') {
                            return;
                        }
                        
                        log('INFO', `Processing request`, {
                            requestId: requestData.id,
                            method: requestData.method,
                            path: requestData.path,
                            url: `${TARGET_API}${requestData.path}`,
                            headers: requestData.headers,
                            body: requestData.body
                        });
                        
                        // Make request to internal API with retries
                        let retries = 0;
                        let response = null;
                        let lastError = null;
                        
                        while (retries < MAX_RETRIES && !response) {
                            try {
                                response = await axios({
                                    method: requestData.method,
                                    url: `${TARGET_API}${requestData.path}`,
                                    headers: requestData.headers,
                                    data: requestData.body,
                                    validateStatus: () => true,
                                    timeout: 30000,
                                    maxRedirects: 0,
                                    proxy: !config.proxy.enabled,
                                    maxContentLength: Infinity,
                                    maxBodyLength: Infinity
                                });
                            } catch (error) {
                                lastError = error;
                                retries++;
                                if (retries < MAX_RETRIES) {
                                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                                }
                            }
                        }
                        
                        if (!response) {
                            throw lastError || new Error('Max retries exceeded');
                        }
                        
                        // Write response
                        const responseFile = path.join(RESPONSES_DIR, `${requestData.id}.json`);
                        const doneFile = `${responseFile}.done`;
                        const responseData = {
                            statusCode: response.status,
                            headers: response.headers,
                            body: response.data,
                            timestamp: Date.now()
                        };
                        
                        // Lock response file before writing
                        if (!await lockFile(responseFile)) {
                            throw new Error('Could not lock response file');
                        }
                        
                        try {
                            // First write the response file
                            await fs.writeFile(responseFile, JSON.stringify(responseData, null, 2));
                            
                            // Then create the done file to signal completion
                            await fs.writeFile(doneFile, '');
                            
                            log('INFO', `Response written`, { 
                                requestId: requestData.id,
                                status: response.status
                            });
                        } finally {
                            await unlockFile(responseFile);
                        }
                        
                        // Update request status
                        requestData.status = 'completed';
                        await fs.writeFile(requestFile, JSON.stringify(requestData, null, 2));
                        
                    } catch (error) {
                        log('ERROR', `Error processing request`, { 
                            file,
                            error: error.message,
                            stack: error.stack
                        });
                        
                        // Create error response
                        const responseFile = path.join(RESPONSES_DIR, `${file.replace('.json', '')}.json`);
                        const errorResponse = {
                            statusCode: 500,
                            headers: {},
                            body: {
                                error: 'Internal Server Error',
                                message: error.message
                            },
                            timestamp: Date.now()
                        };
                        
                        await fs.writeFile(responseFile, JSON.stringify(errorResponse, null, 2));
                        
                        // Update request status
                        const requestData = JSON.parse(await fs.readFile(requestFile, 'utf8'));
                        requestData.status = 'error';
                        await fs.writeFile(requestFile, JSON.stringify(requestData, null, 2));
                        
                    } finally {
                        await unlockFile(requestFile);
                    }
                } finally {
                    semaphore.release();
                }
            }));
        }
    } catch (error) {
        log('ERROR', `Error in processRequests`, { 
            error: error.message,
            stack: error.stack
        });
    }
}

// Simple semaphore implementation for concurrency control
class Semaphore {
    constructor(maxConcurrent) {
        this.maxConcurrent = maxConcurrent;
        this.current = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.current < this.maxConcurrent) {
            this.current++;
            return;
        }
        await new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        if (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        } else {
            this.current--;
        }
    }
}

// Main loop
async function startPolling() {
    console.log('Starting polling for requests...');
    
    // Initialize directories first
    await initializeDirs();
    
    let isProcessing = false;
    
    setInterval(async () => {
        if (isProcessing) {
            return;
        }
        
        try {
            isProcessing = true;
            const dirsExist = await checkDirs();
            if (dirsExist) {
                await processRequests();
            }
        } finally {
            isProcessing = false;
        }
    }, POLL_INTERVAL);
}

// Start
console.log(`Starting proxy client using shared folder: ${SHARED_FOLDER_PATH}`);
console.log(`Forwarding requests to: ${TARGET_API}`);
startPolling();
