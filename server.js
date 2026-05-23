require('dotenv').config();
// DEPLOYMENT TIMESTAMP: 2026-05-10T12:20:00
const http = require('http');
const https = require('https');
let autoRedeemChile = null;
try {
    const service = require('./redeem-service.js');
    autoRedeemChile = service.autoRedeemChile;
} catch (e) {
    console.error('[CRÍTICO] No se pudo cargar el servicio de canje automático:', e.message);
}
const fs = require('fs');
const path = require('path');
const url = require('url');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3500;

// --- Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: Faltan SUPABASE_URL o SUPABASE_KEY en las variables de entorno.');
    console.error('Si estás en Render, asegúrate de configurarlas en el Dashboard.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// --- Web Push Notifications ---
const webPush = require('web-push');
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:netfreelat@gmail.com';
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    console.log('[PUSH] ✅ Web Push configurado correctamente.');
} else {
    console.warn('[PUSH] ⚠️ ADVERTENCIA: Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY en variables de entorno.');
}

async function sendPushToUser(uid, title, body, icon = '/icon-192.png', urlPath = '/') {
    if (!vapidPublicKey || !vapidPrivateKey) {
        console.warn(`[PUSH] Intentando enviar push a ${uid} pero VAPID no está configurado.`);
        return;
    }
    try {
        const { data: subscriptions, error } = await supabase
            .from('ff_push_subscriptions')
            .select('*')
            .eq('uid', uid);
            
        if (error) {
            console.error('[PUSH] Error al obtener suscripciones de Supabase:', error.message);
            return;
        }
        
        if (!subscriptions || subscriptions.length === 0) {
            console.log(`[PUSH] Sin suscripciones registradas para el usuario: ${uid}`);
            return;
        }
        
        const payload = JSON.stringify({
            title,
            body,
            icon,
            badge: icon,
            data: { url: urlPath }
        });
        
        console.log(`[PUSH] Enviando notificación a ${subscriptions.length} dispositivo(s) del usuario ${uid}...`);
        
        for (const sub of subscriptions) {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth
                }
            };
            
            webPush.sendNotification(pushSubscription, payload)
                .then(() => {
                    console.log(`[PUSH] Notificación enviada con éxito a endpoint: ${sub.endpoint.slice(0, 40)}...`);
                })
                .catch(async (err) => {
                    console.warn(`[PUSH] Error al enviar a endpoint. Código: ${err.statusCode}`);
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        console.log(`[PUSH] Eliminando suscripción inválida (ID: ${sub.id})`);
                        await supabase
                            .from('ff_push_subscriptions')
                            .delete()
                            .eq('id', sub.id);
                    }
                });
        }
    } catch (e) {
        console.error('[PUSH] Error general en sendPushToUser:', e.message);
    }
}

const BDV_TOKEN = process.env.BDV_TOKEN;
const BDV_PASSWORD = process.env.BDV_PASSWORD;
const BDV_API_URL = 'https://apicentral.pro/apis/movimientos_bdv.jsp';

const { bdvLogin, verificarPagoBDV } = require('./bdv-service.js');
let currentBdvToken = null;

async function verifyBDVPayment(montoReportado, referencia4) {
    try {
        if (!currentBdvToken) {
            currentBdvToken = await bdvLogin();
        }
        
        let result = await verificarPagoBDV(montoReportado, referencia4, currentBdvToken);
        
        if (!result.success && result.pending && !result.movimiento) {
            const newToken = await bdvLogin();
            if (newToken && newToken !== currentBdvToken) {
                currentBdvToken = newToken;
                result = await verificarPagoBDV(montoReportado, referencia4, currentBdvToken);
            }
        }
        
        return result;
    } catch (e) {
        console.error('[BDV] Error en verifyBDVPayment:', e.message);
        return { success: false, pending: true };
    }
}

const { checkBinanceEmails, markEmailAsRead } = require('./binance-service.js');

// --- Helper de Hora Venezuela (UTC-4) ---
function getVEISO() {
    // Almacenar el timestamp real estándar (UTC). El frontend (navegador) 
    // se encarga de convertir esto a la hora local de Venezuela automáticamente.
    return new Date().toISOString();
}

