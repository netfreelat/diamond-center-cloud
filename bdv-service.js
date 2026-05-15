/**
 * bdv-service.js
 * Servicio de verificación de pagos BDV en línea
 * Portado desde PHP Bdv_api class
 */
const https = require('https');

// Tomar de las variables de entorno, o usar las por defecto (aunque caducan)
const MEDIA_HUELLA = process.env.BDV_MEDIA_HUELLA || 'I0+nx3T/kAjP/sNwSmHST/U92mILKHJgwzc7MoaZYPMIkcls7+AVv2egxsrsZFbnawtVojz5OP978ac43vk4467DfChOi0wscvparN2/w0iOpwU8ELwNH2E/SoIHA1kuo4mf83CsAMdx7u+/1toMyIfTRTAQUjwXxflPXDvjUKQ=';
const BDV_HOST = 'bdvenlinea.banvenez.com';
const BDV_COOKIE = process.env.BDV_F5_COOKIE || 'f5avrbbbbbbbbbbbbbbbb=GCDPJHLGPMIAOPAEKIKAFMNOHLENMHDNGLEBDPHDKLLGKMFHHOBBFJMKCJHHEAGHDGJDIDIIMGKCMPAKCEJALPGDAOMCKNJPEGGHFNKPIFFDCLCBCGLHAHBCBJKGKAID';

function httpsRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request({ ...options, rejectUnauthorized: false }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('BDV Timeout')); });
        if (postData) req.write(postData);
        req.end();
    });
}

async function bdvLogin() {
    try {
        const user = process.env.BDV_USER;
        const pass = process.env.BDV_PASS;

        if (!user || !pass) {
            console.error('[BDV] Faltan BDV_USER o BDV_PASS en .env');
            return null;
        }

        // PASO 1: Verificar usuario único
        const post1 = JSON.stringify({ username: user, mediaHuella: MEDIA_HUELLA, huella: null });
        const res1 = await httpsRequest({
            hostname: BDV_HOST,
            path: '/oauthaccess/verificar-usuario-unico',
            method: 'POST',
            headers: {
                'Host': BDV_HOST,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(post1),
                'Referer': `https://${BDV_HOST}/`,
                'Origin': `https://${BDV_HOST}`,
                'Connection': 'keep-alive',
                'Cookie': BDV_COOKIE
            }
        }, post1);

        const ticketMatch = res1.match(/"ticketId":"([^"]+)"/);
        if (!ticketMatch) {
            console.error('[BDV] No se obtuvo ticketId:', res1.substring(0, 300));
            return null;
        }
        const ticketId = ticketMatch[1];
        console.log('[BDV] Step 1 OK. TicketId obtenido.');

        // PASO 2: Login con contraseña
        const post2 = JSON.stringify({ usoFrecuente: null, password: pass, ticketId });
        const res2 = await httpsRequest({
            hostname: BDV_HOST,
            path: '/oauthaccess/login',
            method: 'POST',
            headers: {
                'Host': BDV_HOST,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(post2),
                'Referer': `https://${BDV_HOST}/`,
                'Origin': `https://${BDV_HOST}`,
                'Cookie': BDV_COOKIE
            }
        }, post2);

        const codigoMatch = res2.match(/"codigo":"([^"]+)"/);
        const codigo = codigoMatch ? codigoMatch[1] : '';

        if (codigo === '00') {
            const tokenMatch = res2.match(/"access_token":"([^"]+)"/);
            if (tokenMatch) {
                console.log('[BDV] ✅ Login exitoso.');
                return `Bearer ${tokenMatch[1]}`;
            }
        }

        const descMatch = res2.match(/"descripcion":"([^"]+)"/);
        console.error(`[BDV] Login fallido. Código: ${codigo}, Descripción: ${descMatch ? descMatch[1] : 'Sin detalle'}`);
        return null;

    } catch (e) {
        console.error('[BDV] Error en login:', e.message);
        return null;
    }
}

async function bdvMovimientos(bearerToken) {
    try {
        const cuenta = process.env.BDV_CUENTA;
        if (!cuenta) {
            console.error('[BDV] Falta BDV_CUENTA en .env');
            return null;
        }

        const res = await httpsRequest({
            hostname: BDV_HOST,
            path: `/movimientoscuenta/movimientosCuenta/${cuenta}/VES/`,
            method: 'GET',
            headers: {
                'Authorization': bearerToken,
                'Cookie': BDV_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:83.0) Gecko/20100101 Firefox/83.0',
                'Accept': 'application/json, text/plain, */*',
                'Host': BDV_HOST
            }
        });

        if (res.includes('invalid_token')) {
            console.error('[BDV] Token inválido, se requiere nuevo login.');
            return null;
        }

        // Intentar parsear JSON
        const jsonMatch = res.match(/(\[.*\])/s);
        if (!jsonMatch) {
            console.error('[BDV] Respuesta no es JSON:', res.substring(0, 200));
            return null;
        }

        const movimientos = JSON.parse(jsonMatch[1]);
        console.log(`[BDV] ✅ Se obtuvieron ${movimientos.length} movimientos.`);
        return movimientos;

    } catch (e) {
        console.error('[BDV] Error obteniendo movimientos:', e.message);
        return null;
    }
}

/**
 * Verifica si existe un pago BDV que coincida con la referencia y monto dados.
 * @param {number} montoBs - Monto esperado en Bolívares
 * @param {string} ref4 - Últimos 4 dígitos de la referencia que reportó el cliente
 * @param {string} bearerToken - Token de autenticación BDV
 * @returns {object} { success, movimiento } o { success: false, error/pending }
 */
async function verificarPagoBDV(montoBs, ref4, bearerToken) {
    try {
        const movimientos = await bdvMovimientos(bearerToken);
        if (!movimientos) return { success: false, pending: true };

        for (const mov of movimientos) {
            const indicador = (mov.indicadorCargoAbono || '').trim();
            const descripcion = (mov.descripcion || '').trim();
            const referencia = (mov.referencia || '').replace(/\s/g, '');
            const importe = (mov.importe || '0');

            // Solo abonos (créditos)
            if (indicador !== 'A' && indicador !== 'ABONO') continue;

            // Calcular monto
            const montoMov = parseFloat(importe.replace(/\./g, '').replace(',', '.'));

            // Determinar longitud de referencia según descripción
            let refVal;
            if (
                descripcion === 'ABO TRASP A OTRAS CTAS CLAVENET' ||
                descripcion === 'TRASPASO OTRAS CTAS BDV EN LINEA' ||
                descripcion === 'TRANSFERENCIAS RECIBIDAS'
            ) {
                refVal = referencia.slice(-8);
            } else {
                refVal = referencia.slice(-4);
            }

            const refMatch = refVal === ref4 || refVal.endsWith(ref4);
            const montoMatch = Math.abs(montoMov - montoBs) < 1.0;

            if (refMatch && montoMatch) {
                console.log(`[BDV] ✅ Pago verificado. Ref: ${referencia}, Monto: ${importe} Bs`);
                return { success: true, movimiento: { fecha: mov.fecha, referencia, importe, descripcion } };
            }
        }

        return { success: false, pending: true };

    } catch (e) {
        console.error('[BDV] Error verificando pago:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = { bdvLogin, bdvMovimientos, verificarPagoBDV };
