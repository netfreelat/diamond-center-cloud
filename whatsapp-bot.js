require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const RENDER_URL = 'https://recargasney.com';
const SERVER_URL = process.env.SERVER_URL || RENDER_URL;
const isHttps = SERVER_URL.startsWith('https');
const httpMod = isHttps ? require('https') : require('http');

let isProcessingQueue = false;
let isRestarting = false;
const messageFailCount = {}; // Contador de fallos por mensaje

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 300000, // 5 minutos de timeout del protocolo
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ? process.env.PUPPETEER_EXECUTABLE_PATH.trim() : undefined,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            // Prevenir suspensión/estrangulamiento en segundo plano (background throttling)
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection'
        ]
    }
});

async function restartClient() {
    if (isRestarting) {
        console.log('⚠️ [WHATSAPP] Ya hay un proceso de reinicio activo. Ignorando...');
        return;
    }
    isRestarting = true;
    isProcessingQueue = true; // Pausar cola temporalmente
    console.log('🔄 [WHATSAPP] Iniciando proceso de reinicio del bot...');
    updateStatus('Reiniciando');

    try {
        if (client) {
            console.log('🔄 [WHATSAPP] Cerrando navegador y limpiando sesión previa...');
            await client.destroy();
            console.log('✅ [WHATSAPP] Cliente previo destruido con éxito.');
        }
    } catch (destroyErr) {
        console.error('⚠️ [WHATSAPP] Error al destruir cliente previo:', destroyErr.message);
    }

    console.log('🔄 [WHATSAPP] Esperando 5 segundos antes de re-inicializar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        console.log('🔄 [WHATSAPP] Inicializando nuevo cliente de WhatsApp...');
        await client.initialize();
        console.log('✅ [WHATSAPP] Cliente de WhatsApp inicializado.');
    } catch (initErr) {
        console.error('❌ [WHATSAPP] Error en initialize durante reinicio:', initErr.message);
        isRestarting = false;
        // Si falla, reintentar automáticamente en 15 segundos
        setTimeout(restartClient, 15000);
    } finally {
        isRestarting = false;
        isProcessingQueue = false;
    }
}

function updateStatus(status, qr = '') {
    const data = JSON.stringify({ status, qr });
    const url = new URL(SERVER_URL);
    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/wa_status_update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };
    const req = httpMod.request(options, (res) => {
        console.log(`[WA-STATUS] Notificado al servidor: ${status} (Respuesta: ${res.statusCode})`);
    });
    req.on('error', (e) => {
        console.error(`[WA-STATUS] ❌ Error notificando al servidor:`, e.message);
    });
    req.write(data);
    req.end();
}

client.on('qr', (qr) => {
    console.log('\n=========================================');
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP');
    console.log('=========================================\n');
    qrcode.generate(qr, { small: true });
    updateStatus('Esperando QR', qr);
});

client.on('ready', () => {
    console.log('\n✅ ¡Bot de WhatsApp conectado y listo!');
    console.log(`Escuchando mensajes pendientes desde: ${SERVER_URL}\n`);
    updateStatus('Conectado', '');
    
    // Iniciar el polling cada 10 segundos
    setInterval(checkQueue, 10000);
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
    updateStatus('Error de autenticación');
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    updateStatus('Desconectado');
    restartClient();
});

client.initialize();

