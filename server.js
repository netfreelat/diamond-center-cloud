const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');
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
let rechargeViaJadh = null;
let rechargeViaJadhPaquetes = null;
try {
    const jadhService = require('./jadh-service.js');
    rechargeViaJadh = jadhService.rechargeViaJadh;
    rechargeViaJadhPaquetes = jadhService.rechargeViaJadhPaquetes;
} catch (e) {
    console.error('[CRÍTICO] No se pudo cargar el servicio de recarga directa de Jadh:', e.message);
}
const fs = require('fs');
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

const WebSocket = require('ws');
const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
    auth: { persistSession: false },
    realtime: {
        transport: WebSocket
    }
});

// --- Web Push Notifications ---
const webPush = require('web-push');
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:netfreelat@gmail.com';
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.trim().replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') : undefined;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.trim().replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') : undefined;

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

const { checkBinanceEmails, markEmailAsRead: originalMarkEmailAsRead } = require('./binance-service.js');
let simulatedBinanceEmails = [];
const markEmailAsRead = async (uid) => {
    if (typeof uid === 'string' && uid.startsWith('mock-')) {
        console.log(`[BINANCE] Correo simulado ${uid} marcado como leído.`);
        simulatedBinanceEmails = simulatedBinanceEmails.filter(e => e.uid !== uid);
        return;
    }
    return originalMarkEmailAsRead(uid);
};

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
    barra_informativa: "🔥 ¡Bienvenidos a RECARGASNEY.COM! 💎",
    precios: {
        "100":     { "usdt": 1.00,  "label": "100 + 10 Diamantes" },
        "310":     { "usdt": 3.10,  "label": "310 + 31 Diamantes" },
        "520":     { "usdt": 5.20,  "label": "520 + 52 Diamantes" },
        "1060":    { "usdt": 10.60, "label": "1060 + 106 Diamantes" },
        "2180":    { "usdt": 21.80, "label": "2180 + 218 Diamantes" },
        "5600":    { "usdt": 56.00, "label": "5600 + 560 Diamantes" },
        "basica":  { "usdt": 0.75,  "label": "🃏 Tarjeta Básica" },
        "semanal": { "usdt": 2.80,  "label": "📅 Tarjeta Semanal" },
        "mensual": { "usdt": 13.50, "label": "👑 Tarjeta Mensual" },
        "booyah":  { "usdt": 4.20,  "label": "🏆 Pase Booyah" }
    },
    juegos: {
        "freefire": {
            "nombre": "Free Fire",
            "inputLabel": "ID de Jugador",
            "inputPlaceholder": "Ej: 123456789",
            "icono": "fa-fire",
            "paquetes": {
                "100": { "usdt": 1.0, "label": "100 Diamantes" },
                "310": { "usdt": 3.0, "label": "310 Diamantes" }
            }
        },
        "roblox": {
            "nombre": "Roblox",
            "inputLabel": "Usuario / ID de Roblox",
            "inputPlaceholder": "Ej: MiUsuario123",
            "icono": "fa-gamepad",
            "paquetes": {
                "10": { "usdt": 10.50, "label": "10 USD" }
            }
        }
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
        
        // Usuarios con paginación para evitar el límite de 1000 filas
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        let loadedCount = 0;
        
        while (hasMore) {
            const { data: usersData, error: usersError } = await supabase
                .from('ff_users')
                .select('*')
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (usersError) throw usersError;
            
            if (usersData && usersData.length > 0) {
                usersData.forEach(u => {
                    users[u.uid] = { 
                        name: u.name, 
                        apellido: u.apellido || '',
                        points: u.points, 
                        password: u.password, 
                        registered: u.registered, 
                        referred_by: u.referred_by, 
                        referral_claimed: u.referral_claimed, 
                        cedula: u.cedula, 
                        phone: u.phone 
                    };
                });
                loadedCount += usersData.length;
                if (usersData.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }
        console.log(`[SUPABASE] 📥 ${loadedCount} usuarios cargados en memoria.`);

        // Pedidos Pendientes
        const { data: ordersData } = await supabase.from('ff_orders').select('*').eq('status', 'pending');
        if (ordersData) {
            ordersData.forEach(o => { orders[o.ref] = { ...o, time: o.time }; });
        }
        
        // Configuración (sin admin_session_token para compatibilidad con DBs sin la columna)
        const { data: settingsData, error: settingsError } = await supabase
            .from('ff_settings')
            .select('id, tasa_del_dia, barra_informativa, admin_username, admin_password, metodos_pago, whatsapp_config, precios, juegos')
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
            if (settingsData.juegos) {
                settings.juegos = settingsData.juegos;
            }
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
        if (waData) whatsappQueue = waData.map(w => ({ id: w.id, number: w.number, message: w.message, delay: w.delay }));

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
        const packStr = (order.pack || '').toLowerCase();
        const isCard = packStr.includes('tarjeta') || packStr.includes('basica') || packStr.includes('semanal') || packStr.includes('mensual');
        const isPass = packStr.includes('pase') || packStr.includes('booyah');
        
        let itemType = 'diamantes';
        let itemStatus = '¡Diamantes Enviados! ✨';
        
        if (isCard) {
            itemType = 'tarjetas';
            itemStatus = '¡Tarjetas Enviadas! ✨';
        } else if (isPass) {
            itemType = 'pase booyah';
            itemStatus = '¡Pase Enviado! ✨';
        }

        msg = `🔥 *¡BOOYAH! COMPRA EXITOSA* 🔥\n\n` +
              `¡Hola, *${order.name}*! Tu pedido de ${itemType} ha sido procesado con éxito. 🚀\n\n` +
              `━━━━━━━━━━━━━━━\n` +
              `👤 *Jugador:* ${order.name}\n` +
              `🆔 *ID Garena:* ${order.uid}\n` +
              `💎 *Paquete:* ${order.pack}\n` +
              `━━━━━━━━━━━━━━━\n\n` +
              `✅ *Estado:* ${itemStatus}`;

        const userObj = users[order.login_uid || order.uid];
        if (userObj) {
            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
            if (!isNaN(usdtPrice) && usdtPrice > 0) {
                const pointsEarned = Math.floor(usdtPrice * 10);
                const earnedUsdt = (pointsEarned * 0.003).toFixed(2);
                const totalUsdt = (((userObj.points) || 0) * 0.003).toFixed(2);
                msg += `\n\n🎁 *Cashback ganado:* +$${earnedUsdt} USDT\n💰 *Tu saldo total:* $${totalUsdt} USDT`;
            }
        }

        if (pin && order.juego === 'roblox') {
            msg = `🔥 *¡COMPRA EXITOSA DE ROBLOX!* 🔥\n\n` +
                  `¡Hola, *${order.name}*! Tu código de Roblox ha sido procesado con éxito. 🚀\n\n` +
                  `━━━━━━━━━━━━━━━\n` +
                  `👤 *Usuario:* ${order.name}\n` +
                  `🎮 *Juego:* Roblox\n` +
                  `💎 *Paquete:* ${order.pack}\n` +
                  `━━━━━━━━━━━━━━━\n\n` +
                  `✅ *Estado:* ¡Código Generado! ✨\n\n` +
                  `⚡ *CANGE SU CÓDIGO AQUÍ:* \n` +
                  `Presiona el link para ir directo a canjear tu código de Roblox:\n` +
                  `🔗 https://www.roblox.com/redeem\n\n` +
                  `*Tu código (PIN) está abajo, cópialo y ve a canjearlo* 👇👇`;
            
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
        msg += `\n\n📢 *Únete a nuestro canal de WhatsApp para promos:* \n🔗 https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K\n\n¡Gracias por confiar en *RECARGASNEY.COM*! 🎯🛡️`;
    } else {
        msg = `⚠️ *AVISO DE TU RECARGA* ⚠️\n\n` +
              `Hola *${order.name}*, no pudimos procesar tu recarga de *${order.pack}*.\n\n` +
              `❌ *Motivo:* Error en la verificacion de su pago, favor chequea el monto y la referencia.\n\n` +
              `Envía captura de tu pago a soporte al *+584125322412*. 🛠️\n🆔 *ID:* ${order.uid}\n\n` +
              `📢 *Únete a nuestro canal de WhatsApp para novedades:* \n🔗 https://whatsapp.com/channel/0029Vb7Wf8M35fLnOvFiY01K\n\n¡Estamos aquí para ayudarte! 🤝`;
    }

    const waItem = { id: singleId, number: order.wa, message: msg };
    whatsappQueue.push(waItem);
    supabase.from('ff_wa_queue').insert(waItem)
        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error msg:', error.message); });
    console.log(`[WA-QUEUE] ✅ 1 mensaje encolado para ${order.wa} (ref: ${orderRef})`);
}

// --- NOTIFICACIÓN A ADMINS: Nuevo pedido recibido ---
// Números de WhatsApp de los administradores que recibirán alertas de nuevos pedidos
const ADMIN_WA_NUMBERS = ['04243790757', '04125313735'];

function notifyAdminsNewOrder(order) {
    const now = getVEString();
    const msg =
        `🛒 *NUEVO PEDIDO RECIBIDO* 🛒\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *Juego:* ${order.juego ? order.juego.toUpperCase() : 'FREEFIRE'}\n` +
        `👤 *Jugador:* ${order.name}\n` +
        `🆔 *ID/Usuario:* ${order.uid}\n` +
        `💎 *Paquete:* ${order.pack}\n` +
        `💰 *Total:* ${order.price}\n` +
        `💳 *Método:* ${order.method === 'pagomovil' ? 'Pago Móvil BDV 📲' : 'Binance Pay 🟡'}\n` +
        `📝 *Referencia:* \`${order.ref}\`\n` +
        `🔢 *N° Control:* \`${order.control_num}\`\n` +
        `📱 *WA Cliente:* +${order.wa && order.wa !== 'No provisto' ? order.wa : 'No indicado'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ *Hora:* ${now}\n` +
        `\n💡 *Responde a este mensaje con:*\n` +
        `👉 *Aprobar* (para procesar recarga)\n` +
        `👉 *Rechazar* (para cancelar y notificar al cliente)`;

    for (const adminNumber of ADMIN_WA_NUMBERS) {
        const adminMsgId = `wa_admin_${order.ref}_${adminNumber.slice(-4)}`;
        // Evitar duplicado si ya está en cola
        if (whatsappQueue.some(item => item.id === adminMsgId)) continue;

        const waItem = { id: adminMsgId, number: adminNumber, message: msg };
        whatsappQueue.push(waItem);
        supabase.from('ff_wa_queue').insert(waItem)
            .then(({ error }) => {
                if (error && error.code !== '23505') {
                    console.error(`[WA-ADMIN] Error encolando alerta para ${adminNumber}:`, error.message);
                }
            });
        console.log(`[WA-ADMIN] 📲 Alerta de nuevo pedido encolada para admin: ${adminNumber} (ref: ${order.ref})`);
    }
}

// --- NOTIFICACIÓN A ADMINS: Pedido aprobado o rechazado ---
function notifyAdminsOrderStatus(order, isApproved, source = 'sistema') {
    const now = getVEString();
    const statusEmoji = isApproved ? '✅' : '❌';
    const statusText  = isApproved ? 'APROBADO' : 'RECHAZADO';
    const msg =
        `${statusEmoji} *PEDIDO ${statusText}* ${statusEmoji}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *Juego:* ${order.juego ? order.juego.toUpperCase() : 'FREEFIRE'}\n` +
        `👤 *Jugador:* ${order.name}\n` +
        `🆔 *ID/Usuario:* ${order.uid}\n` +
        `💎 *Paquete:* ${order.pack}\n` +
        `💰 *Total:* ${order.price || 'N/A'}\n` +
        `📝 *Referencia:* \`${order.ref}\`\n` +
        `📱 *WA Cliente:* +${order.wa && order.wa !== 'No provisto' ? order.wa : 'No indicado'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 *Fuente:* ${source}\n` +
        `⏰ *Hora:* ${now}`;

    for (const adminNumber of ADMIN_WA_NUMBERS) {
        const adminMsgId = `wa_admin_status_${order.ref}_${isApproved ? 'ok' : 'ko'}_${adminNumber.slice(-4)}`;
        if (whatsappQueue.some(item => item.id === adminMsgId)) continue;

        const waItem = { id: adminMsgId, number: adminNumber, message: msg };
        whatsappQueue.push(waItem);
        supabase.from('ff_wa_queue').insert(waItem)
            .then(({ error }) => {
                if (error && error.code !== '23505') {
                    console.error(`[WA-ADMIN-STATUS] Error encolando para ${adminNumber}:`, error.message);
                }
            });
        console.log(`[WA-ADMIN-STATUS] 📲 Notificación de estado encolada para admin: ${adminNumber} (ref: ${order.ref}, estado: ${statusText})`);
    }
}

// Programa un mensaje de solicitud de calificación 15 min después de una recarga aprobada
const pendingReviewRequests = new Map(); // wa_number -> { uid, name, pack }

function scheduleReviewRequest(order) {
    if (!order.wa || order.wa === 'No provisto') return;
    const delay = 15 * 60 * 1000; // 15 minutos
    setTimeout(() => {
        const reviewId = `wa_review_${order.ref}_${Date.now()}`;
        const msg = `⭐ *¿Cómo fue tu experiencia con RECARGASNEY.COM?* ⭐\n\n` +
                    `Hola *${order.name}*, hace unos minutos recibiste tu recarga de *${order.pack}*. 💎\n\n` +
                    `¿Podrías calificarnos respondiendo con un número del *1 al 5*?\n\n` +
                    `1️⃣ Malo\n2️⃣ Regular\n3️⃣ Bueno\n4️⃣ Muy bueno\n5️⃣ ¡Excelente!\n\n` +
                    `¡Tu opinión nos ayuda a seguir mejorando! 🙏`;

        // Registrar solicitud pendiente por número de WA (válida por 30 min)
        const waKey = order.wa.replace(/\D/g, '');
        pendingReviewRequests.set(waKey, { uid: order.login_uid || order.uid, name: order.name, pack: order.pack });
        setTimeout(() => pendingReviewRequests.delete(waKey), 30 * 60 * 1000); // Expira en 30 min

        const waItem = { id: reviewId, number: order.wa, message: msg };
        whatsappQueue.push(waItem);
        supabase.from('ff_wa_queue').insert(waItem)
            .then(({ error }) => { if (error && error.code !== '23505') console.error('[REVIEW-WA] Error encolando reseña:', error.message); });
        console.log(`[REVIEW-WA] ✅ Solicitud de reseña encolada para ${order.wa} (ref: ${order.ref})`);
    }, delay);
}


function saveUsers() {
    // No-op: se usa saveUser(uid) para guardar usuario individual
}

async function saveUser(uid) {
    const u = users[uid];
    if (!u) return;
    
    const payload = {
        uid, name: u.name, apellido: u.apellido || null, points: u.points, password: u.password || null,
        cedula: u.cedula || null, phone: u.phone || null,
        registered: u.registered, referred_by: u.referred_by || null,
        referral_claimed: u.referral_claimed || false
    };

    let { error } = await supabase.from('ff_users').upsert(payload);
    
    if (error) {
        // Reintentar sin columnas extendidas si no existen en la base de datos (p. ej. PGRST204 o 42703)
        const isColumnError = error.code === '42703' || 
                              error.code === 'PGRST204' || 
                              error.message.includes('cedula') || 
                              error.message.includes('phone') || 
                              error.message.includes('apellido');
                              
        if (isColumnError) {
            console.warn(`[SUPABASE] ⚠️ Columnas extendidas o no existentes (apellido/cédula/teléfono) no existen en ff_users. Reintentando guardar sin ellas para el ID: ${uid}...`);
            const fallbackPayload = {
                uid, name: u.name, points: u.points, password: u.password || null,
                registered: u.registered, referred_by: u.referred_by || null,
                referral_claimed: u.referral_claimed || false
            };
            const retry = await supabase.from('ff_users').upsert(fallbackPayload);
            if (retry.error) {
                console.error('[SUPABASE] ❌ Error crítico al guardar usuario (fallback):', retry.error.message);
            } else {
                console.log(`[SUPABASE] ✅ Usuario ${uid} guardado con éxito (modo fallback).`);
            }
        } else {
            console.error('[SUPABASE] ❌ Error guardando usuario:', error.message);
        }
    }
}

function isUserFullyRegistered(uid) {
    const user = users[uid];
    if (!user) return false;
    // Si tiene contraseña en la cuenta, se considera registrado y apto para ganar puntos.
    // Esto previene que se bloqueen los puntos si las columnas de cédula/teléfono no existen en la base de datos.
    return !!(user.password);
}

async function ensureUserLoaded(uid) {
    if (!users[uid]) {
        try {
            const { data, error } = await supabase
                .from('ff_users')
                .select('*')
                .eq('uid', uid)
                .single();
            if (!error && data) {
                users[uid] = {
                    name: data.name,
                    points: data.points || 0,
                    password: data.password || null,
                    registered: data.registered,
                    referred_by: data.referred_by || null,
                    referral_claimed: data.referral_claimed || false,
                    cedula: data.cedula || null,
                    phone: data.phone || null
                };
                console.log(`[SUPABASE] 📥 Usuario ${uid} cargado dinámicamente en memoria.`);
            } else {
                users[uid] = { name: 'Jugador', points: 0, registered: getVEISO() };
                console.log(`[MEMORIA] 🆕 Usuario ${uid} inicializado en memoria.`);
            }
        } catch (e) {
            console.error(`[SUPABASE] Error cargando usuario ${uid}:`, e.message);
            users[uid] = { name: 'Jugador', points: 0, registered: getVEISO() };
        }
    }
    return users[uid];
}

async function addPoints(uid, amountUsdt, name = null) {
    const userObj = await ensureUserLoaded(uid);
    const pointsToAdd = Math.floor(amountUsdt * 10);
    userObj.points = (userObj.points || 0) + pointsToAdd;
    if (name) {
        const currentName = (userObj.name || '').trim();
        if (!currentName || currentName === 'Jugador' || currentName === '—' || currentName === '-') {
            userObj.name = name;
        }
    }

    // Lógica de Referidos: 10 pts al referrer en la PRIMERA recarga
    if (userObj.referred_by && !userObj.referral_claimed) {
        const referrerUid = userObj.referred_by;
        const referrerObj = await ensureUserLoaded(referrerUid);
        if (referrerObj && isUserFullyRegistered(referrerUid)) {
            referrerObj.points = (referrerObj.points || 0) + 10;
            userObj.referral_claimed = true;
            await saveUser(referrerUid);
            console.log(`[REFERRAL_REWARD] ${referrerUid} gana 10 pts por la 1ra recarga de ${uid}`);

            // Encolar mensaje de WhatsApp para el referidor
            getLastUserWa(referrerUid).then(referrerWa => {
                if (referrerWa) {
                    const refMsgId = `wa_ref_${uid}_reward`;
                    const refTotalUsdt = ((referrerObj.points || 0) * 0.003).toFixed(2);
                    const refMsg = `🎉 *¡FELICIDADES! HAS GANADO CASHBACK* 🎉\n\n` +
                                   `¡Hola! Tu referido con ID *${uid}* ha realizado su primera compra. 🚀\n\n` +
                                   `🎁 *Cashback ganado:* +$0.03 USDT\n` +
                                   `💰 *Tu saldo total:* $${refTotalUsdt} USDT\n\n` +
                                   `¡Sigue compartiendo tu enlace para ganar más premios! 💎✨`;
                    
                    const waItem = { id: refMsgId, number: referrerWa, message: refMsg };
                    whatsappQueue.push(waItem);
                    supabase.from('ff_wa_queue').insert(waItem)
                        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error ref reward:', error.message); });
                    console.log(`[REFERRAL_NOTIFICATION] Encolada notificación de referidos para ${referrerWa}`);
                }
            });

            // Push al referidor
            sendPushToUser(referrerUid, '¡Referido Exitoso! 🎉💎', `Tu referido ${uid} hizo su primera compra. ¡Ganaste +$0.03 USDT de cashback!`, '/icon-192.png', '/');
        }
    }

    await saveUser(uid);
    const earnedUsdtLog = (pointsToAdd * 0.003).toFixed(2);
    const totalUsdtLog = ((userObj.points || 0) * 0.003).toFixed(2);
    console.log(`[PUNTOS] Se añadieron ${pointsToAdd} puntos ($${earnedUsdtLog} USDT) a ID: ${uid}. Total: ${userObj.points} ($${totalUsdtLog} USDT)`);
    
    // Push por cashback acumulado en la recarga
    if (pointsToAdd > 0) {
        sendPushToUser(uid, '💰 ¡Ganaste Cashback! 🎁', `+$${earnedUsdtLog} USDT de cashback (3%). Saldo: $${totalUsdtLog} USDT`, '/icon-192.png', '/');
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

// Paquetes especiales de jadh.shop/producto/freefire-paquetes
const PAQUETES_ESPECIALES = ['basica', 'semanal', 'mensual', 'booyah'];
function isPaqueteEspecial(amountKey) {
    return PAQUETES_ESPECIALES.includes(amountKey.toString().toLowerCase());
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
    if (!order) return;

    const messageId = order.tg_message_id || order.telegram_msg_id;
    const chatId = order.tg_chat_id || process.env.TELEGRAM_CHAT_ID;

    if (!messageId || !chatId) return;

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
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
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
    // Auto-aprobar pedidos de Free Fire y Roblox.
    if (inputShortRef && orders[inputShortRef] && orders[inputShortRef].juego && orders[inputShortRef].juego !== 'freefire' && orders[inputShortRef].juego !== 'roblox') {
        console.log(`[AUTO-APPROVE] ⏭️ Pedido ${inputShortRef} es de juego '${orders[inputShortRef].juego}'. Se requiere aprobación manual.`);
        return false;
    }
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
                
                const { qty, amountKey } = extractPackInfo(order.pack);
                
                // Cambiar estado a processing para bloquear aprobaciones manuales simultáneas
                orders[targetShortRef].status = 'processing';
                
                console.log(`[AUTO-APPROVE] Iniciando recarga automática via Jadh.shop para ${order.uid} | Qty: ${qty}`);
                
                (async () => {
                    let allSuccess = true;
                    let nick = order.name;
                    
                    // Priorizar el nombre registrado del usuario en la base de datos/memoria si existe y no es genérico
                    const registeredUser = users[order.uid];
                    if (registeredUser && registeredUser.name && registeredUser.name !== 'Jugador' && registeredUser.name !== '—' && registeredUser.name !== '-') {
                        nick = registeredUser.name;
                    }
                    
                    let orderIds = [];
                    let pins = [];
                    
                    for (let i = 0; i < qty; i++) {
                        console.log(`[AUTO-APPROVE] Ejecutando recarga ${i+1}/${qty} en Jadh.shop...`);
                        const result = isPaqueteEspecial(amountKey)
                            ? await rechargeViaJadhPaquetes(order.uid, amountKey)
                            : await rechargeViaJadh(order.uid, amountKey, order.juego || 'freefire');
                        if (result.success) {
                            // Solo actualizar el nick si Jadh devuelve un nombre real (no '—', '-' ni vacío)
                            const jadhNick = (result.nickname || '').trim();
                            if (jadhNick && jadhNick !== '—' && jadhNick !== '-' && jadhNick !== '--') nick = jadhNick;
                            if (result.orderId) orderIds.push(result.orderId);
                            if (result.pin) pins.push(result.pin);
                        } else {
                            allSuccess = false;
                            console.error(`[AUTO-APPROVE] Falló recarga ${i+1}/${qty}: ${result.message}`);
                            // Revertimos estado en caso de fallo para permitir intervención manual
                            orders[targetShortRef].status = 'pending';
                            break;
                        }
                    }
                    
                    if (allSuccess) {
                        orders[targetShortRef].status = 'approved';
                        orders[targetShortRef].name = nick;
                        const jadhOrdersStr = orderIds.length > 0 ? orderIds.join(', ') : 'Exitoso';
                        const pinVal = pins.length > 0 ? pins.join(' / ') : null;
                        updateOrderStatus(targetShortRef, 'approved', pinVal || jadhOrdersStr);
                        saveRecent(nick, order.pack);
                        
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) {
                             await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                        }
                        
                        queueWhatsAppMessage({ ...order, name: nick, pin: pinVal }, true, pinVal);
                        notifyAdminsOrderStatus({ ...order, name: nick, ref: targetShortRef, pin: pinVal }, true, 'Auto-Aprobación');
                        updateTelegramStatus(targetShortRef);
                        console.log(`[AUTO-APPROVE] Recarga directa exitosa (Jadh) para ${order.uid}. Órdenes: ${orderIds.join(', ')}`);
                    } else {
                        console.error(`[AUTO-APPROVE] Recarga automática Jadh.shop falló por completo para ID ${order.uid}`);
                        orders[targetShortRef].status = 'failed';
                        updateOrderStatus(targetShortRef, 'failed');
                    }
                })();
                return true;
            } else {
                // No marcamos como usado para que el admin pueda decidir qué hacer
                return false;
            }
        }
    }
    return false;
}

