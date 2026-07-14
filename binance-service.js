/**
 * binance-service.js — Verificación de pagos Binance Pay vía correo IMAP
 *
 * Lee correos de confirmación de pago de Binance Pay en Gmail.
 * Después de procesar cada correo lo ELIMINA automáticamente para que
 * el buzón nunca se llene.
 *
 * Variables de entorno requeridas:
 *   BINANCE_EMAIL_USER     → correo Gmail que recibe notificaciones de Binance
 *   BINANCE_EMAIL_PASSWORD → contraseña de aplicación de Google (16 caracteres)
 */

const imaps = require('imap-simple');

const BINANCE_EMAIL_USER     = process.env.BINANCE_EMAIL_USER;
const BINANCE_EMAIL_PASSWORD = process.env.BINANCE_EMAIL_PASSWORD;

function getImapConfig() {
    return {
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
}

/**
 * Busca correos no leídos de Binance Pay en las últimas 48h
 * y extrae los montos USDT de pagos recibidos.
 */
async function checkBinanceEmails() {
    if (!BINANCE_EMAIL_USER || !BINANCE_EMAIL_PASSWORD || BINANCE_EMAIL_USER === 'tu_correo_binance@gmail.com') {
        console.error('[BINANCE] ❌ Credenciales de correo no configuradas en .env');
        return [];
    }

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        await connection.openBox('INBOX');

        const since = new Date(Date.now() - 48 * 3600 * 1000); // Últimas 48h

        const searchCriteria = [
            ['UNSEEN'],
            ['SINCE', since.toISOString()],
            ['OR', ['FROM', 'binance'], ['SUBJECT', 'Binance Pay']]
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
        };

        const results = await connection.search(searchCriteria, fetchOptions);
        const pagosRecibidos = [];

        for (const mail of results) {
            const textPart = mail.parts.find(p => p.which === 'TEXT');
            if (!textPart || !textPart.body) continue;

            let bodyStr = textPart.body;
            // Decodificar base64 si aplica
            if (bodyStr.indexOf('base64') > -1 || !bodyStr.includes(' ')) {
                try { bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8'); } catch (e) {}
            }

            const plainText = bodyStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const lowerText = plainText.toLowerCase();

            // Detectar confirmación de pago recibido
            const esRecibido =
                lowerText.includes('recibido un pago') ||
                lowerText.includes('received a payment') ||
                lowerText.includes('has recibido') ||
                lowerText.includes('te ha enviado') ||
                lowerText.includes('payment received') ||
                lowerText.includes('you received') ||
                lowerText.includes('has been credited');

            if (esRecibido) {
                const amountMatch = plainText.match(/([0-9.,]+)\s*USDT/i);
                if (amountMatch) {
                    const amount = parseFloat(amountMatch[1].replace(',', '.'));
                    if (!isNaN(amount) && amount > 0) {
                        pagosRecibidos.push({
                            uid: mail.attributes.uid,
                            amount,
                            text: plainText.substring(0, 300)
                        });
                        console.log(`[BINANCE] 💛 Pago detectado en correo: ${amount} USDT (uid: ${mail.attributes.uid})`);
                    }
                }
            }
        }

        connection.end();
        return pagosRecibidos;

    } catch (err) {
        console.error('[BINANCE] ❌ Error leyendo correos:', err.message);
        if (connection) try { connection.end(); } catch (_) {}
        return [];
    }
}

/**
 * Marca el correo como leído Y lo mueve a la Papelera para liberar espacio.
 * Esto evita que el Gmail se llene con correos de Binance acumulados.
 */
async function markEmailAsRead(uid) {
    if (!BINANCE_EMAIL_USER || !BINANCE_EMAIL_PASSWORD) return;

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        await connection.openBox('INBOX');

        // Marcar como leído
        await connection.addFlags(uid, ['\\Seen']);

        // Mover a Papelera de Gmail para liberar espacio
        try {
            await connection.moveMessage(uid, '[Gmail]/Trash');
            console.log(`[BINANCE] 🗑️  Correo ${uid} eliminado (espacio liberado).`);
        } catch (moveErr) {
            // Fallback: marcar como eliminado + expunge
            try {
                await connection.addFlags(uid, ['\\Deleted']);
                await new Promise((resolve, reject) => {
                    connection.imap.expunge((err) => err ? reject(err) : resolve());
                });
                console.log(`[BINANCE] 🗑️  Correo ${uid} eliminado vía expunge.`);
            } catch (deleteErr) {
                console.warn(`[BINANCE] ⚠️  No se pudo eliminar correo ${uid}: ${deleteErr.message}`);
            }
        }

        connection.end();
    } catch (err) {
        console.error(`[BINANCE] Error procesando correo ${uid}:`, err.message);
        if (connection) try { connection.end(); } catch (_) {}
    }
}

/**
 * Limpieza masiva: elimina TODOS los correos de Binance del INBOX
 * que tengan más de `daysOld` días. Ejecutar una vez para limpiar el buzón.
 */
async function cleanupOldBinanceEmails(daysOld = 2) {
    if (!BINANCE_EMAIL_USER || !BINANCE_EMAIL_PASSWORD) return 0;

    let connection;
    try {
        connection = await imaps.connect(getImapConfig());
        await connection.openBox('INBOX');

        const cutoff = new Date(Date.now() - daysOld * 24 * 3600 * 1000);
        const searchCriteria = [
            ['BEFORE', cutoff.toISOString()],
            ['OR', ['FROM', 'binance'], ['SUBJECT', 'Binance']]
        ];

        const mails = await connection.search(searchCriteria, { bodies: [], struct: false });

        if (mails.length === 0) {
            console.log(`[BINANCE-CLEANUP] ✅ No hay correos viejos de Binance que limpiar.`);
            connection.end();
            return 0;
        }

        console.log(`[BINANCE-CLEANUP] 🗑️  Eliminando ${mails.length} correo(s) de Binance viejos...`);

        for (const mail of mails) {
            try {
                await connection.moveMessage(mail.attributes.uid, '[Gmail]/Trash');
            } catch (e) {
                try { await connection.addFlags(mail.attributes.uid, ['\\Deleted']); } catch (_) {}
            }
        }

        try {
            await new Promise((resolve, reject) => {
                connection.imap.expunge((err) => err ? reject(err) : resolve());
            });
        } catch (_) {}

        console.log(`[BINANCE-CLEANUP] ✅ ${mails.length} correo(s) eliminado(s). Espacio liberado.`);
        connection.end();
        return mails.length;

    } catch (err) {
        console.error('[BINANCE-CLEANUP] ❌ Error:', err.message);
        if (connection) try { connection.end(); } catch (_) {}
        return 0;
    }
}

// Compatibilidad con server.js que espera estos exports
module.exports = {
    checkBinanceEmails,
    markEmailAsRead,
    cleanupOldBinanceEmails,
    // No-op para compatibilidad con código que importe verifyBinancePaymentById
    verifyBinancePaymentById: async () => ({ found: false, amount: 0 })
};