// 🌟 Capturar respuestas de calificación (1-5) de los clientes e instrucciones de admin (Aprobar/Rechazar)
client.on('message', async (msg) => {
    try {
        const text = msg.body.trim();
        
        // Resolver el ID real del remitente (evita vulnerabilidad en grupos donde msg.from es el JID del grupo)
        const realSenderId = msg.author || msg.from;
        
        // Resolver número real del remitente - múltiples métodos de fallback
        let senderPhone = '';
        try {
            const contact = await msg.getContact();
            // contact.id.user da el número de teléfono real (sin @lid/@c.us)
            senderPhone = (contact.id && contact.id.user) 
                ? contact.id.user.replace(/\D/g, '') 
                : (contact.number || '').replace(/\D/g, '');
        } catch (e) {
            // Fallback: extraer de realSenderId si viene @c.us
            senderPhone = realSenderId.replace('@c.us', '').replace('@lid', '').replace(/\D/g, '');
        }
        
        console.log(`[WHATSAPP-MSG] 📩 Remitente: ${realSenderId} (Chat: ${msg.from}) | Phone resuelto: ${senderPhone} | Texto: "${text}" | isAdmin: ${isAdminJID(realSenderId, senderPhone)}`);

        // 🛡️ LÓGICA DE ADMINISTRADOR: Aprobar/Rechazar Pedidos
        if (isAdminJID(realSenderId, senderPhone)) {
            // Caso 1: Responder a un mensaje (Quoted Message)
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const ref = extractReference(quotedMsg.body);
                if (ref) {
                    const command = text.toLowerCase();
                    if (['aprobar', 'aprobado', 'aproba', 'aprueba', 'si', 'sí', 'a', 'yes'].includes(command)) {
                        await handleAdminAction(msg, 'aprobar', ref);
                        return;
                    } else if (['rechazar', 'rechazado', 'rechaza', 'no', 'r'].includes(command)) {
                        await handleAdminAction(msg, 'rechazar', ref);
                        return;
                    }
                }
            }
            
            // Caso 2: Comando directo (ej: "Aprobar 1234", "a 1234", "1234 a", "r 1234")
            const parts = text.split(/\s+/);
            if (parts.length === 2) {
                const p1 = parts[0].toLowerCase();
                const p2 = parts[1].toLowerCase();
                
                // Mapear comandos válidos
                const approveCmds = ['aprobar', 'aprobado', 'aprueba', 'a', 'ok', 'si', 'sí', 'yes'];
                const rejectCmds = ['rechazar', 'rechazado', 'rechaza', 'r', 'no'];
                
                let action = null;
                let ref = null;
                
                if (approveCmds.includes(p1) && /^[A-Za-z0-9_.-]{4,}$/.test(p2)) {
                    action = 'aprobar';
                    ref = parts[1];
                } else if (rejectCmds.includes(p1) && /^[A-Za-z0-9_.-]{4,}$/.test(p2)) {
                    action = 'rechazar';
                    ref = parts[1];
                } else if (/^[A-Za-z0-9_.-]{4,}$/.test(p1) && approveCmds.includes(p2)) {
                    action = 'aprobar';
                    ref = parts[0];
                } else if (/^[A-Za-z0-9_.-]{4,}$/.test(p1) && rejectCmds.includes(p2)) {
                    action = 'rechazar';
                    ref = parts[0];
                }
                
                if (action && ref) {
                    await handleAdminAction(msg, action, ref);
                    return;
                }
            }

            // Caso 3: Cambiar tasa de cambio (ej: "tasa 650" o "tasa 650.50")
            const tasaMatch = text.match(/^tasa\s+(\d+(?:[.,]\d+)?)$/i);
            if (tasaMatch) {
                const newRateStr = tasaMatch[1].replace(',', '.');
                const newRate = parseFloat(newRateStr);
                if (!isNaN(newRate) && newRate > 0) {
                    await handleAdminUpdateRate(msg, newRate);
                    return;
                }
            }
        }

        // --- COMANDO DE PRECIOS PARA TODOS (Clientes y Admin) ---
        const cleanText = text.toLowerCase().trim();
        if (['precios', 'precio', 'diamantes', 'costos', 'paquetes'].includes(cleanText)) {
            await handleSendPrices(msg);
            return;
        }

        const rating = parseInt(text);
        if (isNaN(rating) || rating < 1 || rating > 5) return; // Solo aceptar "1" a "5"

        // Buscar si este número tiene una solicitud de reseña pendiente en la cola
        const senderNumber = msg.from.replace('@c.us', '');
        
        // Consultar al servidor si este número tiene una orden aprobada reciente
        const checkUrl = `${SERVER_URL}/api/reviews/check?wa=${encodeURIComponent(senderNumber)}`;
        const isHttps = SERVER_URL.startsWith('https');
        const httpMod2 = isHttps ? require('https') : require('http');

        const checkReq = httpMod2.get(checkUrl, (checkRes) => {
            let body = '';
            checkRes.on('data', chunk => body += chunk);
            checkRes.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.eligible) return; // No tenía solicitud de reseña pendiente

                    // Guardar la reseña
                    const reviewPayload = JSON.stringify({
                        uid: data.uid,
                        name: data.name,
                        pack: data.pack,
                        rating: rating
                    });
                    const postUrl = new URL(`${SERVER_URL}/api/reviews`);
                    const postReq = httpMod2.request({
                        hostname: postUrl.hostname,
                        port: postUrl.port || (isHttps ? 443 : 80),
                        path: postReq_path = postUrl.pathname,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reviewPayload) }
                    }, () => {});
                    postReq.on('error', () => {});
                    postReq.write(reviewPayload);
                    postReq.end();

                    // Confirmar al cliente
                    const stars = '⭐'.repeat(rating);
                    const reply = rating >= 4
                        ? `${stars}\n\n¡Gracias por tu calificación! Tu opinión nos motiva a seguir mejorando. 💎\n\n¡Esperamos verte pronto en *RECARGASNEY.COM*! 🎯`
                        : `${stars}\n\nGracias por tu respuesta. Lamentamos que tu experiencia no haya sido perfecta. Si tuviste algún problema, contáctanos y lo resolveremos. 🤝`;
                    await client.sendMessage(msg.from, reply);
                    console.log(`[REVIEW] ✅ Calificación ${rating}⭐ guardada de ${senderNumber}`);
                } catch (e) {}
            });
        });
        checkReq.on('error', () => {});
    } catch (e) {}
});

