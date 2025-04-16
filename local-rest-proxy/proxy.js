// local-rest-proxy.js - Express server that runs on macOS
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const app = express();
app.use(cors());
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
        
        while (!response && attempts < MAX_ATTEMPTS) {
            try {
                // Try to lock and read response file
                if (await lockFile(responseFile)) {
                    try {
                        const responseData = await fs.readFile(responseFile, 'utf8');
                        response = JSON.parse(responseData);
                        const elapsedTime = Date.now() - startTime;
                        log('INFO', `Response found`, { 
                            requestId, 
                            response,
                            elapsedTime,
                            attempts
                        });
                        
                        // Delete response file after reading
                        await fs.unlink(responseFile);
                        
                        // Delete request file after successful response
                        await fs.unlink(requestFile);
                        log('INFO', `Request and response files cleaned up`, { requestId });
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
        
        // Send response
        log('INFO', `Sending response to client`, { 
            requestId, 
            status: response.statusCode,
            elapsedTime: Date.now() - startTime
        });
        return res.status(response.statusCode || 200)
            .set(response.headers || {})
            .send(response.body || {});
            
    } catch (error) {
        log('ERROR', `Error handling request`, { 
            requestId, 
            error: error.message,
            stack: error.stack
        });
        
        // Clean up files in case of error
        try {
            const requestFile = path.join(REQUESTS_DIR, `${requestId}.json`);
            const responseFile = path.join(RESPONSES_DIR, `${requestId}.json`);
            
            // Try to delete both files if they exist
            await Promise.all([
                fs.unlink(requestFile).catch(() => {}),
                fs.unlink(responseFile).catch(() => {})
            ]);
            
            log('INFO', `Cleaned up files after error`, { requestId });
        } catch (cleanupError) {
            log('ERROR', `Error during cleanup`, { 
                requestId,
                error: cleanupError.message 
            });
        }
        
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            message: error.message 
        });
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
