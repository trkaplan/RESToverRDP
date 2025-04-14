// rdp-client.js - Client that runs on Remote Desktop
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const config = require('./config');

// Configuration
const TARGET_API = `http://127.0.0.1:${config.server.port}`; // Address of your internal REST API
// Windows UNC path format
const SHARED_FOLDER_PATH = config.sharedFolder.path;
const REQUESTS_FILE = path.join(SHARED_FOLDER_PATH, config.sharedFolder.requestFolder + '.json');
const RESPONSES_FILE = path.join(SHARED_FOLDER_PATH, config.sharedFolder.responseFolder + '.json');
const POLL_INTERVAL = 200; // Check interval in milliseconds

// Check if files exist
let isFirstCheck = true;
let filesInitialized = false;
let initializationAttempted = false;

async function checkFiles() {
  try {
    // Check if UNC path is accessible on Windows
    try {
      await fs.access(SHARED_FOLDER_PATH);
      if (isFirstCheck) {
        console.log(`Shared folder is accessible: ${SHARED_FOLDER_PATH}`);
        isFirstCheck = false;
      }
    } catch (error) {
      console.error(`Cannot access shared folder: ${error.message}`);
      console.log('Please make sure:');
      console.log('1. Remote Desktop Connection is active');
      console.log('2. The folder is shared in Remote Desktop settings');
      console.log('3. You have proper permissions to access the folder');
      return false;
    }

    // Check and create files only on first startup
    if (!filesInitialized && !initializationAttempted) {
      initializationAttempted = true;
      try {
        // Check requests file
        try {
          await fs.access(REQUESTS_FILE);
        } catch (error) {
          await fs.writeFile(REQUESTS_FILE, JSON.stringify({}));
        }

        // Check responses file
        try {
          await fs.access(RESPONSES_FILE);
        } catch (error) {
          await fs.writeFile(RESPONSES_FILE, JSON.stringify({}));
        }

        filesInitialized = true;
        console.log('Initialized shared files successfully');
      } catch (error) {
        console.error('Error initializing shared files:', error);
        initializationAttempted = false; // Reset the flag to allow retry
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(`Error accessing shared files: ${error.message}`);
    console.log('Make sure the shared folder is properly mounted and files exist.');
    return false;
  }
}

// Process requests
async function processRequests() {
  try {
    // Read requests file
    let data;
    try {
      data = await fs.readFile(REQUESTS_FILE, 'utf8');
      // Empty file check
      if (!data.trim()) {
        data = '{}';
      }
    } catch (error) {
      console.error('Error reading requests file:', error);
      return;
    }

    let requests = {};
    try {
      requests = JSON.parse(data);
    } catch (error) {
      console.error('Error parsing requests file:', error);
      return;
    }
    
    // Filter out empty requests
    const pendingRequests = Object.entries(requests).filter(([_, req]) => Object.keys(req).length > 0);
    
    // Return if no pending requests
    if (pendingRequests.length === 0) {
      return;
    }

    console.log(`Found ${pendingRequests.length} pending requests`);
    
    // Read responses file
    let responses = {};
    try {
      const responseData = await fs.readFile(RESPONSES_FILE, 'utf8');
      // Empty file check
      if (!responseData.trim()) {
        responses = {};
      } else {
        responses = JSON.parse(responseData);
      }
    } catch (error) {
      responses = {};
    }
    
    // Process each request
    for (const [requestId, request] of pendingRequests) {
      try {
        // Make request to internal API
        console.log(`[${requestId}] Accessing test server: ${TARGET_API}${request.path}`);
        
        // Configure proxy settings
        if (!config.proxy.enabled) {
          process.env.NO_PROXY = config.proxy.noProxy || '*';
          process.env.HTTP_PROXY = config.proxy.httpProxy || '';
          process.env.HTTPS_PROXY = config.proxy.httpsProxy || '';
        }
        
        const response = await axios({
          method: request.method,
          url: `${TARGET_API}${request.path}`,
          headers: request.headers,
          data: request.body,
          validateStatus: () => true,
          timeout: 10000,
          maxRedirects: 0,
          proxy: !config.proxy.enabled,  // Disable proxy if configured
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });
        
        // Prepare response
        responses[requestId] = {
          statusCode: response.status,
          headers: response.headers,
          body: response.data,
          timestamp: Date.now()
        };
        
        // Update responses file first
        await fs.writeFile(RESPONSES_FILE, JSON.stringify(responses, null, 2));
        console.log(`[${requestId}] Response updated (Status: ${response.status})`);
        
        // Then update request to empty object instead of deleting
        requests[requestId] = {};
        await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
        console.log(`[${requestId}] Request processed and updated to empty object`);
        
        // Exit loop after processing
        break;
      } catch (error) {
        console.error(`[${requestId}] Error accessing test server:`, error.message);
        
        // Create error response
        responses[requestId] = {
          statusCode: 500,
          headers: {},
          body: {
            error: 'Internal Server Error',
            message: error.message
          },
          timestamp: Date.now()
        };
        
        // Update responses file first
        await fs.writeFile(RESPONSES_FILE, JSON.stringify(responses, null, 2));
        console.log(`[${requestId}] Error response written`);
        
        // Then update request to empty object instead of deleting
        requests[requestId] = {};
        await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
        console.log(`[${requestId}] Request updated to empty object after error`);
        
        // Exit loop after error
        break;
      }
    }
  } catch (error) {
    console.error('Error in processRequests:', error);
  }
}

// Main loop
async function startPolling() {
  console.log('Starting polling for requests...');
  
  let isProcessing = false;
  
  setInterval(async () => {
    if (isProcessing) {
      return; // Skip if already processing
    }
    
    try {
      isProcessing = true;
      const filesExist = await checkFiles();
      if (filesExist) {
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