// Lógica de procesamiento de cola


async function checkQueue() {
    if (isProcessingQueue) return; // ⚠️ Evitar llamadas superpuestas
    
    try {
        isProcessingQueue = true;
        const req = httpMod.get(`${SERVER_URL}/api/whatsapp_queue`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(body);
                        
                        if (data.restart) {
                            console.log('🔄 [WHATSAPP] Reinicio remoto solicitado desde el servidor.');
                            restartClient();
                            return;
                        }

                        if (data.success && data.queue && data.queue.length > 0) {
                            console.log(`[WHATSAPP] Hay ${data.queue.length} mensajes pendientes.`);
                            for (const item of data.queue) {
                                await sendMessage(item);
                            }
                        }
                    } catch(e) {
                        console.error('[WHATSAPP] Error parseando JSON de cola:', e.message);
                    } finally {
                        isProcessingQueue = false; // Liberar lock al terminar el lote
                    }
                } else {
                    isProcessingQueue = false;
                }
            });
        });
        req.on('error', (e) => {
            console.error('[WHATSAPP] Error conectando al servidor web:', e.message);
            isProcessingQueue = false;
        });
    } catch (e) {
        console.error('[WHATSAPP] Error en checkQueue:', e.message);
        isProcessingQueue = false;
    }
}

