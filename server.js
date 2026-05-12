require('dotenv').config();
// DEPLOYMENT TIMESTAMP: 2026-05-10T12:20:00
const http = require('http');
const https = require('https');
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

const BDV_TOKEN = process.env.BDV_TOKEN;
const BDV_PASSWORD = process.env.BDV_PASSWORD;
const BDV_API_URL = 'https://apicentral.pro/apis/movimientos_bdv.jsp';

async function verifyBDVPayment(montoReportado, referencia4) {
    try {
        const urlStr = `${BDV_API_URL}?token=${BDV_TOKEN}&password=${encodeURIComponent(BDV_PASSWORD)}`;
        const response = await new Promise((resolve, reject) => {
            https.get(urlStr, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        if (response.alerta !== 'green' || !Array.isArray(response.movimientos)) return { success: false, pending: true };

        const match = response.movimientos.find(m => {
            if (m.tipo !== 'credito') return false;
            const montoMov = parseFloat(m.monto.replace(/\./g, '').replace(',', '.'));
            const refMov = String(m.referencia || '').slice(-4);
            return Math.abs(montoMov - montoReportado) < 1 && refMov === referencia4;
        });

        return match ? { success: true, movimiento: match } : { success: false, pending: true };
    } catch (e) {
        console.error('[BDV] Error:', e);
        return { success: false, pending: true };
    }
}

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
        password: process.env.ADMIN_PASS || "123" 
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
            usersData.forEach(u => { users[u.uid] = { name: u.name, points: u.points, password: u.password, registered: u.registered, referred_by: u.referred_by, referral_claimed: u.referral_claimed }; });
        }

        // Pedidos Pendientes
        const { data: ordersData } = await supabase.from('ff_orders').select('*').eq('status', 'pending');
        if (ordersData) {
            ordersData.forEach(o => { orders[o.ref] = { ...o, time: o.time }; });
        }
        
        // Configuración
        const { data: settingsData } = await supabase.from('ff_settings').select('*').eq('id', 1).single();
        if (settingsData) {
            settings.tasa_del_dia = parseFloat(settingsData.tasa_del_dia);
            settings.barra_informativa = settingsData.barra_informativa;
            settings.admin.username = settingsData.admin_username;
            settings.admin.password = settingsData.admin_password;
            settings.metodos_pago = settingsData.metodos_pago;
            settings.whatsapp = settingsData.whatsapp_config;
            settings.precios = settingsData.precios;
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
        if (pin) {
            msg += `\n\n⚡ *CANJE SU PIN AQUÍ:* \n` +
                   `Presiona el link de abajo para recibir tus diamantes al instante:\n` +
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
        registered: u.registered, referred_by: u.referred_by || null,
        referral_claimed: u.referral_claimed || false
    });
    if (error) console.error('[SUPABASE] Error guardando usuario:', error.message);
}

function addPoints(uid, amountUsdt, name = null) {
    if (!users[uid]) {
        users[uid] = { name: name || 'Jugador', points: 0, registered: new Date().toISOString() };
    }
    const pointsToAdd = Math.floor(amountUsdt * 10);
    users[uid].points += pointsToAdd;
    if (name) users[uid].name = name;

    // Lógica de Referidos: 15 pts al referrer en la PRIMERA recarga
    if (users[uid].referred_by && !users[uid].referral_claimed) {
        const referrerUid = users[uid].referred_by;
        if (users[referrerUid]) {
            users[referrerUid].points = (users[referrerUid].points || 0) + 15;
            users[uid].referral_claimed = true;
            saveUser(referrerUid);
            console.log(`[REFERRAL_REWARD] ${referrerUid} gana 15 pts por la 1ra recarga de ${uid}`);
        }
    }

    saveUser(uid);
    console.log(`[PUNTOS] Se añadieron ${pointsToAdd} puntos a ID: ${uid}. Total: ${users[uid].points}`);
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

async function getFallbackPin(amount) {
    const amountKey = amount.toString().split(' ')[0].replace(',', '').replace('.', '');
    if (pines[amountKey] && pines[amountKey].length > 0) {
        const pin = pines[amountKey].shift();
        // Marcar como usado en Supabase
        const { error } = await supabase.from('ff_pines').update({ used: true }).eq('code', pin);
        if (error) console.error('[SUPABASE] Error marcando PIN como usado:', error.message);
        return pin;
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

function processPendingOrder(inputFullRef, inputShortRef) {
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

            console.log(`[AUTO-APPROVE] Validando monto -> Recibido: ${pago.amount} Bs | Esperado: ${expectedBs} Bs`);

            // Validación de seguridad: El pago debe ser igual o mayor al esperado (con margen de 0.50 Bs)
            if (pago.amount >= (expectedBs - 0.50)) {
                console.log(`[AUTO-APPROVE] ✅ MONTO CORRECTO. Procediendo...`);
                console.log(`[AUTO-APPROVE] Ref Banco: ${targetFullRef} <--> Ref Formulario: ${targetShortRef}`);
                
                pagosValidados[targetFullRef].used = true;
                savePagos();
                
                rechargeViaNetfreelat(order, targetShortRef).then(result => {
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
                        const pin = getFallbackPin(order.pack);
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
                return true;
            } else {
                console.log(`[AUTO-APPROVE] ❌ MONTO INSUFICIENTE. El pago de ${pago.amount} Bs es menor a lo esperado (${expectedBs} Bs).`);
                // No marcamos como usado para que el admin pueda decidir qué hacer
                return false;
            }
        }
    }
    return false;
}

// --- LIMPIADOR AUTOMÁTICO DE PEDIDOS (Cada 1 minuto) ---
setInterval(() => {
    const NOW = new Date();
    let changed = false;

    for (let ref in orders) {
        if (orders[ref].status === 'pending') {
            const orderTime = new Date(orders[ref].time);
            const diffMinutes = (NOW - orderTime) / (1000 * 60);

            if (diffMinutes > 5) {
                console.log(`[AUTO-CLEAN] Rechazando pedido ${ref} por inactividad (5+ min).`);
                orders[ref].status = 'rejected';
                changed = true;
            }
        }
    }

    if (changed) {
        // En un sistema real, deberías actualizar Supabase para cada pedido cambiado
        // Pero para no saturar, al menos no rompemos el servidor con una variable inexistente
        console.log('[AUTO-CLEAN] Cambios detectados en pedidos pendientes.');
    }
}, 60000); // Se ejecuta cada 60 segundos
// ------------------------------------------------------

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Responder rápido a peticiones OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
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
        const { data: existingOrder } = await supabase.from('ff_orders').select('ref, status').eq('ref', ref).single();
        if (existingOrder) {
            console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado en Supabase: Ref ${ref} (status: ${existingOrder.status})`);
            // Restaurar en memoria para futuros chequeos
            orders[ref] = { status: existingOrder.status };
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
            }));
        }

        // Generar número de control único
        const control_num = `DC-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100).toString().padStart(2, '0')}`;

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
                    } else if (action === 'accept' && orders[ref].status === 'approved') {
                        queueWhatsAppMessage(orderWithRef, true, orders[ref].pin);
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
            return res.end(JSON.stringify({ success: false, hasPassword: true }));
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
    } else if (parsedUrl.pathname === '/admin/settings' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(settings));
    } else if (parsedUrl.pathname === '/admin/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const newSettings = JSON.parse(body);
                settings = { ...settings, ...newSettings };
                // Guardar en Supabase
                const dbUpdate = {};
                if (newSettings.tasa_del_dia !== undefined) dbUpdate.tasa_del_dia = newSettings.tasa_del_dia;
                if (newSettings.barra_informativa !== undefined) dbUpdate.barra_informativa = newSettings.barra_informativa;
                if (newSettings.metodos_pago !== undefined) dbUpdate.metodos_pago = newSettings.metodos_pago;
                if (newSettings.whatsapp !== undefined) dbUpdate.whatsapp_config = newSettings.whatsapp;
                if (newSettings.precios !== undefined) dbUpdate.precios = newSettings.precios;
                if (newSettings.admin) {
                    dbUpdate.admin_username = newSettings.admin.username;
                    dbUpdate.admin_password = newSettings.admin.password;
                }
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
            stock: Object.keys(pines).reduce((acc, amount) => {
                acc[amount] = pines[amount].length > 0;
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
                const { uid, pack } = data;
                const user = users[uid];
                
                // Definir costos en puntos (ejemplo: 100 diamantes = 500 puntos)
                const pointCosts = { "100": 500, "310": 1500, "520": 2500 };
                const cost = pointCosts[pack];

                if (!user || !cost || user.points < cost) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Puntos insuficientes o paquete inválido' }));
                }

                // Intentar recarga (prioridad pines para canje)
                const pin = getFallbackPin(pack);
                if (pin) {
                    const pointsBefore = Number(user.points);
                    user.points = pointsBefore - cost;
                    saveUsers();
                    console.log(`[CANJE] ✅ ÉXITO: Usuario ${uid} canjeó ${cost} puntos. Balance: ${pointsBefore} -> ${user.points}`);
                    
                    // Mostrar en la marquesina (usar nombre si existe o ID)
                    saveRecent(user.name || uid, pack, 'canje');
                    
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

        console.log(`[CANJE_PIN] Intentando canjear PIN ${pin} para ID: ${uid}`);

        const apiUrl = `https://netfreelat.net/redeem/conexion_api/api.php?action=canjefreeFire&id=${encodeURIComponent(uid)}&pin=${encodeURIComponent(pin)}`;

        https.get(apiUrl, (apiRes) => {
            let body = '';
            apiRes.on('data', chunk => body += chunk);
            apiRes.on('end', () => {
                try {
                    let data = body.trim();
                    if (data.startsWith('"') && data.endsWith('"')) {
                        data = data.substring(1, data.length - 1).replace(/\\"/g, '"');
                    }
                    const parsedData = JSON.parse(data);
                    
                    if (parsedData.alerta === 'green') {
                        // Guardar en recientes
                        saveRecent(uid, 'Diamantes', 'canje');
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, message: parsedData.mensaje }));
                    } else {
                        let errorMsg = parsedData.mensaje;
                        // Ocultar referencias a Pago Norte / Netfreelat y hacer el mensaje más amigable
                        if (errorMsg && (errorMsg.includes('Pago Norte') || errorMsg.includes('Netfreelat'))) {
                            errorMsg = 'El PIN ingresado no es válido, ha caducado o ya fue utilizado. Por favor, verifica que lo hayas escrito correctamente e intenta de nuevo.';
                        }
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: false, message: errorMsg }));
                    }
                } catch (e) {
                    console.error('[CANJE_PIN] Error parseando respuesta:', e.message, body);
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, message: 'Error procesando la respuesta del proveedor.' }));
                }
            });
        }).on('error', (err) => {
            console.error('[CANJE_PIN] Error conectando a Netfreelat:', err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: 'Error de conexión con el proveedor.' }));
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