// --- AUTO-APROBACIÓN Y LIMPIADOR AUTOMÁTICO DE PEDIDOS ---
async function runAutoApprovalCycle() {
    const NOW = new Date();
    let changed = false;

    // 1. Obtener pagos recientes de Binance (si hay pedidos pendientes de Free Fire)
    let pendingBinanceOrders = Object.values(orders).filter(o => o.status === 'pending' && o.method === 'binance' && (!o.juego || o.juego === 'freefire'));
    let binanceEmails = [];
    if (pendingBinanceOrders.length > 0) {
        try {
            binanceEmails = await checkBinanceEmails();
        } catch (e) {
            console.error('[AUTO-BINANCE] Error al verificar correos:', e.message);
        }
        if (simulatedBinanceEmails.length > 0) {
            binanceEmails = binanceEmails.concat(simulatedBinanceEmails);
        }
        if (binanceEmails.length > 0) {
            console.log(`[AUTO-BINANCE] 📧 ${binanceEmails.length} correo(s) de pago encontrado(s) (incluyendo simulados).`);
        }
    }

    for (let ref in orders) {
        if (orders[ref].status === 'pending') {
            const orderTime = new Date(orders[ref].time);
            const diffMinutes = (NOW - orderTime) / (1000 * 60);

            if (diffMinutes > 10) {
                console.log(`[AUTO-CLEAN] Rechazando pedido ${ref} por inactividad (10+ min).`);
                orders[ref].status = 'rejected';
                updateOrderStatus(ref, 'rejected');
                changed = true;
                continue;
            }

            // --- AUTO APROBACIÓN BINANCE (ACTIVA) ---
            if (orders[ref].method === 'binance' && binanceEmails.length > 0 && (!orders[ref].juego || orders[ref].juego === 'freefire')) {
                let expectedUsdt = 0;
                try {
                    expectedUsdt = parseFloat(orders[ref].price.split('USDT')[0].trim());
                } catch (e) {}

                if (expectedUsdt > 0) {
                    // Buscar un correo cuyo monto sea igual o mayor al esperado
                    const matchingEmail = binanceEmails.find(email => email.amount >= expectedUsdt);
                    if (matchingEmail) {
                        const emailUidStr = matchingEmail.uid.toString();
                        console.log(`[AUTO-BINANCE] 💰 Pago de ${matchingEmail.amount} USDT encontrado (esperado: ${expectedUsdt} USDT). Procesando pedido ${ref}...`);

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
                            const approved = await processPendingOrder(emailUidStr, ref);
                            if (approved) {
                                // Solo marcar correo como leído si el pedido se aprobó con éxito
                                await markEmailAsRead(matchingEmail.uid);
                                console.log(`[AUTO-BINANCE] ✅ Pedido ${ref} aprobado y correo marcado como leído.`);
                            }
                        } else {
                            // Correo ya usado: marcar de todas formas para limpiar la bandeja
                            await markEmailAsRead(matchingEmail.uid);
                        }

                        // Remover de la lista temporal para no aplicarlo a dos pedidos en el mismo ciclo
                        binanceEmails = binanceEmails.filter(e => e.uid !== matchingEmail.uid);
                    }
                }
            }
        }
    }

    if (changed) {
        console.log('[AUTO-CLEAN] Cambios detectados en pedidos pendientes.');
    }
}
setInterval(async () => {
    try {
        await runAutoApprovalCycle();
    } catch (e) {
        console.error('[AUTO-CYCLE] Error en ciclo:', e.message);
    }
}, 60000); // Se ejecuta cada 60 segundos // Se ejecuta cada 60 segundos
// --- SISTEMA DE AUTENTICACIÓN ADMIN ---

