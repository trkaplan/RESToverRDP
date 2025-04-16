// local-rest-proxy.js - Express server that runs on macOS
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const app = express();
app.use(cors());
app.use(bodyParser.json({
    strict: false // Allow non-object values like null
}));
app.use(express.json());

// Path to the shared folder
const SHARED_FOLDER_PATH = config.sharedFolder.path;
const REQUESTS_DIR = path.join(SHARED_FOLDER_PATH, 'requests');
const RESPONSES_DIR = path.join(SHARED_FOLDER_PATH, 'responses');

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
    try {
        const lockFile = `${filePath}.lock`;
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(lockFile), { recursive: true });
        
        // Try to create lock file
        await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') {
            // Lock file already exists
            return false;
        }
        // Create parent dirs if they don't exist and retry once
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(path.dirname(lockFile), { recursive: true });
                await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
                return true;
            } catch (retryError) {
                return false;
            }
        }
        return false;
    }
}

async function unlockFile(filePath) {
    try {
        const lockFile = `${filePath}.lock`;
        await fs.unlink(lockFile);
        return true;
    } catch (error) {
        // If lock file doesn't exist, that's fine
        if (error.code === 'ENOENT') {
            return true;
        }
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
        console.log(`Created directories: ${REQUESTS_DIR}, ${RESPONSES_DIR}`);
    } catch (error) {
        console.error('Error initializing directories:', error);
        process.exit(1);
    }
}

// Catch all requests
app.all('*', async (req, res) => {
    const requestId = uuidv4();
    const requestPath = req.originalUrl;
    
    log('DEBUG', `New request received`, {
        requestId,
        method: req.method,
        path: requestPath,
        headers: req.headers,
        body: req.body
    });
    
    try {
        // Create request object
        const requestData = {
            id: requestId,
            method: req.method,
            path: requestPath,
            headers: req.headers,
            body: req.body,
            timestamp: Date.now(),
            status: 'pending'
        };
        
        // Write request to file
        const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
        await fs.writeFile(requestFile, JSON.stringify(requestData, null, 2));
        
        log('INFO', `Request saved to file`, { requestId, method: req.method, path: requestPath });
        
        // Wait for response (polling)
        let response = null;
        let attempts = 0;
        const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);
        const startTime = Date.now();
        const POLL_INTERVAL = 100; // 200ms polling interval
        const MAX_ATTEMPTS = 300; // 30 seconds timeout (200ms * 150)
        
        let responseFound = false;
        while (!responseFound && attempts < MAX_ATTEMPTS) {
            try {
                // Try to lock and read response file
                if (await lockFile(responseFile)) {
                    try {
                        // Check if response is complete by looking for .done file
                        const doneFile = `${responseFile}.done`;
                        const [doneExists, responseExists] = await Promise.all([
                            fs.access(doneFile).then(() => true).catch(() => false),
                            fs.access(responseFile).then(() => true).catch(() => false)
                        ]);

                        if (doneExists && responseExists) {
                            // Read and parse response
                            const responseData = await fs.readFile(responseFile, 'utf8');
                            log('DEBUG', `Read response file`, { requestId, data: responseData });
                            
                            try {
                                response = JSON.parse(responseData);
                                const elapsedTime = Date.now() - startTime;
                                log('INFO', `Response found`, { 
                                    requestId, 
                                    response,
                                    elapsedTime,
                                    attempts
                                });
                                responseFound = true;
                                break;
                            } catch (parseError) {
                                log('ERROR', `Failed to parse response`, { 
                                    requestId, 
                                    error: parseError.message,
                                    data: responseData
                                });
                            }
                        } else {
                            log('DEBUG', `Response not ready yet`, { 
                                requestId,
                                doneExists,
                                responseExists
                            });
                        }
                    } finally {
                        await unlockFile(responseFile);
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    log('ERROR', `Error checking for response`, { 
                        requestId, 
                        error: error.message,
                        attempts
                    });
                }
            }
            
            if (!response) {
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                attempts++;
                if (attempts % 25 === 0) {
                    const elapsedTime = Date.now() - startTime;
                    log('INFO', `Still waiting for response`, { 
                        requestId, 
                        attempts,
                        elapsedTime
                    });
                }
            }
        }
        
        if (!response) {
            const elapsedTime = Date.now() - startTime;
            log('ERROR', `Timeout waiting for response`, { 
                requestId,
                attempts,
                elapsedTime
            });
            return res.status(504).json({ 
                error: 'Gateway Timeout', 
                message: 'Remote client did not respond in time',
                elapsedTime
            });
        }
        
        if (response && !res.headersSent) {
            try {
                // Send response to client
                log('DEBUG', `Preparing to send response to client`, { 
                    requestId,
                    statusCode: response.statusCode,
                    headers: response.headers
                });
                
                res.status(response.statusCode || 200)
                   .set(response.headers || {})
                   .send(response.body || {});
                
                log('INFO', `Response sent to client`, { 
                    requestId,
                    statusCode: response.statusCode
                });
            } catch (error) {
                log('ERROR', `Error sending response`, { 
                    requestId, 
                    error: error.message 
                });
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Internal Server Error' });
                }
                return;
            }
            
            try {
                // Clean up files only after successful response
                log('DEBUG', `Starting file cleanup`, { requestId });
                const doneFile = `${responseFile}.done`;
                await Promise.all([
                    fs.unlink(responseFile).catch(() => {}),
                    fs.unlink(doneFile).catch(() => {}),
                    fs.unlink(requestFile).catch(() => {})
                ]);
                
                log('INFO', `Request and response files cleaned up`, { requestId });
            } catch (error) {
                log('ERROR', `Error cleaning up files`, { 
                    requestId, 
                    error: error.message 
                });
            }
        }
    } catch (error) {
        // Only send error response if we haven't sent any response yet
        if (!res.headersSent) {
            log('ERROR', `Error processing request`, { requestId, error: error.message });
            res.status(500).json({ error: 'Internal Server Error', message: error.message });
        } else {
            log('ERROR', `Error after response sent`, { requestId, error: error.message });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || config.server.port;

async function startServer() {
    await initializeDirs();
    
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`Using shared folder: ${SHARED_FOLDER_PATH}`);
    });
}

startServer();

module.exports = app;