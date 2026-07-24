require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const RENDER_URL = 'https://recargasney.com';
const SERVER_URL = process.env.SERVER_URL || RENDER_URL;
const isHttps = SERVER_URL.startsWith('https');
const httpMod = isHttps ? require('https') : require('http');

let isProcessingQueue = false;
let isRestarting = false;
let queueInterval = null; // handle del setInterval de la cola
const messageFailCount = {}; // Contador de fallos por mensaje

// Evasión de firmas de bot y User-Agent moderno correspondiente a Windows
const CUSTOM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const client = new Client({
    authStrategy: new LocalAuth(),
    userAgent: CUSTOM_USER_AGENT,
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
            '--disable-ipc-flooding-protection',
            `--user-agent=${CUSTOM_USER_AGENT}`
        ]
    }
});

function clearSessionCache() {
    try {
        const sessionPath = path.join(__dirname, '.wwebjs_auth');
        if (fs.existsSync(sessionPath)) {
            console.log('🧹 [WHATSAPP] Borrando caché de sesión de WhatsApp en .wwebjs_auth...');
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('🧹 [WHATSAPP] Caché borrada exitosamente.');
        }
    } catch (e) {
        console.error('⚠️ [WHATSAPP] Error al intentar borrar la caché de sesión:', e.message);
    }
}

async function restartClient() {
    if (isRestarting) {
        console.log('⚠️ [WHATSAPP] Ya hay un proceso de reinicio activo. Ignorando...');
        return;
    }
    isRestarting = true;
    isProcessingQueue = true;
    console.log('🔄 [WHATSAPP] Error crítico detectado. Reiniciando proceso via PM2...');
    updateStatus('Reiniciando');

    // Limpiar intervalo anterior para evitar acumulación
    if (queueInterval) {
        clearInterval(queueInterval);
        queueInterval = null;
    }

    try {
        if (client) {
            await client.destroy();
        }
    } catch (e) {}

    // Dejar que PM2 reinicie el proceso limpiamente
    console.log('🔄 [WHATSAPP] Saliendo para que PM2 reinicie el proceso...');
    setTimeout(() => process.exit(1), 2000);
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
    const activeNumber = client.info && client.info.wid ? client.info.wid.user : 'Desconocido';
    console.log(`\n✅ ¡Bot de WhatsApp conectado y listo! Número activo: ${activeNumber}`);
    console.log(`Escuchando mensajes pendientes desde: ${SERVER_URL}\n`);
    updateStatus('Conectado', '');
    
    // Limpiar intervalo anterior si existe
    if (queueInterval) clearInterval(queueInterval);
    // 🔕 Iniciar el polling cada 10 segundos DESACTIVADO a petición del usuario.
    // El bot no enviará mensajes automáticos salientes, solo responderá de manera reactiva.
    // queueInterval = setInterval(checkQueue, 10000);

    // 📇 Sincronizar todos los chats históricos de WhatsApp
    syncAllHistoricalChats();
});

async function syncAllHistoricalChats() {
    try {
        console.log('[WA-SYNC] 📥 Sincronizando chats históricos de la cuenta de WhatsApp...');
        const chats = await client.getChats();
        let synced = 0;
        for (const chat of chats) {
            if (!chat.isGroup && chat.id && chat.id.user) {
                const phone = chat.id.user.replace(/\D/g, '');
                const name = chat.name || chat.pushname || 'Cliente WA';
                if (phone && phone.length >= 8 && !isAdminJID(chat.id._serialized, phone)) {
                    synced++;
                    const postData = JSON.stringify({ phone, name, source: 'wa_bot' });
                    const req = http.request({
                        hostname: 'localhost',
                        port: 3500,
                        path: '/api/save_wa_contact',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
                    }, () => {});
                    req.on('error', () => {});
                    req.write(postData);
                    req.end();
                }
            }
        }
        console.log(`[WA-SYNC] ✅ Sincronizados ${synced} contactos de WhatsApp históricos.`);
    } catch (e) {
        console.error('[WA-SYNC] Error sincronizando chats:', e.message);
    }
}

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
    updateStatus('Error de autenticación');
    clearSessionCache(); // Borrar sesión corrupta/bloqueada
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    updateStatus('Desconectado');
    if (reason === 'NAVIGATION' || reason === 'LOGOUT' || reason === 'DELETE_USER' || (reason && reason.toString().includes('Session closed'))) {
        console.log('🧹 [WHATSAPP] Desconexión permanente detectada, limpiando caché de sesión...');
        clearSessionCache();
    }
    restartClient();
});