// 🔒 NÚMEROS DE WHATSAPP AUTORIZADOS PARA APROBAR/RECHAZAR
const ADMIN_WA_PHONES = ['04243790757', '04125313735'];

// 🔒 USER IDs DE TELEGRAM AUTORIZADOS (obtener con @userinfobot en Telegram)
// IMPORTANTE: Llenar con los IDs reales de cada administrador
const ADMIN_TELEGRAM_IDS = (
    process.env.ADMIN_TELEGRAM_IDS
        ? process.env.ADMIN_TELEGRAM_IDS.split(',')
              .map(id => parseInt(id.trim()))
              .filter(id => !isNaN(id))
        : []
);

// Helper: verifica si un user_id de Telegram es admin autorizado
function isTelegramAdmin(userId) {
    if (!userId) return false;
    if (ADMIN_TELEGRAM_IDS.length === 0) {
        // Si no hay IDs configurados, bloquear TODO por defecto (seguridad máxima)
        console.warn('[TELEGRAM-AUTH] ⚠️ ADMIN_TELEGRAM_IDS no configurado en .env — todos los clics de Telegram bloqueados.');
        return false;
    }
    return ADMIN_TELEGRAM_IDS.includes(Number(userId));
}

function checkAdminAuth(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let token = parsedUrl.searchParams.get('token');
    
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    
    // Permitir acceso si se provee el header X-WA-Secret con la contraseña de admin
    // Solo el bot de WhatsApp interno lo conoce; valida adicionalmente por IP si es necesario
    const waSecret = req.headers['x-wa-secret'];
    const expectedSecret = process.env.ADMIN_PASS || 'Sneyder12345*#';
    if (waSecret && waSecret === expectedSecret) {
        console.log(`[AUTH] ✅ Acceso autorizado por X-WA-Secret desde ${req.socket.remoteAddress}`);
        return true;
    }
    
    // Validar token contra el guardado en memoria
    if (!token || !settings.admin.session_token || token !== settings.admin.session_token) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconocida';
        console.warn(`[AUTH] 🛑 ACCESO DENEGADO: ${req.method} ${parsedUrl.pathname} | IP: ${ip} | Token recibido: ${token ? token.substring(0,8)+'...' : 'ninguno'}`);
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
        let responseSent = false; // ✅ Guard contra doble respuesta

        const sendResponse = (code, body) => {
            if (responseSent || res.headersSent) return;
            responseSent = true;
            res.writeHead(code);
            res.end(JSON.stringify(body));
        };

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
                    if (responseSent) return;
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

                        // VALIDACIÓN ESTRICTA: solo aceptar si alerta es 'green' (ID real en Garena)
                        const invalidNicknames = ['jugador inválido', 'jugador invalido', 'invalid player', 'not found', ''];
                        const isValidPlayer = data && 
                                              data.alerta === 'green' && 
                                              data.Nickname && 
                                              !invalidNicknames.includes(data.Nickname.toLowerCase().trim());

                        if (isValidPlayer) {
                            const nombre = data.Nickname || data.perfil;
                            console.log(`[OK] ID ${uid} verificado como: ${nombre}`);
                            sendResponse(200, { success: true, nombre: nombre });
                        } else if (currentHostIndex < hosts.length - 1) {
                            console.log(`[!] Falló con ${hostname}, probando con el siguiente...`);
                            currentHostIndex++;
                            attemptRequest(hosts[currentHostIndex]);
                        } else {
                            const mensaje = (data && data.mensaje) ? data.mensaje : 'ID no encontrado en Garena';
                            sendResponse(200, { success: false, mensaje });
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
            if (responseSent) return; // ✅ Guard: evita ERR_HTTP_HEADERS_SENT
            if (currentHostIndex < hosts.length - 1) {
                currentHostIndex++;
                attemptRequest(hosts[currentHostIndex]);
            } else {
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
        const juego = parsedUrl.searchParams.get('juego') || 'freefire';

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
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const ip_address = rawIp.split(',')[0].trim() || 'N/A';

        orders[ref] = { uid, login_uid, name, pack, method, price, status: 'pending', time: currentTime, wa: wa, control_num, ip_address, juego };
        const { error: insertError } = await supabase.from('ff_orders').insert({
            ref, uid, login_uid, name, pack, method, price, status: 'pending', time: currentTime, wa, control_num, ip_address, juego
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

        // --- NOTIFICAR A ADMINS VÍA WHATSAPP ---
        notifyAdminsNewOrder({ uid, login_uid, name, pack, method, price, wa, ref, control_num, juego });

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
                    
                    const tgUserId = callbackQuery.from.id;
                    const tgUsername = callbackQuery.from.username || String(tgUserId);
                    console.log(`[WEBHOOK] 🖱️ CLIC RECIBIDO: Acción=${action} | Ref=${ref} | User=${tgUsername} | ID=${tgUserId}`);

                    // 🔒 VERIFICACIÓN DE IDENTIDAD: Solo admins autorizados pueden aprobar/rechazar
                    if (!isTelegramAdmin(tgUserId)) {
                        console.warn(`[WEBHOOK] 🚫 ACCESO DENEGADO: Usuario ${tgUsername} (ID: ${tgUserId}) NO está en la lista de admins autorizados. Clic ignorado.`);
                        // Notificar al usuario no autorizado directamente
                        const denyPayload = JSON.stringify({
                            callback_query_id: callbackQuery.id,
                            text: '🚫 No tienes permisos para aprobar o rechazar pagos.',
                            show_alert: true
                        });
                        const denyReq = https.request({
                            hostname: 'api.telegram.org',
                            path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(denyPayload) }
                        });
                        denyReq.on('error', () => {});
                        denyReq.write(denyPayload);
                        denyReq.end();
                        return;
                    }
                    console.log(`[WEBHOOK] ✅ Admin autorizado: ${tgUsername} (ID: ${tgUserId})`);

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
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard: [] }
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

                    if (action === 'accept') {
                        // 🔒 DOBLE CANDADO SUPABASE: verificar estado real ANTES de bloquear el pedido
                        // Previene doble recarga si el panel admin o WhatsApp bot aprobaron primero
                        const { data: dbLock } = await supabase.from('ff_orders').select('status').eq('ref', ref).single();
                        if (dbLock && dbLock.status !== 'pending') {
                            console.log(`[WEBHOOK] 🛑 ANTI-DOBLE: ref ${ref} ya tiene estado '${dbLock.status}' en Supabase. Abortando.`);
                            order.status = dbLock.status; // Sincronizar memoria
                            const alreadyDonePayload = JSON.stringify({
                                chat_id: chatId,
                                message_id: messageId,
                                text: `⚠️ *PEDIDO YA PROCESADO*\n\n(Ref: \`${ref}\`) ya fue *${dbLock.status === 'approved' ? '✅ APROBADO' : '❌ RECHAZADO/PROCESADO'}* por otro canal.\n\n_Clic ignorado para evitar doble recarga._`,
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard: [] }
                            });
                            const alreadyDoneReq = https.request({ hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/editMessageText`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(alreadyDonePayload) } });
                            alreadyDoneReq.on('error', () => {});
                            alreadyDoneReq.write(alreadyDonePayload);
                            alreadyDoneReq.end();
                            return;
                        }
                        // Cambiar estado a processing para evitar ejecución simultánea
                        order.status = 'processing';
                        
                        const juego = order.juego || 'freefire';
                        const esAutomatizado = juego === 'freefire' || juego === 'roblox';

                        // ===== JUEGOS NO-AUTOMATIZADOS: Aprobación manual directa desde Telegram =====
                        if (!esAutomatizado) {
                            console.log(`[WEBHOOK] 🎮 Pedido de '${order.juego.toUpperCase()}'. Aprobando manualmente (sin Jadh.shop).`);
                            orders[ref].status = 'approved';
                            updateOrderStatus(ref, 'approved', 'Manual');
                            saveRecent(order.name, order.pack);
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                            queueWhatsAppMessage({ ...order, ref }, true);
                            notifyAdminsOrderStatus({ ...order, ref }, true, 'Telegram (manual)');
                            scheduleReviewRequest({ ...order, ref });
                            sendPushToUser(order.login_uid || order.uid, 'Pedido Aprobado ✅', `¡Tu pedido de ${order.pack} fue aprobado!`, '/icon-192.png', '/historial');
                            updateTelegramStatus(ref);

                            const editPayloadManual = JSON.stringify({
                                chat_id: chatId,
                                message_id: messageId,
                                text: `✅ *APROBADO MANUALMENTE (${order.juego.toUpperCase()})*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID/Usuario:* ${order.uid}\n📦 *Paquete:* ${order.pack}\n\n⚠️ _Recuerda realizar la recarga en la plataforma correspondiente._`,
                                parse_mode: 'Markdown'
                            });
                            const erManual = https.request({ hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/editMessageText`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(editPayloadManual) } });
                            erManual.on('error', () => {});
                            erManual.write(editPayloadManual);
                            erManual.end();
                            return;
                        }

                        // ===== AUTOMÁTICO (FREE FIRE & ROBLOX): Recarga automática via Jadh.shop =====
                        console.log(`[WEBHOOK] 💎 Ejecutando recarga directa via Jadh.shop para ${order.uid}`);
                        
                        (async () => {
                            const { qty, amountKey } = extractPackInfo(order.pack);
                            let allSuccess = true;
                            let nick = order.name;
                            let orderIds = [];
                            let pins = [];
                            
                            let lastError = 'Error de conexión o saldo insuficiente en el proveedor.';
                            for (let i = 0; i < qty; i++) {
                                const result = isPaqueteEspecial(amountKey)
                                    ? await rechargeViaJadhPaquetes(order.uid, amountKey)
                                    : await rechargeViaJadh(order.uid, amountKey, order.juego || 'freefire');
                                if (result.success) {
                                    // Solo actualizar el nick si Jadh devuelve un nombre real (no '—', '-' ni vacío)
                                    const jadhNick = (result.nickname || '').trim();
                                    if (jadhNick && jadhNick !== '—' && jadhNick !== '-' && jadhNick !== '--') nick = jadhNick;
                                    if (result.orderId) orderIds.push(result.orderId);
                                    if (result.pin) pins.push(result.pin);
                                } else {
                                    allSuccess = false;
                                    lastError = result.message || 'Error de conexión o saldo insuficiente en el proveedor.';
                                    console.error(`[WEBHOOK] Falló recarga ${i+1}/${qty}: ${result.message}`);
                                    break;
                                }
                            }
                            
                            let editMessageText = '';
                            if (allSuccess) {
                                orders[ref].status = 'approved';
                                orders[ref].name = nick;
                                const jadhOrdersStr = orderIds.length > 0 ? orderIds.join(', ') : 'Exitoso';
                                const pinVal = pins.length > 0 ? pins.join(' / ') : null;
                                updateOrderStatus(ref, 'approved', pinVal || jadhOrdersStr);
                                saveRecent(nick, order.pack);

                                const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                                if (!isNaN(usdtPrice)) {
                                     await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                                }

                                if (pinVal) {
                                    editMessageText = `✅ *RECARGA GENERADA VÍA PIN (JADH.SHOP)*\n\n👤 *Usuario:* ${nick}\n🆔 *ID/Usuario:* ${order.uid}\n📦 *Paquete:* ${order.pack}\n💰 *Monto:* ${order.price}\n🔑 *PIN:* \`${pinVal}\`\n📝 *Ref:* \`${ref}\`\n\n✨ _PIN enviado al cliente por WhatsApp._`;
                                } else {
                                    editMessageText = `✅ *RECARGA DIRECTA EXITOSA (JADH.SHOP)*\n\n👤 *Jugador:* ${nick}\n🆔 *ID:* ${order.uid}\n💎 *Paquete:* ${order.pack}\n💰 *Monto:* ${order.price}\n📝 *Ref:* \`${ref}\`\n🔢 *Órdenes Jadh:* \`${orderIds.join(', ')}\`\n\n✨ _Acreditado automáticamente en la cuenta del jugador._`;
                                }
                                
                                queueWhatsAppMessage({ ...order, name: nick, ref, pin: pinVal }, true, pinVal);
                                notifyAdminsOrderStatus({ ...order, name: nick, ref, pin: pinVal }, true, 'Telegram (Jadh)');
                                scheduleReviewRequest({ ...order, name: nick, ref });
                                sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes fueron recargados directamente a tu ID!`, '/icon-192.png', '/historial');
                            } else {
                                orders[ref].status = 'pending'; // Revertimos a pending para reintento manual
                                updateOrderStatus(ref, 'pending');
                                editMessageText = `❌ *ERROR EN RECARGA DIRECTA (JADH.SHOP)*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n❌ *Motivo:* ${lastError}\n\n_El pedido volvió a estado pendiente. Revisa manualmente._`;
                                
                                queueWhatsAppMessage({ ...order, ref }, false);
                                sendPushToUser(order.login_uid || order.uid, 'Error en Recarga ❌', `Tuvimos un problema al recargar tus diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
                            }

                            const editPayload = JSON.stringify({
                                chat_id: chatId,
                                message_id: messageId,
                                text: editMessageText,
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
                            editReq.on('error', (err) => console.error('[WEBHOOK] Error editando mensaje final:', err));
                            editReq.write(editPayload);
                            editReq.end();
                        })();
                        
                        return;
                    } else {
                        newText = `❌ *PEDIDO RECHAZADO*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n💰 *Monto:* ${order.price}\n📝 *Ref:* \`${ref}\`\n\n⚠️ _El pago no fue aprobado._`;
                        orders[ref].status = 'rejected';
                        updateOrderStatus(ref, 'rejected');
                        queueWhatsAppMessage({ ...order, ref }, false);
                        notifyAdminsOrderStatus({ ...order, ref }, false, 'Telegram');
                        sendPushToUser(order.login_uid || order.uid, 'Pago Rechazado ❌', `No pudimos verificar tu pago para el pedido de ${order.pack} diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
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
            total_users: Object.values(users).filter(u => u.password || u.points > 0 || u.cedula || u.phone).length,
            total_pines: Object.values(pines).reduce((acc, curr) => acc + curr.length, 0)
        };
        res.writeHead(200);
        res.end(JSON.stringify(stats));
    } else if (parsedUrl.pathname === '/admin/orders/all' && req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('ff_orders')
                .select('ref, control_num, uid, login_uid, name, pack, method, price, status, time, pin, ip_address')
                .order('time', { ascending: false });
            if (error) throw error;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, orders: data || [] }));
        } catch (e) {
            console.error('[ADMIN-ALL-ORDERS] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: 'Error al obtener todas las transacciones' }));
        }
    } else if (parsedUrl.pathname === '/admin/pedidos' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(Object.entries(orders).map(([ref, data]) => ({ ref, ...data }))));
    } else if (parsedUrl.pathname === '/admin/test-binance-payment' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { amount } = JSON.parse(body);
                const parsedAmount = parseFloat(amount);
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'El monto especificado no es válido.' }));
                }

                // Generar un UID simulado de correo único
                const mockUid = `mock-${Date.now()}`;
                simulatedBinanceEmails.push({
                    uid: mockUid,
                    amount: parsedAmount,
                    text: `[SIMULADOR] Has recibido un pago de ${parsedAmount} USDT.`
                });

                console.log(`[SIMULADOR-BINANCE] Pago inyectado de ${parsedAmount} USDT (ID: ${mockUid}). Ejecutando auto-aprobación...`);
                
                // Forzar el ciclo de verificación de inmediato
                await runAutoApprovalCycle();

                res.writeHead(200);
                res.end(JSON.stringify({ 
                    success: true, 
                    message: `Pago simulado de ${parsedAmount} USDT inyectado con éxito. Se ejecutó la auto-aprobación inmediatamente.` 
                }));
            } catch (e) {
                console.error('[SIMULADOR-BINANCE] Error:', e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: 'Error interno en el simulador de pagos.' }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/aprobar' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ref } = JSON.parse(body);
                let targetRef = ref;
                let order = orders[targetRef];
                
                // Si la referencia recibida es corta (ej: 4 dígitos) y no coincide directamente,
                // buscar entre los pedidos pendientes uno que termine con esos dígitos.
                if (!order && ref && ref.length >= 4) {
                    const matches = Object.keys(orders).filter(k => 
                        orders[k].status === 'pending' && k.endsWith(ref)
                    );
                    if (matches.length === 1) {
                        targetRef = matches[0];
                        order = orders[targetRef];
                        console.log(`[ADMIN-RESOLVE] Referencia parcial '${ref}' resuelta a: '${targetRef}'`);
                    } else if (matches.length > 1) {
                        res.writeHead(200);
                        return res.end(JSON.stringify({ 
                            success: false, 
                            message: `Múltiples pedidos pendientes coinciden con '${ref}': ${matches.join(', ')}. Usa la referencia completa.` 
                        }));
                    }
                }
                
                // 🔒 RECUPERACIÓN SUPABASE: Si el pedido no está en memoria, buscarlo en la BD
                if (!order) {
                    const { data: dbOrder } = await supabase.from('ff_orders').select('*').eq('ref', targetRef).single();
                    if (dbOrder) {
                        if (dbOrder.status !== 'pending') {
                            console.log(`[ADMIN-APPROVE] 🛑 BLOQUEADO: pedido ${targetRef} ya está '${dbOrder.status}' en Supabase (no estaba en memoria).`);
                            res.writeHead(200);
                            return res.end(JSON.stringify({ success: false, message: `🚫 Este pedido ya fue ${dbOrder.status === 'approved' ? 'APROBADO' : 'PROCESADO/RECHAZADO'}. No se puede aprobar de nuevo.` }));
                        }
                        // Restaurar pedido pending en memoria
                        orders[targetRef] = { ...dbOrder };
                        order = orders[targetRef];
                        console.log(`[ADMIN-APPROVE] Pedido ${targetRef} restaurado desde Supabase.`);
                    }
                }

                // --- SEGURIDAD: NO APROBAR DOS VECES (memoria) ---
                if (order && order.status !== 'pending') {
                    console.log(`[ALMACEN] ⚠️ Bloqueado re-procesamiento de pedido: ${targetRef} (status actual: ${order.status})`);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: '🚫 Este pedido ya está siendo procesado o fue procesado.' }));
                }

                if (order && order.status === 'pending') {
                    // 🔒 DOBLE CANDADO SUPABASE: verificar estado en BD antes de proceder
                    // Previene race conditions si Telegram o WhatsApp bot aprobaron al mismo tiempo
                    const { data: dbCheck } = await supabase.from('ff_orders').select('status').eq('ref', targetRef).single();
                    if (dbCheck && dbCheck.status !== 'pending') {
                        console.log(`[ADMIN-APPROVE] 🛑 RACE CONDITION BLOQUEADA: ref ${targetRef} ya tiene estado '${dbCheck.status}' en Supabase.`);
                        order.status = dbCheck.status; // Sincronizar memoria
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: false, message: `🚫 Pedido ya procesado (${dbCheck.status}). Otro canal aprobó/rechazó primero. Doble recarga bloqueada.` }));
                    }
                    // Cambiar estado a processing de inmediato para evitar doble click
                    order.status = 'processing';

                    // ===== JUEGOS NO-AUTOMATIZADOS: Aprobación manual directa =====
                    const juego = order.juego || 'freefire';
                    const esAutomatizado = juego === 'freefire' || juego === 'roblox';
                    if (!esAutomatizado) {
                        console.log(`[ADMIN-APPROVE] 🎮 Pedido de '${order.juego.toUpperCase()}'. Aprobando manualmente (sin Jadh.shop).`);
                        orders[targetRef].status = 'approved';
                        updateOrderStatus(targetRef, 'approved', 'Manual');
                        saveRecent(order.name, order.pack);
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                        queueWhatsAppMessage({ ...order, ref: targetRef }, true);
                        notifyAdminsOrderStatus({ ...order, ref: targetRef }, true, 'Panel Admin (manual)');
                        scheduleReviewRequest({ ...order, ref: targetRef });
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅', `¡Tu pedido de ${order.pack} fue aprobado! Recuerda completar tu recarga.`, '/icon-192.png', '/historial');
                        updateTelegramStatus(targetRef);
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: true, resolvedRef: targetRef, message: `Pedido de ${order.juego.toUpperCase()} aprobado manualmente. Recuerda realizar la recarga en la plataforma correspondiente.` }));
                    }

                    // ===== AUTOMÁTICO (FREE FIRE & ROBLOX): Recarga automática via Jadh.shop =====
                    console.log(`[ADMIN-APPROVE] 💎 Iniciando recarga via Jadh.shop para ${order.uid}`);
                    const { qty, amountKey } = extractPackInfo(order.pack);
                    let allSuccess = true;
                    let nick = order.name;
                    let orderIds = [];
                    let pins = [];
                    
                    for (let i = 0; i < qty; i++) {
                        const result = isPaqueteEspecial(amountKey)
                            ? await rechargeViaJadhPaquetes(order.uid, amountKey)
                            : await rechargeViaJadh(order.uid, amountKey, order.juego || 'freefire');
                        if (result.success) {
                            // Solo actualizar el nick si Jadh devuelve un nombre real (no '—', '-' ni vacío)
                            const jadhNick = (result.nickname || '').trim();
                            if (jadhNick && jadhNick !== '—' && jadhNick !== '-' && jadhNick !== '--') nick = jadhNick;
                            if (result.orderId) orderIds.push(result.orderId);
                            if (result.pin) pins.push(result.pin);
                        } else {
                            allSuccess = false;
                            order.status = 'pending'; // Revertimos para permitir reintento manual
                            res.writeHead(200);
                            return res.end(JSON.stringify({ success: false, message: `Error en recarga ${i+1}/${qty}: ${result.message}` }));
                        }
                    }

                    if (allSuccess) {
                        orders[targetRef].status = 'approved';
                        orders[targetRef].name = nick;
                        const jadhOrdersStr = orderIds.length > 0 ? orderIds.join(', ') : 'Exitoso';
                        const pinVal = pins.length > 0 ? pins.join(' / ') : null;
                        updateOrderStatus(targetRef, 'approved', pinVal || jadhOrdersStr);
                        saveRecent(nick, order.pack);
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                        
                        queueWhatsAppMessage({ ...order, ref: targetRef, name: nick, pin: pinVal }, true, pinVal);
                        notifyAdminsOrderStatus({ ...order, ref: targetRef, name: nick, pin: pinVal }, true, 'Panel Admin (Jadh)');
                        scheduleReviewRequest({ ...order, ref: targetRef, name: nick });
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes fueron recargados directamente a tu ID!`, '/icon-192.png', '/historial');
                        updateTelegramStatus(targetRef);
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, resolvedRef: targetRef, message: `Recarga exitosa. Nickname: ${nick}. Órdenes Jadh: ${orderIds.join(', ')}` }));
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
    } else if (parsedUrl.pathname === '/admin/retry-recharge' && req.method === 'POST') {
        // ✅ REINTENTO MANUAL: Para pedidos aprobados sin recarga real o fallidos
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ref, force } = JSON.parse(body);
                
                // Buscar pedido en Supabase si no está en memoria
                let order = orders[ref];
                if (!order) {
                    const { data, error } = await supabase
                        .from('ff_orders')
                        .select('*')
                        .eq('ref', ref)
                        .single();
                    if (error || !data) {
                        res.writeHead(404);
                        return res.end(JSON.stringify({ success: false, message: `Pedido con ref '${ref}' no encontrado.` }));
                    }
                    order = data;
                }

                // Solo permitir reintento en pedidos approved o failed (no pending/rejected)
                if (!force && order.status === 'rejected') {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: `El pedido está rechazado. Usa force:true para forzar reintento.` }));
                }

                const juego = order.juego || 'freefire';
                const esAutomatizado = juego === 'freefire' || juego === 'roblox';
                if (!esAutomatizado) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: `El juego '${juego}' no es automatizable vía Jadh.shop.` }));
                }

                console.log(`[RETRY-RECHARGE] 🔄 Reintentando recarga para ref=${ref} | UID=${order.uid} | Pack=${order.pack} | Juego=${juego}`);

                const { qty, amountKey } = extractPackInfo(order.pack);
                let allSuccess = true;
                let nick = order.name;
                let orderIds = [];
                let pins = [];

                for (let i = 0; i < qty; i++) {
                    const result = isPaqueteEspecial(amountKey)
                        ? await rechargeViaJadhPaquetes(order.uid, amountKey)
                        : await rechargeViaJadh(order.uid, amountKey, juego);
                    if (result.success) {
                        // Solo actualizar el nick si Jadh devuelve un nombre real (no '—', '-' ni vacío)
                        const jadhNick = (result.nickname || '').trim();
                        if (jadhNick && jadhNick !== '—' && jadhNick !== '-' && jadhNick !== '--') nick = jadhNick;
                        if (result.orderId) orderIds.push(result.orderId);
                        if (result.pin) pins.push(result.pin);
                    } else {
                        allSuccess = false;
                        console.error(`[RETRY-RECHARGE] ❌ Falló reintento ${i+1}/${qty}: ${result.message}`);
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: false, message: `Reintento fallido (${i+1}/${qty}): ${result.message}` }));
                    }
                }

                if (allSuccess) {
                    const pinVal = pins.length > 0 ? pins.join(' / ') : null;
                    const jadhOrdersStr = orderIds.length > 0 ? orderIds.join(', ') : 'Exitoso';
                    
                    // Actualizar estado del pedido
                    if (orders[ref]) {
                        orders[ref].status = 'approved';
                        orders[ref].name = nick;
                    }
                    updateOrderStatus(ref, 'approved', pinVal || jadhOrdersStr);
                    saveRecent(nick, order.pack);

                    // Notificar al cliente por WhatsApp
                    queueWhatsAppMessage({ ...order, ref, name: nick, pin: pinVal }, true, pinVal);

                    console.log(`[RETRY-RECHARGE] ✅ Recarga exitosa en reintento para ref=${ref}. Órdenes: ${jadhOrdersStr}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ 
                        success: true, 
                        message: `Reintento exitoso. Nickname: ${nick}. Órdenes Jadh: ${jadhOrdersStr}${pinVal ? '. PIN: ' + pinVal : ''}`,
                        resolvedRef: ref,
                        nick,
                        orderIds,
                        pin: pinVal
                    }));
                }
            } catch (e) {
                console.error('[RETRY-RECHARGE] ❌ Error:', e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: 'Error interno: ' + e.message }));
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
        req.on('end', async () => {
            try {
                const { ref } = JSON.parse(body);
                let targetRef = ref;
                let order = orders[targetRef];
                
                // Si la referencia recibida es corta (ej: 4 dígitos) y no coincide directamente,
                // buscar entre los pedidos pendientes uno que termine con esos dígitos.
                if (!order && ref && ref.length >= 4) {
                    const matches = Object.keys(orders).filter(k => 
                        orders[k].status === 'pending' && k.endsWith(ref)
                    );
                    if (matches.length === 1) {
                        targetRef = matches[0];
                        order = orders[targetRef];
                        console.log(`[ADMIN-RESOLVE] Referencia parcial '${ref}' resuelta a: '${targetRef}'`);
                    } else if (matches.length > 1) {
                        res.writeHead(200);
                        return res.end(JSON.stringify({ 
                            success: false, 
                            message: `Múltiples pedidos pendientes coinciden con '${ref}': ${matches.join(', ')}. Usa la referencia completa.` 
                        }));
                    }
                }

                // 🔒 DOBLE CANDADO SUPABASE: verificar estado real antes de rechazar
                // Previene rechazar lo que ya fue aprobado por otro canal
                if (order || !order) {
                    const { data: dbCheck } = await supabase.from('ff_orders').select('status').eq('ref', targetRef).single();
                    if (dbCheck && dbCheck.status !== 'pending') {
                        console.log(`[ADMIN-REJECT] 🛑 BLOQUEADO: ref ${targetRef} ya está '${dbCheck.status}' en Supabase.`);
                        if (order) order.status = dbCheck.status;
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: false, message: `🚫 Pedido ya procesado (${dbCheck.status}). No se puede rechazar un pedido ya ${dbCheck.status === 'approved' ? 'APROBADO' : 'procesado'}.` }));
                    }
                    if (dbCheck && !order) {
                        // Restaurar en memoria para el rechazo
                        const { data: fullOrder } = await supabase.from('ff_orders').select('*').eq('ref', targetRef).single();
                        if (fullOrder) { orders[targetRef] = { ...fullOrder }; order = orders[targetRef]; }
                    }
                }

                if (order) {
                    orders[targetRef].status = 'rejected';
                    updateOrderStatus(targetRef, 'rejected');
                    queueWhatsAppMessage({ ...orders[targetRef], ref: targetRef }, false);
                    notifyAdminsOrderStatus({ ...orders[targetRef], ref: targetRef }, false, 'Panel Admin');
                    sendPushToUser(orders[targetRef].login_uid || orders[targetRef].uid, 'Pago Rechazado ❌', `No pudimos verificar tu pago para el pedido de ${orders[targetRef].pack} diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
                    updateTelegramStatus(targetRef);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, resolvedRef: targetRef, message: 'Pedido rechazado con éxito.' }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, message: 'Pedido no encontrado.' }));
                }
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: 'Error: ' + e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/send-push' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { target, uid, title, body: msgBody, urlPath } = JSON.parse(body);
                
                if (!title || !msgBody) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Título y mensaje son obligatorios.' }));
                }

                if (!vapidPublicKey || !vapidPrivateKey) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, message: 'Las notificaciones Push (VAPID) no están configuradas en el servidor.' }));
                }

                const payload = JSON.stringify({
                    title: title,
                    body: msgBody,
                    icon: '/icon-192.png',
                    data: { url: urlPath || '/' }
                });

                let query = supabase.from('ff_push_subscriptions').select('*');
                if (target === 'single') {
                    if (!uid) {
                        res.writeHead(400);
                        return res.end(JSON.stringify({ success: false, message: 'Debe especificar el Player ID para enviar una notificación individual.' }));
                    }
                    query = query.eq('uid', uid);
                }

                const { data: subscriptions, error } = await query;

                if (error) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, message: 'Error de base de datos: ' + error.message }));
                }

                if (!subscriptions || subscriptions.length === 0) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: true, sentCount: 0, message: 'No hay dispositivos suscritos para este destinatario.' }));
                }

                let sentCount = 0;
                let promises = subscriptions.map(sub => {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            p256dh: sub.keys_p256dh,
                            auth: sub.keys_auth
                        }
                    };
                    return webPush.sendNotification(pushSubscription, payload)
                        .then(() => {
                            sentCount++;
                        })
                        .catch(async (err) => {
                            console.warn(`[PUSH-MANUAL] Error en endpoint. Código: ${err.statusCode}`);
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                await supabase
                                    .from('ff_push_subscriptions')
                                    .delete()
                                    .eq('id', sub.id);
                            }
                        });
                });

                await Promise.all(promises);

                res.writeHead(200);
                res.end(JSON.stringify({ 
                    success: true, 
                    sentCount: sentCount,
                    message: `Notificación enviada con éxito a ${sentCount} dispositivo(s).` 
                }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/usuarios' && req.method === 'GET') {
        try {
            // Filtrar y devolver únicamente los usuarios reales (con contraseña, puntos o datos de contacto)
            // Esto excluye visitas de consulta temporal de ID y mantiene la coherencia total con el Dashboard.
            const realUsers = {};
            Object.entries(users).forEach(([uid, data]) => {
                if (data.password || data.points > 0 || data.cedula || data.phone) {
                    realUsers[uid] = data;
                }
            });
            res.writeHead(200);
            res.end(JSON.stringify(realUsers));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: 'Error al obtener usuarios' }));
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
                            const adminNewUsdt = ((users[uid].points || 0) * 0.003).toFixed(2);
                            const adminUpdateMsg = `💰 *ACTUALIZACIÓN DE SALDO* 💰\n\n` +
                                                   `¡Hola! Tu saldo de cashback ha sido actualizado por el administrador. ⚙️\n\n` +
                                                   `📊 *Tu nuevo saldo:* $${adminNewUsdt} USDT\n\n` +
                                                   `¡Gracias por formar parte de *RECARGASNEY.COM*! 💎✨`;
                            
                            const waItem = { id: adminUpdateMsgId, number: userWa, message: adminUpdateMsg };
                            whatsappQueue.push(waItem);
                            supabase.from('ff_wa_queue').insert(waItem)
                                .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error admin update message:', error.message); });
                            console.log(`[ADMIN_POINTS_NOTIFICATION] Encolada notificación de ajuste de puntos para ${userWa}`);
                        }
                    });

                    sendPushToUser(uid, 'Saldo Actualizado 💰', `Tu saldo de cashback fue actualizado. Nuevo saldo: $${((users[uid].points || 0) * 0.003).toFixed(2)} USDT`, '/icon-192.png', '/');

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
        if (!uid) {
            res.writeHead(400);
            return res.end(JSON.stringify({ success: false, message: 'Falta uid' }));
        }
        // Primero buscar en memoria; si no está, consultar Supabase directamente
        // sin crear un stub falso (evita logins de usuarios inexistentes)
        let user = users[uid] || null;
        if (!user) {
            try {
                const { data, error } = await supabase
                    .from('ff_users')
                    .select('*')
                    .eq('uid', uid)
                    .single();
                if (!error && data) {
                    users[uid] = {
                        name: data.name,
                        points: data.points || 0,
                        password: data.password || null,
                        registered: data.registered,
                        referred_by: data.referred_by || null,
                        referral_claimed: data.referral_claimed || false,
                        cedula: data.cedula || null,
                        phone: data.phone || null
                    };
                    user = users[uid];
                    console.log(`[SUPABASE] 📥 Usuario ${uid} cargado dinámicamente (check_password).`);
                }
            } catch (e) {
                console.error(`[SUPABASE] Error buscando usuario ${uid} en check_password:`, e.message);
            }
        }
        if (!user) {
            res.writeHead(404);
            return res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
        }
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
                const { uid, name, apellido, cedula, phone, password } = JSON.parse(body);
                
                // Cargar usuario para verificar si ya existe
                const existingUser = await ensureUserLoaded(uid);
                const isNewRegistration = !existingUser || !existingUser.password;
                
                if (!uid || !name || !phone || (isNewRegistration && !password)) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Faltan campos obligatorios (ID, nombre, teléfono y contraseña son requeridos para nuevos registros)' }));
                }
                
                // Si el usuario no existe en memoria, lo creamos
                if (!users[uid]) {
                    users[uid] = { name: name || 'Jugador', points: 0, registered: getVEISO() };
                }
                
                // Guardar los datos completos
                users[uid].name = name;
                users[uid].apellido = apellido || '';
                users[uid].cedula = cedula || users[uid].cedula || '';
                users[uid].phone = phone;
                if (password) {
                    users[uid].password = password;
                }
                
                await saveUser(uid);
                
                const nombreRegistrado = `${users[uid].name} ${users[uid].apellido || ''}`.trim();
                console.log(`[REGISTRO] Usuario registrado con éxito: ID=${uid}, Nombre=${nombreRegistrado}, Teléfono=${phone}`);

                // ─── 🔔 NOTIFICACIÓN PUSH DE BIENVENIDA ──────────────────────
                sendPushToUser(
                    uid,
                    '🎉 ¡Bienvenido a RECARGASNEY.COM!',
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
                        `🔥 *¡BIENVENIDO A RECARGASNEY.COM!* 🔥\n\n` +
                        `¡Hola, *${nombreRegistrado}*! Tu cuenta ha sido creada exitosamente. 🎉\n\n` +
                        `━━━━━━━━━━━━━━━\n` +
                        `👤 *Jugador:* ${nombreRegistrado}\n` +
                        `🆔 *ID Garena:* ${uid}\n` +
                        `━━━━━━━━━━━━━━━\n\n` +
                        `✅ Ya puedes *acumular puntos* en cada recarga y canjearlos por diamantes gratis. 💎\n\n` +
                        `🌐 *Tu tienda:* https://recargasney.com\n\n` +
                        `¡Gracias por unirte a *RECARGASNEY.COM*! 🚀`;

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
                if (newSettings.juegos !== undefined) dbUpdate.juegos = newSettings.juegos;
                
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
            juegos: settings.juegos,
            metodos_pago: settings.metodos_pago,
            whatsapp: settings.whatsapp,
            stock: Object.keys(settings.precios).reduce((acc, amount) => {
                acc[amount] = 99; // Siempre disponible con stock simulado alto
                return acc;
            }, {})
        };
        res.writeHead(200);
        res.end(JSON.stringify(publicConfig));
    } else if (parsedUrl.pathname === '/perfil') {
        const uid = parsedUrl.searchParams.get('uid');
        const ref = parsedUrl.searchParams.get('ref'); // referido por
        if (uid) {
            const userObj = await ensureUserLoaded(uid);
            const isNew = !userObj.password && !userObj.phone;
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, user: userObj, isNew: isNew }));
        } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Falta uid' }));
        }
    } else if (parsedUrl.pathname === '/api/referral' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { referrer_uid, new_uid } = JSON.parse(body);
                // Validar que el nuevo usuario existe y que el referido también
                const referrerObj = await ensureUserLoaded(referrer_uid);
                const newObj = await ensureUserLoaded(new_uid);
                
                if (!referrerObj || !newObj) {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ success: false, message: 'Usuario no encontrado' }));
                }
                // Evitar auto-referido
                if (referrer_uid === new_uid) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'No puedes referirte a ti mismo' }));
                }
                // Evitar doble referido: marcar al nuevo usuario como ya referido
                if (newObj.referred_by) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: false, message: 'Ya fue referido anteriormente' }));
                }
                // Guardar quién lo refirió, pero NO dar puntos todavía
                newObj.referred_by = referrer_uid;
                // Guardar inmediatamente en Supabase para evitar pérdida por reinicios
                await saveUser(new_uid);
                console.log(`[REFERRAL] ${new_uid} vinculado a ${referrer_uid} (Pendiente de 1ra compra)`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'Vinculado correctamente' }));
            } catch (e) { 
                console.error('[REFERRAL] Error:', e.message);
                res.writeHead(400); 
                res.end('Error'); 
            }
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
                
                // Definir costos en puntos
                const pointCosts = { 
                    "100": 500, "310": 1500, "520": 2500,
                    "basica": 400, "semanal": 1500, "booyah": 2300, "mensual": 7500
                };
                const cost = pointCosts[pack];

                if (!cost || user.points < cost) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Puntos insuficientes o paquete inválido' }));
                }

                // Todos los canjes ahora se hacen por recarga directa vía Jadh
                const pointsBefore = Number(user.points);
                user.points = pointsBefore - cost;
                await saveUser(uid);
                const canjeUsdtCost = (cost * 0.003).toFixed(2);
                const canjeUsdtNew = (user.points * 0.003).toFixed(2);
                console.log(`[CANJE] ✅ ÉXITO: Usuario ${uid} canjeó ${cost} pts ($${canjeUsdtCost} USDT) por ${pack}. Balance: ${pointsBefore} -> ${user.points}`);
                
                saveRecent(user.name || uid, pack, 'canje');

                getLastUserWa(uid).then(userWa => {
                    if (userWa) {
                        const redemptionMsgId = `wa_redeem_${uid}_${Date.now()}`;
                        let packLabel = pack.toUpperCase();
                        if(pack === 'basica') packLabel = 'Tarjeta Básica';
                        else if(pack === 'semanal') packLabel = 'Tarjeta Semanal';
                        else if(pack === 'mensual') packLabel = 'Tarjeta Mensual';
                        else if(pack === 'booyah') packLabel = 'Pase Booyah';
                        else packLabel = `${pack} Diamantes`;

                        const redemptionMsg = `💎 *¡CANJE DE CASHBACK EXITOSO!* 💎\n\n` +
                                             `¡Hola! Has canjeado tu cashback por *${packLabel}*. 🚀\n\n` +
                                             `━━━━━━━━━━━━━━━\n` +
                                             `🆔 *ID Garena:* ${uid}\n` +
                                             `📉 *Costo del canje:* -$${canjeUsdtCost} USDT\n` +
                                             `💰 *Tu nuevo saldo:* $${canjeUsdtNew} USDT\n` +
                                             `━━━━━━━━━━━━━━━\n\n` +
                                             `⚡ *Nota:* Esta es una recarga directa. Tu recarga ya se está procesando y llegará a tu cuenta en los próximos minutos.\n\n` +
                                             `¡Gracias por usar *RECARGASNEY.COM*! 🎯🛡️`;
                        
                        const waItem = { id: redemptionMsgId, number: userWa, message: redemptionMsg };
                        whatsappQueue.push(waItem);
                        supabase.from('ff_wa_queue').insert(waItem).catch(() => {});
                    }
                });

                sendPushToUser(uid, '🎁 ¡Canje de Cashback Exitoso!', `Canjeaste $${canjeUsdtCost} USDT por ${pack}. Recarga en proceso.`, '/icon-192.png', '/historial');

                // Lanzar recarga en background usando Jadh
                const jadhService = require('./jadh-service');
                if (typeof isPaqueteEspecial === 'function' && isPaqueteEspecial(pack)) {
                    jadhService.rechargeViaJadhPaquetes(uid, pack).catch(e => console.error('[CANJE_JADH_ESP] Error:', e));
                } else {
                    jadhService.rechargeViaJadh(uid, pack).catch(e => console.error('[CANJE_JADH] Error:', e));
                }

                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: '¡Canje exitoso! Recarga en proceso directo a tu cuenta.' }));
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
                const cleanBody = body.replace(/\r/g, '').trim();
                console.log(`[ADMIN-LOGIN] Body recibido: ${cleanBody}`);
                const { username, password } = JSON.parse(cleanBody);
                console.log(`[ADMIN-LOGIN] Intento de login. Usuario: '${username}' | Pass recibido: '${password}' | Esperado usuario: '${settings.admin.username}' | Esperado pass: '${settings.admin.password}'`);
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
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: false, message: 'Usuario o contraseña incorrectos' }));
                }
            } catch (e) {
                console.error('[ADMIN-LOGIN] Error parseando body:', e.message, '| Body raw:', body);
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, message: 'Error interno: ' + e.message }));
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
    } else if (parsedUrl.pathname === '/api/admin/wa_broadcast_referrals' && req.method === 'POST') {
        if (!checkAdminAuth(req, res)) return;
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { customTemplate } = JSON.parse(body || '{}');
                let enqueued = 0;
                const numbersSet = new Set();
                const queueItems = [];

                // Obtener teléfonos de pedidos aprobados como fallback si el usuario no tiene teléfono en su perfil
                const userPhonesFallback = {};
                try {
                    const { data: ordersData } = await supabase
                        .from('ff_orders')
                        .select('uid, login_uid, wa')
                        .eq('status', 'approved')
                        .not('wa', 'is', null)
                        .neq('wa', '')
                        .neq('wa', 'No provisto');
                    
                    if (ordersData) {
                        for (const o of ordersData) {
                            const targetUid = o.login_uid || o.uid;
                            if (targetUid && o.wa && o.wa.trim() !== '') {
                                userPhonesFallback[targetUid] = o.wa.trim();
                            }
                        }
                    }
                } catch (err) {
                    console.error('[BROADCAST-REFS] Error consultando fallbacks de teléfonos:', err.message);
                }

                let i = 0;
                for (const uid in users) {
                    const u = users[uid];
                    let phone = (u.phone || '').trim();

                    // Fallback si no tiene teléfono en su perfil
                    if (!phone && userPhonesFallback[uid]) {
                        phone = userPhonesFallback[uid];
                    }

                    if (phone && phone !== '') {
                        if (numbersSet.has(phone)) continue;
                        numbersSet.add(phone);

                        const name = u.name || 'Jugador';
                        const referralLink = `https://recargasney.com/?ref=${uid}`;

                        let message = customTemplate;
                        if (!message) {
                            message = `🔥 *¡PROGRAMA DE REFERIDOS RECARGASNEY.COM!* 🔥\n\n` +
                                      `¡Hola, *${name}*! Queremos recordarte que puedes ganar diamantes gratis invitando a tus amigos a recargar con nosotros. 💎🚀\n\n` +
                                      `🎁 *¿Cómo funciona?*\n` +
                                      `1. Comparte tu link único de referido con tus amigos.\n` +
                                      `2. Por cada amigo que ingrese con tu link y realice su primera compra, ¡tú ganas *+$0.03 USDT*! 💰\n` +
                                      `3. Acumula tus puntos y canjéalos por recargas gratis en la página. 🎟️\n\n` +
                                      `🔗 *Tu Link de Referido Único:*\n` +
                                      `${referralLink}\n\n` +
                                      `¡Comparte tu link y empieza a ganar hoy mismo! 🎯🛡️`;
                        } else {
                            message = message
                                .replace(/{name}/g, name)
                                .replace(/{referralLink}/g, referralLink)
                                .replace(/{uid}/g, uid);
                        }

                        // Generar delay aleatorio entre 45 y 90 segundos para evitar bloqueos por spam
                        const randomDelay = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;

                        const waItem = { 
                            id: `broadcast_ref_${Date.now()}_${i++}`, 
                            number: phone, 
                            message,
                            delay: randomDelay
                        };
                        queueItems.push(waItem);
                        enqueued++;
                    }
                }

                // Encolar todos los mensajes
                for (const waItem of queueItems) {
                    whatsappQueue.push(waItem);
                    try {
                        const { error } = await supabase.from('ff_wa_queue').insert(waItem);
                        if (error && error.code !== '23505') {
                            console.error('[BROADCAST-REFS] Error encolando en Supabase:', error.message);
                        }
                    } catch (err) {
                        console.error('[BROADCAST-REFS] Error inesperado encolando en Supabase:', err.message);
                    }
                }

                console.log(`[BROADCAST-REFS] ✅ ${enqueued} mensajes de referidos encolados en total.`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, enqueued }));
            } catch (e) {
                console.error('[BROADCAST-REFS] Error:', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: 'Error procesando solicitud: ' + e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/api/admin/wa_broadcast' && req.method === 'POST') {
        if (!checkAdminAuth(req, res)) return;
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { targetType, targetPhone, message } = JSON.parse(body);
                if (!message) return res.end(JSON.stringify({ success: false, message: 'Mensaje vacío' }));

                let enqueued = 0;
                
                if (targetType === 'single') {
                    if (!targetPhone) return res.end(JSON.stringify({ success: false, message: 'Falta el número de teléfono' }));
                    const waItem = { id: `broadcast_${Date.now()}_single`, number: targetPhone, message };
                    whatsappQueue.push(waItem);
                    supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error) console.error('Supabase wa_queue err:', error.message); });
                    enqueued++;
                } else if (targetType === 'all') {
                    // ═══════════════════════════════════════════════════════════════
                    // BROADCAST MASIVO: Usuarios registrados + Todos los compradores
                    // ═══════════════════════════════════════════════════════════════
                    const numbersSet = new Set(); // Para evitar duplicados

                    // 1. Usuarios registrados que tienen teléfono en su perfil
                    for (const uid in users) {
                        const u = users[uid];
                        if (u.phone && u.phone.trim() !== '') {
                            numbersSet.add(u.phone.trim());
                        }
                    }

                    // 2. Todos los compradores que pusieron su WA en algún pedido aprobado
                    try {
                        const { data: ordersWa, error: ordersErr } = await supabase
                            .from('ff_orders')
                            .select('wa')
                            .eq('status', 'approved')
                            .not('wa', 'is', null)
                            .neq('wa', '')
                            .neq('wa', 'No provisto');

                        if (!ordersErr && ordersWa) {
                            for (const o of ordersWa) {
                                if (o.wa && o.wa.trim() !== '') {
                                    numbersSet.add(o.wa.trim());
                                }
                            }
                            console.log(`[BROADCAST] 🗒️ Compradores encontrados en pedidos: ${ordersWa.length}`);
                        } else if (ordersErr) {
                            console.error('[BROADCAST] Error consultando pedidos para WA:', ordersErr.message);
                        }
                    } catch (dbErr) {
                        console.error('[BROADCAST] Error inesperado consultando ff_orders:', dbErr.message);
                    }

                    console.log(`[BROADCAST] 📲 Enviando mensaje masivo a ${numbersSet.size} números únicos...`);

                    let i = 0;
                    for (const number of numbersSet) {
                        // Generar delay aleatorio entre 45 y 90 segundos (en ms) para evitar bloqueos por spam
                        const randomDelay = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
                        const waItem = { 
                            id: `broadcast_${Date.now()}_${i++}`, 
                            number, 
                            message,
                            delay: randomDelay
                        };
                        whatsappQueue.push(waItem);
                        supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error && error.code !== '23505') console.error('Supabase wa_queue err:', error.message); });
                        enqueued++;
                    }

                    console.log(`[BROADCAST] ✅ ${enqueued} mensajes encolados en total.`);
                }

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, enqueued }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: 'Error procesando solicitud' }));
            }
        });
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

    // ===== REVIEWS API =====
    } else if (parsedUrl.pathname.startsWith('/api/reviews')) {
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
        if (parsedUrl.pathname === '/api/reviews/check' && req.method === 'GET') {
            const waNum = (parsedUrl.searchParams.get('wa') || '').replace(/\D/g, '');
            const pending = pendingReviewRequests.get(waNum);
            if (pending) {
                pendingReviewRequests.delete(waNum); // Consumir una sola vez
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ eligible: true, ...pending }));
            } else {
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ eligible: false }));
            }
        } else if (parsedUrl.pathname === '/api/reviews' && req.method === 'GET') {
            try {
                const { data, error } = await supabase
                    .from('ff_reviews')
                    .select('name, rating, pack, comment, created_at')
                    .gte('rating', 4)
                    .order('created_at', { ascending: false })
                    .limit(30);
                if (error) throw error;
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, reviews: data || [] }));
            } catch (e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        } else if (parsedUrl.pathname === '/api/reviews' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { uid, rating, name, pack } = JSON.parse(body);
                    const stars = parseInt(rating);
                    if (!uid || isNaN(stars) || stars < 1 || stars > 5) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Datos inválidos' }));
                    }
                    const { error } = await supabase.from('ff_reviews').insert({
                        uid,
                        name: name || uid,
                        pack: pack || 'Diamantes',
                        rating: stars,
                        comment: `${stars === 5 ? '¡Excelente servicio!' : stars === 4 ? 'Muy buen servicio' : 'Buen servicio'}`
                    });
                    if (error) throw error;
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        }
    } else {
        // Servir archivos estáticos (index.html, style.css, script.js, etc.)
        let filePath = '.' + parsedUrl.pathname;
        if (filePath === './') filePath = './index.html';

        // --- SEGURIDAD CRÍTICA ---
        // Prevenir directory traversal y bloquear archivos sensibles (.env, .json, scripts backend)
        const normalizedPath = filePath.toLowerCase();
        const basename = path.basename(normalizedPath);
        
        if (
            normalizedPath.includes('..') || 
            basename.startsWith('.') || 
            (basename.endsWith('.json') && basename !== 'manifest.json') || 
            ['server.js', 'whatsapp-bot.js', 'jadh-service.js', 'bdv-service.js', 'binance-service.js', 'email-bot.js', 'redeem-service.js', 'set_webhook.js'].includes(basename)
        ) {
            console.log(`[SECURITY] 🚨 Intento de acceso bloqueado a archivo sensible: ${filePath}`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Access denied: Security Policy' }));
        }

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
        console.log('  RECARGASNEY.COM - Servidor');
        console.log(`  Corriendo en: http://localhost:${PORT}`);
        console.log('  Cargando datos desde Supabase...');
        console.log('=========================================');
        await loadFromSupabase();
        console.log('[SERVER] ✅ Listo para recibir solicitudes.');
    });
}