async function sendMessage(item) {
    try {
        // =====================================================
        // NORMALIZACIÓN UNIVERSAL DE NÚMERO (soporte internacional)
        // =====================================================
        let targetNumber = item.number.toString().trim();

        // 1. Quitar el símbolo + si viene (ej: +573001234567 -> 573001234567)
        if (targetNumber.startsWith('+')) {
            targetNumber = targetNumber.substring(1);
        }

        // 2. Quitar espacios, guiones, paréntesis que algunos usuarios escriben
        targetNumber = targetNumber.replace(/[\s\-\(\)\.]/g, '');

        // 3. Solo si es un número LOCAL venezolano (empieza en 04xx o 02xx),
        //    agregarle el código de país 58.
        //    Ejemplo: 04123456789 -> 584123456789
        if (/^0[24]\d+$/.test(targetNumber)) {
            console.log(`[WHATSAPP] 🔧 Número local venezolano detectado: ${targetNumber} -> 58${targetNumber.substring(1)}`);
            targetNumber = '58' + targetNumber.substring(1);
        }

        // 4. Fix específico: si quedó 580x... (doble cero venezolano) -> 584x...
        //    Ejemplo: 5804123456789 -> 584123456789
        if (targetNumber.startsWith('580') && targetNumber.length >= 13) {
            console.log(`[WHATSAPP] 🔧 Corrigiendo doble-cero venezolano: ${targetNumber} -> 58${targetNumber.substring(3)}`);
            targetNumber = '58' + targetNumber.substring(3);
        }

        // 5. Verificar que el número resultante solo tenga dígitos
        if (!/^\d+$/.test(targetNumber)) {
            console.warn(`[WHATSAPP] ⚠️ Número inválido tras normalización: "${targetNumber}". Se intenta enviar igual.`);
            targetNumber = targetNumber.replace(/\D/g, '');
        }

        console.log(`[WHATSAPP] 📞 Número normalizado: ${item.number} -> ${targetNumber}`);
        let numberId = `${targetNumber}@c.us`;
        
        // Verificamos si el cliente está listo
        if (!client || !client.pupPage) {
            throw new Error('El navegador de WhatsApp no está listo todavía.');
        }

        try {
            console.log(`[WHATSAPP] 🔍 Resolviendo WID/LID para el número: ${targetNumber}...`);
            const resolvedId = await client.getNumberId(targetNumber);
            if (resolvedId && resolvedId._serialized) {
                numberId = resolvedId._serialized;
                console.log(`[WHATSAPP] ✅ WID/LID resuelto exitosamente: ${numberId}`);
            } else {
                console.log(`[WHATSAPP] ⚠️ getNumberId no encontró WID para ${targetNumber}. Usando fallback: ${numberId}`);
            }
        } catch (resolveErr) {
            console.warn(`[WHATSAPP] ⚠️ Error llamando a getNumberId para ${targetNumber}:`, resolveErr.message);
        }

        console.log(`[WHATSAPP] Enviando mensaje a ${item.number} (usando ${numberId})...`);
        await client.sendMessage(numberId, item.message);
        console.log(`[WHATSAPP] ✅ Mensaje enviado a ${item.number}`);
        
        // Marcar como enviado en el servidor
        markAsSent(item.id);
        
        // Pausa aleatoria para parecer más humano y evitar bloqueos (entre 4 y 8 segundos por defecto, o el delay personalizado)
        const delay = item.delay ? parseInt(item.delay) : (Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000);
        console.log(`[WHATSAPP] ⏳ Esperando ${Math.round(delay / 1000)} segundos antes de continuar...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
        console.error(`[WHATSAPP] ❌ Error enviando a ${item.number}:`, error.message);
        
        // 🛡️ RECUPERACIÓN: Si el error es un frame desconectado, contexto destruido o sesión cerrada, reiniciar por completo
        const isFatalError = error.message.includes('detached Frame') || 
                             error.message.includes('Execution context was destroyed') || 
                             error.message.includes('Session closed') ||
                             error.message.includes('Protocol error');
                             
        if (isFatalError) {
            console.log('🔄 [WHATSAPP] Detectado error fatal en Puppeteer/Navegador. Iniciando reinicio...');
            restartClient();
            return;
        }

        // 🔁 ANTI-BUCLE: Si el mismo mensaje falla 3 veces, marcarlo como enviado para no bloquearse
        messageFailCount[item.id] = (messageFailCount[item.id] || 0) + 1;
        if (messageFailCount[item.id] >= 3) {
            console.warn(`[WHATSAPP] ⚠️ Mensaje ${item.id} falló 3 veces. Se descarta para evitar bucle infinito.`);
            delete messageFailCount[item.id];
            markAsSent(item.id);
        } else {
            console.log(`[WHATSAPP] 🔁 Reintento ${messageFailCount[item.id]}/3 para mensaje ${item.id}. Esperando 10s...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

function markAsSent(id) {
    const data = JSON.stringify({ id });
    const url = new URL(SERVER_URL);
    
    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/whatsapp_sent',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };
    
    const req = httpMod.request(options, (res) => {
        // OK
    });
    
    req.on('error', (error) => {
        console.error('[WHATSAPP] Error al marcar como enviado:', error.message);
    });
    
    req.write(data);
    req.end();
}

// =========================================================================
// 🛡️ LÓGICA Y CONFIGURACIÓN DE ADMINISTRADORES (Aprobar/Rechazar Pedidos)
// =========================================================================
const ADMIN_WA_NUMBERS = ['04243790757', '04125313735'];

// Verificación de admin: compara ESTRICTAMENTE por número de teléfono normalizado
function isAdminJID(jid, resolvedPhone) {
    return isAdminPhone(resolvedPhone);
}

// Verifica si un número de teléfono (solo dígitos) es admin
function isAdminPhone(phoneDigits) {
    if (!phoneDigits) return false;
    return ADMIN_WA_NUMBERS.some(adminNum => {
        let cleanAdmin = adminNum.replace(/\D/g, '');
        if (cleanAdmin.startsWith('0')) {
            cleanAdmin = '58' + cleanAdmin.substring(1);
        } else if (!cleanAdmin.startsWith('58') && cleanAdmin.length === 10) {
            cleanAdmin = '58' + cleanAdmin;
        }
        return phoneDigits === cleanAdmin;
    });
}

function extractReference(text) {
    if (!text) return null;
    // Buscar la referencia en el cuerpo del mensaje citado
    const match = text.match(/Referencia:\s*\*?`?([A-Za-z0-9_.-]+)/i);
    if (match) return match[1].trim();
    return null;
}

function callAdminAPI(endpoint, payloadObj) {
    return new Promise((resolve, reject) => {
        const dataObj = typeof payloadObj === 'object' ? payloadObj : { ref: payloadObj };
        const payload = JSON.stringify(dataObj);
        const url = new URL(`${SERVER_URL}${endpoint}`);
        const isHttps = SERVER_URL.startsWith('https');
        const httpLib = isHttps ? require('https') : require('http');

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'X-WA-Secret': process.env.ADMIN_PASS || 'Sneyder12345*#'
            }
        };

        const req = httpLib.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, error: e.message, raw: body });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(payload);
        req.end();
    });
}

async function handleAdminAction(msg, action, ref) {
    try {
        const actionLabel = action === 'aprobar' ? 'APROBACIÓN' : 'RECHAZO';
        console.log(`[ADMIN-ACTION] Iniciando ${actionLabel} para ref: ${ref} (Solicitado por admin: ${msg.from})`);
        await msg.reply(`⏳ Procesando ${actionLabel.toLowerCase()} del pedido *${ref}*...`);

        const endpoint = action === 'aprobar' ? '/admin/aprobar' : '/admin/rechazar';
        const res = await callAdminAPI(endpoint, ref);

        if (res.statusCode === 200 && res.data && res.data.success) {
            const finalRef = res.data.resolvedRef || ref;
            if (action === 'aprobar') {
                await msg.reply(`✅ *PEDIDO APROBADO CON ÉXITO*\n\n📌 *Referencia:* ${finalRef}\n📝 *Detalle:* ${res.data.message || 'Recarga completada directamente.'}`);
            } else {
                await msg.reply(`✅ *PEDIDO RECHAZADO Y NOTIFICADO*\n\n📌 *Referencia:* ${finalRef}`);
            }
        } else {
            const finalRef = (res.data && res.data.resolvedRef) ? res.data.resolvedRef : ref;
            const errorMsg = res.data ? (res.data.message || res.data.error) : (res.error || 'Error de conexión');
            await msg.reply(`❌ *FALLO AL PROCESAR EL PEDIDO*\n\n📌 *Referencia:* ${finalRef}\n⚠️ *Motivo:* ${errorMsg}`);
        }
    } catch (err) {
        console.error(`[ADMIN-ACTION] Error en action ${action} para ref ${ref}:`, err.message);
        await msg.reply(`❌ *ERROR DE SISTEMA*\n\n📌 *Referencia:* ${ref}\n⚠️ *Detalle:* ${err.message}`);
    }
}

async function handleAdminUpdateRate(msg, newRate) {
    try {
        console.log(`[ADMIN-RATE] Actualizando tasa a ${newRate} (Solicitado por admin: ${msg.from})`);
        await msg.reply(`⏳ Actualizando tasa del día a *${newRate} Bs*...`);

        const res = await callAdminAPI('/admin/settings', { tasa_del_dia: newRate });

        if (res.statusCode === 200 && res.data && res.data.success) {
            await msg.reply(`✅ *TASA ACTUALIZADA CON ÉXITO*\n\n📈 *Nueva tasa:* ${newRate} Bs/$`);
        } else {
            const errorMsg = res.data ? (res.data.message || res.data.error) : (res.error || 'Error de conexión');
            await msg.reply(`❌ *FALLO AL ACTUALIZAR LA TASA*\n\n⚠️ *Motivo:* ${errorMsg}`);
        }
    } catch (err) {
        console.error(`[ADMIN-RATE] Error actualizando tasa a ${newRate}:`, err.message);
        await msg.reply(`❌ *ERROR DE SISTEMA*\n\n⚠️ *Detalle:* ${err.message}`);
    }
}

async function handleSendPrices(msg) {
    try {
        const url = new URL(`${SERVER_URL}/api/config`);
        const isHttps = SERVER_URL.startsWith('https');
        const httpLib = isHttps ? require('https') : require('http');

        console.log(`[WHATSAPP-PRECIOS] Consultando precios al servidor: ${url.href}`);

        httpLib.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', async () => {
                try {
                    if (res.statusCode !== 200) {
                        throw new Error(`Código de estado del servidor: ${res.statusCode}`);
                    }
                    const config = JSON.parse(body);
                    const tasa = parseFloat(config.tasa_del_dia) || 635.00;
                    const precios = config.precios || {};
                    const canal = (config.whatsapp && config.whatsapp.canal) ? config.whatsapp.canal : 'https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K';
                    
                    // Ordenar las claves de precios numéricamente
                    const sortedKeys = Object.keys(precios).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    let msgText = `💎 *RECARGASNEY.COM - PRECIOS ACTUALIZADOS* 💎\n`;
                    msgText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    msgText += `⚡ _Precios expresados en Bolívares (Bs.):_\n\n`;
                    
                    sortedKeys.forEach(key => {
                        const item = precios[key];
                        const priceUsdt = parseFloat(item.usdt);
                        const priceBs = (priceUsdt * tasa).toFixed(2).replace('.', ',');
                        
                        let icon = '🔹';
                        if (parseInt(key) >= 1060) icon = '🔥';
                        if (parseInt(key) >= 5600) icon = '👑';
                        
                        msgText += `${icon} *${item.label || (key + ' Diamantes')}* ➔ *${priceBs} Bs.*\n`;
                    });
                    
                    msgText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                    msgText += `🌐 *Compra aquí:* https://recargasney.com\n`;
                    msgText += `📱 *Únete a nuestro Canal:* \n🔗 ${canal}\n\n`;
                    msgText += `⚡ _¡Recargas al instante con tu ID Garena!_ 🚀`;
                    
                    await client.sendMessage(msg.from, msgText);
                    console.log(`[WHATSAPP-PRECIOS] Precios enviados con éxito a ${msg.from}`);
                } catch (e) {
                    console.error('[WHATSAPP-PRECIOS] Error parseando respuesta de config:', e.message);
                    await msg.reply('❌ No se pudo obtener la lista de precios en este momento. Por favor intenta más tarde.');
                }
            });
        }).on('error', async (err) => {
            console.error('[WHATSAPP-PRECIOS] Error en petición GET:', err.message);
            await msg.reply('❌ Error al conectar con el servidor para obtener los precios.');
        });
    } catch (err) {
        console.error('[WHATSAPP-PRECIOS] Error general en handleSendPrices:', err.message);
        await msg.reply('❌ Error al procesar la solicitud de precios.');
    }
}

