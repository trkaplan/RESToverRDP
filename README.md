# RDP2REST

A file-based REST API proxy system that allows accessing internal REST APIs through Remote Desktop environments without requiring direct network connections.

## Overview

RDP2REST enables secure access to REST APIs located inside corporate networks or behind firewalls by using a file polling mechanism. This approach works well in restricted environments where direct connections are not possible or when you want to avoid exposing internal services.

### How It Works

1. The **local-rest-proxy** runs on your computer and accepts REST API requests
2. It writes these requests to a shared folder accessible by both systems
3. The **rdp-rest-proxy** running on the Remote Desktop continuously monitors the shared folder
4. When a request is detected, it forwards it to the internal REST API
5. The response is written back to the shared folder
6. The local proxy returns the response to the original requester

This approach requires no special firewall configurations and no direct connection to the internal API.

## Components

The project consists of two main components:

1. **local-rest-proxy**: A server running on your local machine that captures API requests and communicates via shared files
2. **rdp-rest-proxy**: A client running on the Remote Desktop that forwards requests to the internal REST API
3. **test-server**: Test server for local testing

## Getting Started

### Prerequisites

- Node.js (v14 or later) installed on both systems
- A shared folder accessible by both your local machine and the Remote Desktop
- Access to an internal REST API (default: port 8088) on the Remote Desktop
- Windows Remote Desktop app ([download from App Store](https://apps.apple.com/us/app/windows-app/id1295203466?mt=12)) configured with folder sharing:
  1. Open Windows Remote Desktop app
  2. Select your remote PC and click "Edit"
  3. Go to "Folders" tab
  4. Enable "Redirect folders" checkbox
  5. Click "+" to add a folder
  6. Select the folder you want to share (e.g., "my-remote") and set its path
  7. Make sure "Read-only" is unchecked if you need write access
  8. Click "Save" to apply the changes

### Proxy Settings

The RDP proxy respects system-level proxy settings by default. This means:
1. If you have proxy settings configured in your environment (via `export` or system settings), these will be used automatically
2. If no proxy is configured in your environment, direct connections will be used

You can configure proxy settings in two ways:

1. **Using system proxy settings** (default behavior):
```javascript
// Your system's proxy settings will be used automatically
// Example of setting proxy at system level:
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
```

2. **Disabling proxy** (for localhost testing):
   If you need to bypass proxy for local development (e.g., when using test-server.js), uncomment these lines in rdp-rest-proxy/proxy.js:
```javascript
// In rdp-rest-proxy/proxy.js

// Uncomment these lines to disable proxy
// process.env.NO_PROXY = '*';
// process.env.HTTP_PROXY = '';
// process.env.HTTPS_PROXY = '';

const response = await axios({
  // ... other options ...
  // proxy: false,  // Uncomment to force disable proxy
});
```

### Start the Local Target Server:**
    A simple test server (`test-server.js`) is included. Run it in a terminal:
    ```bash
    node test-server.js 
    # Expected output: Test server listening on http://localhost:8088
    ```

### Installation

Since the components run on different machines, you'll need to install them separately:

1. Clone this repository to both your local machine and Remote Desktop
   ```
   git clone https://github.com/yourusername/rdp2rest.git
   ```

2. For your local machine:
   ```
   cd rdp2rest/local-rest-proxy
   npm install
   ```

3. For the Remote Desktop:
   ```
   cd rdp2rest/rdp-rest-proxy
   npm install
   ```

4. Configure the shared folder path in both components (see their respective README files)

### Running

1. Start the local proxy on your machine
   ```
   cd rdp2rest/local-rest-proxy
   npm start
   ```

2. Start the RDP proxy on your Remote Desktop
   ```
   cd rdp2rest/rdp-rest-proxy
   npm start
   ```

3. Make requests to the local proxy
   ```
   http://localhost:3000/api/your-endpoint
   ```

## Configuration

See the README files in each component's directory for detailed configuration options.

## Use Cases

- Accessing corporate REST APIs from your personal device
- Developing against APIs that are only available inside a corporate network
- Testing applications that require access to internal services
- Creating a secure bridge for specific API endpoints without exposing the entire API

## License

[MIT](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.