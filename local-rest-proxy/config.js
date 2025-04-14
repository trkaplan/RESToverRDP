module.exports = {
    // Server configuration
    server: {
        port: 3000
    },
    
    // Shared folder configuration
    sharedFolder: {
        path: '/Users/user1/Documents/my-remote/REST_PROXY_DO_NOT_DELETE',
        requestFolder: 'requests',
        responseFolder: 'responses'
    },
    
    // Target server configuration
    targetServer: {
        baseUrl: 'http://localhost:8088'
    },
    
    // Logging configuration
    logging: {
        level: 'info',
        file: 'local-proxy.log'
    }
}; 