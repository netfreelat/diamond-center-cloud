require('dotenv').config();
const imaps = require('imap-simple');

const config = {
    imap: {
        user: process.env.BINANCE_EMAIL_USER,
        password: process.env.BINANCE_EMAIL_PASSWORD ? process.env.BINANCE_EMAIL_PASSWORD.replace(/\s+/g, '') : '',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

imaps.connect(config).then(connection => {
    console.log('✅ CONEXIÓN EXITOSA AL CORREO IMAP GMAIL!');
    return connection.openBox('INBOX').then(() => {
        console.log('INBOX ABIERTO.');
        // Buscar correos de Binance de los últimos 2 días
        const delay = 24 * 3600 * 1000 * 2;
        const yesterday = new Date();
        yesterday.setTime(Date.now() - delay);
        const searchCriteria = [
            ['SINCE', yesterday.toISOString()],
            ['OR', ['FROM', 'binance'], ['SUBJECT', 'Binance']]
        ];
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
        };
        return connection.search(searchCriteria, fetchOptions).then(results => {
            console.log(`Encontrados ${results.length} correos de Binance recientes.`);
            
            // Si hay correos, procesar el primero
            if (results.length > 0) {
                const mail = results[0];
                const headerPart = mail.parts.find(p => p.which === 'HEADER');
                const textPart = mail.parts.find(p => p.which === 'TEXT');
                
                if (headerPart && headerPart.body && headerPart.body.subject) {
                    console.log('--- ASUNTO ---');
                    console.log(headerPart.body.subject[0]);
                }
                
                if (textPart && textPart.body) {
                    console.log('--- CUERPO ---');
                    // Si el body es base64 y html, lo limpiamos
                    let bodyStr = textPart.body;
                    if (textPart.body.indexOf('base64') > -1 || !textPart.body.includes(' ')) {
                        // asume base64 si no hay espacios casi (solo saltos de linea de base64)
                        bodyStr = Buffer.from(textPart.body, 'base64').toString('utf8');
                    }
                    const plainText = bodyStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    console.log(plainText);
                }
            }
            connection.end();
        });
    });
}).catch(err => {
    console.error('❌ ERROR DE CONEXIÓN IMAP:', err.message);
});
