// local-rest-proxy.js - Express server that runs on macOS
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Path to the shared folder (where the shared folder is mounted on Mac OS)
const SHARED_FOLDER_PATH = '/Users/user1/Documents/my-remote/test/REST_PROXY_DO_NOT_DELETE';
const REQUESTS_FILE = path.join(SHARED_FOLDER_PATH, 'requests.json');
const RESPONSES_FILE = path.join(SHARED_FOLDER_PATH, 'responses.json');

// Check if files exist, create them if they don't
async function initializeFiles() {
  try {
    try {
      await fs.access(REQUESTS_FILE);
    } catch (e) {
      await fs.writeFile(REQUESTS_FILE, JSON.stringify({}));
      console.log(`Created ${REQUESTS_FILE}`);
    }

    try {
      await fs.access(RESPONSES_FILE);
    } catch (e) {
      await fs.writeFile(RESPONSES_FILE, JSON.stringify({}));
      console.log(`Created ${RESPONSES_FILE}`);
    }
  } catch (error) {
    console.error('Error initializing files:', error);
    process.exit(1);
  }
}

// Catch all API requests
app.all('/api/*', async (req, res) => {
  const requestId = uuidv4();
  const path = req.originalUrl.replace('/api', '');
  
  try {
    // Create request object
    const requestData = {
      id: requestId,
      method: req.method,
      path: path,
      headers: req.headers,
      body: req.body,
      timestamp: Date.now()
    };
    
    // Read requests file
    let requests = {};
    try {
      const data = await fs.readFile(REQUESTS_FILE, 'utf8');
      if (!data.trim()) {
        requests = {};
      } else {
        requests = JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading requests file:', error);
      requests = {};
    }
    
    // Add new request and write to file
    requests[requestId] = requestData;
    await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
    
    console.log(`Request ${requestId} saved: ${req.method} ${path}`);
    
    // Wait for response (polling)
    let response = null;
    let attempts = 0;
    
    while (!response && attempts < 60) { // 30 second timeout (500ms * 60)
      // Check responses file
      try {
        const responsesData = await fs.readFile(RESPONSES_FILE, 'utf8');
        let responses = {};
        
        if (!responsesData.trim()) {
          responses = {};
        } else {
          responses = JSON.parse(responsesData);
        }
        
        if (responses[requestId]) {
          response = responses[requestId];
          
          // Remove response from file after receiving it
          delete responses[requestId];
          await fs.writeFile(RESPONSES_FILE, JSON.stringify(responses, null, 2));
          
          // Remove request from file
          requests = JSON.parse(await fs.readFile(REQUESTS_FILE, 'utf8'));
          delete requests[requestId];
          await fs.writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
        }
      } catch (error) {
        console.error('Error checking for response:', error);
      }
      
      if (!response) {
        // Wait if no response
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
    }
    
    if (!response) {
      return res.status(504).json({ error: 'Gateway Timeout', message: 'Remote client did not respond in time' });
    }
    
    // Send response
    return res.status(response.statusCode || 200)
      .set(response.headers || {})
      .send(response.body || {});
      
  } catch (error) {
    console.error('Error handling request:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeFiles();
  
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Using shared folder: ${SHARED_FOLDER_PATH}`);
  });
}

startServer();