client.initialize();

// ═══════════════════════════════════════════════════════════
// 📋 MENÚ INTERACTIVO — Sesiones activas por usuario
// ═══════════════════════════════════════════════════════════
// Guarda: { expiresAt: timestamp } por cada JID activo en el menú
const menuSessions = new Map();
const MENU_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de sesión activa

function isMenuActive(jid) {
    const session = menuSessions.get(jid);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
        menuSessions.delete(jid);
        return false;
    }
    return true;
}

function setMenuActive(jid) {
    menuSessions.set(jid, { expiresAt: Date.now() + MENU_TIMEOUT_MS });
}

function clearMenu(jid) {
    menuSessions.delete(jid);
}

async function sendMenu(msg) {
    setMenuActive(msg.from);
    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1200));
    } catch (e) {}
    const menuText =
        `🎮 *¡Hola! Bienvenido a RECARGASNEY* 💎\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `¿En qué te puedo ayudar hoy?\n\n` +
        `1️⃣  Ver precios en *Bolívares*\n` +
        `2️⃣  Ver precios en *USDT*\n` +
        `3️⃣  ¿Cómo comprar? *(paso a paso)*\n` +
        `4️⃣  Estado de mi *pedido*\n` +
        `5️⃣  Hablar con *Soporte*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_Responde con el número de tu opción_ 👆`;
    await msg.reply(menuText);
    console.log(`[MENÚ] ✅ Menú enviado a ${msg.from}`);
}

async function sendHowToBuy(msg) {
    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 1500));
    } catch (e) {}
    const howText =
        `📖 *¿Cómo comprar diamantes?*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Paso 1* 🌐\n` +
        `Entra a *recargasney.com*\n\n` +
        `*Paso 2* 🎮\n` +
        `Ingresa tu *ID de jugador* de Free Fire y toca _Consultar ID_\n\n` +
        `*Paso 3* 💎\n` +
        `Elige el *paquete de diamantes* que quieras\n\n` +
        `*Paso 4* 💳\n` +
        `Selecciona tu *método de pago*:\n` +
        `• Pago Móvil (Bolívares)\n` +
        `• Binance Pay (USDT)\n\n` +
        `*Paso 5* ✅\n` +
        `Realiza el pago, ingresa la *referencia* y confirma. ¡Listo!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ *Las recargas son instantáneas* — en menos de 5 minutos tienes tus diamantes.\n\n` +
        `¿Tienes alguna duda? Escribe *5* para hablar con soporte.`;
    await msg.reply(howText);
}

async function sendOrderStatusPrompt(msg) {
    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 800));
    } catch (e) {}
    await msg.reply(
        `🔍 *Consultar estado de pedido*\n\n` +
        `Envíame el *número de referencia* de tu pago\n` +
        `_(son los últimos dígitos de tu comprobante)_\n\n` +
        `Ejemplo: _12345678_`
    );
}

async function sendSupportMessage(msg) {
    try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await new Promise(r => setTimeout(r, 800));
    } catch (e) {}
    await msg.reply(
        `🤝 *Soporte RECARGASNEY*\n\n` +
        `Un agente te atenderá en breve.\n\n` +
        `Para agilizar tu caso, por favor indícanos:\n` +
        `• Tu *ID de jugador*\n` +
        `• El *monto* de tu recarga\n` +
        `• El *problema* o pregunta\n\n` +
        `⏰ Horario: _Lunes a Domingo, 8am - 10pm_\n\n` +
        `También puedes ingresar a *recargasney.com* y usar el chat de soporte.`
    );
}

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

        // 📇 Registrar contacto automáticamente en la base de datos
        if (senderPhone && !isAdminJID(realSenderId, senderPhone)) {
            (async () => {
                try {
                    let pushName = 'Cliente WA';
                    try {
                        const c = await msg.getContact();
                        pushName = c.pushname || c.name || 'Cliente WA';
                    } catch (_) {}
                    const postData = JSON.stringify({ phone: senderPhone, name: pushName, source: 'wa_bot' });
                    const req = http.request({
                        hostname: 'localhost',
                        port: 3500,
                        path: '/api/save_wa_contact',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
                    }, () => {});
                    req.on('error', () => {});
                    req.write(postData);
                    req.end();
                } catch (_) {}
            })();
        }

        // 🛡️ LÓGICA DE ADMINISTRADOR: Solo para actualizar la tasa
        if (isAdminJID(realSenderId, senderPhone)) {
            // Nota: Comandos de Aprobar/Rechazar Pedidos desactivados para reducir sospecha de bot/spam en el número
            /*
            // Caso 1: Responder a un mensaje (Quoted Message)
            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                const ref = extractReference(quotedMsg.body);
                if (ref) {
                    const firstWord = text.split(/\s+/)[0].toLowerCase();
                    const restText = text.substring(firstWord.length).trim();
                    if (['aprobar', 'aprobado', 'aproba', 'aprueba', 'si', 'sí', 'a', 'yes'].includes(firstWord)) {
                        await handleAdminAction(msg, 'aprobar', ref);
                        return;
                    } else if (['rechazar', 'rechazado', 'rechaza', 'no', 'r'].includes(firstWord)) {
                        await handleAdminAction(msg, 'rechazar', ref, restText || null);
                        return;
                    }
                }
            }
            
            // Caso 2: Comando directo (ej: "Aprobar 1234", "a 1234", "1234 a", "r 1234")
            const parts = text.trim().split(/\s+/);
            if (parts.length >= 2) {
                const p1 = parts[0].toLowerCase();
                const p2 = parts[1].toLowerCase();
                
                // Mapear comandos válidos
                const approveCmds = ['aprobar', 'aprobado', 'aprueba', 'a', 'ok', 'si', 'sí', 'yes'];
                const rejectCmds = ['rechazar', 'rechazado', 'rechaza', 'r', 'no'];
                
                let action = null;
                let ref = null;
                let reason = null;
                
                if (approveCmds.includes(p1) && /^[A-Za-z0-9_.-]{3,}$/.test(p2)) {
                    action = 'aprobar';
                    ref = parts[1];
                } else if (rejectCmds.includes(p1) && /^[A-Za-z0-9_.-]{3,}$/.test(p2)) {
                    action = 'rechazar';
                    ref = parts[1];
                    reason = parts.slice(2).join(' ').trim() || null;
                } else if (/^[A-Za-z0-9_.-]{3,}$/.test(p1) && approveCmds.includes(p2)) {
                    action = 'aprobar';
                    ref = parts[0];
                } else if (/^[A-Za-z0-9_.-]{3,}$/.test(p1) && rejectCmds.includes(p2)) {
                    action = 'rechazar';
                    ref = parts[0];
                    reason = parts.slice(2).join(' ').trim() || null;
                }
                
                if (action && ref) {
                    await handleAdminAction(msg, action, ref, reason);
                    return;
                }
            }
            */

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

        // ═══════════════════════════════════════════════════════════
        // 📋 MENÚ INTERACTIVO
        // ═══════════════════════════════════════════════════════════
        const cleanText = text.toLowerCase().trim()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar tildes

        const containsAny = (keywords) => keywords.some(kw => cleanText.includes(kw));

        // Palabras que abren el menú
        const menuTriggers = ['hola', 'ola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes',
            'buenas noches', 'hey', 'hi', 'menu', 'menú', 'inicio', 'start',
            'ayuda', 'help', 'info', 'informacion', 'que hacen', 'que ofrecen',
            'como funciona', 'quiero comprar', 'quiero recargar'];

        /* Desactivado para que el bot solo responda a precios
        if (containsAny(menuTriggers) && !isMenuActive(msg.from)) {
            await sendMenu(msg);
            return;
        }

        // Respuestas numéricas al menú activo
        if (isMenuActive(msg.from)) {
            const opt = cleanText.replace(/[^1-5]/g, '').trim();
            if (opt === '1') {
                clearMenu(msg.from);
                await handleSendPrices(msg);
                return;
            } else if (opt === '2') {
                clearMenu(msg.from);
                await handleSendPricesUSDT(msg);
                return;
            } else if (opt === '3') {
                clearMenu(msg.from);
                await sendHowToBuy(msg);
                return;
            } else if (opt === '4') {
                clearMenu(msg.from);
                await sendOrderStatusPrompt(msg);
                return;
            } else if (opt === '5') {
                clearMenu(msg.from);
                await sendSupportMessage(msg);
                return;
            } else if (cleanText.length > 0) {
                // Está en el menú pero escribió algo que no es 1-5
                // Si parece una palabra clave de precios, procesar igual
                if (!containsAny(['precio', 'precios', 'diamante', 'diamantes', 'costo', 'paquete',
                    'usdt', 'dolares', 'recarga', 'cuanto'])) {
                    await msg.reply(
                        `☝️ Por favor responde con un número del *1 al 5*\n\n` +
                        `1️⃣ Precios en Bs\n2️⃣ Precios USDT\n3️⃣ Cómo comprar\n4️⃣ Mi pedido\n5️⃣ Soporte`
                    );
                    return;
                }
                // Si era una pregunta de precios, limpiar menú y continuar abajo
                clearMenu(msg.from);
            }
        }
        */

        // --- COMANDO DE PRECIOS PARA TODOS ---
        // Precios en USDT (debe ir antes para que no lo atrape el bloque de bolívares)
        if (containsAny(['usdt', 'dolares', 'dolar', 'usd', 'precio dolar', 'precios dolar'])) {
            await handleSendPricesUSDT(msg);
            return;
        }

        // Precios en bolívares — cualquier forma natural de pedir precios
        if (containsAny([
            'precio', 'precios',
            'diamante', 'diamantes',
            'costo', 'costos',
            'paquete', 'paquetes',
            'cuanto cuesta', 'cuanto vale', 'cuanto cobran',
            'cuanto es', 'cuanto son',
            'que precio', 'que vale',
            'dime el precio', 'dame el precio', 'dame los precios',
            'cual es el precio', 'cuales son los precios',
            'lista de precios', 'ver precios', 'ver precio',
            'quiero saber el precio', 'quiero los precios',
            'recarga', 'recargar'
        ])) {
            await handleSendPrices(msg);
            return;
        }

        // --- CONSULTA INTERACTIVA DE PEDIDOS POR REFERENCIA ---
        const refMatch = text.match(/\b\d{3,30}\b/);
        if (refMatch) {
            const ref = refMatch[0];
            console.log(`[WHATSAPP-BOT] 🔎 Cliente/Admin ${msg.from} solicitando estado de ref: ${ref}`);
            
            const checkUrl = `${SERVER_URL}/api/wa_order_status?ref=${encodeURIComponent(ref)}`;
            const isHttps = SERVER_URL.startsWith('https');
            const httpMod2 = isHttps ? require('https') : require('http');
            
            httpMod2.get(checkUrl, (checkRes) => {
                let body = '';
                checkRes.on('data', chunk => body += chunk);
                checkRes.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        const isStaff = isAdminJID(realSenderId, senderPhone) || 
                                        ['584125322412', '584125313735', '584243445879'].some(num => senderPhone.includes(num));
                        
                        if (data.success) {
                            try {
                                const chat = await msg.getChat();
                                await chat.sendStateTyping();
                                await new Promise(resolve => setTimeout(resolve, 1500));
                            } catch (e) {}
                            
                            await client.sendMessage(msg.from, data.message);
                            console.log(`[WHATSAPP-BOT] ✅ Estado de ref ${ref} enviado a ${msg.from}`);
                        } else if (isStaff) {
                            // Si es administrador/personal y la referencia no existe en la base de datos, responderle explícitamente
                            await msg.reply(`❌ *Referencia no encontrada:* \`${ref}\`\nNo hay ningún pedido registrado con ese número de referencia en el sistema.`);
                        }
                    } catch (e) {
                        console.error('[WHATSAPP-BOT] Error procesando estado de pedido:', e.message);
                    }
                });
            }).on('error', (e) => {
                console.error('[WHATSAPP-BOT] Error conectando al servidor:', e.message);
            });
            
            return; // Terminar flujo
        }

        // Ignorar cualquier otro mensaje del cliente (Modo solo precios y consultas de ticket)
        console.log(`[WHATSAPP-BOT] ℹ️ Mensaje de cliente ignorado: "${text}"`);
        return;        // --- PREGUNTAS FRECUENTES (FAQ AUTOMÁTICO) ---
        // 1. ¿Es seguro / confiable?
        if (containsAny(['seguro', 'confiable', 'estafa', 'legal', 'segura', 'confiar', 'roban', 'roba'])) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1500));
            } catch (e) {}
            await msg.reply(
                `🛡️ *¿Es seguro comprar aquí?*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `¡Totalmente seguro! *RECARGASNEY.COM* es una plataforma automatizada y con excelente reputación.\n\n` +
                `✅ *Garantías:*\n` +
                `• No pedimos contraseñas (solo tu ID de jugador)\n` +
                `• Puedes ver opiniones reales de otros clientes en nuestra web\n` +
                `• Soporte en vivo directo de lunes a domingo\n\n` +
                `¡Tu compra está 100% protegida! 🎯`
            );
            return;
        }

        // 2. ¿Cuánto tarda?
        if (containsAny(['tarda', 'demora', 'tiempo', 'cuanto tiempo', 'rapido', 'horas', 'minutos', 'tardan'])) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1200));
            } catch (e) {}
            await msg.reply(
                `⚡ *Tiempo de entrega de las recargas*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `¡Somos ultra rápidos! Nuestras recargas son *100% automáticas*.\n\n` +
                `⏱️ El proceso tarda de *1 a 5 minutos* después de confirmar tu pago en la página web.\n\n` +
                `Si tu pago tarda más en verificarse, puedes consultar el estado enviando el número de referencia aquí mismo.`
            );
            return;
        }

        // 3. Métodos de pago
        if (containsAny(['metodo', 'metodos', 'como pago', 'pago movil', 'binance', 'bs', 'bolivares', 'transferencia', 'efectivo', 'zelle'])) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1200));
            } catch (e) {}
            await msg.reply(
                `💳 *Métodos de Pago Disponibles*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Aceptamos los siguientes métodos de pago directamente en la web:\n\n` +
                `🇻🇪 *Pago Móvil* (Bolívares - tasa del día)\n` +
                `🪙 *Binance Pay* (USDT/Dólares)\n\n` +
                `*Nota:* Los datos para pagar te saldrán al momento de seleccionar tu paquete en la página *recargasney.com*.`
            );
            return;
        }

        // 4. ¿Cómo gano con referidos?
        if (containsAny(['referido', 'referidos', 'invitar', 'ganar dinero', 'ganar usd', 'ganar gratis', 'link de referido'])) {
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping();
                await new Promise(r => setTimeout(r, 1500));
            } catch (e) {}
            await msg.reply(
                `🎁 *Programa de Referidos (Bono Doble)*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `¡Gana dinero recomendando nuestra web!\n\n` +
                `👤 *Tú ganas:* +$0.05 USDT de cashback por cada amigo que haga su primera recarga usando tu link.\n` +
                `🎮 *Tu amigo gana:* -3% de descuento en su primera compra.\n\n` +
                `🔗 Consigue tu link de referido iniciando sesión en *recargasney.com* e ingresando a "Mi Cuenta" o escribe *MENU* para ver tus estadísticas.`
            );
            return;
        }




        // ── CALIFICACIÓN CON ESTRELLAS DESACTIVADA A PETICIÓN DEL USUARIO ──
        console.log(`[WHATSAPP-BOT] ℹ️ Mensaje no reconocido ignorado de ${msg.from}: "${text}"`);
        return;
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
                                // Esperar un retraso aleatorio entre 3 y 7 segundos para evitar bloqueos
                                const delay = Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000;
                                console.log(`[WHATSAPP] Esperando ${delay/1000}s antes de procesar el siguiente mensaje...`);
                                await new Promise(resolve => setTimeout(resolve, delay));
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

        // Usamos directamente el formato estándar @c.us para asegurar la sincronización en la app móvil (especialmente WhatsApp Business)
        console.log(`[WHATSAPP] 📲 Usando JID estándar: ${numberId}`);

        console.log(`[WHATSAPP] Enviando mensaje a ${item.number} (usando ${numberId})...`);
        try {
            const chat = await client.getChatById(numberId);
            await chat.sendStateTyping();
            await new Promise(r => setTimeout(r, 1500)); // Simular escritura durante 1.5s
        } catch (errTyping) {
            console.log(`[WHATSAPP] No se pudo simular escritura para ${numberId}:`, errTyping.message);
        }
        await client.sendMessage(numberId, item.message);
        console.log(`[WHATSAPP] ✅ Mensaje enviado a ${item.number}`);
        
        // Marcar como enviado en el servidor
        markAsSent(item.id);
        
        // Pausa aleatoria para parecer más humano y evitar bloqueos (entre 30 y 45 segundos por defecto, o el delay personalizado)
        const delay = item.delay ? parseInt(item.delay) : (Math.floor(Math.random() * (45000 - 30000 + 1)) + 30000);
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
    
    // Bloqueo estricto del número reportado
    if (phoneDigits.includes('4125322412') || phoneDigits.includes('4243445879') || phoneDigits.includes('4125313735')) return false;

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
    // Buscar la referencia en el cuerpo del mensaje citado (soportando comas y espacios para pagos divididos)
    const match = text.match(/Referencia:\s*\*?`?([A-Za-z0-9_.,\s-]+)/i);
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

