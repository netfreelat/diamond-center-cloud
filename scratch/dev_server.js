const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(`[DEV-SERVER] Request: ${req.url}`);
    
    // Normalize path to prevent directory traversal
    let filePath = req.url.split('?')[0];
    if (filePath === '/') {
        filePath = '/index.html';
    }
    
    const absolutePath = path.join(__dirname, '..', filePath);
    
    fs.stat(absolutePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        
        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        
        const stream = fs.createReadStream(absolutePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`[DEV-SERVER] Running at http://localhost:${PORT}`);
});
