const http = require('http');

http.get('http://localhost:3333/api/time', (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
        process.exit(0);
    });
}).on('error', (e) => {
    console.log('Not running or error:', e.message);
    process.exit(1);
});