function getVEString() {
    return new Date().toLocaleString("es-VE", { 
        timeZone: "America/Caracas",
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// --- Helper para obtener el último WhatsApp registrado de un UID ---
async function getLastUserWa(uid) {
    try {
        const { data, error } = await supabase
            .from('ff_orders')
            .select('wa')
            .eq('uid', uid)
            .not('wa', 'eq', 'No provisto')
            .order('time', { ascending: false })
            .limit(1);
        if (data && data.length > 0 && data[0].wa) {
            return data[0].wa;
        }
    } catch (e) {
        console.error('[WA-PUNTOS] Error obteniendo WhatsApp del usuario:', e.message);
    }
    return null;
}

// --- Estado en memoria (cache) ---
let recentReloads = [];
let orders = {};
let pines = { "100": [], "310": [], "520": [], "1060": [], "2180": [], "5600": [] };
let whatsappQueue = [];
let waBotStatus = 'Desconectado';
let waBotQR = '';
let pagosValidados = {};
let users = {};
let settings = {
    tasa_del_dia: 635.00,
    barra_informativa: "🔥 ¡Bienvenidos a Diamond Center! 💎",
    precios: {
        "100":  { "usdt": 1.00,  "label": "100 + 10 Diamantes" },
        "310":  { "usdt": 3.10,  "label": "310 + 31 Diamantes" },
        "520":  { "usdt": 5.20,  "label": "520 + 52 Diamantes" },
        "1060": { "usdt": 10.60, "label": "1060 + 106 Diamantes" },
        "2180": { "usdt": 21.80, "label": "2180 + 218 Diamantes" },
        "5600": { "usdt": 56.00, "label": "5600 + 560 Diamantes" }
    },
    admin: { 
        username: process.env.ADMIN_USER || "admin", 
        password: process.env.ADMIN_PASS || "123",
        session_token: null
    },
    metodos_pago: { pagomovil: { banco: "", telefono: "", cedula: "" }, binance: { id: "", nombre: "" } },
    whatsapp: { soporte: "", canal: "" }
};

// --- Carga inicial desde Supabase ---
async function reloadPines() {
    try {
        const { data: pinesData, error } = await supabase.from('ff_pines').select('*').eq('used', false);
        if (error) throw error;
        
        // Reiniciar objeto en memoria
        Object.keys(pines).forEach(k => pines[k] = []);
        
        if (pinesData) {
            pinesData.forEach(p => {
                if (pines[p.amount]) pines[p.amount].push(p.code);
            });
        }
        console.log('[SUPABASE] 📥 Inventario de pines sincronizado.');
    } catch (e) {
        console.error('[SUPABASE] ❌ Error recargando pines:', e.message);
    }
}

async function loadFromSupabase() {
    try {
        // Cargar Pines
        await reloadPines();
        
        // Usuarios
        const { data: usersData } = await supabase.from('ff_users').select('*');
        if (usersData) {
            usersData.forEach(u => { users[u.uid] = { name: u.name, points: u.points, password: u.password, registered: u.registered, referred_by: u.referred_by, referral_claimed: u.referral_claimed, cedula: u.cedula, phone: u.phone }; });
        }

        // Pedidos Pendientes
        const { data: ordersData } = await supabase.from('ff_orders').select('*').eq('status', 'pending');
        if (ordersData) {
            ordersData.forEach(o => { orders[o.ref] = { ...o, time: o.time }; });
        }
        
        // Configuración (sin admin_session_token para compatibilidad con DBs sin la columna)
        const { data: settingsData, error: settingsError } = await supabase
            .from('ff_settings')
            .select('id, tasa_del_dia, barra_informativa, admin_username, admin_password, metodos_pago, whatsapp_config, precios')
            .eq('id', 1)
            .single();
        if (settingsError) {
            console.error('[SUPABASE] ❌ Error cargando settings:', settingsError.message);
        } else if (settingsData) {
            settings.tasa_del_dia = parseFloat(settingsData.tasa_del_dia);
            settings.barra_informativa = settingsData.barra_informativa;
            settings.admin.username = settingsData.admin_username || settings.admin.username;
            settings.admin.password = settingsData.admin_password || settings.admin.password;
            settings.metodos_pago = settingsData.metodos_pago;
            settings.whatsapp = settingsData.whatsapp_config;
            settings.precios = settingsData.precios;
            console.log(`[SUPABASE] 🔑 Credenciales admin cargadas: usuario='${settings.admin.username}'`);
        }
        
        // Intentar cargar el token de sesión por separado (requiere columna admin_session_token)
        try {
            const { data: tokenData, error: tokenError } = await supabase
                .from('ff_settings')
                .select('admin_session_token')
                .eq('id', 1)
                .single();
            if (!tokenError && tokenData) {
                settings.admin.session_token = tokenData.admin_session_token || null;
                console.log(`[SUPABASE] 🔒 Token de sesión: ${settings.admin.session_token ? 'activo' : 'ninguno'}`);
            }
        } catch (tokenErr) {
            console.warn('[SUPABASE] ⚠️  Columna admin_session_token no existe. Ejecuta la migración SQL. El login funcionará pero sin persistencia de token.');
        }


        // Recientes
        const { data: recData } = await supabase.from('ff_recientes').select('*').order('created_at', { ascending: false }).limit(10);
        if (recData) recentReloads = recData.map(r => ({ name: r.name, pack: r.pack, type: r.type, time: r.time }));

        // Cola WA
        const { data: waData } = await supabase.from('ff_wa_queue').select('*').eq('sent', false);
        if (waData) whatsappQueue = waData.map(w => ({ id: w.id, number: w.number, message: w.message }));

        // Pagos validados
        const { data: pagosData } = await supabase.from('ff_pagos_recibidos').select('*');
        if (pagosData) pagosData.forEach(p => { pagosValidados[p.ref] = { amount: p.amount, date: p.date, used: p.used }; });

        console.log('[SUPABASE] ✅ Datos cargados:', Object.keys(users).length, 'usuarios,', Object.keys(orders).length, 'pedidos pendientes.');
    } catch (e) {
        console.error('[SUPABASE] ❌ Error cargando datos:', e.message);
    }
}

function savePagos() {
    supabase.from('ff_pagos_recibidos').upsert(
        Object.entries(pagosValidados).map(([ref, p]) => ({ ref, amount: p.amount, date: p.date, used: p.used }))
    ).then(({ error }) => { if (error) console.error('[SUPABASE] Error guardando pagos:', error.message); });
}

function saveWaQueue() {
    // La cola WA se maneja individualmente al agregar/marcar como enviado
}

function queueWhatsAppMessage(order, isAccepted, pin = null) {
    if (!order.wa || order.wa === 'No provisto') return;

    // ⚠️ ANTI-DUPLICADO: IDs basados en ref del pedido (únicos por orden)
    const orderRef = order.ref || Date.now().toString();
    const ticketId = `wa_${orderRef}_ticket`;
    const pinId    = `wa_${orderRef}_pin`;
    const singleId = `wa_${orderRef}_msg`;

    // Verificar si ya hay mensajes de este pedido en la cola
    const yaEncolado = whatsappQueue.some(item => item.id && item.id.startsWith(`wa_${orderRef}_`));
    if (yaEncolado) {
        console.log(`[WA-QUEUE] ⚠️ Duplicado ignorado para ref ${orderRef}`);
        return;
    }
    
    let msg = '';
    if (isAccepted) {
        msg = `🔥 *¡BOOYAH! COMPRA EXITOSA* 🔥\n\n` +
              `¡Hola, *${order.name}*! Tu pedido de diamantes ha sido procesado con éxito. 🚀\n\n` +
              `━━━━━━━━━━━━━━━\n` +
              `👤 *Jugador:* ${order.name}\n` +
              `🆔 *ID Garena:* ${order.uid}\n` +
              `💎 *Paquete:* ${order.pack}\n` +
              `━━━━━━━━━━━━━━━\n\n` +
              `✅ *Estado:* ¡Diamantes Enviados! ✨`;

        const userObj = users[order.login_uid || order.uid];
        if (userObj) {
            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
            if (!isNaN(usdtPrice) && usdtPrice > 0) {
                const pointsEarned = Math.floor(usdtPrice * 10);
                msg += `\n\n🎁 *Puntos ganados por esta compra:* +${pointsEarned} pts\n⭐ *Tu total acumulado:* ${userObj.points} pts`;
            }
        }

        if (pin) {
            msg += `\n\n⚡ *CANJE SU PIN AQUÍ:* \n` +
                   `Presiona el link para ir directo a cangear tu pin:\n` +
                   `🔗 https://redeempins.com/\n\n` +
                   `*Tu PIN está abajo, cópialo y ve a canjearlo* 👇👇`;
            
            // Mensaje 1: Ticket con instrucciones (ID único por ref)
            const waTicket = { id: ticketId, number: order.wa, message: msg };
            whatsappQueue.push(waTicket);
            supabase.from('ff_wa_queue').insert(waTicket)
                .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error ticket:', error.message); });

            // Mensaje 2: El PIN solo (ID único por ref) - 100% copiable
            const waPin = { id: pinId, number: order.wa, message: pin };
            whatsappQueue.push(waPin);
            supabase.from('ff_wa_queue').insert(waPin)
                .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error pin:', error.message); });

            console.log(`[WA-QUEUE] ✅ 2 mensajes encolados para ${order.wa} (ref: ${orderRef})`);
            return;
        }
        msg += `\n\n¡Gracias por confiar en *Diamond Center*! 🎯🛡️`;
    } else {
        msg = `⚠️ *AVISO DE TU RECARGA* ⚠️\n\n` +
              `Hola *${order.name}*, no pudimos procesar tu recarga de *${order.pack}*.\n\n` +
              `❌ *Motivo:* Error en la verificación del pago.\n\n` +
              `Envía captura de tu pago a soporte. 🛠️\n🆔 *ID:* ${order.uid}\n\n¡Estamos aquí para ayudarte! 🤝`;
    }

    const waItem = { id: singleId, number: order.wa, message: msg };
    whatsappQueue.push(waItem);
    supabase.from('ff_wa_queue').insert(waItem)
        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error msg:', error.message); });
    console.log(`[WA-QUEUE] ✅ 1 mensaje encolado para ${order.wa} (ref: ${orderRef})`);
}

function saveUsers() {
    // No-op: se usa saveUser(uid) para guardar usuario individual
}

async function saveUser(uid) {
    const u = users[uid];
    if (!u) return;
    const { error } = await supabase.from('ff_users').upsert({
        uid, name: u.name, points: u.points, password: u.password || null,
        cedula: u.cedula || null, phone: u.phone || null,
        registered: u.registered, referred_by: u.referred_by || null,
        referral_claimed: u.referral_claimed || false
    });
    if (error) console.error('[SUPABASE] Error guardando usuario:', error.message);
}

function isUserFullyRegistered(uid) {
    const user = users[uid];
    if (!user) return false;
    return !!(user.cedula && user.phone && user.password);
}

function addPoints(uid, amountUsdt, name = null) {
    if (!isUserFullyRegistered(uid)) {
        console.log(`[PUNTOS] El usuario ID: ${uid} no acumula puntos por no estar completamente registrado en Cuenta (cédula, teléfono, contraseña).`);
        return 0;
    }
    const pointsToAdd = Math.floor(amountUsdt * 10);
    users[uid].points += pointsToAdd;
    if (name) users[uid].name = name;

    // Lógica de Referidos: 10 pts al referrer en la PRIMERA recarga
    if (users[uid].referred_by && !users[uid].referral_claimed) {
        const referrerUid = users[uid].referred_by;
        if (users[referrerUid] && isUserFullyRegistered(referrerUid)) {
            users[referrerUid].points = (users[referrerUid].points || 0) + 10;
            users[uid].referral_claimed = true;
            saveUser(referrerUid);
            console.log(`[REFERRAL_REWARD] ${referrerUid} gana 10 pts por la 1ra recarga de ${uid}`);

            // Encolar mensaje de WhatsApp para el referidor
            getLastUserWa(referrerUid).then(referrerWa => {
                if (referrerWa) {
                    const refMsgId = `wa_ref_${uid}_reward`;
                    const refMsg = `🎉 *¡FELICIDADES! HAS GANADO PUNTOS* 🎉\n\n` +
                                   `¡Hola! Tu referido con ID *${uid}* ha realizado su primera compra. 🚀\n\n` +
                                   `🎁 *Puntos ganados:* +10 pts\n` +
                                   `⭐ *Tu total acumulado:* ${users[referrerUid].points} pts\n\n` +
                                   `¡Sigue compartiendo tu enlace para ganar más premios! 💎✨`;
                    
                    const waItem = { id: refMsgId, number: referrerWa, message: refMsg };
                    whatsappQueue.push(waItem);
                    supabase.from('ff_wa_queue').insert(waItem)
                        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error ref reward:', error.message); });
                    console.log(`[REFERRAL_NOTIFICATION] Encolada notificación de referidos para ${referrerWa}`);
                }
            });

            // Push al referidor
            sendPushToUser(referrerUid, '¡Referido Exitoso! 🎉💎', `Tu referido ${uid} hizo su primera compra. ¡Ganaste +10 puntos!`, '/icon-192.png', '/');
        }
    }

    saveUser(uid);
    console.log(`[PUNTOS] Se añadieron ${pointsToAdd} puntos a ID: ${uid}. Total: ${users[uid].points}`);
    
    // Push por puntos acumulados en la recarga
    if (pointsToAdd > 0) {
        sendPushToUser(uid, '¡Ganaste Puntos! 🎁⭐', `Sumaste +${pointsToAdd} puntos por tu compra. Total: ${users[uid].points} pts.`, '/icon-192.png', '/');
    }
    
    return pointsToAdd;
}

function saveRecent(name, pack, type = 'recarga') {
    const entry = { name, pack, type, time: getVEString().split(' ')[1] + ' ' + getVEString().split(' ')[2] };
    recentReloads.unshift(entry);
    if (recentReloads.length > 10) recentReloads.pop();
    supabase.from('ff_recientes').insert(entry)
        .then(({ error }) => { if (error) console.error('[SUPABASE] Error guardando reciente:', error.message); });
}

function updateOrderStatus(ref, status, pin = null) {
    if (orders[ref]) {
        orders[ref].status = status;
        if (pin) orders[ref].pin = pin;
        const update = { status };
        if (pin) update.pin = pin;
        supabase.from('ff_orders').update(update).eq('ref', ref)
            .then(({ error }) => { if (error) console.error('[SUPABASE] Error actualizando pedido:', error.message); });
    }
}

async function rechargeViaNetfreelat(order, ref) {
    const packMap = {
        "100": "1",
        "310": "2",
        "520": "3",
        "1060": "4",
        "2180": "5",
        "5600": "6"
    };

    const amountKey = order.pack.split(' ')[0].replace(',', '').replace('.', '');
    const montoId = packMap[amountKey];

    if (!montoId) return { success: false, message: 'Paquete no mapeado: ' + amountKey };

    if (process.env.TEST_MODE === 'true') {
        console.log(`[TEST_MODE] Simulando recarga exitosa para ID: ${order.uid}`);
        return { success: true, message: 'Simulación de recarga exitosa (Modo Prueba)' };
    }

    const user = encodeURIComponent(process.env.NETFREELAT_USER || '');
    const pass = encodeURIComponent(process.env.NETFREELAT_PASS || '');
    const apiUrl = `https://www.netfreelat.net/conexcion_api/api.php?action=recarga&usuario=${user}&clave=${pass}&tipo=recargaFreefire&numero=${order.uid}&monto=${montoId}&modo=1&id_aprobacion=${ref}`;

    console.log(`[NETFREELAT] Intentando recarga para ID: ${order.uid} | Paquete: ${amountKey}`);

    return new Promise((resolve) => {
        console.log(`[NETFREELAT] Enviando petición a: ${apiUrl.substring(0, 100)}...`);
        
        const req = https.get(apiUrl, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`[NETFREELAT] Respuesta recibida: ${body}`);
                const lowerBody = body.toLowerCase();
                if (lowerBody.includes('success') || lowerBody.includes('exito') || lowerBody.includes('ok') || lowerBody.includes('green')) {
                    resolve({ success: true, message: body });
                } else {
                    resolve({ success: false, message: body });
                }
            });
        });

        req.on('error', (e) => {
            console.error('[NETFREELAT] Error de conexión:', e.message);
            resolve({ success: false, message: 'Error de conexión: ' + e.message });
        });

        // Timeout de 15 segundos para no dejar colgado el servidor
        req.setTimeout(15000, () => {
            req.destroy();
            console.error('[NETFREELAT] La API tardó demasiado en responder (Timeout)');
            resolve({ success: false, message: 'Tiempo de espera agotado' });
        });
    });
}

