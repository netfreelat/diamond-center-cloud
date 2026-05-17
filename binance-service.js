const imaps = require('imap-simple');

const BINANCE_EMAIL_USER = process.env.BINANCE_EMAIL_USER;
const BINANCE_EMAIL_PASSWORD = process.env.BINANCE_EMAIL_PASSWORD;

async function checkBinanceEmails() {
    if (!BINANCE_EMAIL_USER || !BINANCE_EMAIL_PASSWORD || BINANCE_EMAIL_USER === 'tu_correo_binance@gmail.com') {
        console.error('[BINANCE] Credenciales de correo no configuradas en .env');
        return [];
    }

    const config = {
        imap: {
            user: BINANCE_EMAIL_USER,
            password: BINANCE_EMAIL_PASSWORD,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    let connection;
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        const delay = 24 * 3600 * 1000; // Últimas 24 horas
        const yesterday = new Date(Date.now() - delay);

        // Buscar correos no leídos de Binance
        const searchCriteria = [
            ['UNSEEN'],
            ['SINCE', yesterday.toISOString()],
            ['OR', ['FROM', 'binance'], ['SUBJECT', 'Binance Pay']]
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false // No lo marcamos como leído hasta que lo usemos para aprobar
        };

        const results = await connection.search(searchCriteria, fetchOptions);
        const pagosRecibidos = [];

        for (let mail of results) {
            const textPart = mail.parts.find(p => p.which === 'TEXT');
            if (!textPart || !textPart.body) continue;

            let bodyStr = textPart.body;
            // Decodificar si es base64
            if (bodyStr.indexOf('base64') > -1 || !bodyStr.includes(' ')) {
                try {
                    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
                } catch (e) { }
            }

            const plainText = bodyStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            // Buscar si es un pago recibido. Binance suele decir:
            // "You have received a payment of 5.00 USDT"
            // "Has recibido un pago de 5 USDT"
            // "Recibiste un pago de"
            // O simplemente "Importe: 5 USDT" y ver que sea "recibido"

            const lowerText = plainText.toLowerCase();
            const esRecibido = lowerText.includes('recibido un pago') ||
                lowerText.includes('received a payment') ||
                lowerText.includes('has recibido') ||
                lowerText.includes('te ha enviado') ||
                lowerText.includes('payment received');

            if (esRecibido) {
                // Extraer el monto en USDT
                // Busca patrones como "5.00 USDT", "15 USDT", "2.5 USDT"
                const amountMatch = plainText.match(/([0-9.,]+)\s*USDT/i);
                if (amountMatch) {
                    let amountStr = amountMatch[1].replace(',', '.');
                    let amount = parseFloat(amountStr);
                    if (!isNaN(amount)) {
                        pagosRecibidos.push({
                            uid: mail.attributes.uid,
                            amount: amount,
                            text: plainText.substring(0, 200) // para logs
                        });
                    }
                }
            }
        }

        connection.end();
        return pagosRecibidos;

    } catch (err) {
        console.error('[BINANCE] Error leyendo correos:', err.message);
        if (connection) connection.end();
        return [];
    }
}

async function markEmailAsRead(uid) {
    const config = {
        imap: {
            user: BINANCE_EMAIL_USER,
            password: BINANCE_EMAIL_PASSWORD,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 10000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    let connection;
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');
        await connection.addFlags(uid, ['\\Seen']);
        connection.end();
        console.log(`[BINANCE] Correo ${uid} marcado como leído.`);
    } catch (err) {
        console.error(`[BINANCE] Error marcando correo ${uid} como leído:`, err.message);
        if (connection) connection.end();
    }
}

module.exports = { checkBinanceEmails, markEmailAsRead };
