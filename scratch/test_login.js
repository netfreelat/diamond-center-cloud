const https = require('https');

const body = JSON.stringify({ username: 'admin', password: '123' });

const options = {
    hostname: 'diamond-center-cloud.onrender.com',
    path: '/api/admin/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        try {
            const parsed = JSON.parse(data);
            if (parsed.success) {
                console.log('\n✅ LOGIN EXITOSO! Token:', parsed.token);
            } else {
                console.log('\n❌ Login fallido:', parsed.message);
            }
        } catch (e) {
            console.error('Error parseando respuesta:', e.message);
        }
    });
});

req.on('error', (e) => console.error('Error de conexión:', e.message));
req.write(body);
req.end();