function extractPackInfo(packStr) {
    if (!packStr) return { qty: 1, amountKey: "" };
    const qtyMatch = packStr.match(/\(x(\d+)\)/);
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
    
    // El amountKey es el primer número en el pack string, e.g. "100" de "100 + 10 (x3)" o "100" de "100"
    const amountKey = packStr.toString().split(' ')[0].replace(',', '').replace('.', '').trim();
    
    return { qty, amountKey };
}

async function getFallbackPin(amount) {
    const { qty, amountKey } = extractPackInfo(amount);
    
    if (pines[amountKey] && pines[amountKey].length >= qty) {
        const selectedPins = [];
        for (let i = 0; i < qty; i++) {
            const pin = pines[amountKey].shift();
            selectedPins.push(pin);
        }
        
        // Marcar como usados en Supabase
        const { error } = await supabase.from('ff_pines').update({ used: true }).in('code', selectedPins);
        if (error) console.error('[SUPABASE] Error marcando PINes como usados:', error.message);
        
        return selectedPins.join(' / ');
    }
    return null;
}

function updateTelegramStatus(ref) {
    const order = orders[ref];
    if (!order || !order.tg_message_id || !order.tg_chat_id) return;

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) return;

    let newText = '';
    if (order.status === 'approved') {
        if (order.pin) {
            newText = `🎟️ *RECARGA VÍA PIN (ADMIN)*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n🔑 *PIN:* \`${order.pin}\`\n\n✅ _Aprobado desde el panel administrativo._`;
        } else {
            newText = `✅ *RECARGA EXITOSA (ADMIN)*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n💎 *Paquete:* ${order.pack}\n\n✨ _Aprobado desde el panel administrativo._`;
        }
    } else if (order.status === 'rejected') {
        newText = `❌ *PEDIDO RECHAZADO (ADMIN)*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n\n⚠️ _Rechazado desde el panel administrativo._`;
    } else {
        return; 
    }

    const editPayload = JSON.stringify({
        chat_id: order.tg_chat_id,
        message_id: order.tg_message_id,
        text: newText,
        parse_mode: 'Markdown'
    });

    const editReq = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/editMessageText`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(editPayload)
        }
    });
    editReq.on('error', (e) => console.error('[TG-EDIT] Error:', e.message));
    editReq.write(editPayload);
    editReq.end();
}

async function processPendingOrder(inputFullRef, inputShortRef) {
    let targetFullRef = inputFullRef;
    let targetShortRef = inputShortRef;

    // Caso A: Viene del Banco (tenemos FullRef, buscamos ShortRef en pedidos)
    if (targetFullRef && !targetShortRef) {
        for (let sRef in orders) {
            if (orders[sRef].status === 'pending' && targetFullRef.endsWith(sRef)) {
                targetShortRef = sRef;
                break;
            }
        }
    }

    // Caso B: Viene del Usuario (tenemos ShortRef, buscamos FullRef en pagos recibidos)
    if (targetShortRef && !targetFullRef) {
        for (let fRef in pagosValidados) {
            if (!pagosValidados[fRef].used && fRef.endsWith(targetShortRef)) {
                targetFullRef = fRef;
                break;
            }
        }
    }

    // Si encontramos ambos, procedemos a validar el monto y aprobar
    if (targetFullRef && targetShortRef && orders[targetShortRef] && orders[targetShortRef].status === 'pending') {
        const order = orders[targetShortRef];
        const pago = pagosValidados[targetFullRef];
        
        if (pago && !pago.used) {
            let isValid = false;

            if (order.method === 'binance') {
                let expectedUsdt = 0;
                try {
                    expectedUsdt = parseFloat(order.price.split('USDT')[0].trim());
                } catch (e) {}

                console.log(`[AUTO-APPROVE-BINANCE] Validando monto -> Recibido: ${pago.amount} USDT | Esperado: ${expectedUsdt} USDT`);
                if (expectedUsdt > 0 && pago.amount >= expectedUsdt) {
                    isValid = true;
                } else {
                    console.log(`[AUTO-APPROVE-BINANCE] ❌ MONTO INSUFICIENTE. Recibido: ${pago.amount} USDT, Esperado: ${expectedUsdt} USDT.`);
                }
            } else {
                // Extraer precio esperado en Bs: "1.00USDT/635.00Bs" -> 635.00
                let expectedBs = 0;
                try {
                    const parts = order.price.split('/');
                    if (parts[1]) {
                        expectedBs = parseFloat(parts[1].replace('Bs', '').trim());
                    }
                } catch (e) {
                    console.error('[AUTO-APPROVE] Error extrayendo precio esperado:', e.message);
                }

                console.log(`[AUTO-APPROVE-BDV] Validando monto -> Recibido: ${pago.amount} Bs | Esperado: ${expectedBs} Bs`);

                // Validación de seguridad: El pago debe ser igual o mayor al esperado (con margen de 0.50 Bs)
                if (pago.amount >= (expectedBs - 0.50)) {
                    isValid = true;
                } else {
                    console.log(`[AUTO-APPROVE-BDV] ❌ MONTO INSUFICIENTE. El pago de ${pago.amount} Bs es menor a lo esperado (${expectedBs} Bs).`);
                }
            }

            if (isValid) {
                console.log(`[AUTO-APPROVE] ✅ MONTO CORRECTO. Procediendo...`);
                console.log(`[AUTO-APPROVE] Ref Banco/Correo: ${targetFullRef} <--> Ref Formulario: ${targetShortRef}`);
                
                pagosValidados[targetFullRef].used = true;
                savePagos();
                
                const { qty } = extractPackInfo(order.pack);
                
                if (qty > 1) {
                    // Si la cantidad es mayor a 1, no usamos la API automatizada (para evitar bloqueos por duplicados)
                    // y vamos directo a entregar pines
                    console.log(`[AUTO-APPROVE] Compra múltiple detectada (${qty}x). Usando fallback de PINs.`);
                    const pin = await getFallbackPin(order.pack);
                    if (pin) {
                        orders[targetShortRef].status = 'approved';
                        orders[targetShortRef].pin = pin;
                        updateOrderStatus(targetShortRef, 'approved', pin);
                        saveRecent(order.name, order.pack);
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) {
                            addPoints(order.uid, usdtPrice, order.name);
                        }
                        queueWhatsAppMessage(order, true, pin);
                        updateTelegramStatus(targetShortRef);
                        console.log(`[AUTO-APPROVE] Recarga múltiple exitosa (PINs) para ${order.uid}`);
                    } else {
                        console.error(`[AUTO-APPROVE] Error: No hay stock de pines para recarga múltiple de ${order.pack}`);
                    }
                } else {
                    rechargeViaNetfreelat(order, targetShortRef).then(async result => {
                        if (result.success) {
                            orders[targetShortRef].status = 'approved';
                            
                            saveRecent(order.name, order.pack);
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) {
                                addPoints(order.uid, usdtPrice, order.name);
                            }
                            queueWhatsAppMessage(order, true);
                            updateTelegramStatus(targetShortRef);
                            console.log(`[AUTO-APPROVE] Recarga exitosa para ${order.uid}`);
                        } else {
                            const pin = await getFallbackPin(order.pack);
                            if (pin) {
                                orders[targetShortRef].status = 'approved';
                                orders[targetShortRef].pin = pin;
                                
                                saveRecent(order.name, order.pack);
                                const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                                if (!isNaN(usdtPrice)) {
                                    addPoints(order.uid, usdtPrice, order.name);
                                }
                                queueWhatsAppMessage(order, true, pin);
                                updateTelegramStatus(targetShortRef);
                                console.log(`[AUTO-APPROVE] Recarga exitosa (PIN) para ${order.uid}`);
                            } else {
                                console.error(`[AUTO-APPROVE] Error en recarga automática.`);
                            }
                        }
                    });
                }
                return true;
            } else {
                // No marcamos como usado para que el admin pueda decidir qué hacer
                return false;
            }
        }
    }
    return false;
}

// --- AUTO-APROBACIÓN Y LIMPIADOR AUTOMÁTICO DE PEDIDOS (Cada 1 minuto) ---
setInterval(async () => {
    const NOW = new Date();
    let changed = false;

    // 1. Obtener pagos recientes de Binance (si hay pedidos pendientes)
    let pendingBinanceOrders = Object.values(orders).filter(o => o.status === 'pending' && o.method === 'binance');
    let binanceEmails = [];
    if (pendingBinanceOrders.length > 0) {
        binanceEmails = await checkBinanceEmails();
    }

    for (let ref in orders) {
        if (orders[ref].status === 'pending') {
            const orderTime = new Date(orders[ref].time);
            const diffMinutes = (NOW - orderTime) / (1000 * 60);

            if (diffMinutes > 10) {
                console.log(`[AUTO-CLEAN] Rechazando pedido ${ref} por inactividad (10+ min).`);
                orders[ref].status = 'rejected';
                changed = true;
                continue;
            }

            // --- AUTO APROBACIÓN BDV (DESACTIVADA TEMPORALMENTE) ---
            /*
            if (orders[ref].method === 'pagomovil') {
                let expectedBs = 0;
                try {
                    const parts = orders[ref].price.split('/');
                    if (parts[1]) expectedBs = parseFloat(parts[1].replace('Bs', '').trim());
                } catch (e) {}

                if (expectedBs > 0) {
                    const check = await verifyBDVPayment(expectedBs, ref);
                    if (check.success && check.movimiento) {
                        const fullRef = check.movimiento.referencia;
                        
                        // Agregar a pagosValidados si no existe
                        if (!pagosValidados[fullRef]) {
                            pagosValidados[fullRef] = {
                                amount: parseFloat(check.movimiento.importe.replace(/\./g, '').replace(',', '.')),
                                date: check.movimiento.fecha,
                                used: false
                            };
                            savePagos();
                        }
                        
                        if (!pagosValidados[fullRef].used) {
                            console.log(`[AUTO-BDV] ¡Pago encontrado! Procediendo a aprobar ${ref}`);
                            processPendingOrder(fullRef, ref);
                        }
                    }
                }
            }
            */

            // --- AUTO APROBACIÓN BINANCE ---
            if (orders[ref].method === 'binance' && binanceEmails.length > 0) {
                let expectedUsdt = 0;
                try {
                    expectedUsdt = parseFloat(orders[ref].price.split('USDT')[0].trim());
                } catch (e) {}

                if (expectedUsdt > 0) {
                    // Buscar un correo que coincida con el monto exacto o mayor
                    const matchingEmail = binanceEmails.find(email => email.amount >= expectedUsdt);
                    if (matchingEmail) {
                        const emailUidStr = matchingEmail.uid.toString();
                        console.log(`[AUTO-BINANCE] ¡Pago de ${matchingEmail.amount} USDT encontrado en el correo! Aprobando pedido ${ref}`);
                        
                        // Guardar en pagosValidados
                        if (!pagosValidados[emailUidStr]) {
                            pagosValidados[emailUidStr] = {
                                amount: matchingEmail.amount,
                                date: new Date().toISOString(),
                                used: false
                            };
                            savePagos();
                        }

                        if (!pagosValidados[emailUidStr].used) {
                            // Aprobar pedido
                            processPendingOrder(emailUidStr, ref);
                        }
                        
                        // Marcar el correo como leído para no re-usarlo
                        await markEmailAsRead(matchingEmail.uid);
                        
                        // Removerlo de la lista temporal para no aplicarlo a dos pedidos en el mismo ciclo
                        binanceEmails = binanceEmails.filter(e => e.uid !== matchingEmail.uid);
                    }
                }
            }
        }
    }

    if (changed) {
        // En un sistema real, deberías actualizar Supabase para cada pedido cambiado
        // Pero para no saturar, al menos no rompemos el servidor con una variable inexistente
        console.log('[AUTO-CLEAN] Cambios detectados en pedidos pendientes.');
    }
}, 60000); // Se ejecuta cada 60 segundos
// --- SISTEMA DE AUTENTICACIÓN ADMIN ---
function checkAdminAuth(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let token = parsedUrl.searchParams.get('token');
    
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    
    // Validar token contra el guardado en memoria
    if (!token || !settings.admin.session_token || token !== settings.admin.session_token) {
        console.warn(`[AUTH] 🛑 Acceso denegado: ${req.method} ${parsedUrl.pathname}`);
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: 'Unauthorized', code: 401 }));
        return false;
    }
    return true;
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const searchParams = parsedUrl.searchParams;
    
    // LOG GLOBAL DE TRÁFICO (Filtrado para no saturar con WhatsApp)
    if (parsedUrl.pathname !== '/api/whatsapp_queue' && parsedUrl.pathname !== '/api/wa_status') {
        console.log(`[TRAFICO] ${req.method} ${parsedUrl.pathname}`);
    }

    // Permisos CORS para que el panel admin y la web funcionen
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Permitir Authorization header
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Responder rápido a peticiones OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- PROTECCIÓN DE RUTAS DE ADMINISTRACIÓN ---
    if (parsedUrl.pathname.startsWith('/admin/')) {
        if (!checkAdminAuth(req, res)) {
            return;
        }
    }

    // parsedUrl ya está definida al inicio del handler
    if (parsedUrl.pathname === '/verificar') {
        const uid = parsedUrl.searchParams.get('uid');

        if (!uid) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Falta el parámetro uid' }));
        }

        console.log(`[VERIFICAR] Consultando ID: ${uid}`);

        const hosts = ['netfreelat.net'];
        let currentHostIndex = 0;

        const attemptRequest = (hostname) => {
            const apiPath = `/redeem/conexion_api/api.php`;
            const postData = `action=ValidarParametros&id=${encodeURIComponent(uid)}`;
            
            const options = {
                hostname: hostname,
                path: apiPath,
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': `https://${hostname}/redeem/`,
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 10000
            };

            const apiReq = https.request(options, (apiRes) => {
                let body = '';
                apiRes.setEncoding('utf8');
                apiRes.on('data', chunk => body += chunk);
                apiRes.on('end', () => {
                    try {
                        console.log(`[LOG] Respuesta de ${hostname}: ${body.substring(0, 100)}...`);
                        
                        // Intentar encontrar JSON en cualquier parte de la respuesta
                        let data = null;
                        const jsonMatch = body.match(/\{.*\}/s);
                        if (jsonMatch) {
                            try {
                                data = JSON.parse(jsonMatch[0]);
                            } catch (e) {
                                console.error('Error parseando JSON match:', e.message);
                            }
                        }

                        if (data && (data.alerta === 'green' || data.Nickname || data.perfil)) {
                            const nombre = data.Nickname || data.perfil || data.mensaje;
                            console.log(`[OK] ID ${uid} verificado como: ${nombre}`);
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: true, nombre: nombre }));
                        } else if (currentHostIndex < hosts.length - 1) {
                            console.log(`[!] Falló con ${hostname}, probando con el siguiente...`);
                            currentHostIndex++;
                            attemptRequest(hosts[currentHostIndex]);
                        } else {
                            const mensaje = (data && data.mensaje) ? data.mensaje : 'ID no encontrado en Garena';
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: false, mensaje }));
                        }
                    } catch (e) {
                        handleError(e, hostname);
                    }
                });
            });

            apiReq.on('error', (e) => handleError(e, hostname));
            apiReq.on('timeout', () => {
                apiReq.destroy();
                handleError(new Error('Timeout'), hostname);
            });
            apiReq.write(postData);
            apiReq.end();
        };

        const handleError = (e, hostname) => {
            console.error(`[ERROR] en ${hostname}:`, e.message);
            if (currentHostIndex < hosts.length - 1) {
                currentHostIndex++;
                attemptRequest(hosts[currentHostIndex]);
            } else {
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, error: 'Error de conexión con servidores de Garena' }));
            }
        };

        attemptRequest(hosts[currentHostIndex]);

    } else if (parsedUrl.pathname === '/notificar') {
        console.log('[DEBUG] Entrando en /notificar...');
        const uid = parsedUrl.searchParams.get('uid');
        const login_uid = parsedUrl.searchParams.get('login_uid') || uid;
        const name = parsedUrl.searchParams.get('name');
        const pack = parsedUrl.searchParams.get('pack');
        const method = parsedUrl.searchParams.get('method');
        const ref = parsedUrl.searchParams.get('ref');
        const price = parsedUrl.searchParams.get('price') || 'N/A';
        const wa = parsedUrl.searchParams.get('wa') || 'No provisto';

        console.log(`[DEBUG] Datos: name=${name}, ref=${ref}, wa=${wa}`);

        console.log(`\n[NOTIFICACIÓN] Recibida solicitud de pago de: ${name} (ID: ${uid})`);
        console.log(`[NOTIFICACIÓN] Referencia: ${ref} | Paquete: ${pack} | WA: ${wa}\n`);

        // --- SEGURIDAD DOBLE: EVITAR DUPLICADOS (memoria + Supabase) ---
        if (orders[ref]) {
            console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado en memoria: Ref ${ref} (status: ${orders[ref].status})`);
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
            }));
        }
        // Verificación secundaria en Supabase (cubre reinicios de Render)
        const { data: existingOrder } = await supabase.from('ff_orders').select('*').eq('ref', ref).single();
        if (existingOrder) {
            console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado en Supabase: Ref ${ref} (status: ${existingOrder.status})`);
            // NO guardamos en orders para que NO aparezca en el panel de administración
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
            }));
        }

        // Generar número de control único
        const control_num = `${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100).toString().padStart(2, '0')}`;

        // Guardar pedido como pendiente
        const currentTime = getVEISO();
        orders[ref] = { uid, login_uid, name, pack, method, price, status: 'pending', time: currentTime, wa: wa, control_num };
        const { error: insertError } = await supabase.from('ff_orders').insert({
            ref, uid, login_uid, name, pack, method, price, status: 'pending', time: currentTime, wa, control_num
        });
        if (insertError) {
            // Si Supabase rechaza por restricción de unicidad, también bloqueamos
            if (insertError.code === '23505') {
                console.log(`[NOTIFICACIÓN] 🛑 Duplicado rechazado por Supabase (unique constraint): Ref ${ref}`);
                delete orders[ref]; // Revertir en memoria
                res.writeHead(200);
                return res.end(JSON.stringify({ success: false, message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' }));
            }
            console.error('[SUPABASE] Error guardando pedido:', insertError.message);
        }

        /* 
        // Auto-aprobación desactivada por seguridad a petición del usuario
        const autoApproved = processPendingOrder(null, ref);
        if (autoApproved) {
            console.log(`[NOTIFICACIÓN] Pedido ${ref} fue AUTO-APROBADO por correo.`);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, info: 'Pedido auto-aprobado instantáneamente', control_num }));
        }
        */

        // --- CONFIGURACIÓN DE TELEGRAM ---
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
        const CHAT_ID = process.env.TELEGRAM_CHAT_ID;     
        // ---------------------------------

        const message = `
🔥 *NUEVO PEDIDO DE DIAMANTES* 🔥
-------------------------------
👤 *Jugador:* ${name}
🆔 *ID:* ${uid}
💎 *Paquete:* ${pack}
💰 *Total:* ${price}
💳 *Método:* ${method === 'pagomovil' ? 'Pago Móvil' : 'Binance Pay'}
📝 *Referencia:* \`${ref}\`
🔢 *N° Control:* \`${control_num}\`
📱 *WhatsApp:* \`+${wa}\`
-------------------------------
⏰ _Verifica el pago y presiona un botón:_
        `;

        const payload = JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ ACEPTAR", callback_data: `accept|${ref}` },
                        { text: "❌ RECHAZAR", callback_data: `reject|${ref}` }
                    ]
                ]
            }
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const tgReq = https.request(options, (apiRes) => {
            let body = '';
            apiRes.on('data', chunk => body += chunk);
            apiRes.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.ok && result.result) {
                        orders[ref].tg_message_id = result.result.message_id;
                        orders[ref].tg_chat_id = result.result.chat.id;
                        
                    }
                } catch (e) {
                    console.error('[TG-NOTIF] Error guardando ID de mensaje:', e.message);
                }
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, info: 'Notificación enviada', control_num }));
            });
        });
        
        tgReq.on('error', (e) => {
            console.error('Error enviando a Telegram:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Error al enviar notificación' }));
        });

        tgReq.write(payload);
        tgReq.end();

    } else if (parsedUrl.pathname === '/webhook' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            // Responder 200 OK inmediatamente
            res.writeHead(200);
            res.end('OK');

            try {
                const update = JSON.parse(body);
                const updateId = update.update_id;

                // Cache para evitar duplicados (memoria temporal)
                if (!global.processedUpdates) global.processedUpdates = new Set();
                if (global.processedUpdates.has(updateId)) {
                    console.log(`[WEBHOOK] Ignorando update_id duplicado: ${updateId}`);
                    return;
                }
                global.processedUpdates.add(updateId);
                // Limpiar cache cada 10 min
                setTimeout(() => global.processedUpdates.delete(updateId), 600000);

                if (update.callback_query) {
                    const callbackQuery = update.callback_query;
                    const data = callbackQuery.data;
                    const messageId = callbackQuery.message.message_id;
                    const chatId = callbackQuery.message.chat.id;
                    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                    
                    if (!BOT_TOKEN) {
                        console.error('[WEBHOOK] ❌ ERROR: TELEGRAM_BOT_TOKEN no está configurado en las variables de entorno de Render.');
                        return res.end('Token missing');
                    }

                    const [action, ref] = data.split('|');
                    let order = orders[ref];
                    
                    console.log(`[WEBHOOK] 🖱️ CLIC RECIBIDO: Acción=${action} | Ref=${ref} | User=${callbackQuery.from.username || callbackQuery.from.id}`);

                    // 1. Responder INMEDIATAMENTE a Telegram para quitar el "relojito"
                    const answerPayload = JSON.stringify({ 
                        callback_query_id: callbackQuery.id,
                        text: action === 'accept' ? 'Procesando recarga...' : 'Cancelando pedido...'
                    });
                    const answerReq = https.request({
                        hostname: 'api.telegram.org',
                        path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(answerPayload)
                        }
                    }, (ansRes) => {
                        console.log(`[WEBHOOK] Telegram respondió a answerCallbackQuery: ${ansRes.statusCode}`);
                    });
                    answerReq.on('error', (err) => console.error('[WEBHOOK] ❌ Error enviando answerCallbackQuery:', err.message));
                    answerReq.write(answerPayload);
                    answerReq.end();

                    // Si Render se durmió, orders[ref] estará vacío. Lo recuperamos del texto del mensaje.
                    if (!order) {
                        console.log(`[WEBHOOK] Pedido no encontrado en memoria. Consultando Supabase antes de recuperar...`);
                        
                        // ⚠️ SEGURIDAD CRÍTICA: Verificar en Supabase si ya fue procesado
                        const { data: dbOrder } = await supabase.from('ff_orders').select('*').eq('ref', ref).single();
                        if (dbOrder && (dbOrder.status === 'approved' || dbOrder.status === 'rejected')) {
                            console.log(`[WEBHOOK] 🛑 BLOQUEADO: El pedido ${ref} ya fue procesado (${dbOrder.status}) en Supabase. Ignorando clic duplicado.`);
                            // Notificar al admin en Telegram que este pedido ya fue procesado
                            const warnPayload = JSON.stringify({
                                chat_id: chatId,
                                message_id: messageId,
                                text: `⚠️ *PEDIDO YA PROCESADO*\n\nEste pedido (Ref: \`${ref}\`) ya fue *${dbOrder.status === 'approved' ? '✅ APROBADO' : '❌ RECHAZADO'}* anteriormente.\n\n_Clic ignorado por seguridad._`,
                                parse_mode: 'Markdown'
                            });
                            const warnReq = https.request({
                                hostname: 'api.telegram.org',
                                path: `/bot${BOT_TOKEN}/editMessageText`,
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(warnPayload) }
                            });
                            warnReq.on('error', () => {});
                            warnReq.write(warnPayload);
                            warnReq.end();
                            return;
                        }
                        
                        // Si existe en Supabase como pending, restaurar en memoria
                        if (dbOrder) {
                            orders[ref] = { uid: dbOrder.uid, login_uid: dbOrder.login_uid, name: dbOrder.name, pack: dbOrder.pack, method: dbOrder.method, price: dbOrder.price, status: dbOrder.status, time: dbOrder.time, wa: dbOrder.wa, pin: dbOrder.pin };
                            order = orders[ref];
                            console.log(`[WEBHOOK] Pedido restaurado desde Supabase: ${ref}`);
                        } else {
                            // Último recurso: recuperar desde el texto del mensaje de Telegram
                            const text = callbackQuery.message.text || '';
                            const uidMatch = text.match(/ID:\s*(\d+)/);
                            const nameMatch = text.match(/Jugador:\s*(.+)/);
                            const packMatch = text.match(/Paquete:\s*(.+)/);
                            const priceMatch = text.match(/Total:\s*(.+)/);
                            const waMatch = text.match(/WhatsApp:\s*\+?(\d+)/);
                            
                            if (uidMatch && packMatch) {
                                orders[ref] = {
                                    uid: uidMatch[1].trim(),
                                    name: nameMatch ? nameMatch[1].trim() : 'Desconocido',
                                    pack: packMatch[1].trim(),
                                    price: priceMatch ? priceMatch[1].trim() : '0USDT',
                                    wa: waMatch ? waMatch[1].trim() : 'No provisto',
                                    status: 'pending'
                                };
                                order = orders[ref];
                                console.log(`[WEBHOOK] Pedido recuperado desde texto de Telegram (sin Supabase):`, order);
                            } else {
                                console.error(`[WEBHOOK] No se pudo recuperar el pedido para ref: ${ref}`);
                                return;
                            }
                        }
                    }
                    
                    // ⚠️ GUARDA FINAL: Nunca procesar un pedido que ya no esté en 'pending'
                    if (order.status && order.status !== 'pending') {
                        console.log(`[WEBHOOK] 🛑 GUARDA FINAL: pedido ${ref} ya está en estado '${order.status}'. Abortando.`);
                        return;
                    }

                    let newText = '';
                    if (action === 'accept') {
                        const pin = await getFallbackPin(order.pack);
                        if (pin) {
                            newText = `🎟️ *RECARGA VÍA PIN ENTREGADA*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n💎 *Paquete:* ${order.pack}\n💰 *Monto:* ${order.price}\n📝 *Ref:* \`${ref}\`\n🔑 *PIN:* \`${pin}\`\n\n⚡ *LINK DE CANJE DIRECTO:* \nhttps://diamond-center-cloud.onrender.com/canjear.html?uid=${order.uid}&pin=${pin}\n\n✅ _Entrega automática exitosa._`;
                            
                            orders[ref].status = 'approved';
                            orders[ref].pin = pin;
                            updateOrderStatus(ref, 'approved', pin);
                            saveRecent(order.name, order.pack);

                            // Sumar puntos al que inició sesión
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) {
                                addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                            }
                        } else {
                            newText = `⚠️ *NO HAY STOCK DE PINES*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n❌ *Error:* El almacén está vacío para este paquete.\n\n_Por favor, carga pines y aprueba manualmente._`;
                        }
                    } else {
                        newText = `❌ *PEDIDO RECHAZADO*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n💰 *Monto:* ${order.price}\n📝 *Ref:* \`${ref}\`\n\n⚠️ _El pago no fue aprobado._`;
                        orders[ref].status = 'rejected';
                        
                    }

                    // Encolar mensaje de WhatsApp si corresponde (éxito o rechazo final)
                    const orderWithRef = { ...order, ref };
                    if (action === 'reject') {
                        queueWhatsAppMessage(orderWithRef, false);
                        sendPushToUser(order.login_uid || order.uid, 'Pago Rechazado ❌', `No pudimos verificar tu pago para el pedido de ${order.pack} diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
                    } else if (action === 'accept' && orders[ref].status === 'approved') {
                        queueWhatsAppMessage(orderWithRef, true, orders[ref].pin);
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes están listos! Haz clic para ver tu PIN: ${orders[ref].pin || ''}`, '/icon-192.png', '/historial');
                    }

                    // 2. Editar el mensaje original con el resultado
                    const editPayload = JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: newText,
                        parse_mode: 'Markdown'
                    });

                    const editReq = https.request({
                        hostname: 'api.telegram.org',
                        path: `/bot${BOT_TOKEN}/editMessageText`,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(editPayload)
                        }
                    }, (editRes) => {
                        editRes.on('data', () => {});
                        editRes.on('end', () => console.log('[WEBHOOK] Mensaje editado correctamente'));
                    });

                    editReq.on('error', (err) => console.error('[WEBHOOK] Error editando:', err));
                    editReq.write(editPayload);
                    editReq.end();
                }
            } catch (e) {
                console.error('[WEBHOOK] Error procesando body:', e);
                // No respondemos aquí porque ya se envió el 200 OK arriba
            }
        });
    } else if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    } else if (parsedUrl.pathname === '/admin/restart-wa' && req.method === 'POST') {
        global.waRestartRequested = true;
        console.log('[ADMIN] 🔄 REINICIO DE WHATSAPP SOLICITADO');
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Solicitud de reinicio enviada al bot' }));
    } else if (parsedUrl.pathname === '/webhook/notificacion' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            // Responder de inmediato para evitar reintentos de Macrodroid
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));

            try {
                const data = JSON.parse(body);
                const text = data.text || '';
                
                if (!text) return;

                // Evitar procesar el mismo mensaje en menos de 10 segundos
                if (global.lastProcessedWebhooks && global.lastProcessedWebhooks[text]) {
                    const diff = Date.now() - global.lastProcessedWebhooks[text];
                    if (diff < 10000) {
                        console.log('[DEBUG-WEBHOOK] ⏩ Ignorando duplicado reciente.');
                        return;
                    }
                }
                if (!global.lastProcessedWebhooks) global.lastProcessedWebhooks = {};
                global.lastProcessedWebhooks[text] = Date.now();

                console.log(`[DEBUG-WEBHOOK] Procesando: "${text}"`);
                
                let refMatch = text.match(/(?:Ref|Referencia)\s*:?\s*(\d+)/i);
                let amountMatch = text.match(/Bs\.?\s*([\d,.]+)/i);

                if (refMatch && amountMatch) {
                    const ref = refMatch[1];
                    let amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
                    const amount = parseFloat(amountStr);

                    console.log(`[DEBUG-WEBHOOK] ✅ ÉXITO EXTRAYENDO -> Ref: ${ref}, Monto: ${amount}`);

                    if (!pagosValidados[ref]) {
                        pagosValidados[ref] = { amount, time: new Date().toISOString(), used: false };
                        savePagos();
                    }
                    // processPendingOrder(ref, null); // Desactivado por seguridad
                }
            } catch (e) {
                console.error('[DEBUG-WEBHOOK] ❌ Error:', e.message);
            }
        });
    } else if (parsedUrl.pathname === '/status') {
        const ref = parsedUrl.searchParams.get('ref');
        const order = orders[ref];
        if (order) {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                status: order.status,
                pin: order.pin || null
            }));
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Pedido no encontrado' }));
        }
    } else if (parsedUrl.pathname === '/recientes') {
        res.writeHead(200);
        res.end(JSON.stringify(recentReloads));
    } else if (parsedUrl.pathname === '/historial') {
        // Historial de compras de un jugador por su UID (tiempo real desde Supabase)
        const uid = parsedUrl.searchParams.get('uid');
        if (!uid) {
            res.writeHead(400);
            return res.end(JSON.stringify({ success: false, error: 'Falta el uid' }));
        }
        try {
            const { data, error } = await supabase
                .from('ff_orders')
                .select('ref, control_num, pack, status, time, pin, method, price')
                .eq('uid', uid)
                .order('time', { ascending: false })
                .limit(20);
            if (error) throw error;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, orders: data || [] }));
        } catch (e) {
            console.error('[HISTORIAL] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: 'Error al obtener historial' }));
        }
    } else if (parsedUrl.pathname === '/admin/stats' && req.method === 'GET') {
        const stats = {
            pending: Object.values(orders).filter(o => o.status === 'pending').length,
            approved: Object.values(orders).filter(o => o.status === 'approved').length,
            rejected: Object.values(orders).filter(o => o.status === 'rejected').length,
            total_users: Object.keys(users).length,
            total_pines: Object.values(pines).reduce((acc, curr) => acc + curr.length, 0)
        };
        res.writeHead(200);
        res.end(JSON.stringify(stats));
    } else if (parsedUrl.pathname === '/admin/pedidos' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(Object.entries(orders).map(([ref, data]) => ({ ref, ...data }))));
    } else if (parsedUrl.pathname === '/admin/aprobar' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ref } = JSON.parse(body);
                const order = orders[ref];
                
                // --- SEGURIDAD: NO APROBAR DOS VECES ---
                if (order && order.status !== 'pending') {
                    console.log(`[ALMACEN] ⚠️ Bloqueado re-procesamiento de pedido: ${ref}`);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: 'Este pedido ya fue procesado.' }));
                }

                if (order && order.status === 'pending') {
                    const pin = await getFallbackPin(order.pack);
                    if (pin) {
                        orders[ref].status = 'approved';
                        orders[ref].pin = pin;
                        updateOrderStatus(ref, 'approved', pin);
                        saveRecent(order.name, order.pack);
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                        queueWhatsAppMessage({ ...order, ref }, true, pin);
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes están listos! Haz clic para ver tu PIN: ${pin || ''}`, '/icon-192.png', '/historial');
                        updateTelegramStatus(ref);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, message: 'Aprobado vía PIN' }));
                    } else {
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, message: 'No hay stock de pines para este paquete.' }));
                    }
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: 'Pedido no encontrado.' }));
                }
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/clear-wa-queue' && req.method === 'POST') {
        whatsappQueue = [];
        supabase.from('ff_wa_queue').delete().neq('id', '0')
            .then(() => {
                console.log('[WA-QUEUE] Cola vaciada con éxito.');
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            });
    } else if (parsedUrl.pathname === '/admin/rechazar' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { ref } = JSON.parse(body);
                if (orders[ref]) {
                    orders[ref].status = 'rejected';
                    updateOrderStatus(ref, 'rejected');
                    queueWhatsAppMessage({ ...orders[ref], ref }, false);
                    sendPushToUser(orders[ref].login_uid || orders[ref].uid, 'Pago Rechazado ❌', `No pudimos verificar tu pago para el pedido de ${orders[ref].pack} diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
                    updateTelegramStatus(ref);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                }
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/admin/usuarios' && req.method === 'GET') {
        try {
            // Obtener lista de UIDs que tienen al menos un pedido en Supabase
            const { data: realUids } = await supabase.from('ff_orders').select('uid');
            const customerSet = new Set(realUids.map(o => o.uid));
            
            const filteredUsers = {};
            Object.entries(users).forEach(([uid, data]) => {
                if (customerSet.has(uid) || data.points > 0) {
                    filteredUsers[uid] = data;
                }
            });
            
            res.writeHead(200);
            res.end(JSON.stringify(filteredUsers));
        } catch (e) {
            // Fallback: enviar todos si falla la consulta
            res.writeHead(200);
            res.end(JSON.stringify(users));
        }
    } else if (parsedUrl.pathname === '/admin/usuarios/update_points' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { uid, points } = JSON.parse(body);
                if (users[uid]) {
                    users[uid].points = parseInt(points);
                    saveUser(uid);

                    // Encolar mensaje de WhatsApp para el usuario
                    getLastUserWa(uid).then(userWa => {
                        if (userWa) {
                            const adminUpdateMsgId = `wa_admin_update_${uid}_${Date.now()}`;
                            const adminUpdateMsg = `⭐ *ACTUALIZACIÓN DE PUNTOS* ⭐\n\n` +
                                                   `¡Hola! Tu saldo de puntos ha sido actualizado por el administrador. ⚙️\n\n` +
                                                   `📊 *Tu nuevo balance:* ${users[uid].points} pts\n\n` +
                                                   `¡Gracias por formar parte de *Diamond Center*! 💎✨`;
                            
                            const waItem = { id: adminUpdateMsgId, number: userWa, message: adminUpdateMsg };
                            whatsappQueue.push(waItem);
                            supabase.from('ff_wa_queue').insert(waItem)
                                .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error admin update message:', error.message); });
                            console.log(`[ADMIN_POINTS_NOTIFICATION] Encolada notificación de ajuste de puntos para ${userWa}`);
                        }
                    });

                    sendPushToUser(uid, 'Puntos Actualizados ⭐', `Tu saldo de puntos ha sido actualizado. Nuevo balance: ${users[uid].points} pts.`, '/icon-192.png', '/');

                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                }
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/admin/usuarios/set_password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { uid, password } = JSON.parse(body);
                if (users[uid]) {
                    users[uid].password = password || null;
                    saveUser(uid);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/admin/usuarios/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { uid } = JSON.parse(body);
                if (users[uid]) {
                    delete users[uid];
                    await supabase.from('ff_users').delete().eq('uid', uid);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/admin/pines' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(pines));
    } else if (parsedUrl.pathname === '/admin/pines/used' && req.method === 'GET') {
        supabase.from('ff_orders').select('time, pack, pin, name, uid, ref, control_num').not('pin', 'is', null).order('time', { ascending: false }).limit(50)
            .then(({ data, error }) => {
                if (error) { 
                    console.error('[PIN-HISTORY] Error:', error);
                    res.writeHead(500); 
                    return res.end(JSON.stringify(error)); 
                }
                res.writeHead(200);
                res.end(JSON.stringify(data || []));
            });
    } else if (parsedUrl.pathname === '/admin/pines/available' && req.method === 'GET') {
        const amount = parsedUrl.searchParams.get('amount');
        let query = supabase.from('ff_pines').select('*').eq('used', false);
        if (amount) query = query.eq('amount', amount);
        
        query.order('created_at', { ascending: false })
            .then(({ data, error }) => {
                res.writeHead(200);
                res.end(JSON.stringify(data || []));
            });
    } else if (parsedUrl.pathname === '/admin/pines/update' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { id, code } = JSON.parse(body);
                const { error } = await supabase.from('ff_pines').update({ code }).eq('id', id);
                if (error) throw error;
                await reloadPines();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/pines/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { id } = JSON.parse(body);
                const { error } = await supabase.from('ff_pines').delete().eq('id', id);
                if (error) throw error;
                await reloadPines();
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/pines/add' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                if (!body) throw new Error('Cuerpo de petición vacío');
                const parsed = JSON.parse(body);
                const { amount, codes } = parsed;
                
                if (!amount || !codes || !Array.isArray(codes)) throw new Error('Faltan datos (monto o lista de códigos)');

                // Limpiar códigos después de extraerlos
                const cleanCodes = codes.map(c => c.trim()).filter(c => c.length > 0);
                if (cleanCodes.length === 0) throw new Error('No hay códigos válidos para cargar');

                console.log(`[ALMACEN] Intentando cargar ${cleanCodes.length} pines para paquete ${amount}`);

                const inserts = cleanCodes.map(code => ({ amount: amount.toString(), code, used: false }));
                const { error } = await supabase.from('ff_pines').insert(inserts);
                
                if (error) {
                    console.error('[ALMACEN] ❌ Supabase Error:', error);
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: error.message || 'Error en la base de datos de Supabase' }));
                }

                // Actualizar memoria
                if (!pines[amount]) pines[amount] = [];
                cleanCodes.forEach(code => pines[amount].push(code));

                console.log(`[ALMACEN] ✅ ÉXITO: ${cleanCodes.length} pines cargados.`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) { 
                console.error('[ALMACEN] ❌ ERROR:', e.message);
                res.writeHead(400); 
                res.end(JSON.stringify({ success: false, message: e.message || 'Error interno del servidor' })); 
            }
        });
    } else if (parsedUrl.pathname === '/api/check_password') {
        const uid = parsedUrl.searchParams.get('uid');
        const pass = parsedUrl.searchParams.get('pass');
        if (!uid || !users[uid]) {
            res.writeHead(404);
            return res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
        }
        const user = users[uid];
        const hasPassword = !!user.password;
        if (!hasPassword) {
            // No tiene contraseña, puede entrar libre
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, hasPassword: false, name: user.name }));
        }
        if (pass && user.password === pass) {
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, hasPassword: true, name: user.name }));
        }
        // Solo verificar si tiene contraseña (sin pass en la query)
        if (!pass) {
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, hasPassword: true }));
        }
        res.writeHead(200);
        return res.end(JSON.stringify({ success: false, hasPassword: true, message: 'Contraseña incorrecta' }));
    } else if (parsedUrl.pathname === '/api/set_password' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { uid, password } = JSON.parse(body);
                if (users[uid]) {
                    // Solo permitimos setear si no tenía o si la petición viene con el uid correcto
                    // En una app real usaríamos JWT, aquí confiamos en la lógica del frontend por ahora
                    users[uid].password = password;
                    await saveUser(uid);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/api/register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { uid, name, cedula, phone, password } = JSON.parse(body);
                if (!uid || !cedula || !phone || !password) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Faltan campos obligatorios' }));
                }
                
                // Si el usuario no existe en memoria, lo creamos
                if (!users[uid]) {
                    users[uid] = { name: name || 'Jugador', points: 0, registered: getVEISO() };
                }
                
                // Guardar los datos completos
                users[uid].name = name || users[uid].name || 'Jugador';
                users[uid].cedula = cedula;
                users[uid].phone = phone;
                users[uid].password = password;
                
                await saveUser(uid);
                
                const nombreRegistrado = users[uid].name || 'Jugador';
                console.log(`[REGISTRO] Usuario registrado con éxito: ID=${uid}, Nombre=${nombreRegistrado}, Cédula=${cedula}, Teléfono=${phone}`);

                // ─── 🔔 NOTIFICACIÓN PUSH DE BIENVENIDA ──────────────────────
                sendPushToUser(
                    uid,
                    '🎉 ¡Bienvenido a Diamond Center!',
                    `¡Hola ${nombreRegistrado}! Tu cuenta está activa. Acumula puntos en cada compra y canjéalos por diamantes gratis. 💎`,
                    '/icon-192.png',
                    '/'
                );

                // ─── 📱 WHATSAPP DE BIENVENIDA ───────────────────────────────
                const phoneClean = phone.replace(/\D/g, '');
                const waWelcomeId = `wa_bienvenida_${uid}`;
                const yaEnviadoBienvenida = whatsappQueue.some(i => i.id === waWelcomeId);
                if (!yaEnviadoBienvenida) {
                    const waWelcomeMsg =
                        `🔥 *¡BIENVENIDO A DIAMOND CENTER!* 🔥\n\n` +
                        `¡Hola, *${nombreRegistrado}*! Tu cuenta ha sido creada exitosamente. 🎉\n\n` +
                        `━━━━━━━━━━━━━━━\n` +
                        `👤 *Jugador:* ${nombreRegistrado}\n` +
                        `🆔 *ID Garena:* ${uid}\n` +
                        `━━━━━━━━━━━━━━━\n\n` +
                        `✅ Ya puedes *acumular puntos* en cada recarga y canjearlos por diamantes gratis. 💎\n\n` +
                        `🌐 *Tu tienda:* https://diamond-center-cloud.onrender.com\n\n` +
                        `¡Gracias por unirte a *Diamond Center*! 🚀`;

                    const waWelcome = { id: waWelcomeId, number: phoneClean, message: waWelcomeMsg };
                    whatsappQueue.push(waWelcome);
                    supabase.from('ff_wa_queue').insert(waWelcome)
                        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-REGISTRO] Error encolando bienvenida:', error.message); });
                    console.log(`[REGISTRO] 📱 WhatsApp de bienvenida encolado para ${phoneClean}`);
                }

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, name: nombreRegistrado }));
            } catch (e) { 
                console.error('[REGISTRO] Error:', e.message);
                res.writeHead(500); 
                res.end(JSON.stringify({ success: false, message: 'Error interno del servidor' })); 
            }
        });
    } else if (parsedUrl.pathname === '/admin/settings' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(settings));
    } else if (parsedUrl.pathname === '/admin/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newSettings = JSON.parse(body);
                
                // Guardar en Supabase
                const dbUpdate = {};
                if (newSettings.tasa_del_dia !== undefined) dbUpdate.tasa_del_dia = newSettings.tasa_del_dia;
                if (newSettings.barra_informativa !== undefined) dbUpdate.barra_informativa = newSettings.barra_informativa;
                if (newSettings.metodos_pago !== undefined) dbUpdate.metodos_pago = newSettings.metodos_pago;
                if (newSettings.whatsapp !== undefined) dbUpdate.whatsapp_config = newSettings.whatsapp;
                if (newSettings.precios !== undefined) dbUpdate.precios = newSettings.precios;
                
                let passwordChanged = false;
                if (newSettings.admin) {
                    passwordChanged = newSettings.admin.password && newSettings.admin.password !== settings.admin.password;
                    dbUpdate.admin_username = newSettings.admin.username;
                    dbUpdate.admin_password = newSettings.admin.password;
                    
                    if (passwordChanged) {
                        console.log('[ADMIN] 🔒 Contraseña modificada. Invalidando todas las sesiones.');
                        newSettings.admin.session_token = null;
                        dbUpdate.admin_session_token = null;
                    } else {
                        // Preservar el token existente
                        newSettings.admin.session_token = settings.admin.session_token;
                    }
                }
                
                settings = { ...settings, ...newSettings };
                
                supabase.from('ff_settings').update(dbUpdate).eq('id', 1)
                    .then(({ error }) => { if (error) console.error('[SUPABASE] Error guardando settings:', error.message); });
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/api/config' && req.method === 'GET') {
        const publicConfig = {
            tasa_del_dia: settings.tasa_del_dia,
            barra_informativa: settings.barra_informativa,
            precios: settings.precios,
            metodos_pago: settings.metodos_pago,
            whatsapp: settings.whatsapp,
            stock: Object.keys(settings.precios).reduce((acc, amount) => {
                acc[amount] = pines[amount] ? pines[amount].length : 0;
                return acc;
            }, {})
        };
        res.writeHead(200);
        res.end(JSON.stringify(publicConfig));
    } else if (parsedUrl.pathname === '/perfil') {
        const uid = parsedUrl.searchParams.get('uid');
        const ref = parsedUrl.searchParams.get('ref'); // referido por
        if (uid && users[uid]) {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, user: users[uid], isNew: false }));
        } else if (uid) {
            // Mantener en memoria temporalmente, pero NO guardar en Supabase todavía
            // Solo se guardará si realiza una compra (vía addPoints)
            users[uid] = { name: 'Jugador', points: 0, registered: getVEISO() };
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, user: users[uid], isNew: true }));
        } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Falta uid' }));
        }
    } else if (parsedUrl.pathname === '/api/referral' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { referrer_uid, new_uid } = JSON.parse(body);
                // Validar que el nuevo usuario existe y que el referido también
                if (!users[referrer_uid] || !users[new_uid]) {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }
                // Evitar auto-referido
                if (referrer_uid === new_uid) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'No puedes referirte a ti mismo' }));
                }
                // Evitar doble referido: marcar al nuevo usuario como ya referido
                if (users[new_uid].referred_by) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: 'Ya fue referido anteriormente' }));
                }
                // Guardar quién lo refirió, pero NO dar puntos todavía
                users[new_uid].referred_by = referrer_uid;
                // No guardamos en Supabase todavía, solo en memoria
                console.log(`[REFERRAL] ${new_uid} vinculado a ${referrer_uid} (Pendiente de 1ra compra)`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'Vinculado correctamente' }));
            } catch (e) { res.writeHead(400); res.end('Error'); }
        });
    } else if (parsedUrl.pathname === '/canjear' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { uid, pack, password } = data;
                const user = users[uid];

                if (!user) {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }

                // Verificar contraseña si el usuario tiene una configurada
                if (user.password && user.password !== password) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Contraseña incorrecta o requerida para canjear' }));
                }
                
                // Definir costos en puntos (ejemplo: 100 diamantes = 500 puntos)
                const pointCosts = { "100": 500, "310": 1500, "520": 2500 };
                const cost = pointCosts[pack];

                if (!cost || user.points < cost) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Puntos insuficientes o paquete inválido' }));
                }

                // Intentar recarga (prioridad pines para canje)
                const pin = await getFallbackPin(pack);
                if (pin) {
                    const pointsBefore = Number(user.points);
                    user.points = pointsBefore - cost;
                    await saveUser(uid);
                    console.log(`[CANJE] ✅ ÉXITO: Usuario ${uid} canjeó ${cost} puntos. Balance: ${pointsBefore} -> ${user.points}`);
                    
                    // Mostrar en la marquesina (usar nombre si existe o ID)
                    saveRecent(user.name || uid, pack, 'canje');

                    // Encolar mensaje de WhatsApp para el usuario
                    getLastUserWa(uid).then(userWa => {
                        if (userWa) {
                            const redemptionMsgId = `wa_redeem_${uid}_${Date.now()}`;
                            const redemptionMsg = `💎 *¡CANJE DE PUNTOS EXITOSO!* 💎\n\n` +
                                                 `¡Hola! Has canjeado con éxito tu saldo de puntos por un paquete de *${pack} Diamantes*. 🚀\n\n` +
                                                 `━━━━━━━━━━━━━━━\n` +
                                                 `🆔 *ID Garena:* ${uid}\n` +
                                                 `📉 *Costo del canje:* -${cost} pts\n` +
                                                 `⭐ *Tu nuevo balance:* ${user.points} pts\n` +
                                                 `━━━━━━━━━━━━━━━\n\n` +
                                                 `⚡ *Tu PIN de Diamantes:* \n` +
                                                 `\`${pin}\`\n\n` +
                                                 `🔗 Canjéalo aquí directamente:\n` +
                                                 `https://redeempins.com/\n\n` +
                                                 `¡Gracias por usar *Diamond Center*! 🎯🛡️`;
                            
                            const waItem = { id: redemptionMsgId, number: userWa, message: redemptionMsg };
                            whatsappQueue.push(waItem);
                            supabase.from('ff_wa_queue').insert(waItem)
                                .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error redemption message:', error.message); });
                            console.log(`[CANJE_NOTIFICATION] Encolada notificación de canje de puntos para ${userWa}`);
                        }
                    });

                    sendPushToUser(uid, '🎁 ¡Canje de Puntos Exitoso! 💎', `Canjeaste ${cost} puntos por ${pack} diamantes. Tu PIN es: ${pin}`, '/icon-192.png', '/historial');
                    
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, pin: pin, message: '¡Canje exitoso!' }));
                } else {
                    console.log(`[CANJE] ❌ FALLO: No hay pines para el paquete ${pack}`);
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, message: 'No hay pines disponibles para canje en este momento' }));
                }
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Error procesando canje' }));
            }
        });
    } else if (parsedUrl.pathname === '/api/redeem_pin') {
        const uid = parsedUrl.searchParams.get('uid');
        const pin = parsedUrl.searchParams.get('pin');
        
        if (!uid || !pin) {
            res.writeHead(400);
            return res.end(JSON.stringify({ success: false, message: 'Falta el ID o el PIN' }));
        }

        // CANJE UNIVERSAL: Todos los pines pasan por la API de Netfreelat
        // Los pines UUID de Netfreelat son canjeados automáticamente
        // Los pines de otros proveedores son guiados desde el frontend (no llegan aquí)
        console.log(`[CANJE_PIN] 📡 Canjeando PIN via API Netfreelat | ID: ${uid} | PIN: ${pin}`);

        const postData = `action=canjefreeFire&id=${encodeURIComponent(uid)}&pin=${encodeURIComponent(pin)}`;
        const options = {
            hostname: 'netfreelat.net',
            path: '/redeem/conexion_api/api.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://netfreelat.net/redeem/'
            },
            timeout: 20000
        };

        const apiReq = https.request(options, (apiRes) => {
            let body = '';
            apiRes.on('data', chunk => body += chunk);
            apiRes.on('end', () => {
                try {
                    const parsedData = JSON.parse(body.trim());
                    if (parsedData.alerta === 'green') {
                        saveRecent(uid, 'Diamantes', 'canje');
                        console.log(`[CANJE_PIN] ✅ Canje exitoso para ID: ${uid}`);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, message: `¡Canje realizado con éxito! ${parsedData.codigo_aprobacion ? 'N° Aprobación: ' + parsedData.codigo_aprobacion : ''}` }));
                    } else {
                        let errorMsg = parsedData.mensaje || 'PIN inválido o ya utilizado.';
                        const isExternalPin = errorMsg.includes('Pago Norte') || errorMsg.includes('Netfreelat');

                        if (isExternalPin) {
                            // PIN de otro proveedor → cliente debe ir a redeempins.com
                            console.log(`[CANJE_PIN] 🔁 PIN externo detectado. Enviando a guía manual.`);
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: false, needsManual: true }));
                        } else {
                            // Error real: PIN inválido, ya usado, etc.
                            console.log(`[CANJE_PIN] ❌ Error real: ${errorMsg.substring(0, 80)}`);
                            res.writeHead(200);
                            res.end(JSON.stringify({ success: false, message: errorMsg }));
                        }
                    }
                } catch (e) {
                    console.error('[CANJE_PIN] Error parseando respuesta:', e.message, body.substring(0, 200));
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, message: 'Error procesando la respuesta del proveedor.' }));
                }
            });
        });

        apiReq.on('error', (err) => {
            console.error('[CANJE_PIN] Error conectando a Netfreelat:', err.message);
            res.writeHead(200);
            res.end(JSON.stringify({ success: false, message: 'Error de conexión con el proveedor. Intenta de nuevo.' }));
        });

        apiReq.on('timeout', () => {
            apiReq.destroy();
            res.writeHead(200);
            res.end(JSON.stringify({ success: false, message: 'El servidor tardó demasiado. Intenta de nuevo.' }));
        });

        apiReq.write(postData);
        apiReq.end();
    } else if (parsedUrl.pathname === '/api/admin/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { username, password } = JSON.parse(body);
                console.log(`[ADMIN-LOGIN] Intento de login. Usuario: '${username}' | Esperado: '${settings.admin.username}'`);
                if (username === settings.admin.username && password === settings.admin.password) {
                    // Generar un token aleatorio seguro
                    const token = 'tok_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
                    settings.admin.session_token = token;
                    
                    // Guardar en Supabase para persistencia
                    const { error } = await supabase
                        .from('ff_settings')
                        .update({ admin_session_token: token })
                        .eq('id', 1);
                    if (error) {
                        console.error('[SUPABASE] Error guardando session_token:', error.message);
                    }
                    console.log('[ADMIN-LOGIN] ✅ Login exitoso.');
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, token }));
                } else {
                    console.warn('[ADMIN-LOGIN] ❌ Credenciales incorrectas.');
                    // Siempre devolver 200 para que el frontend pueda leer el mensaje
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, message: 'Usuario o contraseña incorrectos' }));
                }
            } catch (e) {
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, message: 'Datos inválidos. Intenta de nuevo.' }));
            }
        });
    } else if (parsedUrl.pathname === '/api/admin/logout_all' && req.method === 'POST') {
        if (!checkAdminAuth(req, res)) return;
        
        const token = null;
        settings.admin.session_token = token;
        
        // Guardar en Supabase
        const { error } = await supabase
            .from('ff_settings')
            .update({ admin_session_token: token })
            .eq('id', 1);
        if (error) {
            console.error('[SUPABASE] Error guardando session_token (logout):', error.message);
        }
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Todas las sesiones cerradas' }));
    } else if (parsedUrl.pathname === '/api/whatsapp_queue') {
        res.writeHead(200);
        res.end(JSON.stringify({ 
            success: true, 
            queue: whatsappQueue,
            restart: global.waRestartRequested || false
        }));
        if (global.waRestartRequested) global.waRestartRequested = false; // Resetear flag
    } else if (parsedUrl.pathname === '/api/whatsapp_sent' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { id } = JSON.parse(body);
                whatsappQueue = whatsappQueue.filter(item => item.id !== id);
                
                // BORRADO REAL EN SUPABASE
                supabase.from('ff_wa_queue').delete().eq('id', id)
                    .then(({ error }) => {
                        if (error) console.error('[SUPABASE] Error borrando mensaje enviado:', error.message);
                        else console.log(`[WHATSAPP] ✅ Mensaje ${id} borrado de la base de datos.`);
                    });

                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'Bad request' }));
            }
        });
    } else if (parsedUrl.pathname === '/api/wa_status') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: waBotStatus, qr: waBotQR }));
    } else if (parsedUrl.pathname === '/api/wa_status_update' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.status !== undefined) waBotStatus = data.status;
                if (data.qr !== undefined) waBotQR = data.qr;
                console.log(`[WA-STATUS] ${waBotStatus} ${waBotQR ? '(Con QR)' : ''}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false }));
            }
        });
    } else if (parsedUrl.pathname === '/api/push/vapid-key') {
        res.writeHead(200);
        res.end(JSON.stringify({ publicKey: vapidPublicKey || null }));
    } else if (parsedUrl.pathname === '/api/push/subscribe' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { uid, subscription } = JSON.parse(body);
                if (!uid || !subscription || !subscription.endpoint) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: 'Faltan datos de suscripción o uid' }));
                }

                const { error } = await supabase
                    .from('ff_push_subscriptions')
                    .upsert({
                        uid: uid,
                        endpoint: subscription.endpoint,
                        keys_p256dh: subscription.keys.p256dh,
                        keys_auth: subscription.keys.auth
                    }, { onConflict: 'endpoint' });

                if (error) {
                    console.error('[PUSH] Error al registrar suscripción:', error.message);
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, error: error.message }));
                }

                console.log(`[PUSH] Dispositivo registrado correctamente para el ID: ${uid}`);
                sendPushToUser(uid, 'Notificaciones Activas 🔔', '¡Listo! Recibirás una alerta cuando se procesen tus pedidos.', '/icon-192.png');
                
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'JSON inválido o malformado' }));
            }
        });
    } else if (parsedUrl.pathname === '/api/push/unsubscribe' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { endpoint } = JSON.parse(body);
                if (!endpoint) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, error: 'Falta el endpoint' }));
                }

                const { error } = await supabase
                    .from('ff_push_subscriptions')
                    .delete()
                    .eq('endpoint', endpoint);

                if (error) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, error: error.message }));
                }

                console.log('[PUSH] Dispositivo removido correctamente.');
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: 'JSON inválido o malformado' }));
            }
        });
    } else if (parsedUrl.pathname === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
    } else {
        // Servir archivos estáticos (index.html, style.css, script.js, etc.)
        let filePath = '.' + parsedUrl.pathname;
        if (filePath === './') filePath = './index.html';

        const extname = String(path.extname(filePath)).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.wav': 'audio/wav',
            '.mp4': 'video/mp4',
            '.woff': 'application/font-woff',
            '.ttf': 'application/font-ttf',
            '.eot': 'application/vnd.ms-fontobject',
            '.otf': 'application/font-otf',
            '.wasm': 'application/wasm'
        };

        const contentType = mimeTypes[extname] || 'application/octet-stream';

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if(error.code == 'ENOENT') {
                    res.writeHead(404);
                    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
                } else {
                    res.writeHead(500);
                    res.end('Lo sentimos, error en el servidor: '+error.code+' ..\n');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }
});

if (process.env.VERCEL) {
    module.exports = server;
} else {
    server.listen(PORT, async () => {
        console.log('=========================================');
        console.log('  Diamond Center FF - Servidor');
        console.log(`  Corriendo en: http://localhost:${PORT}`);
        console.log('  Cargando datos desde Supabase...');
        console.log('=========================================');
        await loadFromSupabase();
        console.log('[SERVER] ✅ Listo para recibir solicitudes.');
    });
}
