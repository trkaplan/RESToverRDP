module.exports = {
    // Server configuration
    server: {
        port: 8088
    },
    
    // Shared folder configuration
    sharedFolder: {
        path: '\\\\tsclient\\my-remote\\REST_PROXY_DO_NOT_DELETE',
        requestFolder: 'requests',
        responseFolder: 'responses'
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
        level: 'info',
        file: 'rdp-proxy.log'
    }
}; 