async function handleAdminAction(msg, action, ref, reason = null) {
    try {
        const actionLabel = action === 'aprobar' ? 'APROBACIÓN' : 'RECHAZO';
        console.log(`[ADMIN-ACTION] Iniciando ${actionLabel} para ref: ${ref} (Solicitado por admin: ${msg.from})`);
        await msg.reply(`⏳ Procesando ${actionLabel.toLowerCase()} del pedido *${ref}*...`);

        const endpoint = action === 'aprobar' ? '/admin/aprobar' : '/admin/rechazar';
        const payload = action === 'aprobar' ? { ref } : { ref, reason };
        const res = await callAdminAPI(endpoint, payload);

        if (res.statusCode === 200 && res.data && res.data.success) {
            const finalRef = res.data.resolvedRef || ref;
            if (action === 'aprobar') {
                await msg.reply(`✅ *PEDIDO APROBADO CON ÉXITO*\n\n📌 *Referencia:* ${finalRef}\n📝 *Detalle:* ${res.data.message || 'Recarga completada directamente.'}`);
            } else {
                const reasonStr = reason ? `\n⚠️ *Motivo:* ${reason}` : '';
                await msg.reply(`✅ *PEDIDO RECHAZADO Y NOTIFICADO*${reasonStr}\n\n📌 *Referencia:* ${finalRef}`);
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

        httpLib.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', async () => {
                try {
                    if (res.statusCode !== 200) throw new Error(`Código de estado del servidor: ${res.statusCode}`);
                    const config = JSON.parse(body);
                    const tasa = parseFloat(config.tasa_del_dia) || 635.00;
                    const precios = config.precios || {};
                    const canal = (config.whatsapp && config.whatsapp.canal) ? config.whatsapp.canal : 'https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K';

                    const sortedKeys = Object.keys(precios).sort((a, b) => parseInt(a) - parseInt(b));

                    let msgText = `💎 *RECARGASNEY - PRECIOS* 💎\n⚡ _Precios en Bolívares (Bs.):_\n`;

                    sortedKeys.forEach(key => {
                        const item = precios[key];
                        const priceBs = (parseFloat(item.usdt) * tasa).toFixed(2).replace('.', ',');
                        let icon = parseInt(key) >= 5600 ? '👑' : (parseInt(key) >= 1060 ? '🔥' : '🔹');
                        let labelText = (item.label || (key + ' Diamantes')).replace(/diamantes/gi, '💎').replace(/\s+/g, ' ').trim();
                        msgText += `${icon} *${labelText}* → *${priceBs} Bs.*\n`;
                    });
                    
                    msgText += `───\n¡Gracias por confiar en *RECARGASNEY*! 🎯🛡️`;
                    
                    try {
                        const chat = await msg.getChat();
                        await chat.sendStateTyping();
                        await new Promise(resolve => setTimeout(resolve, 2500));
                    } catch (errTyping) {}
                    
                    await client.sendMessage(msg.from, msgText);
                } catch (e) {
                    await msg.reply('❌ No se pudo obtener la lista de precios.');
                }
            });
        }).on('error', () => msg.reply('❌ Error al conectar con el servidor.'));
    } catch (err) {
        await msg.reply('❌ Error al procesar la solicitud.');
    }
}

