module.exports = {
    // Shared folder configuration
    sharedFolder: {
        path: '\\\\tsclient\\shared-folder\\REST_PROXY_DO_NOT_DELETE',
        requestFolder: 'requests',
        responseFolder: 'responses'
    },
    
    // Target API configuration
    targetApi: {
        url: 'http://127.0.0.1:8088'  // Full URL of the target API
    },
    
    // Proxy configuration
    proxy: {
        enabled: true,
        // Uncomment to disable proxy
        // noProxy: '*',
        // httpProxy: '',
        // httpsProxy: ''
    },
    
    // Logging configuration
    logging: {
        level: 'info'
    }
}; 