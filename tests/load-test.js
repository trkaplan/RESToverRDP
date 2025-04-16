const { exec } = require('child_process');

const CONCURRENT_REQUESTS = 10;
const TOTAL_REQUESTS = 100;
const URL = 'http://localhost:3000/users/1';

let completed = 0;
let success = 0;
let failed = 0;
let startTime = Date.now();

function sendRequest() {
    return new Promise((resolve) => {
        exec(`curl -s -w "%{http_code}" --max-time 30 ${URL}`, (error, stdout, stderr) => {
            const statusCode = parseInt(stdout.slice(-3));
            const response = stdout.slice(0, -3);
            
            if (error || statusCode >= 400) {
                failed++;
                console.log(`Request ${completed + 1}/${TOTAL_REQUESTS}: Failed (${statusCode})`);
            } else {
                success++;
                console.log(`Request ${completed + 1}/${TOTAL_REQUESTS}: Success (${statusCode})`);
            }
            
            completed++;
            resolve();
        });
    });
}

async function runLoadTest() {
    console.log(`Starting load test with ${CONCURRENT_REQUESTS} concurrent requests...`);
    console.log(`Total requests to send: ${TOTAL_REQUESTS}`);
    
    // Process requests sequentially instead of in parallel
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
        await sendRequest();
        // Add a small delay between requests to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const duration = (Date.now() - startTime) / 1000;
    console.log('\nTest Results:');
    console.log('-------------');
    console.log(`Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`Successful: ${success}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((success / TOTAL_REQUESTS) * 100).toFixed(2)}%`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Requests per second: ${(TOTAL_REQUESTS / duration).toFixed(2)}`);
}

runLoadTest().catch(console.error); 