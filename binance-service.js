/**
 * binance-service.js — Verificación de pagos Binance Pay vía API Oficial
 *
 * Endpoint: GET /sapi/v1/pay/transactions
 * Docs: https://developers.binance.com/docs/pay/api-endpoint/Get-Pay-Trade-History
 *
 * Permisos necesarios en la API Key de Binance:
 *   ✅ Enable Reading (solo lectura — NO se necesita trading ni retiros)
 *
 * Variables de entorno requeridas:
 *   BINANCE_API_KEY    → API Key de tu cuenta Binance
 *   BINANCE_API_SECRET → Secret Key de tu cuenta Binance
 */

const https = require('https');
const crypto = require('crypto');

const BINANCE_API_KEY    = process.env.BINANCE_API_KEY;
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET;

// ─── Utilidades ─────────────────────────────────────────────────────────────

function signQuery(queryString) {
    return crypto
        .createHmac('sha256', BINANCE_API_SECRET)
        .update(queryString)
        .digest('hex');
}

function binanceRequest(path, params = {}) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now();
        const queryBase = Object.entries({ ...params, timestamp, recvWindow: 10000 })
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        const signature = signQuery(queryBase);
        const fullQuery = `${queryBase}&signature=${signature}`;

        const options = {
            hostname: 'api.binance.com',
            path: `${path}?${fullQuery}`,
            method: 'GET',
            headers: {
                'X-MBX-APIKEY': BINANCE_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${body.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout en la petición a Binance API'));
        });
        req.end();
    });
}

// ─── Función principal: obtener pagos recibidos recientes ────────────────────

/**
 * Consulta las transacciones Binance Pay recibidas en las últimas `hours` horas.
 * Retorna un array de { transactionId, amount, currency, time, status }
 */
async function checkBinancePayments(hours = 24) {
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
        console.error('[BINANCE-API] ❌ Faltan BINANCE_API_KEY o BINANCE_API_SECRET en .env');
        return [];
    }

    try {
        const startTime = Date.now() - hours * 60 * 60 * 1000;

        const data = await binanceRequest('/sapi/v1/pay/transactions', {
            startTime,
            limit: 100
        });

        if (data.code !== '000000' && data.code !== 0) {
            console.error(`[BINANCE-API] ❌ Error de API: code=${data.code} msg=${data.message}`);
            return [];
        }

        const transactions = Array.isArray(data.data) ? data.data : [];

        // Filtrar solo pagos RECIBIDOS en USDT con estado SUCCESS
        const pagosRecibidos = transactions
            .filter(tx =>
                (tx.orderType === 'C2C' || tx.orderType === 'PAY_IN' || !tx.orderType) &&
                (tx.currency === 'USDT' || tx.fundsDetail?.some(f => f.currency === 'USDT')) &&
                tx.status !== 'FAIL'
            )
            .map(tx => {
                // El monto puede estar en tx.amount directamente o en fundsDetail
                let amount = parseFloat(tx.amount || 0);
                if (!amount && tx.fundsDetail) {
                    const usdtFund = tx.fundsDetail.find(f => f.currency === 'USDT');
                    if (usdtFund) amount = parseFloat(usdtFund.amount || 0);
                }
                return {
                    transactionId: tx.transactionId,
                    amount,
                    currency: tx.currency || 'USDT',
                    time: tx.transactionTime,
                    status: tx.status,
                    raw: tx
                };
            })
            .filter(tx => tx.amount > 0);

        console.log(`[BINANCE-API] ✅ ${pagosRecibidos.length} pago(s) USDT recibido(s) en las últimas ${hours}h`);
        return pagosRecibidos;

    } catch (err) {
        console.error('[BINANCE-API] ❌ Error consultando pagos:', err.message);
        return [];
    }
}

/**
 * Verifica si existe un pago Binance Pay con un Transaction ID específico.
 * Ideal para matching exacto cuando el cliente provee su Order ID.
 *
 * @param {string} transactionId  — El Order ID que el cliente ve en su app Binance
 * @param {number} expectedAmount — Monto USDT esperado (para validar que no sea otra transacción)
 * @returns {{ found: boolean, amount: number, status: string }}
 */
async function verifyBinancePaymentById(transactionId, expectedAmount) {
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
        console.error('[BINANCE-API] ❌ Faltan credenciales API');
        return { found: false, amount: 0 };
    }

    try {
        // Buscar en las últimas 48h para cubrir posibles demoras del cliente
        const recentPayments = await checkBinancePayments(48);

        const match = recentPayments.find(tx =>
            tx.transactionId === transactionId ||
            tx.transactionId?.includes(transactionId) ||
            transactionId?.includes(tx.transactionId)
        );

        if (match) {
            const diff = Math.abs(match.amount - expectedAmount);
            const valid = diff <= 0.05; // Tolerancia de ±0.05 USDT
            console.log(`[BINANCE-API] ${valid ? '✅' : '⚠️'} TxID ${transactionId}: ${match.amount} USDT (esperado: ${expectedAmount} USDT, diff: ${diff.toFixed(4)})`);
            return { found: true, amount: match.amount, status: match.status, amountValid: valid };
        }

        console.log(`[BINANCE-API] 🔍 TxID ${transactionId} no encontrado en las últimas 48h`);
        return { found: false, amount: 0 };

    } catch (err) {
        console.error('[BINANCE-API] Error verificando TxID:', err.message);
        return { found: false, amount: 0, error: err.message };
    }
}

/**
 * Compatibilidad hacia atrás: usado por server.js como markEmailAsRead.
 * Con la API ya no hay correos que marcar — esta función es un no-op.
 */
async function markEmailAsRead(uid) {
    // No-op: con la API de Binance no hay correos IMAP que gestionar
    if (typeof uid === 'string' && uid.startsWith('mock-')) {
        console.log(`[BINANCE-API] Pago simulado ${uid} procesado.`);
    } else {
        console.log(`[BINANCE-API] ℹ️ markEmailAsRead llamado con uid=${uid} — no-op en modo API.`);
    }
}

/**
 * Compatibilidad hacia atrás con server.js que llama checkBinanceEmails().
 * Redirige a checkBinancePayments() devolviendo el mismo formato.
 */
async function checkBinanceEmails() {
    const payments = await checkBinancePayments(24);
    // Adaptar formato al que espera server.js: { uid, amount, text }
    return payments.map(p => ({
        uid: p.transactionId,   // usamos el transactionId como "uid" del correo
        amount: p.amount,
        text: `Binance Pay TxID=${p.transactionId} | ${p.amount} USDT | ${new Date(p.time).toISOString()}`
    }));
}

module.exports = {
    checkBinanceEmails,       // compatibilidad con server.js existente
    checkBinancePayments,     // nueva función directa
    verifyBinancePaymentById, // verificación exacta por Transaction ID
    markEmailAsRead           // no-op de compatibilidad
};
