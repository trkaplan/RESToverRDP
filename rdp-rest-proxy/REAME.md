# rdp-rest-proxy

The Remote Desktop component of RDP2REST that runs on your Remote Desktop machine and forwards requests to the internal REST API.

## Overview

This component acts as a bridge between the shared file system and the internal REST API:

1. It continuously monitors the shared folder for new API requests
2. When a request is found, it forwards it to the internal REST API
3. The response from the API is written back to the shared folder
4. Both systems communicate solely through the shared file system

## Installation

```bash
cd rdp-rest-proxy
npm install
```

## Configuration

Edit the configuration in `proxy.js` to match your environment:

```javascript
// Internal REST API configuration
const TARGET_API = 'http://localhost:8088'; // Address of the internal API

// Shared folder path - update this to match your setup
const SHARED_FOLDER_PATH = 'Z:\\SharedFolder'; // Windows mapped drive example
// const SHARED_FOLDER_PATH = '\\\\SERVERNAME\\SharedFolder'; // Windows UNC path example

// Request polling interval (milliseconds)
const POLL_INTERVAL = 200; // Check for new requests every 200ms

// HTTP request timeout (milliseconds)
const REQUEST_TIMEOUT = 10000; // 10 seconds timeout for API requests
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

### Verifying Operation

The proxy will output log messages when:
- It starts successfully
- It detects a new request
- It forwards a request to the internal API
- It receives a response
- It writes a response back to the shared folder

## How It Works

1. The proxy continuously polls the `requests.json` file in the shared folder
2. When it finds a new request, it extracts the details (method, path, headers, body)
3. It forwards this request to the internal REST API
4. When it receives a response, it writes it to the `responses.json` file
5. The response includes the original request ID for correlation

## Running as a Service

For production use, you may want to set up the proxy as a Windows service so it starts automatically:

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the proxy as a service
pm2 start proxy.js --name "rdp-rest-proxy"

# Set up PM2 to start on boot
pm2 startup
pm2 save
```

### Using Windows Task Scheduler

1. Create a batch file (start-proxy.bat):
   ```batch
   @echo off
   cd C:\path\to\rdp-rest-proxy
   npm start
   ```

2. Open Task Scheduler and create a new task:
   - Trigger: At startup
   - Action: Start a program (select your batch file)
   - Run whether user is logged in or not

## Troubleshooting

### Cannot Access Shared Folder

Make sure the shared folder is properly mapped and accessible:

```batch
dir Z:\SharedFolder
```

If the folder is not accessible, try remapping the drive:

```batch
net use Z: \\SERVERNAME\SharedFolder /persistent:yes
```

### Cannot Connect to Internal API

Verify that the internal API is running and accessible:

```batch
curl http://localhost:8088/users/1
```
*   You should receive the response from the `test-server.js`: `{"id":1,"name":"Test User","message":"Response from localhost:8088"}`.

### Performance Issues

- If CPU usage is high, try increasing the `POLL_INTERVAL` value
- If response times are slow, try decreasing the `POLL_INTERVAL` value
- For large requests/responses, ensure there's enough disk space in the shared folder

## Security Considerations

- This proxy forwards requests as-is, including headers and authentication
- Consider implementing additional authentication in the local proxy
- Be aware that request data is temporarily stored in the shared file system