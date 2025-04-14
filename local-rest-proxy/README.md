# local-rest-proxy

The local component of RDP2REST that runs on your local machine and forwards your requests to the remote REST API.

## Overview

This component acts as a proxy that:

1. Receives the HTTP requests you make from your local machine (e.g., using Postman, curl, or your application)
2. Writes these requests to a shared file system
3. Polls the shared file system for responses from the remote machine
4. Returns responses back to your client application

## Installation

```bash
cd local-rest-proxy
npm install
```

## Configuration

Edit the configuration in `proxy.js` to match your environment:

```javascript
// Shared folder path - update this to match your setup
const SHARED_FOLDER_PATH = '/Users/user1/Documents/my-remote/REST_PROXY_DO_NOT_DELETE'; // Mac OS path example
// const SHARED_FOLDER_PATH = '\\\\SERVERNAME\\SharedFolder'; // Windows UNC path example
// const SHARED_FOLDER_PATH = 'Z:\\SharedFolder'; // Windows mapped drive example

// Server port
const PORT = process.env.PORT || 3000;

// Request timeout (milliseconds)
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Polling interval (milliseconds)
const POLL_INTERVAL = 500; // Check for response every 500ms
```

## Usage

### Starting the Proxy

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

### Making Requests

You can make requests from your local machine to your internal API using any HTTP client:

```bash
# Using curl
curl http://localhost:3000/api/your-endpoint

# Using Postman
# Set URL to: http://localhost:3000/api/your-endpoint
```

The proxy supports all HTTP methods (GET, POST, PUT, DELETE, etc.) and forwards your request headers and bodies to the internal API.

## How It Works

1. You make an HTTP request to this local proxy
2. The proxy generates a unique ID for your request
3. Your request details (method, path, headers, body) are saved to `requests.json` in the shared folder
4. The proxy starts polling the `responses.json` file for a response with the matching ID
5. When a response is found, it's returned to your client
6. The request and response entries are then removed from their respective files

## Troubleshooting

### Cannot Access Shared Folder

Make sure the shared folder is properly mounted and accessible:

```bash
# Check if folder exists and is writable
touch /Volumes/SharedFolder/test.txt
```

### No Response Received

Check if:
- The RDP proxy is running on the remote machine
- The shared folder paths match in both proxies
- The internal API is accessible from the RDP machine

### Slow Responses

You can adjust the polling interval to check for responses more frequently:
- Decrease `POLL_INTERVAL` for faster responses (but more file system operations)
- Increase `POLL_INTERVAL` to reduce load on the file system

## API Reference

### Health Check

```
GET /health
```

Returns the status of the proxy server and information about the shared folder connection.

### Request Proxying

```
ANY /*
```

All requests are forwarded to the internal API through the file-based proxy mechanism.

Example:
```bash
# Using curl
curl http://localhost:3000/users/1

# Using Postman
GET http://localhost:3000/users/1
```