async function handleSendPricesUSDT(msg) {
    try {
        const url = new URL(`${SERVER_URL}/api/config`);
        const isHttps = SERVER_URL.startsWith('https');
        const httpLib = isHttps ? require('https') : require('http');

        httpLib.get(url, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', async () => {
                try {
                    if (res.statusCode !== 200) throw new Error(`Código de estado del servidor: ${res.statusCode}`);
                    const config = JSON.parse(body);
                    const precios = config.precios || {};
                    const canal = (config.whatsapp && config.whatsapp.canal) ? config.whatsapp.canal : 'https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K';

                    const sortedKeys = Object.keys(precios).sort((a, b) => parseInt(a) - parseInt(b));

                    let msgText = `💎 *RECARGASNEY - PRECIOS USDT* 💎\n💵 _Precios en USDT (Dólares):_\n`;

                    sortedKeys.forEach(key => {
                        const item = precios[key];
                        const priceUsdt = parseFloat(item.usdt);
                        const priceFormatted = priceUsdt % 1 === 0 ? priceUsdt.toFixed(0) : priceUsdt.toFixed(2);
                        let icon = parseInt(key) >= 5600 ? '👑' : (parseInt(key) >= 1060 ? '🔥' : '🔹');
                        let labelText = (item.label || (key + ' Diamantes')).replace(/diamantes/gi, '💎').replace(/\s+/g, ' ').trim();
                        msgText += `${icon} *${labelText}* → *$${priceFormatted} USDT*\n`;
                    });

                    msgText += `───\n¡Gracias por confiar en *RECARGASNEY*! 🎯🛡️`;
                    
                    try {
                        const chat = await msg.getChat();
                        await chat.sendStateTyping();
                        await new Promise(resolve => setTimeout(resolve, 2500));
                    } catch (errTyping) {}
                    
                    await client.sendMessage(msg.from, msgText);
                } catch (e) {
                    await msg.reply('❌ No se pudo obtener la lista de precios.');
                }
            });
        }).on('error', () => msg.reply('❌ Error al conectar con el servidor.'));
    } catch (err) {
        await msg.reply('❌ Error al procesar la solicitud.');
    }
}
