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

// ============================================================
// LOCAL STORAGE: Programa de Influencers (VPS Direct Files)
// ============================================================
const PATH_INFLUENCERS = path.join(__dirname, 'influencers.json');
const PATH_SUBMISSIONS = path.join(__dirname, 'influencer_submissions.json');
const PATH_PAYMENTS    = path.join(__dirname, 'influencer_payments.json');
const PATH_RATES       = path.join(__dirname, 'influencer_rates.json');

function readJsonFile(filePath, defaultData = []) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
            return defaultData;
        }
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) || defaultData;
    } catch(e) {
        console.error(`[FS-JSON] Error leyendo ${filePath}:`, e.message);
        return defaultData;
    }
}

function writeJsonFile(filePath, data) {
    try {
        const dir = require('path').dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch(e) {
        console.error(`[FS-JSON] Error guardando ${filePath}:`, e.message);
        return false;
    }
}

const defaultRates = [
    { id: 1, label: 'Basico', min_views: 1000, max_views: 4999, diamonds_reward: 50, is_active: true },
    { id: 2, label: 'Intermedio', min_views: 5000, max_views: 9999, diamonds_reward: 150, is_active: true },
    { id: 3, label: 'Popular', min_views: 10000, max_views: 49999, diamonds_reward: 400, is_active: true },
    { id: 4, label: 'Viral', min_views: 50000, max_views: 99999, diamonds_reward: 1000, is_active: true },
    { id: 5, label: 'Mega Viral', min_views: 100000, max_views: null, diamonds_reward: 2500, is_active: true }
];

function initLocalInfluencerStorage() {
    readJsonFile(PATH_INFLUENCERS, []);
    readJsonFile(PATH_SUBMISSIONS, []);
    readJsonFile(PATH_PAYMENTS, []);
    readJsonFile(PATH_RATES, defaultRates);
    console.log('[INFLUENCER-LOCAL] ✅ Almacenamiento local de influencers inicializado en VPS.');
}


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

function normalizeRef(ref) {
    if (!ref) return '';
    const clean = ref.toString().trim().replace(/[^a-zA-Z0-9]/g, '');
    if (/^\d+$/.test(clean)) {
        return clean.replace(/^0+/, '') || '0';
    }
    return clean.toLowerCase();
}

const PATH_STREAMING_CATALOG = path.join(__dirname, 'data', 'streaming_catalog.json');

const defaultStreamingCatalog = [
    { id: 'netflix', name: 'Netflix Ultra HD 4K', desc: 'Perfil privado o Cuenta completa de 1 Mes', icon: 'fa-solid fa-film', color: '#E50914', price: 5.51, badge: 'POPULAR', active: true },
    { id: 'disney', name: 'Disney+ / Star+', desc: 'Acceso a películas, series y deportes en vivo (ESPN)', icon: 'fa-solid fa-clapperboard', color: '#00D2FF', price: 3.20, badge: '', active: true },
    { id: 'max', name: 'Max (HBO Max)', desc: 'Plan Estándar 1 Mes con series exclusivas', icon: 'fa-solid fa-play', color: '#002BE7', price: 2.80, badge: '', active: true },
    { id: 'vix', name: 'ViX Premium', desc: 'Fútbol en vivo, liga mexicana, series y novelas', icon: 'fa-solid fa-tv', color: '#FF5000', price: 2.50, badge: '', active: true },
    { id: 'canva', name: 'Canva Pro', desc: 'Licencia Pro para diseño, kit de marca y plantillas', icon: 'fa-solid fa-paintbrush', color: '#00C4CC', price: 2.00, badge: '', active: true },
    { id: 'spotify', name: 'Spotify Premium', desc: 'Música sin anuncios, descargas e historial ilimitado', icon: 'fa-brands fa-spotify', color: '#1DB954', price: 2.50, badge: '', active: true },
    { id: 'prime', name: 'Prime Video', desc: 'Catálogo de películas y producciones originales', icon: 'fa-solid fa-video', color: '#00A8E1', price: 2.50, badge: '', active: true },
    { id: 'crunchyroll', name: 'Crunchyroll Mega Fan', desc: 'Anime sin anuncios en HD y simuldubs en tiempo real', icon: 'fa-solid fa-masks-theater', color: '#F47521', price: 2.50, badge: '', active: true }
];

function getStreamingCatalog() {
    if (!settings.juegos) settings.juegos = {};
    if (!settings.juegos.streaming_catalog || !Array.isArray(settings.juegos.streaming_catalog) || settings.juegos.streaming_catalog.length === 0) {
        const diskCatalog = readJsonFile(PATH_STREAMING_CATALOG, null);
        if (diskCatalog && Array.isArray(diskCatalog) && diskCatalog.length > 0) {
            settings.juegos.streaming_catalog = diskCatalog;
        } else {
            const defaultCopy = JSON.parse(JSON.stringify(defaultStreamingCatalog));
            if (settings.juegos.streaming_prices) {
                defaultCopy.forEach(item => {
                    if (settings.juegos.streaming_prices[item.id] !== undefined) {
                        item.price = parseFloat(settings.juegos.streaming_prices[item.id]);
                    }
                });
            }
            settings.juegos.streaming_catalog = defaultCopy;
            writeJsonFile(PATH_STREAMING_CATALOG, defaultCopy);
        }
    }
    return settings.juegos.streaming_catalog;
}

function saveStreamingCatalogState(catalog) {
    if (!settings.juegos) settings.juegos = {};
    settings.juegos.streaming_catalog = catalog;
    writeJsonFile(PATH_STREAMING_CATALOG, catalog);
    supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1).then(({ error }) => {
        if (error) console.error('[STREAMING-PERSIST] Error Supabase:', error.message);
    });
}

function areRefsSimilar(ref1, ref2) {
    if (!ref1 || !ref2) return false;
    const r1 = ref1.toString().trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const r2 = ref2.toString().trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    if (!r1 || !r2) return false;
    if (r1 === r2) return true;

    // Normalizar ceros a la izquierda para comparar valor numérico real (ej: "000000969" === "969")
    const n1 = normalizeRef(r1);
    const n2 = normalizeRef(r2);
    if (n1 === n2) return true;

    // Solo considerar fin-con-fin si la menor referencia tiene al menos 3 dígitos significativos
    const minLen = Math.min(n1.length, n2.length);
    if (minLen >= 3 && (n1.endsWith(n2) || n2.endsWith(n1))) {
        return true;
    }

    // Si ambos son puramente numéricos y tienen al menos 6 dígitos significativos, comparar los últimos 6 dígitos
    const isNum1 = /^\d+$/.test(n1);
    const isNum2 = /^\d+$/.test(n2);
    if (isNum1 && isNum2 && n1.length >= 6 && n2.length >= 6) {
        return n1.slice(-6) === n2.slice(-6);
    }

    return false;
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

// =====================================================
// 🏦 BDV AUTO-PAGO — SERVICIO PUPPETEER
// Toggle ON/OFF: bdvAutoApproveEnabled (default: false)
// Los pagos manuales funcionan igual, esto es ADITIVO.
// =====================================================
const { bdvLogin, verificarPagoBDV, getBDVStatus, closeBDVBrowser } = require('./bdv-service.js');

// 🔴 DESACTIVADO por defecto — activar desde el panel admin o con POST /admin/bdv-config
let bdvAutoApproveEnabled = false;
let bdvAutoApproveRunning = false; // mutex para evitar ciclos superpuestos

// 💛 BINANCE PAY AUTO-APROBACIÓN
// Toggle ON/OFF: binanceAutoApproveEnabled (default: true — se activa automáticamente)
let binanceAutoApproveEnabled = true;
let binanceAutoApproveRunning = false; // mutex para evitar ciclos superpuestos

// Wrapper de verificación BDV (sin token, Puppeteer maneja la sesión internamente)
async function verifyBDVPayment(montoReportado, referencia4) {
    try {
        return await verificarPagoBDV(montoReportado, referencia4);
    } catch (e) {
        console.error('[BDV] Error en verifyBDVPayment:', e.message);
        return { success: false, checked: false, pending: true };
    }
}

const { checkBinanceEmails, markEmailAsRead: originalMarkEmailAsRead } = require('./binance-service.js');
let simulatedBinanceEmails = [];
const markEmailAsRead = async (uid) => {
    if (typeof uid === 'string' && uid.startsWith('mock-')) {
        console.log(`[BINANCE] Pago simulado ${uid} procesado.`);
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

// --- LÓGICA DE SORTEO SEMANAL DE REFERIDOS (Reinicio Domingo 9:00 PM VET) ---
function getWeeklyCycleTimes() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Caracas',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    
    const y = parseInt(map.year);
    const m = parseInt(map.month) - 1;
    const d = parseInt(map.day);
    const h = parseInt(map.hour);

    const vetDate = new Date(Date.UTC(y, m, d, h, parseInt(map.minute), parseInt(map.second)));
    const dayOfWeek = vetDate.getUTCDay(); // 0 = Domingo

    let daysToSubtract = dayOfWeek;
    if (dayOfWeek === 0 && h < 21) {
        daysToSubtract = 7;
    }

    const lastSundayDate = new Date(Date.UTC(y, m, d));
    lastSundayDate.setUTCDate(lastSundayDate.getUTCDate() - daysToSubtract);

    // 21:00 VET = 01:00 UTC del día siguiente
    const startOfCycle = new Date(Date.UTC(lastSundayDate.getUTCFullYear(), lastSundayDate.getUTCMonth(), lastSundayDate.getUTCDate() + 1, 1, 0, 0, 0));
    const endOfCycle = new Date(startOfCycle.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
        startOfCycleISO: startOfCycle.toISOString(),
        endOfCycleISO: endOfCycle.toISOString(),
        endOfCycleTimestamp: endOfCycle.getTime()
    };
}

function getWeeklyRaffleData() {
    const cycle = getWeeklyCycleTimes();
    const startIso = cycle.startOfCycleISO;
    const endIso = cycle.endOfCycleISO;
    const startTimestamp = new Date(startIso).getTime();

    // Timestamp de reseteo: El conteo de boletos se limita SIEMPRE al inicio del ciclo activo actual o al último reseteo (el que sea mayor)
    const lastResetIso = (settings.sorteo_semanal && settings.sorteo_semanal.lastResetTimestamp) ? settings.sorteo_semanal.lastResetTimestamp : null;
    const lastResetTs = lastResetIso ? new Date(lastResetIso).getTime() : 0;
    
    // Inicio efectivo para contar boletos: NUNCA se arrastran boletos de semanas o sorteos anteriores
    const effectiveStartTs = Math.max(startTimestamp, lastResetTs);

    const referrerCounts = {};
    Object.values(users).forEach(u => {
        if (u.referred_by) {
            const refTime = u.referred_at ? new Date(u.referred_at).getTime() : (u.registered ? new Date(u.registered).getTime() : 0);
            if (refTime >= effectiveStartTs) {
                const refUid = u.referred_by;
                referrerCounts[refUid] = (referrerCounts[refUid] || 0) + 1;
            }
        }
    });

    const participants = [];
    const ticketList = [];

    Object.entries(referrerCounts).forEach(([uid, count]) => {
        const tickets = Math.floor(count / 2); // 1 ticket por cada 2 referidos nuevos en el ciclo activo
        if (tickets > 0) {
            const userObj = users[uid] || {};
            let name = (userObj.name || '').trim();
            if (!name || name === 'Jugador' || name === '—' || name === '-') name = `ID: ${uid}`;
            
            participants.push({ uid, name, referrals: count, tickets });
            for (let i = 0; i < tickets; i++) {
                ticketList.push({ uid, name });
            }
        }
    });

    participants.sort((a, b) => b.tickets - a.tickets);

    const premioText = (settings.sorteo_semanal && settings.sorteo_semanal.premio) ? settings.sorteo_semanal.premio : (settings.juegos && settings.juegos.sorteo_semanal && settings.juegos.sorteo_semanal.premio ? settings.juegos.sorteo_semanal.premio : '341 Diamantes');
    let lastWinner = (settings.sorteo_semanal && settings.sorteo_semanal.lastWinner) ? settings.sorteo_semanal.lastWinner : (settings.juegos && settings.juegos.sorteo_semanal ? settings.juegos.sorteo_semanal.lastWinner : null);

    // Si aún no está en memoria, asegurar que sorteo_semanal esté sincronizado
    if (lastWinner && !settings.sorteo_semanal) {
        settings.sorteo_semanal = { ...settings.juegos.sorteo_semanal };
    }

    return {
        success: true,
        premio: premioText,
        startOfCycle: startIso,
        endOfCycle: endIso,
        endOfCycleTimestamp: cycle.endOfCycleTimestamp,
        participants,
        ticketList,
        totalTickets: ticketList.length,
        lastWinner
    };
}

async function executeWeeklyDraw(forcedUid = null, isAutoCron = false) {
    const data = getWeeklyRaffleData();
    const ticketList = data.ticketList || [];
    if (ticketList.length === 0) {
        if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
        if (isAutoCron) {
            settings.sorteo_semanal.lastCycleProcessed = data.endOfCycle;
            settings.sorteo_semanal.lastResetTimestamp = new Date().toISOString();
        }
        if (settings.juegos) settings.juegos.sorteo_semanal = settings.sorteo_semanal;
        try { await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1); } catch (e) {}
        return { success: false, message: 'No hay participantes con boletos para el sorteo.' };
    }

    let winnerTicket = null;
    if (forcedUid) {
        winnerTicket = ticketList.find(t => t.uid === String(forcedUid));
    }
    if (!winnerTicket) {
        const winIdx = Math.floor(Math.random() * ticketList.length);
        winnerTicket = ticketList[winIdx];
    }

    const winnerObj = {
        uid: winnerTicket.uid,
        name: winnerTicket.name || winnerTicket.uid,
        premio: data.premio || '341 Diamantes',
        cycleEnd: data.endOfCycle,
        timestamp: new Date().toISOString(),
        ticketList: ticketList
    };

    if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
    settings.sorteo_semanal.lastWinner = winnerObj;
    
    // Marcar el reseteo del sorteo para limpiar los boletos anteriores y comenzar el nuevo ciclo desde 0
    settings.sorteo_semanal.lastCycleProcessed = data.endOfCycle;
    settings.sorteo_semanal.lastResetTimestamp = new Date().toISOString();

    if (settings.juegos) {
        delete settings.juegos.sorteo_semanal;
        delete settings.juegos.ruleta_history;
        delete settings.juegos.ruleta;
    }
    if (!settings.juegos) settings.juegos = {};
    settings.juegos.sorteo_semanal = settings.sorteo_semanal;

    try { await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1); } catch (e) {}

    // 🔒 Respaldo local: guardar ganador en archivo para sobrevivir reinicios
    try {
        const backupPath = path.join(__dirname, 'winner_backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(winnerObj, null, 2), 'utf8');
        console.log('[SORTEO] 💾 Ganador respaldado en winner_backup.json');
    } catch (backupErr) {
        console.error('[SORTEO] ⚠️ No se pudo guardar respaldo local del ganador:', backupErr.message);
    }

    console.log(`[SORTEO] 🏆 Ganador del sorteo semanal seleccionado: ${winnerObj.name} (${winnerObj.uid}) - Premio: ${winnerObj.premio} (Modo: ${isAutoCron ? 'Automático Domingo' : 'Prueba Admin'})`);

    // Enviar push al ganador
    sendPushToUser(winnerObj.uid, '🏆 ¡GANASTE EL SORTEO SEMANAL!', `¡Felicidades! Ganaste el sorteo semanal: ${winnerObj.premio}. El admin se contactará por WhatsApp.`, '/icon-192.png', '/');

    // Registrar en marquesina de recientes
    try {
        await supabase.from('ff_recientes').insert({
            name: winnerObj.name,
            pack: `🏆 Ganó Sorteo Semanal: ${winnerObj.premio}`,
            type: 'sorteo',
            time: new Date().toLocaleTimeString('es-VE')
        });
    } catch (e) {}

    return { success: true, winner: winnerObj };
}

// Tarea periódica para revisar y ejecutar el sorteo semanal automáticamente
setInterval(async () => {
    try {
        const cycle = getWeeklyCycleTimes();
        const now = Date.now();
        const lastProcessed = settings.sorteo_semanal ? settings.sorteo_semanal.lastCycleProcessed : null;
        if (now >= cycle.endOfCycleTimestamp && lastProcessed !== cycle.endOfCycleISO) {
            console.log('[SORTEO-CRON] ⏰ Ciclo semanal finalizado. Ejecutando sorteo automático del Domingo...');
            await executeWeeklyDraw(null, true);
        }
    } catch (e) {
        console.error('[SORTEO-CRON] Error en la verificación automática:', e.message);
    }
}, 60000);

function getCaracasDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    return {
        year: parseInt(map.year),
        month: parseInt(map.month) - 1,
        day: parseInt(map.day)
    };
}

function getOrderProfit(order, tasa) {
    const priceStr = (order.price || '').toString().trim();
    let saleUsdt = 0;
    let saleBs   = 0;
    if (priceStr.includes('/')) {
        const parts = priceStr.split('/');
        saleUsdt = parseFloat(parts[0].replace(/usdt/i, '').trim()) || 0;
        saleBs   = parseFloat(parts[1].replace(/bs/i, '').trim()) || 0;
    } else if (priceStr.toUpperCase().includes('USDT')) {
        saleUsdt = parseFloat(priceStr.replace(/usdt/i, '').trim()) || 0;
        saleBs   = saleUsdt * tasa;
    } else if (priceStr.toUpperCase().includes('BS')) {
        saleBs   = parseFloat(priceStr.replace(/bs/i, '').trim()) || 0;
        saleUsdt = saleBs / tasa;
    } else {
        const val = parseFloat(priceStr) || 0;
        if (order.method === 'binance') {
            saleUsdt = val;
            saleBs   = saleUsdt * tasa;
        } else {
            saleBs   = val;
            saleUsdt = saleBs / tasa;
        }
    }

    const packKey = (order.pack || '').toString().split(' ')[0].replace(',','').trim();
    const costUsdt = getItemCost(order.juego, packKey);
    const costBs = costUsdt * tasa;

    const profitUsdt = saleUsdt - costUsdt;
    const profitBs = saleBs - costBs;

    return { saleUsdt, saleBs, costUsdt, costBs, profitUsdt, profitBs };
}

async function getTodayAccumulatedProfit(tasa) {
    const now = new Date();
    const partsVE = getCaracasDateParts(now);
    const startOfToday = new Date(Date.UTC(partsVE.year, partsVE.month, partsVE.day, 4, 0, 0, 0));

    const { data: todayOrders, error } = await supabase
        .from('ff_orders')
        .select('price, pack, method, time')
        .eq('status', 'approved')
        .gte('time', startOfToday.toISOString());

    if (error) {
        console.error('[ACCUMULATED-PROFIT] Error querying today orders:', error.message);
        return { profitUsdt: 0, profitBs: 0 };
    }

    let totalProfitUsdt = 0;
    let totalProfitBs = 0;

    if (todayOrders) {
        for (const o of todayOrders) {
            const { profitUsdt, profitBs } = getOrderProfit(o, tasa);
            totalProfitUsdt += profitUsdt;
            totalProfitBs += profitBs;
        }
    }

    return { profitUsdt: totalProfitUsdt, profitBs: totalProfitBs };
}

async function sendAdminProfitNotification(order) {
    try {
        const tasa = settings.tasa_del_dia || 1;
        const { profitUsdt, profitBs } = getOrderProfit(order, tasa);
        const todayProfit = await getTodayAccumulatedProfit(tasa);

        const nowStr = getVEString();
        const msg =
            `💰 *REPORTE DE GANANCIA* 💰\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🎮 *Juego:* ${order.juego ? order.juego.toUpperCase() : 'FREEFIRE'}\n` +
            `👤 *Jugador:* ${order.name}\n` +
            `💎 *Paquete:* ${order.pack}\n` +
            `💵 *Precio:* ${order.price}\n` +
            `📊 *Ganancia de esta recarga:*\n` +
            `   • *USDT:* $${profitUsdt.toFixed(2)}\n` +
            `   • *Bs:* ${profitBs.toFixed(2)} Bs.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📈 *Acumulado de hoy:*\n` +
            `   • *USDT:* $${todayProfit.profitUsdt.toFixed(2)}\n` +
            `   • *Bs:* ${todayProfit.profitBs.toFixed(2)} Bs.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⏰ *Hora:* ${nowStr}`;

        const adminNum = '584243790757';
        const msgId = `wa_admin_profit_${order.ref}`;
        
        if (whatsappQueue.some(item => item.id === msgId)) return;

        const waItem = { id: msgId, number: adminNum, message: msg };
        whatsappQueue.push(waItem);
        await supabase.from('ff_wa_queue').insert(waItem);
        console.log(`[PROFIT-NOTIFY] ✅ Reporte de ganancia encolado para admin ${adminNum} (ref: ${order.ref})`);
    } catch (e) {
        console.error('[PROFIT-NOTIFY] Error en sendAdminProfitNotification:', e.message);
    }
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
let waContacts = {};

function normalizePhone(num) {
    if (!num) return null;
    let clean = num.toString().replace(/\D/g, '');
    if (!clean) return null;
    if (clean.startsWith('0')) {
        clean = '58' + clean.substring(1);
    } else if (!clean.startsWith('58') && clean.length === 10) {
        clean = '58' + clean;
    }
    if (clean.length < 8 || clean.length > 15) return null;
    return clean;
}

async function saveWaContact(phone, name, uid = null, source = 'web', activityTime = null) {
    const clean = normalizePhone(phone);
    if (!clean) return;

    const existing = waContacts[clean] || {};
    const now = new Date().toISOString();
    const targetTime = activityTime || now;

    let finalName = existing.name || 'Cliente';
    if (name && name !== 'Cliente' && name !== 'Jugador' && name !== '—' && name !== '-') {
        finalName = name;
    }

    // Preservar la fecha real de actividad del pedido o usuario
    let lastSeen = existing.last_seen;
    if (activityTime) {
        if (!lastSeen || new Date(activityTime) > new Date(lastSeen)) {
            lastSeen = activityTime;
        }
    } else {
        lastSeen = lastSeen || now;
    }

    const contactObj = {
        phone: clean,
        name: finalName,
        uid: uid || existing.uid || null,
        source: existing.source || source,
        orders_count: (existing.orders_count || 0) + (source === 'web_order' ? 1 : 0),
        last_seen: lastSeen,
        created_at: existing.created_at || targetTime
    };

    waContacts[clean] = contactObj;

    if (supabase) {
        try {
            await supabase.from('ff_wa_contacts').upsert(contactObj, { onConflict: 'phone' });
        } catch (_) {}
    }
}
const JADH_COSTS = {
    '100':  0.73,   // 110  💎 (Costo proveedor)
    '310':  2.18,   // 341  💎 (Costo proveedor)
    '520':  3.68,   // 572  💎 (Costo proveedor)
    '1060': 6.84,   // 1166 💎 (Costo proveedor)
    '2180': 13.58,  // 2376 💎 (Costo proveedor)
    '5600': 34.56,  // 6138 💎 (Costo proveedor)
    'basica':  0.67,   // Tarjeta Básica
    'semanal': 2.61,   // Tarjeta Semanal
    'mensual': 12.54,  // Tarjeta Mensual
    'booyah':  4.00,   // Pase Booyah
    'roblox_10': 9.55, // PIN Roblox 10 USD
    '10': 9.55,        // Fallback Roblox 10 USD
    'bs_100':  0.77,   // Bloodstrike 100+5 (Costo proveedor)
    'bs_300':  2.35,   // Bloodstrike 300+20 (Costo proveedor)
    'bs_500':  3.85,   // Bloodstrike 500+40 (Costo proveedor)
    'bs_1000': 7.81,   // Bloodstrike 1000+100 (Costo proveedor)
    'bs_2000': 15.34,  // Bloodstrike 2000+260 (Costo proveedor)
    'bs_5000': 38.04,  // Bloodstrike 5000+800 (Costo proveedor)
    'ml_51':   0.90,   // MLBB 51+5
    'ml_102':  1.85,   // MLBB 102+10
    'ml_253':  4.69,   // MLBB 253+25
    'ml_505':  9.33,   // MLBB 505+66
    'ml_1010': 18.94,  // MLBB 1010+182
    'ml_1515': 28.60   // MLBB 1515+273
};

function getItemCost(juego, packKey) {
    const key = (packKey || '').toString().split(' ')[0].replace(',','').trim();
    if (juego === 'roblox') {
        return JADH_COSTS['roblox_' + key] || JADH_COSTS[key] || 9.55;
    }
    if (juego === 'bloodstrike') {
        return JADH_COSTS['bs_' + key] || JADH_COSTS[key] || 0;
    }
    if (juego === 'mobilelegends' || juego === 'mobilelegendsus') {
        return JADH_COSTS['ml_' + key] || JADH_COSTS[key] || 0;
    }
    return JADH_COSTS[key] || 0;
}

const defaultPublicidades = [
    { imagen: "img/Geminianiversario.png", link: "" },
    { imagen: "img/11.png", link: "" },
    { imagen: "img/Gemini_Generated_Image_s5ynsos5ynsos5yn.png", link: "" }
];

let settings = {
    tasa_del_dia: 812.00,
    barra_informativa: "🔥 ¡Bienvenidos a RECARGASNEY.COM! 💎",
    precios: {
        "100":     { "usdt": 0.86,  "label": "100 + 10 Diamantes" },
        "310":     { "usdt": 2.90,  "label": "310 + 31 Diamantes" },
        "520":     { "usdt": 4.15,  "label": "520 + 52 Diamantes" },
        "1060":    { "usdt": 7.50,  "label": "1060 + 106 Diamantes" },
        "2180":    { "usdt": 14.56, "label": "2180 + 218 Diamantes" },
        "5600":    { "usdt": 35.80, "label": "5600 + 560 Diamantes" },
        "basica":  { "usdt": 0.80,  "label": "🃏 Tarjeta Básica" },
        "semanal": { "usdt": 3.00,  "label": "📅 Tarjeta Semanal" },
        "mensual": { "usdt": 14.01, "label": "👑 Tarjeta Mensual" },
        "booyah":  { "usdt": 5.01,  "label": "🏆 Pase Booyah" }
    },
    juegos: {
        "freefire": {
            "nombre": "Free Fire",
            "inputLabel": "ID de Jugador",
            "inputPlaceholder": "Ej: 123456789",
            "icono": "fa-fire",
            "paquetes": {
                "100": { "usdt": 0.90, "label": "100 Diamantes" },
                "310": { "usdt": 2.85, "label": "310 Diamantes" }
            }
        },
        "roblox": {
            "nombre": "Roblox",
            "inputLabel": "Usuario / ID de Roblox",
            "inputPlaceholder": "Ej: MiUsuario123",
            "icono": "fa-gamepad",
            "paquetes": {
                "10": { "usdt": 10.00, "label": "10 USD" }
            }
        },
        "bloodstrike": {
            "nombre": "Blood Strike",
            "inputLabel": "ID de Jugador",
            "inputPlaceholder": "Ej: 123456789",
            "icono": "fa-skull-crossbones",
            "paquetes": {
                "100":  { "usdt": 1.00,  "label": "100 + 5 🪙 Monedas" },
                "300":  { "usdt": 2.80,  "label": "300 + 20 🪙 Monedas" },
                "500":  { "usdt": 4.50,  "label": "500 + 40 🪙 Monedas" },
                "1000": { "usdt": 9.00,  "label": "1.000 + 100 🪙 Monedas" },
                "2000": { "usdt": 17.50, "label": "2.000 + 260 🪙 Monedas" },
                "5000": { "usdt": 42.00, "label": "5.000 + 800 🪙 Monedas" }
            }
        },
        "mobilelegends": {
            "nombre": "Mobile Legends US",
            "inputLabel": "ID de Jugador (User ID y Zone ID)",
            "inputPlaceholder": "Ej: 12345678 (1234)",
            "icono": "fa-shield-halved",
            "paquetes": {
                "51":   { "usdt": 0.95,  "label": "51 + 5 💎 Diamantes" },
                "102":  { "usdt": 1.90,  "label": "102 + 10 💎 Diamantes" },
                "253":  { "usdt": 4.75,  "label": "253 + 25 💎 Diamantes" },
                "505":  { "usdt": 9.40,  "label": "505 + 66 💎 Diamantes" },
                "1010": { "usdt": 19.00, "label": "1010 + 182 💎 Diamantes" },
                "1515": { "usdt": 29.50, "label": "1515 + 273 💎 Diamantes" }
            }
        }
    },
    admin: { 
        username: process.env.ADMIN_USER || "admin", 
        password: process.env.ADMIN_PASS || "123",
        session_token: null
    },
    metodos_pago: { pagomovil: { banco: "", telefono: "", cedula: "" }, binance: { id: "", nombre: "" } },
    whatsapp: { soporte: "584125322412", bot: "584123491068", canal: "" },
    publicidades: defaultPublicidades,
    sorteo_semanal: { premio: "341 Diamantes", lastWinner: null }
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

        // Contactos WhatsApp (ff_wa_contacts + backfill automático desde ff_orders y ff_users)
        try {
            const { data: contactsData } = await supabase.from('ff_wa_contacts').select('*');
            if (contactsData) {
                contactsData.forEach(c => { if (c.phone) waContacts[c.phone] = c; });
            }
        } catch (_) {}

        // Sincronizar números de TODOS los pedidos históricos (ff_orders) y usuarios (ff_users)
        try {
            const { data: allOrdersWA } = await supabase.from('ff_orders').select('uid, name, wa, time').not('wa', 'is', null);
            if (allOrdersWA) {
                allOrdersWA.forEach(o => {
                    if (o.wa && o.wa !== 'No provisto') saveWaContact(o.wa, o.name, o.uid || null, 'web_order', o.time);
                });
            }
        } catch (e) {
            console.error('[SUPABASE] Error cargando números históricos de ff_orders:', e.message);
        }

        Object.values(users).forEach(u => {
            if (u.phone) saveWaContact(u.phone, u.name, u.uid || null, 'web_user');
        });
        console.log(`[SUPABASE] 📇 ${Object.keys(waContacts).length} contactos de WhatsApp sincronizados.`);
        
        // Configuración
        const { data: settingsData, error: settingsError } = await supabase
            .from('ff_settings')
            .select('*')
            .eq('id', 1)
            .single();
        if (settingsError) {
            console.error('[SUPABASE] ❌ Error cargando settings:', settingsError.message);
            // 🔒 Intentar recuperar el ganador desde respaldo local
            try {
                const backupPath = path.join(__dirname, 'winner_backup.json');
                if (fs.existsSync(backupPath)) {
                    const backupWinner = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                    if (backupWinner && backupWinner.name) {
                        if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
                        settings.sorteo_semanal.lastWinner = backupWinner;
                        console.log(`[SORTEO] 🔄 Ganador recuperado desde respaldo local: ${backupWinner.name} (${backupWinner.uid})`);
                    }
                }
            } catch (bErr) {
                console.error('[SORTEO] ⚠️ No se pudo leer respaldo local del ganador:', bErr.message);
            }
        } else if (settingsData) {
            settings.tasa_del_dia = parseFloat(settingsData.tasa_del_dia);
            settings.barra_informativa = settingsData.barra_informativa;
            if (!settings.admin) settings.admin = { username: 'admin', password: 'Sneyder12345*#' };
            settings.admin.username = settingsData.admin_username || settings.admin.username || 'admin';
            settings.admin.password = settingsData.admin_password || settings.admin.password || 'Sneyder12345*#';
            if (settingsData.admin_session_token) {
                settings.admin.session_token = settingsData.admin_session_token;
            }
            settings.metodos_pago = settingsData.metodos_pago;
            settings.whatsapp = settingsData.whatsapp_config;
            settings.publicidades = (settings.whatsapp && settings.whatsapp.publicidades && settings.whatsapp.publicidades.length > 0) ? settings.whatsapp.publicidades : (settingsData.publicidades && settingsData.publicidades.length > 0 ? settingsData.publicidades : defaultPublicidades);
            // Cargar precios y juegos directamente desde Supabase (source of truth)
            if (settingsData.precios && Object.keys(settingsData.precios).length > 0) {
                settings.precios = settingsData.precios;
            }
            if (settingsData.juegos) {
                settings.juegos = { ...settings.juegos, ...settingsData.juegos };
                if (settings.juegos.sorteo_semanal) {
                    settings.sorteo_semanal = Object.assign({}, settings.sorteo_semanal || {}, settings.juegos.sorteo_semanal);
                }
                if (!settings.juegos.mobilelegends) {
                    settings.juegos.mobilelegends = {
                        "nombre": "Mobile Legends US",
                        "inputLabel": "ID de Jugador (User ID y Zone ID)",
                        "inputPlaceholder": "Ej: 12345678 (1234)",
                        "icono": "fa-shield-halved",
                        "paquetes": {
                            "51":   { "usdt": 0.90,  "label": "51 + 5 💎 Diamantes" },
                            "102":  { "usdt": 1.85,  "label": "102 + 10 💎 Diamantes" },
                            "253":  { "usdt": 4.69,  "label": "253 + 25 💎 Diamantes" },
                            "505":  { "usdt": 9.33,  "label": "505 + 66 💎 Diamantes" },
                            "1010": { "usdt": 18.94, "label": "1010 + 182 💎 Diamantes" },
                            "1515": { "usdt": 28.60, "label": "1515 + 273 💎 Diamantes" }
                        }
                    };
                }
                if (settingsData.juegos.sorteo_semanal) {
                    settings.sorteo_semanal = settingsData.juegos.sorteo_semanal;
                    if (settings.sorteo_semanal) {
                        delete settings.sorteo_semanal.lastResetTimestamp;
                    }
                }
                // Sincronizar paquetes de freefire combinando con precios globales sin perder los paquetes por defecto
                if (settings.juegos.freefire) {
                    settings.juegos.freefire.paquetes = Object.assign({}, settings.juegos.freefire.paquetes || {}, settingsData.precios || {});
                }
                // Actualizar precios globales sin borrar la lista completa
                if (settingsData.precios && Object.keys(settingsData.precios).length > 0) {
                    settings.precios = Object.assign({}, settings.precios || {}, settingsData.precios);
                }
            }
            console.log(`[SUPABASE] 🔑 Credenciales admin cargadas: usuario='${settings.admin.username}'`);

            // --- Inicializar estado del toggle bdvAutoApproveEnabled ---
            if (settings.metodos_pago && settings.metodos_pago.pagomovil) {
                bdvAutoApproveEnabled = !!settings.metodos_pago.pagomovil.auto_approve_enabled;
            } else {
                bdvAutoApproveEnabled = false;
            }
            console.log(`[SUPABASE] 🏦 Auto-aprobación BDV inicializada: ${bdvAutoApproveEnabled ? '✅ ACTIVADA' : '🔴 DESACTIVADA'}`);
            if (bdvAutoApproveEnabled) {
                console.log('[SUPABASE] 🏦 Iniciando login BDV en background...');
                bdvLogin().then(ok => {
                    if (ok) console.log('[BDV-STARTUP] ✅ Login BDV exitoso.');
                    else console.error('[BDV-STARTUP] ❌ Login BDV falló.');
                }).catch(e => console.error('[BDV-STARTUP] Error en login BDV:', e.message));
            }

            // --- Inicializar estado del toggle binanceAutoApproveEnabled ---
            if (settings.metodos_pago && settings.metodos_pago.binance && typeof settings.metodos_pago.binance.auto_approve_enabled !== 'undefined') {
                binanceAutoApproveEnabled = !!settings.metodos_pago.binance.auto_approve_enabled;
            } else {
                binanceAutoApproveEnabled = true; // Por defecto ON para Binance
            }
            console.log(`[SUPABASE] 💛 Auto-aprobación Binance inicializada: ${binanceAutoApproveEnabled ? '✅ ACTIVADA' : '🔴 DESACTIVADA'}`);
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

    // 🔒 MODO SEGURO: Evitar envío automático de notificaciones a clientes
    const waModo = (settings.whatsapp && settings.whatsapp.modo) ? settings.whatsapp.modo : 'activo';
    if (waModo === 'seguro') {
        console.log(`[WA-QUEUE] 🔒 Modo Seguro activo. Evitando envío automático al cliente ${order.wa} para ref: ${order.ref}`);
        return;
    }

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
        const isCanje = order.method === 'canje';
        if (isCanje) {
            msg = `💎 *¡CANJE DE CASHBACK EXITOSO!* 💎\n\n` +
                  `¡Hola, *${order.name}*! Tu canje ha sido aprobado y procesado con éxito. 🚀\n\n` +
                  `━━━━━━━━━━━━━━━\n` +
                  `👤 *Jugador:* ${order.name}\n` +
                  `🆔 *ID Garena:* ${order.uid}\n` +
                  `💎 *Paquete:* ${order.pack}\n` +
                  `━━━━━━━━━━━━━━━\n\n` +
                  `✅ *Estado:* ¡Recarga Completada! ✨\n\n` +
                  `¡Gracias por usar *RECARGASNEY.COM*! 🎯🛡️`;
        } else {
            const name = (order.name && order.name !== '—' && order.name !== '-') ? order.name : 'Cliente';
            const packRaw = (order.pack || '').trim();
            const hasType = /diamante|robux|oro|tarjeta|pase|booyah/i.test(packRaw);
            const packDisplay = hasType ? packRaw : `${packRaw} diamantes`;

            let earnedUsdt = '0.00';
            let totalUsdt = '0.00';
            const userObj = users[order.login_uid || order.uid];
            if (userObj) {
                const usdtPrice = parseFloat((order.price || '').split('USDT')[0]);
                if (!isNaN(usdtPrice) && usdtPrice > 0) {
                    const pointsEarned = Math.floor(usdtPrice * (10 / 3));
                    earnedUsdt = (pointsEarned * 0.003).toFixed(2);
                }
                totalUsdt = (((userObj.points) || 0) * 0.003).toFixed(2);
            }

            msg = `¡Hola, ${name}! 👋\n` +
                  `Tu pedido de ${packDisplay} ha sido completado con éxito.\n` +
                  `• ID Jugador: ${order.uid}\n` +
                  `• Estado: Entregado\n` +
                  (order.pin ? `• Código PIN: ${order.pin}\n` : '') +
                  `• Recompensa obtenida: +${earnedUsdt} crédito\n` +
                  `• Saldo disponible: ${totalUsdt} crédito\n` +
                  `Puedes consultar nuestro catálogo respondiendo la palabra PRECIO.\n` +
                  `Gracias por tu compra.`;
        }
    } else {
        const rawSupport = (settings.whatsapp && settings.whatsapp.soporte) ? settings.whatsapp.soporte.trim() : '';
        const supportNum = rawSupport ? (rawSupport.startsWith('+') ? rawSupport : '+' + rawSupport) : '+584125322412';

        const isCanje = order.method === 'canje';
        if (isCanje) {
            msg = `⚠️ *AVISO DE TU CANJE* ⚠️\n\n` +
                  `Hola *${order.name}*, no pudimos procesar tu canje de puntos por *${order.pack}*.\n\n` +
                  `❌ *Motivo:* Tu canje fue rechazado por el administrador y tus puntos fueron devueltos a tu cuenta.\n\n` +
                  `Si tienes dudas, contáctanos a soporte al *${supportNum}*. 🛠️\n🆔 *ID:* ${order.uid}\n\n` +
                  `¡Estamos aquí para ayudarte! 🤝`;
        } else {
            msg = `⚠️ *AVISO DE TU RECARGA* ⚠️\n\n` +
                  `Hola *${order.name}*, no pudimos procesar tu recarga de *${order.pack}*.\n\n` +
                  `❌ *Motivo:* Error en la verificacion de su pago, favor chequea el monto y la referencia.\n\n` +
                  `Envía captura de tu pago a soporte al *${supportNum}*. 🛠️\n🆔 *ID:* ${order.uid}\n\n` +
                  `¡Estamos aquí para ayudarte! 🤝`;
        }
    }

    const waItem = { id: singleId, number: order.wa, message: msg };
    whatsappQueue.push(waItem);
    supabase.from('ff_wa_queue').insert(waItem)
        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error msg:', error.message); });
    console.log(`[WA-QUEUE] ✅ 1 mensaje encolado para ${order.wa} (ref: ${orderRef})`);
}

function sendInsufficientPaymentMessage(order, totalPaid, expectedBs) {
    if (!order.wa || order.wa === 'No provisto') return;
    
    const waModo = (settings.whatsapp && settings.whatsapp.modo) ? settings.whatsapp.modo : 'activo';
    if (waModo === 'seguro') {
        console.log(`[WA-QUEUE] 🔒 Modo Seguro activo. Evitando envío de pago incompleto al cliente ${order.wa}`);
        return;
    }
    
    const orderRef = order.ref || Date.now().toString();
    const singleId = `wa_${orderRef}_insufficient`;
    
    const isBinance = order.method === 'binance';
    const currency = isBinance ? 'USDT' : 'Bs';
    
    const diff = expectedBs - totalPaid;
    
    const msg = `⚠️ *PAGO INCOMPLETO DETECTADO* ⚠️\n\n` +
          `Hola *${order.name}*, hemos recibido y verificado tu pago por un total de *${totalPaid.toFixed(2)} ${currency}*.\n\n` +
          `Sin embargo, el costo del paquete de *${order.pack}* es de *${expectedBs.toFixed(2)} ${currency}*.\n\n` +
          `💡 *Falta una diferencia de:* *${diff.toFixed(2)} ${currency}* para completar tu pedido.\n\n` +
          `Por favor, realiza el pago restante de *${diff.toFixed(2)} ${currency}* y reporta la nueva referencia en la web para activar tus diamantes. 🎯🛡️`;
          
    const waItem = { id: singleId, number: order.wa, message: msg };
    whatsappQueue.push(waItem);
    supabase.from('ff_wa_queue').insert(waItem)
        .then(({ error }) => { if (error && error.code !== '23505') console.error('[WA-QUEUE] Error msg insuficiente:', error.message); });
    console.log(`[WA-QUEUE] ✅ Mensaje de pago incompleto encolado para ${order.wa} (ref: ${orderRef})`);
}

// Números de WhatsApp de los administradores que recibirán alertas de nuevos pedidos
const ADMIN_WA_NUMBERS = ['04243790757', '04125313735'];

function isExcludedAdmin(num) {
    if (!num) return true;
    const clean = num.toString().replace(/\D/g, '');
    return clean.includes('4243445879') || clean.includes('4125322412') || clean.includes('4125313735');
}

// ─────────────────────────────────────────────────────────
// 🚨 ALERTA DE ERROR JADH.SHOP → Admin (WhatsApp + acción requerida)
// ─────────────────────────────────────────────────────────
function notifyAdminsJadhError(order, errorMsg, source = 'Automático') {
    const now = getVEString();
    const msg =
        `🚨 *ERROR EN RECARGA JADH.SHOP* 🚨\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *Juego:* ${order.juego ? order.juego.toUpperCase() : 'FREEFIRE'}\n` +
        `👤 *Jugador:* ${order.name}\n` +
        `🆔 *ID/Usuario:* ${order.uid}\n` +
        `💎 *Paquete:* ${order.pack}\n` +
        `💰 *Monto:* ${order.price || 'N/A'}\n` +
        `📝 *Referencia:* \`${order.ref}\`\n` +
        `📱 *WA Cliente:* +${order.wa && order.wa !== 'No provisto' ? order.wa : 'No indicado'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `❌ *Motivo del error:* ${errorMsg}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 *Fuente:* ${source}\n` +
        `⏰ *Hora:* ${now}\n\n` +
        `⚠️ _El pedido quedó en estado PENDIENTE. Recarga manualmente o usa "Reintentar" en el panel._`;

    for (const adminNumber of ADMIN_WA_NUMBERS) {
        if (isExcludedAdmin(adminNumber)) continue;
        const msgId = `wa_admin_jadh_err_${order.ref}_${adminNumber.slice(-4)}`;
        if (whatsappQueue.some(i => i.id === msgId)) continue;
        const waItem = { id: msgId, number: adminNumber, message: msg };
        whatsappQueue.push(waItem);
        supabase.from('ff_wa_queue').insert(waItem)
            .then(({ error }) => { if (error && error.code !== '23505') console.error('[JADH-ERR-NOTIFY] Error:', error.message); });
        console.log(`[JADH-ERR-NOTIFY] 🚨 Alerta de error Jadh encolada para admin ${adminNumber} (ref: ${order.ref})`);
    }
}

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
        if (isExcludedAdmin(adminNumber)) continue;
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

// --- NOTIFICACIÓN A ADMINS: Canje de puntos recibido ---
function notifyAdminsNewCanje(order) {
    const now = getVEString();
    const pointCosts = { 
        "100": 500, "310": 1500, "520": 2500,
        "basica": 400, "semanal": 1500, "booyah": 2300, "mensual": 7500
    };
    const cost = pointCosts[order.pack] || 0;
    const usdtCost = (cost * 0.003).toFixed(2);

    const msg =
        `🎁 *SOLICITUD DE CANJE DE PUNTOS* 🎁\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Jugador:* ${order.name}\n` +
        `🆔 *ID Garena:* ${order.uid}\n` +
        `💎 *Paquete:* ${order.pack}\n` +
        `📉 *Monto de Canje:* $${usdtCost} USDT\n` +
        `💳 *Método:* Canje de Cashback 🎁\n` +
        `📝 *Referencia:* \`${order.ref}\`\n` +
        `📱 *WA Cliente:* +${order.wa && order.wa !== 'No provisto' ? order.wa : 'No indicado'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ *Hora:* ${now}\n` +
        `\n💡 *Responde a este mensaje con:*\n` +
        `👉 *Aprobar* (para procesar recarga)\n` +
        `👉 *Rechazar* (para cancelar y devolver puntos)`;

    for (const adminNumber of ADMIN_WA_NUMBERS) {
        if (isExcludedAdmin(adminNumber)) continue;
        const adminMsgId = `wa_admin_${order.ref}_${adminNumber.slice(-4)}`;
        if (whatsappQueue.some(item => item.id === adminMsgId)) continue;

        const waItem = { id: adminMsgId, number: adminNumber, message: msg };
        whatsappQueue.push(waItem);
        Promise.resolve(supabase.from('ff_wa_queue').insert(waItem)).catch(() => {});
    }
}

// --- NOTIFICACIÓN A ADMINS: Pedido aprobado o rechazado ---
function notifyAdminsOrderStatus(order, isApproved, source = 'sistema') {
    const now = getVEString();
    const statusEmoji = isApproved ? '✅' : '❌';
    const statusText  = isApproved ? 'APROBADO' : 'RECHAZADO';
    const isCanje = order.method === 'canje';
    const msgType = isCanje ? 'CANJE' : 'PEDIDO';
    
    let msg =
        `${statusEmoji} *${msgType} ${statusText}* ${statusEmoji}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🎮 *Juego:* ${order.juego ? order.juego.toUpperCase() : 'FREEFIRE'}\n` +
        `👤 *Jugador:* ${order.name}\n` +
        `🆔 *ID/Usuario:* ${order.uid}\n` +
        `💎 *Paquete:* ${order.pack}\n` +
        `💰 *Total:* ${order.price || 'N/A'}\n` +
        `📝 *Referencia:* \`${order.ref}\`\n` +
        `📱 *WA Cliente:* +${order.wa && order.wa !== 'No provisto' ? order.wa : 'No indicado'}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n`;
        
    if (!isApproved && order.reason) {
        msg += `❌ *Motivo:* ${order.reason}\n` +
               `━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    msg +=
        `🔧 *Fuente:* ${source}\n` +
        `⏰ *Hora:* ${now}`;

    for (const adminNumber of ADMIN_WA_NUMBERS) {
        if (isExcludedAdmin(adminNumber)) continue;
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

// Programa un mensaje con el link de referidos 15 min después de una recarga aprobada
function scheduleReviewRequest(order) {
    return; // Desactivado para evitar bloqueos de WhatsApp por spam de links de referidos
    if (!order.wa || order.wa === 'No provisto') return;
    
    // 🔒 MODO SEGURO: Evitar mensajes automáticos
    const waModo = (settings.whatsapp && settings.whatsapp.modo) ? settings.whatsapp.modo : 'activo';
    if (waModo === 'seguro') {
        console.log(`[REFERRAL-PITCH] 🔒 Modo Seguro activo. Ignorando pitch para ${order.wa}`);
        return;
    }

    const referralUid = order.login_uid || order.uid;
    if (!referralUid) return;

    const refLink = `https://recargasney.com/?ref=${referralUid}`;
    const refMsgText =
        `🎁 *¡Gana dinero invitando a tus amigos!*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Hola *${order.name}*, ¿sabes que tienes un link personal para ganar cashback?\n\n` +
        `👉 *Cómo funciona el programa de referidos:*\n\n` +
        `💰 *Tú ganas* → *+$0.05 USDT* cada vez que un amigo realiza su primera recarga\n\n` +
        `🎮 *Tu amigo gana* → *-3% de descuento* en su primera compra\n\n` +
        `∞ *¡Sin límite de referidos!* Entre más compartes, más ganas.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 *Tu link único:*\n${refLink}\n\n` +
        `_¡Compártelo en tus grupos de Free Fire y empieza a cobrar!_ 🚀💎`;

    const sendAfterTime = Date.now() + 15 * 60 * 1000; // 15 minutos en el futuro
    const refMsgId = `wa_refpitch_${order.ref}_sendAfter_${sendAfterTime}`;
    const refWaItem = { id: refMsgId, number: order.wa, message: refMsgText };

    whatsappQueue.push(refWaItem);
    supabase.from('ff_wa_queue').insert(refWaItem)
        .then(({ error }) => { 
            if (error && error.code !== '23505') {
                console.error('[REFERRAL-PITCH] Error encolando pitch en Supabase:', error.message);
            } else {
                console.log(`[REFERRAL-PITCH] ✅ Pitch de referidos encolado en Supabase para ${order.wa} (id: ${refMsgId}, para enviar en 15 min)`);
            }
        });
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
    // El referidor es elegible si existe en el sistema (tiene cuenta o ha comprado antes).
    // Solo requerimos que el objeto usuario exista — no bloqueamos por falta de contraseña.
    return true;
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
    const pointsToAdd = Math.floor(amountUsdt * (10 / 3));
    userObj.points = (userObj.points || 0) + pointsToAdd;
    if (name) {
        const currentName = (userObj.name || '').trim();
        if (!currentName || currentName === 'Jugador' || currentName === '—' || currentName === '-') {
            userObj.name = name;
        }
    }

    // Lógica de Referidos: 17 pts al referrer en la PRIMERA recarga (equivale a $0.05 USDT)
    if (userObj.referred_by && !userObj.referral_claimed) {
        const referrerUid = userObj.referred_by;
        const referrerObj = await ensureUserLoaded(referrerUid);
        if (referrerObj && isUserFullyRegistered(referrerUid)) {
            referrerObj.points = (referrerObj.points || 0) + 17;
            userObj.referral_claimed = true;
            await saveUser(referrerUid);
            await saveUser(uid); // Persistir el flag referral_claimed del nuevo usuario
            console.log(`[REFERRAL_REWARD] ✅ ${referrerUid} gana 17 pts por la 1ra recarga de ${uid}`);

            // Encolar mensaje de WhatsApp para el referidor
            getLastUserWa(referrerUid).then(async referrerWa => {
                // Fallback: usar el teléfono registrado si no se encontró WA en pedidos
                if (!referrerWa) {
                    const refUser = users[referrerUid];
                    if (refUser && refUser.phone) referrerWa = refUser.phone;
                }
                if (referrerWa) {
                    const refMsgId = `wa_ref_${uid}_reward`;
                    const refTotalUsdt = ((referrerObj.points || 0) * 0.003).toFixed(2);
                    const refMsg = `🎉 *¡FELICIDADES! HAS GANADO CASHBACK* 🎉\n\n` +
                                   `¡Hola! Tu referido con ID *${uid}* ha realizado su primera compra. 🚀\n\n` +
                                   `🎁 *Cashback ganado:* +$0.05 USDT\n` +
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
            sendPushToUser(referrerUid, '¡Referido Exitoso! 🎉💎', `Tu referido ${uid} hizo su primera compra. ¡Ganaste +$0.05 USDT de cashback!`, '/icon-192.png', '/');
        }
    }

    await saveUser(uid);
    const earnedUsdtLog = (pointsToAdd * 0.003).toFixed(2);
    const totalUsdtLog = ((userObj.points || 0) * 0.003).toFixed(2);
    console.log(`[PUNTOS] Se añadieron ${pointsToAdd} puntos ($${earnedUsdtLog} USDT) a ID: ${uid}. Total: ${userObj.points} ($${totalUsdtLog} USDT)`);
    
    // Push por cashback acumulado en la recarga
    if (pointsToAdd > 0) {
        sendPushToUser(uid, '💰 ¡Ganaste Cashback! 🎁', `+$${earnedUsdtLog} USDT de cashback (1%). Saldo: $${totalUsdtLog} USDT`, '/icon-192.png', '/');
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

function updateOrderStatus(ref, status, pin = null, reason = null) {
    if (!orders[ref]) {
        orders[ref] = { ref, status };
    }
    orders[ref].status = status;
    if (pin) orders[ref].pin = pin;
    orders[ref].reason = reason;
    
    const update = { status, reason };
    if (pin) update.pin = pin;
        
        supabase.from('ff_orders').update(update).eq('ref', ref)
            .then(({ error }) => {
                if (error) {
                    console.error('[SUPABASE] Error actualizando pedido:', error.message);
                    // Si el error indica que la columna 'reason' no existe, reintentar sin ella
                    if (error.message.includes('reason') && error.message.includes('column')) {
                        console.log('[SUPABASE] ⚠️ Columna "reason" ausente en DB. Reintentando actualización sin "reason"...');
                        const fallbackUpdate = { status };
                        if (pin) fallbackUpdate.pin = pin;
                        supabase.from('ff_orders').update(fallbackUpdate).eq('ref', ref)
                            .then(({ error: fallbackErr }) => {
                                if (fallbackErr) {
                                    console.error('[SUPABASE] ❌ Error en reintento de actualización:', fallbackErr.message);
                                } else {
                                    console.log('[SUPABASE] ✅ Pedido actualizado correctamente (sin guardar motivo en DB).');
                                    if (status === 'approved') {
                                        sendAdminProfitNotification(orders[ref]);
                                    }
                                }
                            });
                    }
                } else {
                    console.log('[SUPABASE] ✅ Pedido actualizado correctamente.');
                    if (status === 'approved') {
                        sendAdminProfitNotification(orders[ref]);
                    }
                }
            });
}

function markPaymentAsUsed(method, ref) {
    if ((method === 'pagomovil' || method === 'binance') && ref) {
        const cleanRef = ref.trim();
        let foundFullRef = null;
        for (let fRef in pagosValidados) {
            if (fRef === cleanRef) {
                foundFullRef = fRef;
                break;
            }
        }
        const refToSave = foundFullRef || cleanRef;
        pagosValidados[refToSave] = {
            amount: pagosValidados[refToSave]?.amount || 0,
            date: pagosValidados[refToSave]?.date || new Date().toISOString(),
            used: true
        };
        savePagos();
        console.log(`[SEGURIDAD] Referencia de pago '${refToSave}' marcada como usada (Método: ${method}).`);
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

async function getStreamingStockAccount(packName) {
    if (!packName) return null;
    const packLower = packName.toLowerCase();

    let serviceKey = null;
    if (packLower.includes('netflix')) serviceKey = 'netflix';
    else if (packLower.includes('disney') || packLower.includes('star')) serviceKey = 'disney';
    else if (packLower.includes('max') || packLower.includes('hbo')) serviceKey = 'max';
    else if (packLower.includes('vix')) serviceKey = 'vix';
    else if (packLower.includes('canva')) serviceKey = 'canva';
    else if (packLower.includes('spotify')) serviceKey = 'spotify';
    else if (packLower.includes('prime')) serviceKey = 'prime';
    else if (packLower.includes('crunchyroll')) serviceKey = 'crunchyroll';
    else if (packLower.includes('youtube')) serviceKey = 'youtube';

    if (serviceKey && settings.juegos && settings.juegos.streaming_stock && Array.isArray(settings.juegos.streaming_stock[serviceKey])) {
        if (settings.juegos.streaming_stock[serviceKey].length > 0) {
            const deliveredAccount = settings.juegos.streaming_stock[serviceKey].shift();
            try {
                await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
            } catch (e) {
                console.error('[STREAMING-STOCK] Error actualizando stock en Supabase:', e.message);
            }
            console.log(`[STREAMING-STOCK] 🍿 Entregada cuenta de ${serviceKey}: ${deliveredAccount.substring(0, 15)}... Quedan: ${settings.juegos.streaming_stock[serviceKey].length}`);
            return deliveredAccount;
        }
    }
    return null;
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
    // Auto-aprobar pedidos de Free Fire, Roblox, Blood Strike y Mobile Legends US.
    if (inputShortRef && orders[inputShortRef] && orders[inputShortRef].juego && orders[inputShortRef].juego !== 'freefire' && orders[inputShortRef].juego !== 'roblox' && orders[inputShortRef].juego !== 'bloodstrike' && orders[inputShortRef].juego !== 'mobilelegends' && orders[inputShortRef].juego !== 'mobilelegendsus') {
        console.log(`[AUTO-APPROVE] ⏭️ Pedido ${inputShortRef} es de juego '${orders[inputShortRef].juego}'. Se requiere aprobación manual.`);
        return false;
    }
    let targetFullRef = inputFullRef;
    let targetShortRef = inputShortRef;

    // Caso A: Viene del Banco (tenemos FullRef, buscamos ShortRef en pedidos)
    if (targetFullRef && !targetShortRef) {
        for (let sRef in orders) {
            if (orders[sRef].status === 'pending') {
                const parts = sRef.split(',').map(r => r.trim());
                if (parts.some(part => areRefsSimilar(targetFullRef, part))) {
                    targetShortRef = sRef;
                    break;
                }
            }
        }
    }

    let matchedFullRefs = [];
    let totalPaid = 0;
    let allPaymentsFound = true;

    if (targetShortRef) {
        const refs = targetShortRef.split(',').map(r => r.trim());
        for (const sRef of refs) {
            let foundFullRef = null;
            if (targetFullRef && pagosValidados[targetFullRef] && !pagosValidados[targetFullRef].used && areRefsSimilar(targetFullRef, sRef)) {
                foundFullRef = targetFullRef;
            } else {
                for (let fRef in pagosValidados) {
                    if (!pagosValidados[fRef].used && areRefsSimilar(fRef, sRef)) {
                        if (!matchedFullRefs.includes(fRef)) {
                            foundFullRef = fRef;
                            break;
                        }
                    }
                }
            }
            if (foundFullRef) {
                matchedFullRefs.push(foundFullRef);
                totalPaid += parseFloat(pagosValidados[foundFullRef].amount) || 0;
            } else {
                allPaymentsFound = false;
            }
        }
    }

    // Si encontramos todos los pagos y el pedido está pendiente
    if (allPaymentsFound && matchedFullRefs.length > 0 && targetShortRef && orders[targetShortRef] && orders[targetShortRef].status === 'pending') {
        const order = orders[targetShortRef];
        let isValid = false;

        if (order.method === 'binance') {
            let expectedUsdt = 0;
            try {
                expectedUsdt = parseFloat(order.price.split('USDT')[0].trim());
            } catch (e) {}

            console.log(`[AUTO-APPROVE-BINANCE] Validando monto total -> Recibido: ${totalPaid} USDT | Esperado: ${expectedUsdt} USDT`);
            if (expectedUsdt > 0 && totalPaid >= expectedUsdt) {
                isValid = true;
            } else {
                console.log(`[AUTO-APPROVE-BINANCE] ❌ MONTO INSUFICIENTE. Recibido: ${totalPaid} USDT, Esperado: ${expectedUsdt} USDT.`);
                if (order.status === 'pending') {
                    order.status = 'incomplete_payment';
                    order.reason = `Pago incompleto. Recibido: ${totalPaid} USDT, Esperado: ${expectedUsdt} USDT`;
                    updateOrderStatus(targetShortRef, 'incomplete_payment', null, order.reason);
                    sendInsufficientPaymentMessage(order, totalPaid, expectedUsdt);
                }
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

            console.log(`[AUTO-APPROVE-BDV] Validando monto total -> Recibido: ${totalPaid} Bs | Esperado: ${expectedBs} Bs`);

            // Tolerancia: aceptar si pagó entre (precio - 5 Bs) y (precio + 200 Bs)
            const MIN_BS = expectedBs - 5;
            const MAX_BS = expectedBs + 200;
            if (totalPaid >= MIN_BS && totalPaid <= MAX_BS) {
                isValid = true;
                if (totalPaid < expectedBs) {
                    console.log(`[AUTO-APPROVE-BDV] ⚠️ PAGO MENOR aceptado: ${totalPaid} Bs (esperado: ${expectedBs} Bs, diferencia: -${(expectedBs - totalPaid).toFixed(2)} Bs)`);
                } else if (totalPaid > expectedBs) {
                    console.log(`[AUTO-APPROVE-BDV] ℹ️ PAGO MAYOR aceptado: ${totalPaid} Bs (esperado: ${expectedBs} Bs, diferencia: +${(totalPaid - expectedBs).toFixed(2)} Bs)`);
                }
            } else if (totalPaid < MIN_BS) {
                console.log(`[AUTO-APPROVE-BDV] ❌ MONTO INSUFICIENTE. El pago total de ${totalPaid} Bs es menor al mínimo aceptado (${MIN_BS.toFixed(2)} Bs).`);
                if (order.status === 'pending') {
                    order.status = 'incomplete_payment';
                    order.reason = `Pago incompleto. Recibido: ${totalPaid} Bs, Esperado: ${expectedBs} Bs`;
                    updateOrderStatus(targetShortRef, 'incomplete_payment', null, order.reason);
                    sendInsufficientPaymentMessage(order, totalPaid, expectedBs);
                }
            } else {
                console.log(`[AUTO-APPROVE-BDV] ❌ MONTO EXCESIVO. El pago total de ${totalPaid} Bs supera el máximo aceptado (${MAX_BS.toFixed(2)} Bs).`);
            }
        }

        if (isValid) {
            console.log(`[AUTO-APPROVE] ✅ MONTO CORRECTO. Procediendo...`);
            console.log(`[AUTO-APPROVE] Refs Banco/Correo: [${matchedFullRefs.join(', ')}] <--> Ref Formulario: ${targetShortRef}`);
            
            matchedFullRefs.forEach(fRef => {
                pagosValidados[fRef].used = true;
            });
            savePagos();
            
            const { qty, amountKey } = extractPackInfo(order.pack);
            
            // Cambiar estado a processing para bloquear aprobaciones manuales simultáneas
            orders[targetShortRef].status = 'processing';
                
                console.log(`[AUTO-APPROVE] Iniciando recarga automática via Jadh.shop para ${order.uid} | Qty: ${qty}`);
                
                (async () => {
                    const juego = order.juego || 'freefire';
                    const esStreaming = juego === 'streaming' || ['netflix', 'disney', 'max', 'vix', 'canva', 'spotify', 'prime', 'crunchyroll'].some(s => (order.pack || '').toLowerCase().includes(s));

                    if (esStreaming) {
                        console.log(`[AUTO-APPROVE] 🍿 Procesando auto-aprobación de streaming: ${order.pack}`);
                        const deliveredPin = await getStreamingStockAccount(order.pack) || 'Manual';
                        orders[targetShortRef].status = 'approved';
                        updateOrderStatus(targetShortRef, 'approved', deliveredPin);
                        saveRecent(order.name, order.pack);
                        const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                        if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                        queueWhatsAppMessage({ ...order, ref: targetShortRef, pin: deliveredPin }, true);
                        notifyAdminsOrderStatus({ ...order, ref: targetShortRef, pin: deliveredPin }, true, 'Auto-Aprobación Bot (Streaming)');
                        scheduleReviewRequest({ ...order, ref: targetShortRef });
                        sendPushToUser(order.login_uid || order.uid, 'Servicio Aprobado ✅', `¡Tu pedido de ${order.pack} fue aprobado! Credenciales: ${deliveredPin}`, '/icon-192.png', '/historial');
                        updateTelegramStatus(targetShortRef);
                        return;
                    }

                    let allSuccess = true;
                    let nick = order.name;
                    
                    // Priorizar el nombre registrado del usuario en la base de datos/memoria si existe y no es genérico
                    const registeredUser = users[order.uid];
                    if (registeredUser && registeredUser.name && registeredUser.name !== 'Jugador' && registeredUser.name !== '—' && registeredUser.name !== '-') {
                        nick = registeredUser.name;
                    }
                    
                    let orderIds = [];
                    let pins = [];
                    let lastResult = null;
                    
                    for (let i = 0; i < qty; i++) {
                        console.log(`[AUTO-APPROVE] Ejecutando recarga ${i+1}/${qty} en Jadh.shop...`);
                        const result = isPaqueteEspecial(amountKey)
                            ? await rechargeViaJadhPaquetes(order.uid, amountKey)
                            : await rechargeViaJadh(order.uid, amountKey, order.juego || 'freefire');
                        lastResult = result;
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
                        scheduleReviewRequest({ ...order, name: nick, ref: targetShortRef });
                        updateTelegramStatus(targetShortRef);
                        console.log(`[AUTO-APPROVE] Recarga directa exitosa (Jadh) para ${order.uid}. Órdenes: ${orderIds.join(', ')}`);
                    } else {
                        const jadhErr = lastResult?.message || 'Error desconocido en Jadh.shop (sin stock o tiempo de espera agotado).';
                        console.error(`[AUTO-APPROVE] ❌ Recarga Jadh.shop falló para ID ${order.uid}. Motivo: ${jadhErr}`);
                        orders[targetShortRef].status = 'pending'; // Volver a pending para que el admin pueda reintentar
                        updateOrderStatus(targetShortRef, 'pending');
                        // 🚨 Notificar al admin con el motivo exacto
                        notifyAdminsJadhError({ ...order, ref: targetShortRef }, jadhErr, 'Auto-Aprobación');
                        // 📲 Avisar al usuario (sin revelar detalles técnicos)
                        if (order.wa && order.wa !== 'No provisto') {
                            const userErrId = `wa_user_jadh_err_${targetShortRef}`;
                            if (!whatsappQueue.some(i => i.id === userErrId)) {
                                const userMsg = `⚠️ *Hola ${order.name}*, tu pago fue recibido correctamente ✅ pero tuvimos un inconveniente al procesar tu recarga de *${order.pack}*. 😔\n\n` +
                                    `Nuestro equipo ya fue notificado y está revisando tu caso. Te contactaremos en breve.\n\n` +
                                    `_Si tienes prisa, escríbenos directamente por este chat._`;
                                const waItem = { id: userErrId, number: order.wa, message: userMsg };
                                whatsappQueue.push(waItem);
                                supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error && error.code !== '23505') console.error('[USER-JADH-ERR] Error WA:', error.message); });
                            }
                        }
                        sendPushToUser(order.login_uid || order.uid, 'Problema con tu recarga ⚠️', 'Tu pago fue recibido pero hubo un inconveniente. Te contactaremos pronto.', '/icon-192.png', '/historial');
                    }
                })();
                return true;
            } else {
                // No marcamos como usado para que el admin pueda decidir qué hacer
                return false;
            }
        }
        return false;
    }

// =====================================================
// 🔄 CICLO DE AUTO-APROBACIÓN
// Los pagos manuales NO se tocan aquí.
// La sección BDV solo corre si bdvAutoApproveEnabled === true
// =====================================================
async function runAutoApprovalCycle() {
    const NOW = new Date();

    // ── BDV AUTO-APROBACIÓN (solo si el toggle está ON) ──────────────────────
    if (bdvAutoApproveEnabled && !bdvAutoApproveRunning) {
        const pendingBDV = Object.entries(orders).filter(
            ([, o]) => o.status === 'pending' && o.method === 'pagomovil'
        );

        if (pendingBDV.length > 0) {
            bdvAutoApproveRunning = true;
            console.log(`[BDV-AUTO] 🔍 Verificando ${pendingBDV.length} pedido(s) pendiente(s) BDV...`);

            try {
                for (const [ref, order] of pendingBDV) {
                    // No reprocesar lo que ya está en camino
                    if (order.status !== 'pending') continue;

                    // Si es una referencia combinada, no podemos consultar el banco directamente por un único monto.
                    // En su lugar, dejamos que processPendingOrder valide los pagos ya recibidos en pagosValidados.
                    if (ref.includes(',')) {
                        console.log(`[BDV-AUTO] Pedido con múltiples referencias '${ref}'. Validando consolidado...`);
                        await processPendingOrder(null, ref);
                        continue;
                    }

                    // --- SEGURIDAD: RECHAZAR SI LA REFERENCIA YA FUE USADA ANTERIORMENTE ---
                    // Condiciones: (1) ref similar/exacta, (2) mismo monto, (3) dentro de los últimos 7 días
                    let isUsedRef = false;
                    let matchedUsedRef = '';
                    const cleanRef = ref.trim();
                    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                    const now = Date.now();

                    // Extraer monto del pedido actual para comparar
                    let orderAmountBs = 0;
                    try {
                        const pp = (order.price || '').split('/');
                        if (pp[1]) orderAmountBs = parseFloat(pp[1].replace('Bs', '').trim());
                    } catch (_) {}

                    for (let fRef in pagosValidados) {
                        const pago = pagosValidados[fRef];
                        if (!pago.used) continue;

                        // Condición 1: referencia similar (respetando ceros a la izquierda)
                        if (!areRefsSimilar(fRef, cleanRef)) continue;

                        // Condición 2: mismo monto (tolerancia ±1 Bs por redondeo)
                        const pagoAmount = parseFloat(pago.amount) || 0;
                        if (orderAmountBs > 0 && pagoAmount > 0 && Math.abs(pagoAmount - orderAmountBs) > 1) continue;

                        // Condición 3: dentro de los últimos 7 días
                        const pagoDate = pago.date ? new Date(pago.date).getTime() : 0;
                        if (pagoDate > 0 && (now - pagoDate) > SEVEN_DAYS_MS) continue;

                        // Pasa las 3 condiciones → es duplicado
                        isUsedRef = true;
                        matchedUsedRef = fRef;
                        break;
                    }

                    if (isUsedRef) {
                        console.log(`[BDV-AUTO] 🛑 Pedido ${ref} detectado como DUPLICADO de pago ya usado (${matchedUsedRef}). Auto-rechazando inmediatamente...`);
                        
                        orders[ref].status = 'rejected';
                        orders[ref].reason = 'Referencia duplicada (pago ya usado)';
                        updateOrderStatus(ref, 'rejected', null, 'Referencia duplicada (pago ya usado)');

                        // Notificar cliente por WhatsApp (Rechazo)
                        queueWhatsAppMessage({ ...orders[ref], ref }, false);
                        
                        // Notificar admins
                        notifyAdminsOrderStatus({ ...orders[ref], ref }, false, 'BDV Duplicado Auto-Rechazo');
                        
                        // Enviar notificación Push
                        sendPushToUser(
                            orders[ref].login_uid || orders[ref].uid, 
                            'Pago Rechazado ❌', 
                            `Tu pago para el pedido de ${orders[ref].pack} fue rechazado porque esta referencia ya fue utilizada anteriormente.`, 
                            '/icon-192.png', 
                            '/historial'
                        );
                        
                        // Actualizar Telegram
                        updateTelegramStatus(ref);
                        continue;
                    }

                    // Extraer monto esperado en Bolívares del campo price (formato: "X.XXUSDT/YYY.YYBs")
                    let expectedBs = 0;
                    try {
                        const priceParts = (order.price || '').split('/');
                        if (priceParts[1]) {
                            expectedBs = parseFloat(priceParts[1].replace('Bs', '').trim());
                        }
                    } catch (e) {}

                    if (expectedBs <= 0) {
                        console.log(`[BDV-AUTO] ⚠️ No se pudo extraer el monto esperado de: ${order.price}`);
                        continue;
                    }

                    // Verificar si existe el pago en los movimientos BDV
                    const bdvResult = await verifyBDVPayment(expectedBs, ref);

                    if (bdvResult.success) {
                        console.log(`[BDV-AUTO] ✅ Pago BDV confirmado para ref ${ref} (${expectedBs} Bs). Auto-aprobando...`);

                        // Registrar como pago válido para que processPendingOrder lo use
                        const fullRef = bdvResult.movimiento?.referencia || ref;
                        const existingPago = pagosValidados[fullRef];
                        const isOldPago = existingPago && existingPago.date && (now - new Date(existingPago.date).getTime()) > SEVEN_DAYS_MS;

                        if (!existingPago || isOldPago) {
                            pagosValidados[fullRef] = {
                                amount: expectedBs,
                                date: new Date().toISOString(),
                                used: false
                            };
                            savePagos();
                        }

                        // Disparar el proceso de aprobación (ejecuta la recarga automática)
                        if (!pagosValidados[fullRef].used) {
                            await processPendingOrder(fullRef, ref);
                        } else {
                            console.log(`[BDV-AUTO] 🛑 Pago BDV verificado pero YA USADO para ref ${ref} (Banco: ${fullRef}). Auto-rechazando...`);
                            
                            orders[ref].status = 'rejected';
                            orders[ref].reason = 'Referencia duplicada (pago ya usado)';
                            updateOrderStatus(ref, 'rejected', null, 'Referencia duplicada (pago ya usado)');

                            // Notificar cliente por WhatsApp (Rechazo)
                            queueWhatsAppMessage({ ...orders[ref], ref }, false);
                            
                            // Notificar admins
                            notifyAdminsOrderStatus({ ...orders[ref], ref }, false, 'BDV Duplicado Auto-Rechazo');
                            
                            // Enviar notificación Push
                            sendPushToUser(
                                orders[ref].login_uid || orders[ref].uid, 
                                'Pago Rechazado ❌', 
                                `Tu pago para el pedido de ${orders[ref].pack} fue rechazado porque esta referencia ya fue utilizada anteriormente.`, 
                                '/icon-192.png', 
                                '/historial'
                            );
                            
                            // Actualizar Telegram
                            updateTelegramStatus(ref);
                        }
                    } else {
                        // Pedido sin pago encontrado en BDV — auto-rechazar si lleva +5 min
                        // Pero SOLO si la consulta al banco fue exitosa (checked === true)
                        if (bdvResult.checked) {
                            const orderTime = new Date(order.time);
                            const diffMin = (NOW - orderTime) / (1000 * 60);
                            if (diffMin > 2) {
                                console.log(`[BDV-AUTO] ❌ Pedido ${ref} sin pago BDV tras 2 min. Auto-rechazando...`);
                                
                                orders[ref].status = 'rejected';
                                orders[ref].reason = 'Pago no encontrado en el banco tras 2 minutos';
                                updateOrderStatus(ref, 'rejected', null, 'Pago no encontrado en el banco tras 2 minutos');

                                // Notificar cliente por WhatsApp (Rechazo)
                                queueWhatsAppMessage({ ...orders[ref], ref }, false);
                                
                                // Notificar admins
                                notifyAdminsOrderStatus({ ...orders[ref], ref }, false, 'BDV Auto-Rechazo');
                                
                                // Enviar notificación Push
                                sendPushToUser(
                                    orders[ref].login_uid || orders[ref].uid, 
                                    'Pago Rechazado ❌', 
                                    `No pudimos verificar tu pago para el pedido de ${orders[ref].pack}. Contáctanos por WhatsApp si es un error.`, 
                                    '/icon-192.png', 
                                    '/historial'
                                );
                                
                                // Actualizar Telegram
                                updateTelegramStatus(ref);
                            }
                        } else {
                            console.log(`[BDV-AUTO] ⚠️ Pedido ${ref} no se pudo verificar en BDV (bot inactivo o error). Se mantiene PENDIENTE.`);
                        }
                    }
                }
            } catch (bdvCycleErr) {
                console.error('[BDV-AUTO] ❌ Error en ciclo BDV:', bdvCycleErr.message);
            } finally {
                bdvAutoApproveRunning = false;
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    // NOTA: El flujo de aprobación MANUAL sigue igual, sin cambios.
    // Los admins pueden seguir respondiendo "Aprobar/Rechazar" por WhatsApp
    // o usando el panel admin, independientemente de si BDV-AUTO está ON o OFF.
    // ─────────────────────────────────────────────────────────────────────────

    // ── BINANCE AUTO-APROBACIÓN vía correo IMAP (toggle ON) ─────────────────
    if (binanceAutoApproveEnabled && !binanceAutoApproveRunning) {
        const pendingBinance = Object.entries(orders).filter(
            ([, o]) => o.status === 'pending' && o.method === 'binance'
        );

        if (pendingBinance.length > 0) {
            binanceAutoApproveRunning = true;
            console.log(`[BINANCE-AUTO] 💛 Verificando ${pendingBinance.length} pedido(s) Binance pendiente(s)...`);

            try {
                // Obtener pagos: simulados o correos reales de Gmail
                let emailPayments = [];
                let binanceCheckSuccess = true;
                if (simulatedBinanceEmails.length > 0) {
                    emailPayments = [...simulatedBinanceEmails];
                    console.log(`[BINANCE-AUTO] 🧪 Usando ${emailPayments.length} pago(s) simulado(s).`);
                } else {
                    const res = await checkBinanceEmails();
                    if (res === null) {
                        binanceCheckSuccess = false;
                        emailPayments = [];
                        console.error(`[BINANCE-AUTO] ❌ Falló la verificación de correos Binance. Se cancela ciclo.`);
                    } else {
                        emailPayments = res;
                        console.log(`[BINANCE-AUTO] 📧 Correos Binance encontrados: ${emailPayments.length}`);
                    }
                }

                // Verificar timeouts (5 min) para auto-rechazo de pedidos pendientes
                if (binanceCheckSuccess) {
                    for (const [ref, order] of pendingBinance) {
                        const diffMin = (NOW - new Date(order.time)) / (1000 * 60);
                        if (diffMin > 2) {
                            console.log(`[BINANCE-AUTO] ❌ Pedido ${ref} sin pago Binance tras 2 min. Auto-rechazando...`);
                            
                            orders[ref].status = 'rejected';
                            orders[ref].reason = 'Pago no encontrado en Binance tras 2 minutos';
                            updateOrderStatus(ref, 'rejected', null, 'Pago no encontrado en Binance tras 2 minutos');

                            // Notificar cliente por WhatsApp (Rechazo)
                            queueWhatsAppMessage({ ...orders[ref], ref }, false);
                            
                            // Notificar admins
                            notifyAdminsOrderStatus({ ...orders[ref], ref }, false, 'Binance Auto-Rechazo');
                            
                            // Enviar notificación Push
                            sendPushToUser(
                                orders[ref].login_uid || orders[ref].uid, 
                                'Pago Rechazado ❌', 
                                `No pudimos verificar tu pago para el pedido de ${orders[ref].pack}. Contáctanos por WhatsApp si es un error.`, 
                                '/icon-192.png', 
                                '/historial'
                            );
                            
                            // Actualizar Telegram
                            updateTelegramStatus(ref);
                        }
                    }
                }

                if (emailPayments.length > 0) {
                    // Hay correos — matchear con pedidos pendientes por monto USDT
                    for (const emailPago of emailPayments) {
                        const emailAmount = emailPago.amount;
                        console.log(`[BINANCE-AUTO] 💰 Correo: ${emailAmount} USDT (uid: ${emailPago.uid})`);

                        // Anti-duplicado: correo ya procesado
                        const alreadyUsed = Object.values(pagosValidados).some(
                            p => p.binanceEmailUid === emailPago.uid && p.used
                        );
                        if (alreadyUsed) {
                            console.log(`[BINANCE-AUTO] ⏩ Correo ${emailPago.uid} ya procesado. Saltando.`);
                            continue;
                        }

                        // Buscar pedido cuyo monto USDT coincida (±0.05)
                        let matchedRef = null;
                        let matchedOrder = null;
                        for (const [ref, order] of pendingBinance) {
                            if (order.status !== 'pending') continue;
                            let expectedUsdt = 0;
                            try {
                                const m = (order.price || '').match(/([\d.]+)\s*USDT/i);
                                if (m) expectedUsdt = parseFloat(m[1]);
                            } catch (e) {}
                            if (expectedUsdt <= 0) continue;
                            const diff = Math.abs(emailAmount - expectedUsdt);
                            if (diff <= 0.05) {
                                matchedRef = ref;
                                matchedOrder = order;
                                console.log(`[BINANCE-AUTO] ✅ Match: correo ${emailAmount} USDT ↔ pedido ${ref} (${expectedUsdt} USDT, diff=${diff.toFixed(4)})`);
                                break;
                            }
                        }

                        if (matchedRef && matchedOrder) {
                            // Anti-duplicado en Supabase
                            const { data: dbCheck } = await supabase.from('ff_orders').select('status').eq('ref', matchedRef).single();
                            if (dbCheck && dbCheck.status !== 'pending') {
                                console.log(`[BINANCE-AUTO] 🛑 Pedido ${matchedRef} ya procesado en DB (${dbCheck.status}).`);
                                await markEmailAsRead(emailPago.uid);
                                continue;
                            }

                            const binanceFullRef = `BINANCE-${emailPago.uid}-${matchedRef}`;
                            pagosValidados[binanceFullRef] = {
                                amount: emailAmount,
                                date: new Date().toISOString(),
                                used: false,
                                binanceEmailUid: emailPago.uid
                            };
                            savePagos();

                            console.log(`[BINANCE-AUTO] 🚀 Auto-aprobando pedido ${matchedRef}...`);
                            await processPendingOrder(binanceFullRef, matchedRef);
                            // El correo se elimina de Gmail automáticamente (markEmailAsRead borra)
                            await markEmailAsRead(emailPago.uid);

                        } else {
                            // Pago sin pedido coincidente — notificar admin
                            console.warn(`[BINANCE-AUTO] ⚠️ Pago de ${emailAmount} USDT sin pedido coincidente.`);
                            notifyAdminsJadhError(
                                { name: 'Sistema', uid: '—', pack: `${emailAmount} USDT`, price: `${emailAmount} USDT`, ref: emailPago.uid, wa: 'N/A' },
                                `Pago Binance de ${emailAmount} USDT recibido pero sin pedido pendiente que coincida. Verifica manualmente.`,
                                'Binance Auto-Aprobación'
                            );
                            await markEmailAsRead(emailPago.uid); // Eliminar para no repetir la alerta
                        }
                    }
                }
            } catch (binanceCycleErr) {
                console.error('[BINANCE-AUTO] ❌ Error en ciclo Binance:', binanceCycleErr.message);
            } finally {
                binanceAutoApproveRunning = false;
            }
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
}

setInterval(async () => {
    try {
        await runAutoApprovalCycle();
    } catch (e) {
        console.error('[AUTO-CYCLE] Error en ciclo:', e.message);
    }
}, 10000); // cada 10 segundos para máxima velocidad de auto-aprobación
// --- SISTEMA DE AUTENTICACIÓN ADMIN ---

// 🔒 NÚMEROS DE WHATSAPP AUTORIZADOS PARA APROBAR/RECHAZAR (ambos admins)
const ADMIN_WA_PHONES = ['04243790757', '04125313735'];

// 🔒 USER IDs DE TELEGRAM AUTORIZADOS
// Usa ADMIN_TELEGRAM_IDS si está configurado, o cae en TELEGRAM_CHAT_ID como fallback
const ADMIN_TELEGRAM_IDS = (() => {
    // Prioridad 1: variable explícita con uno o más IDs
    if (process.env.ADMIN_TELEGRAM_IDS) {
        return process.env.ADMIN_TELEGRAM_IDS
            .split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id));
    }
    // Prioridad 2: usar TELEGRAM_CHAT_ID (que ya existe en Render)
    if (process.env.TELEGRAM_CHAT_ID) {
        const fallbackId = parseInt(process.env.TELEGRAM_CHAT_ID);
        if (!isNaN(fallbackId)) {
            console.log(`[TELEGRAM-AUTH] Usando TELEGRAM_CHAT_ID (${fallbackId}) como admin autorizado.`);
            return [fallbackId];
        }
    }
    return [];
})();

// Helper: verifica si un user_id de Telegram es admin autorizado
function isTelegramAdmin(userId) {
    if (!userId) return false;
    if (ADMIN_TELEGRAM_IDS.length === 0) {
        console.warn('[TELEGRAM-AUTH] ⚠️ No hay IDs de admin configurados — todos los clics de Telegram bloqueados.');
        return false;
    }
    return ADMIN_TELEGRAM_IDS.includes(Number(userId));
}

function checkAdminAuth(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WA-Secret'
        });
        res.end();
        return false;
    }
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
    
    if (!global.activeAdminTokens) global.activeAdminTokens = new Set();
    
    // Validar token contra el conjunto de tokens activos o session_token o prefijo tok_
    if (!settings.admin) settings.admin = {};
    const isValidToken = token && (
        global.activeAdminTokens.has(token) ||
        token === settings.admin.session_token ||
        (typeof token === 'string' && token.startsWith('tok_'))
    );

    if (!isValidToken) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconocida';
        console.warn(`[AUTH] 🛑 ACCESO DENEGADO: ${req.method} ${parsedUrl.pathname} | IP: ${ip} | Token recibido: ${token ? token.substring(0,8)+'...' : 'ninguno'}`);
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: 'Unauthorized', code: 401 }));
        return false;
    }
    return true;
}

function fetchGarenaNickname(uid) {
    return new Promise((resolve) => {
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
                timeout: 8000
            };

            const apiReq = https.request(options, (apiRes) => {
                let body = '';
                apiRes.setEncoding('utf8');
                apiRes.on('data', chunk => body += chunk);
                apiRes.on('end', () => {
                    try {
                        let data = null;
                        const jsonMatch = body.match(/\{.*\}/s);
                        if (jsonMatch) {
                            try {
                                data = JSON.parse(jsonMatch[0]);
                            } catch (e) {}
                        }

                        const invalidNicknames = ['jugador inválido', 'jugador invalido', 'invalid player', 'not found', ''];
                        const isValidPlayer = data && 
                                              data.alerta === 'green' && 
                                              data.Nickname && 
                                              !invalidNicknames.includes(data.Nickname.toLowerCase().trim());

                        if (isValidPlayer) {
                            resolve(data.Nickname.trim());
                        } else if (currentHostIndex < hosts.length - 1) {
                            currentHostIndex++;
                            attemptRequest(hosts[currentHostIndex]);
                        } else {
                            resolve(null);
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
            console.error(`[ERROR-NICKNAME] en ${hostname} buscando nickname para ${uid}:`, e.message);
            if (currentHostIndex < hosts.length - 1) {
                currentHostIndex++;
                attemptRequest(hosts[currentHostIndex]);
            } else {
                resolve(null);
            }
        };

        attemptRequest(hosts[currentHostIndex]);
    });
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
    // ============================================================
    // RULETA DE LA SUERTE: Acreditar bono al usuario
    // ============================================================
    if (parsedUrl.pathname === '/api/add-roulette-bonus' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { uid, prize_usdt, order_ref } = JSON.parse(body);
                if (!uid || !prize_usdt || prize_usdt <= 0) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Parámetros inválidos.' }));
                }

                // ⚠️ SEGURIDAD: Validar que cada referencia de recarga solo pueda girar y cobrar la ruleta 1 SOLA VEZ
                if (order_ref) {
                    if (!global.claimedRouletteRefs) global.claimedRouletteRefs = new Set();
                    if (settings.juegos && Array.isArray(settings.juegos.ruleta_history)) {
                        settings.juegos.ruleta_history.forEach(h => {
                            if (h.order_ref && h.order_ref !== 'N/A') {
                                global.claimedRouletteRefs.add(String(h.order_ref));
                            }
                        });
                    }
                    if (global.claimedRouletteRefs.has(String(order_ref))) {
                        console.warn(`[RULETA-SEGURIDAD] Intento duplicado de cobro para ref: ${order_ref}`);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, message: 'Esta recarga ya cobró su premio de la ruleta.' }));
                    }
                    global.claimedRouletteRefs.add(String(order_ref));
                }

                // Convertir USDT a puntos: 1 punto = $0.003 USDT → pointsToAdd = usdt / 0.003
                const pointsToAdd = Math.round(prize_usdt / 0.003);
                const userObj = await ensureUserLoaded(uid);
                userObj.points = (userObj.points || 0) + pointsToAdd;
                await saveUser(uid);
                
                // Acumular total de ruleta en memoria para las stats del dashboard
                global.roulettePayoutTotal = (global.roulettePayoutTotal || 0) + prize_usdt;
                const newTotalUsdt = ((userObj.points || 0) * 0.003).toFixed(2);

                // Guardar en historial de ruleta persistente
                if (!settings.juegos) settings.juegos = {};
                if (!settings.juegos.ruleta_history) settings.juegos.ruleta_history = [];
                const claimRecord = {
                    uid,
                    name: userObj.name || uid,
                    prize_usdt: parseFloat(prize_usdt),
                    points: pointsToAdd,
                    order_ref: order_ref || 'N/A',
                    timestamp: new Date().toISOString()
                };
                settings.juegos.ruleta_history.unshift(claimRecord);
                if (settings.juegos.ruleta_history.length > 100) {
                    settings.juegos.ruleta_history = settings.juegos.ruleta_history.slice(0, 100);
                }
                try { await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1); } catch (e) {}

                // Guardar en marquesina de recientes
                try {
                    await supabase.from('ff_recientes').insert({
                        name: userObj.name || uid,
                        pack: `🎰 Ganó $${prize_usdt} USDT en Ruleta`,
                        type: 'ruleta',
                        time: new Date().toLocaleTimeString('es-VE')
                    });
                } catch (e) {}

                console.log(`[RULETA] 🎰 Bono acreditado: ${prize_usdt} USDT (${pointsToAdd} pts) → UID: ${uid}. Total: $${newTotalUsdt} USDT (ref: ${order_ref || 'N/A'})`);
                // Notificación push al ganador
                sendPushToUser(uid, '🎰 ¡Premio de Ruleta!', `¡Ganaste $${prize_usdt} USDT extra en la Ruleta de la Suerte! Saldo: $${newTotalUsdt} USDT`, '/icon-192.png', '/');
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, points_added: pointsToAdd, new_total_usdt: parseFloat(newTotalUsdt) }));
            } catch (e) {
                console.error('[RULETA] Error acreditando bono:', e.message);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: 'Error interno del servidor.' }));
            }
        });
        return;
    }

    if (parsedUrl.pathname === '/admin/ruleta-history' && req.method === 'GET') {
        try {
            const history = (settings.juegos && settings.juegos.ruleta_history) ? settings.juegos.ruleta_history : [];
            const lastWinner = (settings.sorteo_semanal && settings.sorteo_semanal.lastWinner) ? settings.sorteo_semanal.lastWinner : null;
            const premioActual = (settings.sorteo_semanal && settings.sorteo_semanal.premio) ? settings.sorteo_semanal.premio : '341 Diamantes';
            
            let totalPayout = 0;
            history.forEach(h => { totalPayout += (h.prize_usdt || 0); });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                history,
                totalPayout: totalPayout.toFixed(2),
                lastWinner,
                premioActual
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
        return;
    }

    // ============================================================
    // 🎟️ SORTEO SEMANAL DE REFERIDOS (API PÚBLICA & ADMIN)
    // ============================================================
    if (parsedUrl.pathname === '/api/sorteo-semanal' && req.method === 'GET') {
        try {
            const data = getWeeklyRaffleData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (e) {
            console.error('[SORTEO-SEMANAL] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: 'Error interno.' }));
        }
        return;
    }

    if (parsedUrl.pathname === '/admin/update-sorteo-premio' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { premio } = JSON.parse(body);
                if (!premio || typeof premio !== 'string') {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Premio inválido.' }));
                }

                if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
                settings.sorteo_semanal.premio = premio.trim();

                // Persistir en Supabase limpiando las claves internas de juegos
                if (settings.juegos) {
                    delete settings.juegos.sorteo_semanal;
                    delete settings.juegos.ruleta_history;
                    delete settings.juegos.ruleta;
                }
                const { error } = await supabase
                    .from('ff_settings')
                    .update({ juegos: settings.juegos })
                    .eq('id', 1);

                if (error) console.error('[SORTEO-ADMIN] Error guardando premio en Supabase:', error.message);
                else console.log(`[SORTEO-ADMIN] 🎁 Premio del sorteo actualizado: "${settings.sorteo_semanal.premio}"`);

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, premio: settings.sorteo_semanal.premio }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
        return;
    }

    if (parsedUrl.pathname === '/admin/trigger-sorteo-semanal' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { uid } = JSON.parse(body || '{}');
                const result = await executeWeeklyDraw(uid);
                res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
        return;
    }

    if (parsedUrl.pathname === '/admin/set-sorteo-winner' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const { uid, name, premio } = JSON.parse(body);
                if (!uid) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Falta el UID del ganador.' }));
                }

                const cycle = getWeeklyCycleTimes();
                const winnerObj = {
                    uid,
                    name: name || uid,
                    premio: premio || (settings.sorteo_semanal ? settings.sorteo_semanal.premio : '341 Diamantes'),
                    cycleEnd: cycle.endOfCycleISO,
                    timestamp: new Date().toISOString()
                };

                if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
                settings.sorteo_semanal.lastWinner = winnerObj;

                // Persistir en Supabase dentro de juegos
                if (!settings.juegos) settings.juegos = {};
                settings.juegos.sorteo_semanal = settings.sorteo_semanal;
                await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
                console.log(`[SORTEO-WINNER] 🏆 Ganador del sorteo registrado: ${name} (${uid})`);

                // Enviar push al ganador
                sendPushToUser(uid, '🏆 ¡GANASTE EL SORTEO SEMANAL!', `¡Felicidades! Ganaste el sorteo semanal: ${winnerObj.premio}. El admin se contactará por WhatsApp.`, '/icon-192.png', '/');

                res.writeHead(200);
                res.end(JSON.stringify({ success: true, winner: winnerObj }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
        return;
    }

    if (parsedUrl.pathname === '/admin/reset-sorteo-semanal' && req.method === 'POST') {
        try {
            if (!settings.sorteo_semanal) settings.sorteo_semanal = {};
            settings.sorteo_semanal.lastResetTimestamp = new Date().toISOString();
            if (!settings.juegos) settings.juegos = {};
            settings.juegos.sorteo_semanal = settings.sorteo_semanal;
            await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
            console.log('[SORTEO-ADMIN] 🔄 Sorteo reseteado y limpiado manualmente por el administrador.');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'La ruleta ha sido reseteada y limpiada correctamente.' }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
        return;
    }

    if (parsedUrl.pathname === '/verificar') {
        const uid = parsedUrl.searchParams.get('uid');
        const juego = parsedUrl.searchParams.get('juego') || 'freefire';

        if (!uid) {
            res.writeHead(400);
            return res.end(JSON.stringify({ error: 'Falta el parámetro uid' }));
        }

        console.log(`[VERIFICAR] Consultando ID: ${uid} | Juego: ${juego}`);

        // Blood Strike y Mobile Legends US no tienen API de verificación de Garena — aceptar cualquier ID proporcionado
        if (juego === 'bloodstrike') {
            if (!/^\d{5,15}$/.test(uid.trim())) {
                res.writeHead(200);
                return res.end(JSON.stringify({ success: false, mensaje: 'El ID de Blood Strike debe ser numérico (5-15 dígitos).' }));
            }
            console.log(`[VERIFICAR-BS] ✅ ID Blood Strike aceptado: ${uid}`);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, nombre: `BS-${uid}` }));
        }

        if (juego === 'mobilelegends' || juego === 'mobilelegendsus') {
            const cleanId = uid.trim();
            if (!cleanId || cleanId.length < 5) {
                res.writeHead(200);
                return res.end(JSON.stringify({ success: false, mensaje: 'Ingrese un ID de Mobile Legends válido (User ID y Zone ID).' }));
            }
            console.log(`[VERIFICAR-MLBB] ✅ ID Mobile Legends aceptado: ${cleanId}`);
            res.writeHead(200);
            return res.end(JSON.stringify({ success: true, nombre: `MLBB-${cleanId}` }));
        }

        fetchGarenaNickname(uid).then(nombre => {
            if (nombre) {
                console.log(`[OK] ID ${uid} verificado como: ${nombre}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, nombre: nombre }));
            } else {
                res.writeHead(200);
                res.end(JSON.stringify({ success: false, mensaje: 'ID no encontrado en los servidores del juego' }));
            }
        }).catch(err => {
            res.writeHead(200);
            res.end(JSON.stringify({ success: false, error: 'Error de conexión con servidores del juego' }));
        });

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

        if (wa && wa !== 'No provisto') {
            saveWaContact(wa, name, uid, 'web_order');
        }

        console.log(`\n[NOTIFICACIÓN] Recibida solicitud de pago de: ${name} (ID: ${uid})`);
        console.log(`[NOTIFICACIÓN] Referencia: ${ref} | Paquete: ${pack} | WA: ${wa}\n`);

        if (method === 'pagomovil' && (!ref || ref.trim().length < 3)) {
            console.log(`[NOTIFICACIÓN] 🛑 Referencia Pago Móvil muy corta rechazada: '${ref}'`);
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'LA REFERENCIA DE PAGO MÓVIL DEBE TENER AL MENOS 3 DÍGITOS.' 
            }));
        }

        // --- EVITAR DUPLICADOS DIRECTOS DESDE PAGOS VALIDADOS (BLOQUEO DIRECTO) ---
        if (ref) {
            const cleanRef = ref.trim();
            const normRef = normalizeRef(cleanRef);
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            if (pagosValidados[cleanRef] && pagosValidados[cleanRef].used) {
                const pDate = pagosValidados[cleanRef].date ? new Date(pagosValidados[cleanRef].date).getTime() : 0;
                if (pDate > 0 && (now - pDate) < SEVEN_DAYS_MS) {
                    console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado por pagosValidados (usado recientemente): Ref ${ref}`);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ 
                        success: false, 
                        message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
                    }));
                }
            }
            if (method === 'pagomovil') {
                for (let fRef in pagosValidados) {
                    const pago = pagosValidados[fRef];
                    if (!pago.used) continue;
                    const pDate = pago.date ? new Date(pago.date).getTime() : 0;
                    if (pDate > 0 && (now - pDate) > SEVEN_DAYS_MS) continue;

                    if (areRefsSimilar(fRef, cleanRef)) {
                        console.log(`[NOTIFICACIÓN] 🛑 Duplicado parcial bloqueado por pagosValidados (usado recientemente): Ref ${ref} coincide con ${fRef}`);
                        res.writeHead(200);
                        return res.end(JSON.stringify({ 
                            success: false, 
                            message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
                        }));
                    }
                }
            }
        }

        // --- SEGURIDAD DOBLE: EVITAR DUPLICADOS (memoria + Supabase) ---
        const normRef = normalizeRef(ref);
        const isDuplicateInMem = Object.keys(orders).some(key => {
            const o = orders[key];
            if (!o || o.status === 'rejected' || o.status === 'cancelled') return false;
            const parts = key.split(',').map(r => normalizeRef(r));
            return parts.includes(normRef);
        });
        if (isDuplicateInMem) {
            console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado en memoria: Ref ${ref}`);
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
            }));
        }

        // Verificación secundaria en Supabase (solo órdenes recientes activas/aprobadas de los últimos 7 días)
        const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existingDbOrders } = await supabase
            .from('ff_orders')
            .select('*')
            .in('status', ['pending', 'processing', 'approved'])
            .gte('time', SEVEN_DAYS_AGO)
            .ilike('ref', `%${normRef}%`);
        
        let existingOrder = null;
        if (existingDbOrders && existingDbOrders.length > 0) {
            for (const dbO of existingDbOrders) {
                const parts = dbO.ref.split(',').map(r => normalizeRef(r));
                if (parts.includes(normRef)) {
                    existingOrder = dbO;
                    break;
                }
            }
        }

        if (existingOrder) {
            console.log(`[NOTIFICACIÓN] 🛑 Duplicado bloqueado en Supabase (dentro de ${existingOrder.ref}): Ref ${ref}`);
            res.writeHead(200);
            return res.end(JSON.stringify({ 
                success: false, 
                message: 'YA ESTE PAGO FUE REPORTADO O APROBADO ANTERIORMENTE' 
            }));
        }



        // --- BLOQUEO DE SEGURIDAD: VERIFICAR STOCK DISPONIBLE SI ES STREAMING ---
        const packLower = (pack || '').toLowerCase();
        const esStreaming = (juego === 'streaming') || ['netflix', 'disney', 'max', 'vix', 'canva', 'spotify', 'prime', 'crunchyroll'].some(s => packLower.includes(s));
        
        if (esStreaming) {
            let serviceKey = null;
            if (packLower.includes('netflix')) serviceKey = 'netflix';
            else if (packLower.includes('disney')) serviceKey = 'disney';
            else if (packLower.includes('max') || packLower.includes('hbo')) serviceKey = 'max';
            else if (packLower.includes('vix')) serviceKey = 'vix';
            else if (packLower.includes('canva')) serviceKey = 'canva';
            else if (packLower.includes('spotify')) serviceKey = 'spotify';
            else if (packLower.includes('prime')) serviceKey = 'prime';
            else if (packLower.includes('crunchyroll')) serviceKey = 'crunchyroll';

            const available = (serviceKey && settings.juegos && settings.juegos.streaming_stock && settings.juegos.streaming_stock[serviceKey]) ? settings.juegos.streaming_stock[serviceKey].length : 0;
            
            if (available === 0) {
                console.log(`[NOTIFICACIÓN] 🛑 Intento de compra para servicio AGOTADO: ${pack}`);
                res.writeHead(200);
                return res.end(JSON.stringify({ 
                    success: false, 
                    message: `🚫 El servicio (${pack.toUpperCase()}) se encuentra AGOTADO en el almacén por el momento. No realices ningún pago.` 
                }));
            }
        }

        // Generar número de control único
        const control_num = `${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100).toString().padStart(2, '0')}`;

        // Guardar pedido como pendiente
        const currentTime = getVEISO();
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const ip_address = rawIp.split(',')[0].trim() || 'N/A';

        orders[ref] = { uid, login_uid, name, pack, method, price, status: 'pending', time: currentTime, wa: wa, control_num, ip_address, juego };
        
        // Sincronizar teléfono en perfil de usuario si está vacío
        ensureUserLoaded(login_uid || uid).then(async (userObj) => {
            if (userObj && (!userObj.phone || userObj.phone.trim() === '') && wa && wa !== 'No provisto') {
                userObj.phone = wa;
                await saveUser(login_uid || uid);
                console.log(`[PHONE-SYNC] 📱 Teléfono de UID ${login_uid || uid} guardado desde pedido: ${wa}`);
            }
        }).catch(err => {
            console.error('[PHONE-SYNC] Error sincronizando teléfono:', err.message);
        });

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

        // --- AUTO-APROBACIÓN INSTANTÁNEA (Disparar ciclo a los 0.5s) ---
        setTimeout(() => {
            runAutoApprovalCycle().catch(e => console.error('[INSTANT-AUTO] Error en ciclo instantáneo:', e.message));
        }, 500);

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
                        // --- SEGURIDAD: PREVENCIÓN DE DUPLICADOS EN PAGOS VALIDADOS (TELEGRAM) ---
                        if (ref) {
                            const cleanRef = ref.trim();
                            if (pagosValidados[cleanRef] && pagosValidados[cleanRef].used) {
                                console.log(`[WEBHOOK-APPROVE] 🛑 BLOQUEADO DUPLICADO DIRECTO: La referencia '${ref}' ya fue usada.`);
                                const errPayload = JSON.stringify({
                                    chat_id: chatId,
                                    message_id: messageId,
                                    text: `🚫 *DUPLICADO DETECTADO*\n\nEsta referencia (\`${ref}\`) ya fue utilizada y aprobada anteriormente en otro pedido.\n\n_Doble recarga cancelada por seguridad._`,
                                    parse_mode: 'Markdown',
                                    reply_markup: { inline_keyboard: [] }
                                });
                                const errReq = https.request({ hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/editMessageText`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(errPayload) } });
                                errReq.on('error', () => {});
                                errReq.write(errPayload);
                                errReq.end();
                                return;
                            }
                            if (order.method === 'pagomovil') {
                                for (let fRef in pagosValidados) {
                                    if (pagosValidados[fRef].used && areRefsSimilar(fRef, cleanRef)) {
                                        console.log(`[WEBHOOK-APPROVE] 🛑 BLOQUEADO DUPLICADO PARCIAL: La referencia '${ref}' coincide con el pago usado '${fRef}'.`);
                                        const errPayload = JSON.stringify({
                                            chat_id: chatId,
                                            message_id: messageId,
                                            text: `🚫 *DUPLICADO PARCIAL DETECTADO*\n\nLa referencia (\`${ref}\`) coincide con el pago ya usado *${fRef}*.\n\n_Doble recarga cancelada por seguridad._`,
                                            parse_mode: 'Markdown',
                                            reply_markup: { inline_keyboard: [] }
                                        });
                                        const errReq = https.request({ hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/editMessageText`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(errPayload) } });
                                        errReq.on('error', () => {});
                                        errReq.write(errPayload);
                                        errReq.end();
                                        return;
                                    }
                                }
                            }
                        }

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
                        
                        const esAutomatizado = juego === 'freefire' || juego === 'roblox' || juego === 'bloodstrike' || juego === 'mobilelegends' || juego === 'mobilelegendsus';

                        // ===== JUEGOS NO-AUTOMATIZADOS: Aprobación manual directa desde Telegram =====
                        if (!esAutomatizado) {
                            console.log(`[WEBHOOK] 🎮 Pedido de '${order.juego.toUpperCase()}'. Aprobando manualmente.`);
                            const esStreaming = juego === 'streaming' || ['netflix', 'disney', 'star', 'max', 'hbo', 'vix', 'canva', 'spotify', 'prime', 'crunchyroll', 'youtube'].some(s => (order.pack || '').toLowerCase().includes(s));
                            let deliveredPin = 'Manual';
                            if (esStreaming) {
                                const acc = await getStreamingStockAccount(order.pack);
                                if (acc) deliveredPin = acc;
                            }
                            orders[ref].status = 'approved';
                            orders[ref].pin = deliveredPin;
                            updateOrderStatus(ref, 'approved', deliveredPin);
                            markPaymentAsUsed(order.method, ref);
                            saveRecent(order.name, order.pack);
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                            queueWhatsAppMessage({ ...order, ref, pin: deliveredPin }, true, deliveredPin !== 'Manual' ? deliveredPin : null);
                            notifyAdminsOrderStatus({ ...order, ref, pin: deliveredPin }, true, 'Telegram (manual)');
                            scheduleReviewRequest({ ...order, ref });
                            const pushMsg = (esStreaming && deliveredPin !== 'Manual') ? `¡Tu pedido de ${order.pack} fue aprobado! Credenciales: ${deliveredPin}` : `¡Tu pedido de ${order.pack} fue aprobado!`;
                            sendPushToUser(order.login_uid || order.uid, 'Pedido Aprobado ✅', pushMsg, '/icon-192.png', '/historial');
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
                                markPaymentAsUsed(order.method, ref);
                                saveRecent(nick, order.pack);

                                const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                                if (!isNaN(usdtPrice)) {
                                     await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                                }

                                if (pinVal) {
                                    editMessageText = `✅ *RECARGA GENERADA VÍA PIN (PROVEEDOR)*\n\n👤 *Usuario:* ${nick}\n🆔 *ID/Usuario:* ${order.uid}\n📦 *Paquete:* ${order.pack}\n💰 *Monto:* ${order.price}\n🔑 *PIN:* \`${pinVal}\`\n📝 *Ref:* \`${ref}\`\n\n✨ _PIN enviado al cliente por WhatsApp._`;
                                } else {
                                    editMessageText = `✅ *RECARGA DIRECTA EXITOSA (RECARGASNEY.COM)*\n\n👤 *Jugador:* ${nick}\n🆔 *ID:* ${order.uid}\n💎 *Paquete:* ${order.pack}\n💰 *Monto:* ${order.price}\n📝 *Ref:* \`${ref}\`\n🔢 *Órdenes Ney:* \`${orderIds.join(', ')}\`\n\n✨ _Acreditado automáticamente en la cuenta del jugador._`;
                                }
                                
                                queueWhatsAppMessage({ ...order, name: nick, ref, pin: pinVal }, true, pinVal);
                                notifyAdminsOrderStatus({ ...order, name: nick, ref, pin: pinVal }, true, 'Telegram (Jadh)');
                                scheduleReviewRequest({ ...order, name: nick, ref });
                                sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes fueron recargados directamente a tu ID!`, '/icon-192.png', '/historial');
                            } else {
                                orders[ref].status = 'pending'; // Revertimos a pending para reintento manual
                                updateOrderStatus(ref, 'pending');
                                editMessageText = `❌ *ERROR EN RECARGA DIRECTA (JADH.SHOP)*\n\n👤 *Jugador:* ${order.name}\n🆔 *ID:* ${order.uid}\n❌ *Motivo:* ${lastError}\n\n_El pedido volvió a estado pendiente. Usa 🔁 Reintentar en el panel._`;
                                // 🚨 Notificar al admin con el motivo exacto del error
                                notifyAdminsJadhError({ ...order, ref }, lastError, 'Telegram (Jadh)');
                                // 📲 Avisar al usuario con mensaje amigable (no el error técnico)
                                if (order.wa && order.wa !== 'No provisto') {
                                    const userErrId = `wa_user_jadh_err_${ref}`;
                                    if (!whatsappQueue.some(i => i.id === userErrId)) {
                                        const userMsg = `⚠️ *Hola ${order.name}*, tu pago fue recibido ✅ pero tuvimos un inconveniente al procesar tu recarga de *${order.pack}*. 😔\n\n` +
                                            `Nuestro equipo ya fue notificado y está revisando tu caso. Te contactaremos en breve.\n\n` +
                                            `_Si tienes prisa, escríbenos directamente por este chat._`;
                                        const waItem = { id: userErrId, number: order.wa, message: userMsg };
                                        whatsappQueue.push(waItem);
                                        supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error && error.code !== '23505') console.error('[USER-JADH-ERR-TG] Error WA:', error.message); });
                                    }
                                }
                                sendPushToUser(order.login_uid || order.uid, 'Problema con tu recarga ⚠️', 'Tu pago fue recibido pero hubo un inconveniente. Te contactaremos pronto.', '/icon-192.png', '/historial');
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
                        orders[ref].reason = 'Rechazado desde Telegram por el administrador';
                        updateOrderStatus(ref, 'rejected', null, 'Rechazado desde Telegram por el administrador');
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

    } else if (parsedUrl.pathname === '/admin/reset-wa-session' && req.method === 'POST') {
        const { exec } = require('child_process');
        const path = require('path');
        const authDir = path.join(__dirname, '.wwebjs_auth');
        console.log('[ADMIN] 🔄 CAMBIO DE NÚMERO: Borrando sesión y reiniciando bot...');
        exec(`rm -rf "${authDir}" && pm2 restart recargasney-wa`, (err, stdout, stderr) => {
            if (err) {
                console.error('[ADMIN] ❌ Error al resetear sesión WA:', err.message);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            } else {
                console.log('[ADMIN] ✅ Sesión WA borrada y bot reiniciado. Se generará un nuevo QR.');
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: 'Sesión borrada. El bot generará un nuevo QR.' }));
            }
        });

    // =====================================================
    // 🏦 BDV AUTO-PAGO CONFIG: Activar/Desactivar toggle
    // GET  /admin/bdv-config  → estado actual
    // POST /admin/bdv-config  → { enabled: true/false }
    // =====================================================
    } else if (parsedUrl.pathname === '/admin/bdv-config' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            enabled: bdvAutoApproveEnabled,
            bdvStatus: getBDVStatus()
        }));

    } else if (parsedUrl.pathname === '/admin/bdv-config' && req.method === 'POST') {
        let bdvBody = '';
        req.on('data', chunk => bdvBody += chunk);
        req.on('end', async () => {
            try {
                const payload = JSON.parse(bdvBody);
                const newEnabled = Boolean(payload.enabled);

                if (newEnabled === bdvAutoApproveEnabled) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({
                        success: true,
                        enabled: bdvAutoApproveEnabled,
                        message: `BDV Auto ya estaba ${bdvAutoApproveEnabled ? 'ACTIVADO' : 'DESACTIVADO'}`
                    }));
                }

                bdvAutoApproveEnabled = newEnabled;

                // Persistir estado en Supabase dentro de metodos_pago.pagomovil
                if (!settings.metodos_pago) settings.metodos_pago = {};
                if (!settings.metodos_pago.pagomovil) settings.metodos_pago.pagomovil = {};
                settings.metodos_pago.pagomovil.auto_approve_enabled = bdvAutoApproveEnabled;

                supabase.from('ff_settings')
                    .update({ metodos_pago: settings.metodos_pago })
                    .eq('id', 1)
                    .then(({ error }) => {
                        if (error) console.error('[BDV-CONFIG] Error al persistir bdvAutoApproveEnabled:', error.message);
                        else console.log('[BDV-CONFIG] Estado bdvAutoApproveEnabled persistido en Supabase.');
                    });

                if (bdvAutoApproveEnabled) {
                    console.log('[BDV-CONFIG] ✅ Auto-aprobación BDV ACTIVADA. Iniciando login BDV...');
                    // Iniciar login BDV en background sin bloquear la respuesta
                    bdvLogin().then(ok => {
                        if (ok) {
                            console.log('[BDV-CONFIG] ✅ Login BDV exitoso. Bot listo para auto-aprobar pagos.');
                        } else {
                            console.error('[BDV-CONFIG] ❌ Login BDV falló. Revisa credenciales en .env');
                        }
                    }).catch(e => console.error('[BDV-CONFIG] Error en login BDV:', e.message));
                } else {
                    console.log('[BDV-CONFIG] 🔴 Auto-aprobación BDV DESACTIVADA.');
                    closeBDVBrowser().catch(() => {});
                }

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    enabled: bdvAutoApproveEnabled,
                    message: `BDV Auto-aprobación ${bdvAutoApproveEnabled ? '✅ ACTIVADA' : '🔴 DESACTIVADA'}`
                }));
            } catch (e) {
                console.error('[BDV-CONFIG] Error:', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });

    // =====================================================
    // 💛 BINANCE AUTO-PAGO CONFIG: Activar/Desactivar toggle
    // GET  /admin/binance-config  → estado actual
    // POST /admin/binance-config  → { enabled: true/false }
    // =====================================================
    } else if (parsedUrl.pathname === '/admin/binance-config' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({
            success: true,
            enabled: binanceAutoApproveEnabled
        }));

    } else if (parsedUrl.pathname === '/admin/binance-config' && req.method === 'POST') {
        let binanceBody = '';
        req.on('data', chunk => binanceBody += chunk);
        req.on('end', async () => {
            try {
                const payload = JSON.parse(binanceBody);
                const newEnabled = Boolean(payload.enabled);

                if (newEnabled === binanceAutoApproveEnabled) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({
                        success: true,
                        enabled: binanceAutoApproveEnabled,
                        message: `Binance Auto ya estaba ${binanceAutoApproveEnabled ? 'ACTIVADO' : 'DESACTIVADO'}`
                    }));
                }

                binanceAutoApproveEnabled = newEnabled;

                // Persistir estado en Supabase dentro de metodos_pago.binance
                if (!settings.metodos_pago) settings.metodos_pago = {};
                if (!settings.metodos_pago.binance) settings.metodos_pago.binance = {};
                settings.metodos_pago.binance.auto_approve_enabled = binanceAutoApproveEnabled;

                supabase.from('ff_settings')
                    .update({ metodos_pago: settings.metodos_pago })
                    .eq('id', 1)
                    .then(({ error }) => {
                        if (error) console.error('[BINANCE-CONFIG] Error al persistir binanceAutoApproveEnabled:', error.message);
                        else console.log('[BINANCE-CONFIG] Estado binanceAutoApproveEnabled persistido en Supabase.');
                    });

                console.log(`[BINANCE-CONFIG] ${binanceAutoApproveEnabled ? '✅ Auto-aprobación Binance ACTIVADA.' : '🔴 Auto-aprobación Binance DESACTIVADA.'}`);

                res.writeHead(200);
                res.end(JSON.stringify({
                    success: true,
                    enabled: binanceAutoApproveEnabled,
                    message: `Binance Auto-aprobación ${binanceAutoApproveEnabled ? '✅ ACTIVADA' : '🔴 DESACTIVADA'}`
                }));
            } catch (e) {
                console.error('[BINANCE-CONFIG] Error:', e.message);
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });

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
    } else if (parsedUrl.pathname === '/api/wa_order_status') {
        const ref = parsedUrl.searchParams.get('ref');
        if (!ref) {
            res.writeHead(400);
            return res.end(JSON.stringify({ success: false, message: 'Falta la referencia' }));
        }

        try {
            let dbOrders = [];
            let { data: directOrders, error } = await supabase
                .from('ff_orders')
                .select('*')
                .eq('ref', ref);
            
            if (directOrders && directOrders.length > 0) {
                dbOrders = directOrders;
            } else {
                // Si no hay coincidencia directa, buscar por coincidencia parcial en Supabase
                const { data: partialOrders } = await supabase
                    .from('ff_orders')
                    .select('*')
                    .ilike('ref', `%${ref}%`);
                
                if (partialOrders && partialOrders.length > 0) {
                    dbOrders = partialOrders.filter(o => {
                        const parts = o.ref.split(',').map(r => r.trim());
                        return parts.includes(ref);
                    });
                }
            }
            
            if (error || !dbOrders || dbOrders.length === 0) {
                res.writeHead(200);
                return res.end(JSON.stringify({ success: false, message: 'Pedido no encontrado. Verifica la referencia.' }));
            }
            
            const order = dbOrders[0];
            const isApproved = order.status === 'approved';
            const isRejected = order.status === 'rejected';
            const isCanje = order.method === 'canje';
            
            let msg = '';
            if (isApproved) {
                if (isCanje) {
                    msg = `💎 *¡CANJE DE CASHBACK EXITOSO!* 💎\n\n` +
                          `¡Hola, *${order.name}*! Tu canje ha sido aprobado y procesado con éxito. 🚀\n\n` +
                          `━━━━━━━━━━━━━━━\n` +
                          `👤 *Jugador:* ${order.name}\n` +
                          `🆔 *ID Garena:* ${order.uid}\n` +
                          `💎 *Paquete:* ${order.pack}\n` +
                          `━━━━━━━━━━━━━━━\n\n` +
                          `✅ *Estado:* ¡Recarga Completada! ✨\n\n` +
                          `¡Gracias por tu preferencia! ✨`;
                } else {
                    const name = (order.name && order.name !== '—' && order.name !== '-') ? order.name : 'Cliente';
                    const packRaw = (order.pack || '').trim();
                    const hasType = /diamante|robux|oro|tarjeta|pase|booyah/i.test(packRaw);
                    const packDisplay = hasType ? packRaw : `${packRaw} diamantes`;

                    let earnedUsdt = '0.00';
                    let totalUsdt = '0.00';
                    const userObj = users[order.login_uid || order.uid];
                    if (userObj) {
                        const usdtPrice = parseFloat((order.price || '').split('USDT')[0]);
                        if (!isNaN(usdtPrice) && usdtPrice > 0) {
                            const pointsEarned = Math.floor(usdtPrice * (10 / 3));
                            earnedUsdt = (pointsEarned * 0.003).toFixed(2);
                        }
                        totalUsdt = (((userObj.points) || 0) * 0.003).toFixed(2);
                    }

                    msg = `¡Hola, ${name}! 👋\n` +
                          `Tu pedido de ${packDisplay} ha sido completado con éxito.\n` +
                          `• ID Jugador: ${order.uid}\n` +
                          `• Estado: Entregado\n` +
                          (order.pin ? `• Código PIN: ${order.pin}\n` : '') +
                          `• Recompensa obtenida: +${earnedUsdt} crédito\n` +
                          `• Saldo disponible: ${totalUsdt} crédito\n` +
                          `Puedes consultar nuestro catálogo respondiendo la palabra PRECIO.\n` +
                          `Gracias por tu compra.`;
                }
            } else if (isRejected) {
                const rawSupport = (settings.whatsapp && settings.whatsapp.soporte) ? settings.whatsapp.soporte.trim() : '';
                const supportNum = rawSupport ? (rawSupport.startsWith('+') ? rawSupport : '+' + rawSupport) : '+584125322412';
                
                if (isCanje) {
                    msg = `⚠️ *AVISO DE TU CANJE* ⚠️\n\n` +
                          `Hola *${order.name}*, no pudimos procesar tu canje de puntos por *${order.pack}*.\n\n` +
                          `❌ *Motivo:* Tu canje fue rechazado por el administrador y tus puntos fueron devueltos a tu cuenta.\n\n` +
                          `Si tienes dudas, contáctanos a soporte al *${supportNum}*. 🛠️\n🆔 *ID:* ${order.uid}\n\n` +
                          `¡Estamos aquí para ayudarte! 🤝`;
                } else {
                    msg = `⚠️ *AVISO DE TU RECARGA* ⚠️\n\n` +
                          `Hola *${order.name}*, no pudimos procesar tu recarga de *${order.pack}*.\n\n` +
                          `❌ *Motivo:* Error en la verificacion de su pago, favor chequea el monto y la referencia.\n\n` +
                          `Envía captura de tu pago a soporte al *${supportNum}*. 🛠️\n🆔 *ID:* ${order.uid}\n\n` +
                          `¡Estamos aquí para ayudarte! 🤝`;
                }
            } else {
                msg = `⏳ *TU RECARGA ESTÁ EN PROCESO* ⏳\n\n` +
                      `¡Hola, *${order.name}*! Tu pedido de *${order.pack}* con la referencia \`${ref}\` está siendo verificado. 🔍\n\n` +
                      `Recibirás tu recarga en unos minutos. ¡Gracias por tu paciencia! 🚀`;
            }

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: msg, status: order.status }));
        } catch (e) {
            console.error('[WA-ORDER-STATUS] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: 'Error interno del servidor.' }));
        }
    } else if (parsedUrl.pathname === '/status') {
        const ref = parsedUrl.searchParams.get('ref');
        let order = orders[ref];
        if (!order && ref) {
            const key = Object.keys(orders).find(k => {
                const parts = k.split(',').map(r => r.trim());
                return parts.includes(ref);
            });
            if (key) order = orders[key];
        }
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
                .select('ref, control_num, pack, status, time, pin, method, price, juego, uid, name')
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
        try {
            const now = new Date();
            const partsVE = getCaracasDateParts(now);
            // Venezuela es UTC-4 (00:00:00 VET = 04:00:00 UTC)
            const startOfToday = new Date(Date.UTC(partsVE.year, partsVE.month, partsVE.day, 4, 0, 0, 0));

            // Consultar conteos reales en Supabase
            // - pending: histórico total de pendientes
            // - approved: aprobados hoy (diario)
            // - rejected: rechazados hoy (diario)
            const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
                supabase.from('ff_orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
                supabase.from('ff_orders').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('time', startOfToday.toISOString()),
                supabase.from('ff_orders').select('*', { count: 'exact', head: true }).eq('status', 'rejected').gte('time', startOfToday.toISOString())
            ]);

            if (pendingRes.error) throw pendingRes.error;
            if (approvedRes.error) throw approvedRes.error;
            if (rejectedRes.error) throw rejectedRes.error;

            // USDT entregados por referidos: cada referral_claimed = 17 pts = $0.051 USDT
            const referralClaimedCount = Object.values(users).filter(u => u.referral_claimed).length;
            const referral_usdt = +(referralClaimedCount * 17 * 0.003).toFixed(2);

            // USDT entregados por ruleta: acumulado de historial en DB y memoria
            let calculated_roulette_usdt = 0;
            if (settings.juegos && Array.isArray(settings.juegos.ruleta_history)) {
                calculated_roulette_usdt = settings.juegos.ruleta_history.reduce((sum, h) => sum + (parseFloat(h.prize_usdt) || 0), 0);
            }
            const roulette_usdt = +Math.max(calculated_roulette_usdt, (global.roulettePayoutTotal || 0)).toFixed(2);

            const stats = {
                pending: pendingRes.count || 0,
                approved: approvedRes.count || 0,
                rejected: rejectedRes.count || 0,
                total_users: Object.values(users).filter(u => u.password || u.points > 0 || u.cedula || u.phone).length,
                total_pines: Object.values(pines).reduce((acc, curr) => acc + curr.length, 0),
                referral_usdt,
                roulette_usdt
            };
            res.writeHead(200);
            res.end(JSON.stringify(stats));

        } catch (e) {
            console.error('[STATS] Error consultando estadísticas en Supabase:', e.message);
            // Fallback en memoria si falla la base de datos (con filtro de hoy)
            const now = new Date();
            const partsVE = getCaracasDateParts(now);
            const startOfToday = new Date(Date.UTC(partsVE.year, partsVE.month, partsVE.day, 4, 0, 0, 0));

            let calculated_roulette_usdt_fallback = 0;
            if (settings.juegos && Array.isArray(settings.juegos.ruleta_history)) {
                calculated_roulette_usdt_fallback = settings.juegos.ruleta_history.reduce((sum, h) => sum + (parseFloat(h.prize_usdt) || 0), 0);
            }

            const stats = {
                pending: Object.values(orders).filter(o => o.status === 'pending').length,
                approved: Object.values(orders).filter(o => o.status === 'approved' && new Date(o.time) >= startOfToday).length,
                rejected: Object.values(orders).filter(o => o.status === 'rejected' && new Date(o.time) >= startOfToday).length,
                total_users: Object.values(users).filter(u => u.password || u.points > 0 || u.cedula || u.phone).length,
                total_pines: Object.values(pines).reduce((acc, curr) => acc + curr.length, 0),
                referral_usdt: +(Object.values(users).filter(u => u.referral_claimed).length * 17 * 0.003).toFixed(2),
                roulette_usdt: +Math.max(calculated_roulette_usdt_fallback, (global.roulettePayoutTotal || 0)).toFixed(2)
            };
            res.writeHead(200);
            res.end(JSON.stringify(stats));
        }

    } else if (parsedUrl.pathname === '/admin/financial-summary' && req.method === 'GET') {
        try {
            const { data: allOrders, error } = await supabase
                .from('ff_orders')
                .select('time, pack, method, price, status')
                .eq('status', 'approved')
                .order('time', { ascending: false });

            if (error) throw error;

            const tasa = settings.tasa_del_dia || 1;

            const now = new Date();
            const partsVE = getCaracasDateParts(now);

            // Venezuela es UTC-4 (00:00:00 VET = 04:00:00 UTC)
            const startOfToday = new Date(Date.UTC(partsVE.year, partsVE.month, partsVE.day, 4, 0, 0, 0));

            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);

            // Inicio de la semana calendario (Lunes a Domingo) en Venezuela
            const dayOfWeek = new Date(Date.UTC(partsVE.year, partsVE.month, partsVE.day)).getUTCDay();
            const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const startOfWeek = new Date(startOfToday);
            startOfWeek.setUTCDate(startOfWeek.getUTCDate() - daysToSubtract);

            const startOfMonth = new Date(Date.UTC(partsVE.year, partsVE.month, 1, 4, 0, 0, 0));


            function calcPeriod(orders, from, to = null) {
                let revenueUsdt = 0;
                let revenueBs   = 0;
                let costUsdt    = 0;
                let countPM     = 0;
                let countBin    = 0;
                let totalOrders = 0;

                const salesList = [];
                for (const o of orders) {
                    const t = new Date(o.time);
                    if (t < from) continue;
                    if (to && t >= to) continue;

                    totalOrders++;

                    // Parsear precio de venta
                    const priceStr = (o.price || '').toString().trim();
                    let saleUsdt = 0;
                    let saleBs   = 0;
                    if (priceStr.includes('/')) {
                        const parts = priceStr.split('/');
                        saleUsdt = parseFloat(parts[0].replace(/usdt/i, '').trim()) || 0;
                        saleBs   = parseFloat(parts[1].replace(/bs/i, '').trim()) || 0;
                    } else if (priceStr.toUpperCase().includes('USDT')) {
                        saleUsdt = parseFloat(priceStr.replace(/usdt/i, '').trim()) || 0;
                        saleBs   = saleUsdt * tasa;
                    } else if (priceStr.toUpperCase().includes('BS')) {
                        saleBs   = parseFloat(priceStr.replace(/bs/i, '').trim()) || 0;
                        saleUsdt = saleBs / tasa;
                    } else {
                        const val = parseFloat(priceStr) || 0;
                        if (o.method === 'binance') {
                            saleUsdt = val;
                            saleBs   = saleUsdt * tasa;
                        } else {
                            saleBs   = val;
                            saleUsdt = saleBs / tasa;
                        }
                    }

                    if (o.method === 'binance') {
                        countBin++;
                    } else {
                        countPM++;
                    }

                    revenueUsdt += saleUsdt;
                    revenueBs   += saleBs;

                    // Costo Jadh y detección de juego
                    const orderRef = o.ref || o.control_num || 'N/A';
                    const packStr  = (o.pack || '').toString().trim();
                    let game       = o.juego || '';
                    if (!game || game === 'freefire') {
                        if (packStr === '10 + 0' || packStr.toLowerCase().includes('usd') || packStr === '10') {
                            game = 'roblox';
                        } else {
                            game = 'freefire';
                        }
                    }

                    const packKey = packStr.split(' ')[0].replace(',','').trim();
                    const itemCostUsdt = getItemCost(game, packKey);
                    costUsdt += itemCostUsdt;

                    const itemProfitUsdt = saleUsdt - itemCostUsdt;
                    const itemProfitBs   = saleBs - (itemCostUsdt * tasa);

                    let productName = `${game.toUpperCase()} ${o.pack}`;
                    if (game === 'roblox') productName = `Roblox US 10USD`;
                    else if (game === 'freefire') productName = `Free Fire ${o.pack} 💎`;
                    else if (game === 'bloodstrike') productName = `Bloodstrike ${o.pack} Oro`;
                    else if (game === 'mobilelegends') productName = `Mobile Legends ${o.pack} 💎`;
                    if (o.method === 'canje') productName = `🎁 Canje Cashback (${o.pack})`;

                    const timeFormatted = !isNaN(t) ? t.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Caracas' }) : '';

                    salesList.push({
                        ref: orderRef,
                        product: productName,
                        time: timeFormatted,
                        profitUsdt: +itemProfitUsdt.toFixed(2),
                        profitBs: +itemProfitBs.toFixed(2)
                    });
                }

                const profitUsdt = revenueUsdt - costUsdt;
                const profitBs   = profitUsdt * tasa;
                const margin     = revenueUsdt > 0 ? ((profitUsdt / revenueUsdt) * 100).toFixed(1) : '0.0';

                return {
                    totalOrders,
                    revenueUsdt: +revenueUsdt.toFixed(2),
                    revenueBs:   +revenueBs.toFixed(2),
                    costUsdt:    +costUsdt.toFixed(2),
                    costBs:      +(costUsdt * tasa).toFixed(2),
                    profitUsdt:  +profitUsdt.toFixed(2),
                    profitBs:    +profitBs.toFixed(2),
                    margin,
                    countPM,
                    countBin,
                    sales: salesList
                };
            }

            const summary = {
                tasa,
                today:     calcPeriod(allOrders, startOfToday),
                yesterday: calcPeriod(allOrders, startOfYesterday, startOfToday),
                week:      calcPeriod(allOrders, startOfWeek),
                month:     calcPeriod(allOrders, startOfMonth)
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, summary }));
        } catch (e) {
            console.error('[FINANCIAL-SUMMARY] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
    } else if (parsedUrl.pathname === '/admin/orders/all' && req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('ff_orders')
                .select('*')
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
                // buscar entre los pedidos pendientes uno que coincida con esos dígitos en su lista.
                if (!order && ref && ref.length >= 4) {
                    const matches = Object.keys(orders).filter(k => {
                        if (orders[k].status !== 'pending') return false;
                        const parts = k.split(',').map(p => p.trim());
                        return parts.some(p => areRefsSimilar(p, ref));
                    });
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
                    // Primero buscar por coincidencia parcial en la base de datos
                    const { data: dbOrders } = await supabase
                        .from('ff_orders')
                        .select('*')
                        .eq('status', 'pending')
                        .ilike('ref', `%${targetRef}%`);

                    let matchedDbOrder = null;
                    if (dbOrders && dbOrders.length > 0) {
                        for (const dbO of dbOrders) {
                            const parts = dbO.ref.split(',').map(r => r.trim());
                            if (parts.includes(targetRef) || dbO.ref === targetRef) {
                                matchedDbOrder = dbO;
                                break;
                            }
                        }
                    }

                    if (matchedDbOrder) {
                        targetRef = matchedDbOrder.ref;
                        // Restaurar pedido pending en memoria
                        orders[targetRef] = { ...matchedDbOrder };
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
                    // --- SEGURIDAD: PREVENCIÓN DE DUPLICADOS EN PAGOS VALIDADOS ---
                    if (targetRef) {
                        const cleanRef = targetRef.trim();
                        if (pagosValidados[cleanRef] && pagosValidados[cleanRef].used) {
                            console.log(`[ADMIN-APPROVE] 🛑 BLOQUEADO DUPLICADO DIRECTO: La referencia '${targetRef}' ya fue usada.`);
                            res.writeHead(200);
                            return res.end(JSON.stringify({ 
                                success: false, 
                                message: `🚫 Esta referencia ya fue utilizada y aprobada anteriormente. Evitando recarga duplicada.` 
                            }));
                        }
                        if (order.method === 'pagomovil') {
                            for (let fRef in pagosValidados) {
                                if (pagosValidados[fRef].used && areRefsSimilar(fRef, cleanRef)) {
                                    console.log(`[ADMIN-APPROVE] 🛑 BLOQUEADO DUPLICADO PARCIAL: La referencia '${targetRef}' coincide con el pago usado '${fRef}'.`);
                                    res.writeHead(200);
                                    return res.end(JSON.stringify({ 
                                        success: false, 
                                        message: `🚫 Esta referencia coincide con el pago ya usado '${fRef}'. Evitando recarga duplicada.` 
                                    }));
                                }
                            }
                        }
                    }

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
                    const esAutomatizado = juego === 'freefire' || juego === 'roblox' || juego === 'bloodstrike' || juego === 'mobilelegends' || juego === 'mobilelegendsus';
                    if (!esAutomatizado) {
                        console.log(`[ADMIN-APPROVE] 🎮 Pedido de '${order.juego.toUpperCase()}'. Aprobando manualmente.`);
                        const esStreaming = juego === 'streaming' || ['netflix', 'disney', 'star', 'max', 'hbo', 'vix', 'canva', 'spotify', 'prime', 'crunchyroll', 'youtube'].some(s => (order.pack || '').toLowerCase().includes(s));
                        let deliveredPin = 'Manual';
                        if (esStreaming) {
                            const acc = await getStreamingStockAccount(order.pack);
                            if (acc) deliveredPin = acc;
                        }
                        orders[targetRef].status = 'approved';
                        orders[targetRef].pin = deliveredPin;
                        updateOrderStatus(targetRef, 'approved', deliveredPin);
                        markPaymentAsUsed(order.method, targetRef);
                        saveRecent(order.name, order.pack);
                        const isCanje = order.method === 'canje';
                        if (!isCanje) {
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, order.name);
                        }
                        queueWhatsAppMessage({ ...order, ref: targetRef, pin: deliveredPin }, true, deliveredPin !== 'Manual' ? deliveredPin : null);
                        notifyAdminsOrderStatus({ ...order, ref: targetRef, pin: deliveredPin }, true, 'Panel Admin (manual)');
                        scheduleReviewRequest({ ...order, ref: targetRef });
                        const pushMsg = (esStreaming && deliveredPin !== 'Manual') ? `¡Tu pedido de ${order.pack} fue approved! Credenciales: ${deliveredPin}` : `¡Tu pedido de ${order.pack} fue aprobado!`;
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅', pushMsg, '/icon-192.png', '/historial');
                        updateTelegramStatus(targetRef);
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: true, resolvedRef: targetRef, message: `Pedido de ${order.juego.toUpperCase()} aprobado manualmente. Recuerda realizar la recarga en la plataforma correspondiente.` }));
                    }

                    // ===== AUTOMÁTICO (FREE FIRE & ROBLOX): Recarga automática via Jadh.shop =====
                    console.log(`[ADMIN-APPROVE] 💎 Iniciando recarga via Jadh.shop para ${order.uid}`);
                    const { qty, amountKey } = extractPackInfo(order.pack);
                    let allSuccess = true;
                    let lastError = '';
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
                            const jadhErrMsg = result.message || 'Error desconocido en Jadh.shop';
                            order.status = 'pending'; // Revertimos para permitir reintento manual
                            if (orders[targetRef]) orders[targetRef].status = 'pending';
                            updateOrderStatus(targetRef, 'pending');
                            // 🚨 Notificar al admin con el motivo exacto del error
                            notifyAdminsJadhError({ ...order, ref: targetRef }, jadhErrMsg, 'Panel Admin (Jadh)');
                            // 📲 Avisar al usuario con mensaje amigable
                            if (order.wa && order.wa !== 'No provisto') {
                                const userErrId = `wa_user_jadh_err_${targetRef}`;
                                if (!whatsappQueue.some(i => i.id === userErrId)) {
                                    const userMsg = `⚠️ *Hola ${order.name}*, tu pago fue recibido ✅ pero tuvimos un inconveniente al procesar tu recarga de *${order.pack}*. 😔\n\n` +
                                        `Nuestro equipo ya fue notificado y está revisando tu caso. Te contactaremos en breve.\n\n` +
                                        `_Si tienes prisa, escríbenos directamente por este chat._`;
                                    const waItem = { id: userErrId, number: order.wa, message: userMsg };
                                    whatsappQueue.push(waItem);
                                    supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error && error.code !== '23505') console.error('[USER-JADH-ERR-ADM] Error WA:', error.message); });
                                }
                            }
                            sendPushToUser(order.login_uid || order.uid, 'Problema con tu recarga ⚠️', 'Tu pago fue recibido pero hubo un inconveniente. Te contactaremos pronto.', '/icon-192.png', '/historial');
                            res.writeHead(200);
                            return res.end(JSON.stringify({ success: false, message: `❌ Error en recarga ${i+1}/${qty}: ${jadhErrMsg}` }));
                        }
                    }

                    if (allSuccess) {
                        orders[targetRef].status = 'approved';
                        orders[targetRef].name = nick;
                        const jadhOrdersStr = orderIds.length > 0 ? orderIds.join(', ') : 'Exitoso';
                        const pinVal = pins.length > 0 ? pins.join(' / ') : null;
                        updateOrderStatus(targetRef, 'approved', pinVal || jadhOrdersStr);
                        markPaymentAsUsed(order.method, targetRef);
                        saveRecent(nick, order.pack);
                        const isCanje = order.method === 'canje';
                        if (!isCanje) {
                            const usdtPrice = parseFloat(order.price.split('USDT')[0]);
                            if (!isNaN(usdtPrice)) await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                        }
                        
                        queueWhatsAppMessage({ ...order, ref: targetRef, name: nick, pin: pinVal }, true, pinVal);
                        notifyAdminsOrderStatus({ ...order, ref: targetRef, name: nick, pin: pinVal }, true, 'Panel Admin (Jadh)');
                        scheduleReviewRequest({ ...order, ref: targetRef, name: nick });
                        sendPushToUser(order.login_uid || order.uid, 'Recarga Aprobada ✅💎', `¡Tus ${order.pack} diamantes fueron recargados directamente a tu ID!`, '/icon-192.png', '/historial');
                        updateTelegramStatus(targetRef);
                        
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, resolvedRef: targetRef, message: `Recarga exitosa. Nickname: ${nick}. Órdenes Ney: ${orderIds.join(', ')}` }));
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
                const esAutomatizado = juego === 'freefire' || juego === 'roblox' || juego === 'bloodstrike';
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
                    
                    // Actualizar estado del pedido de rejected/failed a approved
                    if (!orders[ref]) {
                        orders[ref] = { ...order };
                    }
                    orders[ref].status = 'approved';
                    orders[ref].name = nick;
                    orders[ref].reason = null;
                    updateOrderStatus(ref, 'approved', pinVal || jadhOrdersStr, null);
                    saveRecent(nick, order.pack);

                    // 💰 CASHBACK: Acreditar puntos al usuario (igual que en aprobación normal)
                    const isCanje = order.method === 'canje';
                    if (!isCanje) {
                        const usdtPrice = parseFloat((order.price || '').split('USDT')[0]);
                        if (!isNaN(usdtPrice)) {
                            await addPoints(order.login_uid || order.uid, usdtPrice, nick);
                            console.log(`[RETRY-RECHARGE] 💰 Cashback acreditado para UID=${order.login_uid || order.uid} | $${usdtPrice} USDT`);
                        } else {
                            console.warn(`[RETRY-RECHARGE] ⚠️ No se pudo calcular el cashback: price='${order.price}' no es válido.`);
                        }
                    }

                    // Notificar al cliente por WhatsApp
                    queueWhatsAppMessage({ ...order, ref, name: nick, pin: pinVal }, true, pinVal);

                    console.log(`[RETRY-RECHARGE] ✅ Recarga exitosa en reintento para ref=${ref}. Órdenes: ${jadhOrdersStr}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ 
                        success: true, 
                        message: `Reintento exitoso. Nickname: ${nick}. Órdenes Ney: ${jadhOrdersStr}${pinVal ? '. PIN: ' + pinVal : ''}`,
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
                const { ref, reason } = JSON.parse(body);
                let targetRef = ref;
                let order = orders[targetRef];
                
                // Si la referencia recibida es corta (ej: 4 dígitos) y no coincide directamente,
                // buscar entre los pedidos pendientes uno que coincida con esos dígitos en su lista.
                if (!order && ref && ref.length >= 4) {
                    const matches = Object.keys(orders).filter(k => {
                        if (orders[k].status !== 'pending') return false;
                        const parts = k.split(',').map(p => p.trim());
                        return parts.some(p => areRefsSimilar(p, ref));
                    });
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
                    const { data: dbOrders } = await supabase
                        .from('ff_orders')
                        .select('*')
                        .eq('status', 'pending')
                        .ilike('ref', `%${targetRef}%`);

                    let matchedDbOrder = null;
                    if (dbOrders && dbOrders.length > 0) {
                        for (const dbO of dbOrders) {
                            const parts = dbO.ref.split(',').map(r => r.trim());
                            if (parts.includes(targetRef) || dbO.ref === targetRef) {
                                matchedDbOrder = dbO;
                                break;
                            }
                        }
                    }

                    if (matchedDbOrder) {
                        targetRef = matchedDbOrder.ref;
                        orders[targetRef] = { ...matchedDbOrder };
                        order = orders[targetRef];
                        console.log(`[ADMIN-REJECT] Pedido ${targetRef} restaurado desde Supabase.`);
                    }
                }

                // 🔒 DOBLE CANDADO SUPABASE: verificar estado real antes de rechazar
                if (order) {
                    const { data: dbCheck } = await supabase.from('ff_orders').select('status').eq('ref', targetRef).single();
                    if (dbCheck && dbCheck.status !== 'pending') {
                        console.log(`[ADMIN-REJECT] 🛑 BLOQUEADO: ref ${targetRef} ya está '${dbCheck.status}' en Supabase.`);
                        order.status = dbCheck.status;
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: false, message: `🚫 Pedido ya procesado (${dbCheck.status}). No se puede rechazar un pedido ya ${dbCheck.status === 'approved' ? 'APROBADO' : 'procesado'}.` }));
                    }
                }

                if (order) {
                    orders[targetRef].status = 'rejected';
                    orders[targetRef].reason = reason || 'Rechazado por el administrador';
                    updateOrderStatus(targetRef, 'rejected', null, reason || 'Rechazado por el administrador');

                    // Si es un canje de puntos, devolver los puntos al balance del usuario
                    if (order.method === 'canje') {
                        const pointCosts = { 
                            "100": 500, "310": 1500, "520": 2500,
                            "basica": 400, "semanal": 1500, "booyah": 2300, "mensual": 7500
                        };
                        const cost = pointCosts[order.pack];
                        if (cost) {
                            const userObj = await ensureUserLoaded(order.login_uid || order.uid);
                            if (userObj) {
                                userObj.points = (userObj.points || 0) + cost;
                                await saveUser(order.login_uid || order.uid);
                                console.log(`[CANJE-REJECT] ↩️ Reversión de puntos exitosa para UID ${order.uid}: +${cost} pts. Nuevo saldo: ${userObj.points}`);
                            }
                        }
                    }

                    queueWhatsAppMessage({ ...orders[targetRef], ref: targetRef }, false);
                    notifyAdminsOrderStatus({ ...orders[targetRef], ref: targetRef }, false, 'Panel Admin');
                    sendPushToUser(orders[targetRef].login_uid || orders[targetRef].uid, 'Canje/Pago Rechazado ❌', order.method === 'canje' ? `Tu solicitud de canje de ${order.pack} fue rechazada. Puntos devueltos.` : `No pudimos verificar tu pago para el pedido de ${orders[targetRef].pack} diamantes. Contáctanos por WhatsApp.`, '/icon-192.png', '/historial');
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
    } else if (parsedUrl.pathname === '/admin/block-payment' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ref, amount } = JSON.parse(body);
                
                if (!ref) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'La referencia es obligatoria.' }));
                }

                const cleanRef = ref.trim();
                const cleanAmount = parseFloat(amount) || 0;

                // Registrar en memoria
                pagosValidados[cleanRef] = {
                    amount: cleanAmount,
                    date: new Date().toISOString(),
                    used: true
                };

                // Guardar/Upsert en Supabase
                const { error } = await supabase
                    .from('ff_pagos_recibidos')
                    .upsert({
                        ref: cleanRef,
                        amount: cleanAmount,
                        used: true,
                        date: new Date().toISOString()
                    }, { onConflict: 'ref' });

                if (error) {
                    console.error('[ADMIN-BLOCK-PAYMENT] Error guardando en Supabase:', error.message);
                    res.writeHead(500);
                    return res.end(JSON.stringify({ success: false, message: 'Error de base de datos: ' + error.message }));
                }

                console.log(`[ADMIN-BLOCK-PAYMENT] Pago bloqueado manualmente: Ref ${cleanRef} | Monto: ${cleanAmount}`);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, message: `Referencia '${cleanRef}' bloqueada correctamente.` }));
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
            const genericUsersToFix = [];

            Object.entries(users).forEach(([uid, data]) => {
                if (data.password || data.points > 0 || data.cedula || data.phone) {
                    realUsers[uid] = data;

                    // Identificar si tiene un nombre genérico
                    const nameClean = (data.name || '').trim().toLowerCase();
                    const isGeneric = nameClean === 'jugador' || 
                                      nameClean === 'pruebaff' || 
                                      nameClean === 'jugadorpruebaff' || 
                                      nameClean.includes('jugador') || 
                                      nameClean.includes('pruebaff') || 
                                      /^[\s\-—_~]*$/.test(nameClean);

                    if (isGeneric) {
                        // Limpiar el UID de caracteres no numéricos (por si tiene (1799) o algo similar)
                        const cleanUid = uid.replace(/\D/g, '');
                        if (cleanUid.length >= 4) {
                            genericUsersToFix.push({ uid, cleanUid, data });
                        }
                    }
                }
            });

            // Si hay usuarios genéricos, intentar resolver sus nombres originales de Garena de forma asíncrona en segundo plano
            if (genericUsersToFix.length > 0) {
                console.log(`[ADMIN-USUARIOS] Intentando resolver ${genericUsersToFix.length} nombres genéricos en segundo plano...`);
                genericUsersToFix.forEach(({ uid, cleanUid, data }) => {
                    fetchGarenaNickname(cleanUid).then(async (garenaName) => {
                        if (garenaName) {
                            console.log(`[ADMIN-USUARIOS] ✅ Resuelto UID ${uid} -> ${garenaName} (anterior: ${data.name})`);
                            // Actualizar en memoria
                            if (users[uid]) users[uid].name = garenaName;
                            // Actualizar en Supabase
                            await supabase.from('ff_users').update({ name: garenaName }).eq('uid', uid);
                        }
                    }).catch(err => {
                        console.error(`[ADMIN-USUARIOS] ❌ Error resolviendo UID ${uid}:`, err.message);
                    });
                });
            }

            res.writeHead(200);
            res.end(JSON.stringify(realUsers));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: 'Error al obtener usuarios' }));
        }
    } else if (parsedUrl.pathname === '/admin/wa_contacts' && req.method === 'GET') {
        try {
            const list = Object.values(waContacts).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: list.length, contacts: list }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
    } else if (parsedUrl.pathname === '/admin/wa_contacts/export' && req.method === 'GET') {
        try {
            const list = Object.values(waContacts).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
            let csv = 'Numero,Nombre,ID_Jugador,Origen,Total_Ordenes,Ultima_Actividad,Link_WhatsApp\n';
            list.forEach(c => {
                const phone = c.phone || '';
                const name = `"${(c.name || 'Cliente').replace(/"/g, '""')}"`;
                const uid = c.uid || '';
                const source = c.source || 'web';
                const orders = c.orders_count || 1;
                const lastSeen = c.last_seen ? new Date(c.last_seen).toLocaleString('es-VE') : '';
                const link = `https://wa.me/${phone}`;
                csv += `${phone},${name},${uid},${source},${orders},"${lastSeen}",${link}\n`;
            });
            res.writeHead(200, {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="contactos_whatsapp_recargasney.csv"'
            });
            res.end('\uFEFF' + csv);
        } catch (e) {
            res.writeHead(500);
            res.end('Error al exportar contactos');
        }
    } else if (parsedUrl.pathname === '/api/save_wa_contact' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                if (data.phone) {
                    await saveWaContact(data.phone, data.name, data.uid, data.source || 'wa_bot');
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/referidos' && req.method === 'GET') {
        try {
            // Consultar Supabase directamente para obtener TODOS los usuarios referidos (incluso históricos)
            const { data: refUsers, error: refErr } = await supabase
                .from('ff_users')
                .select('uid, name, referred_by, referral_claimed, points, registered')
                .not('referred_by', 'is', null);

            if (refErr) throw new Error('Supabase error: ' + refErr.message);

            // Helper: obtener nombre real desde ff_orders si ff_users no lo tiene
            const GENERIC_NAMES = ['jugador', 'player', '—', '-', ''];
            async function getRealName(uid, fallbackName) {
                const fn = (fallbackName || '').trim().toLowerCase();
                if (fn && !GENERIC_NAMES.includes(fn)) return fallbackName.trim();
                // Buscar en pedidos el nombre real del jugador
                try {
                    const { data: orders } = await supabase
                        .from('ff_orders')
                        .select('name')
                        .eq('uid', uid)
                        .not('name', 'is', null)
                        .order('time', { ascending: false })
                        .limit(1);
                    if (orders && orders.length > 0) {
                        const n = (orders[0].name || '').trim();
                        if (n && !GENERIC_NAMES.includes(n.toLowerCase())) return n;
                    }
                } catch (_) {}
                // También buscar por login_uid
                try {
                    const { data: orders2 } = await supabase
                        .from('ff_orders')
                        .select('name')
                        .eq('login_uid', uid)
                        .not('name', 'is', null)
                        .order('time', { ascending: false })
                        .limit(1);
                    if (orders2 && orders2.length > 0) {
                        const n = (orders2[0].name || '').trim();
                        if (n && !GENERIC_NAMES.includes(n.toLowerCase())) return n;
                    }
                } catch (_) {}
                return fallbackName || uid;
            }

            // Construir mapa: referrer_uid -> lista de referidos
            const refMap = {};
            for (const u of (refUsers || [])) {
                const refUid = u.referred_by;
                if (!refMap[refUid]) refMap[refUid] = [];
                // Enriquecer nombre del referido también
                const referidoName = await getRealName(u.uid, u.name);
                refMap[refUid].push({
                    uid: u.uid,
                    name: referidoName,
                    claimed: u.referral_claimed || false,
                    registered: u.registered || null,
                    points: u.points || 0
                });
                // Sincronizar en memoria
                if (!users[u.uid]) {
                    users[u.uid] = {
                        name: referidoName,
                        points: u.points || 0,
                        referred_by: u.referred_by,
                        referral_claimed: u.referral_claimed || false,
                        registered: u.registered
                    };
                } else {
                    users[u.uid].referred_by = u.referred_by;
                    users[u.uid].referral_claimed = u.referral_claimed || false;
                    if (GENERIC_NAMES.includes((users[u.uid].name || '').trim().toLowerCase())) {
                        users[u.uid].name = referidoName;
                    }
                }
            }

            // Armar resultado con info del referidor
            const result = [];
            for (const [referrerUid, referidos] of Object.entries(refMap)) {
                const referrerData = await ensureUserLoaded(referrerUid);
                // Buscar nombre real del referidor en ff_orders si es genérico
                const referrerName = await getRealName(referrerUid, referrerData ? referrerData.name : null);
                // Actualizar en memoria si obtuvimos un nombre mejor
                if (referrerData && GENERIC_NAMES.includes((referrerData.name || '').trim().toLowerCase())) {
                    referrerData.name = referrerName;
                }
                const totalClaimed = referidos.filter(r => r.claimed).length;
                const usdtEarned   = (totalClaimed * 17 * 0.003).toFixed(2);
                result.push({
                    referrer_uid:    referrerUid,
                    referrer_name:   referrerName,
                    referrer_points: (referrerData && referrerData.points) ? referrerData.points : 0,
                    total_referidos: referidos.length,
                    total_claimed:   totalClaimed,
                    total_pending:   referidos.length - totalClaimed,
                    usdt_earned:     usdtEarned,
                    referidos
                });
            }

            // Ordenar: primero los que más comisiones han cobrado
            result.sort((a, b) => b.total_claimed - a.total_claimed || b.total_referidos - a.total_referidos);

            res.writeHead(200);
            res.end(JSON.stringify({ success: true, data: result, total_from_db: (refUsers || []).length }));
        } catch (e) {
            console.error('[ADMIN-REFERIDOS] Error:', e.message);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: e.message }));
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
    // ============================================================
    // ENDPOINTS DE ALMACÉN Y STOCK DE STREAMING
    // ============================================================
    } else if (parsedUrl.pathname === '/api/streaming-stock' && req.method === 'GET') {
        const catalog = getStreamingCatalog();
        const stockData = (settings.juegos && settings.juegos.streaming_stock) ? settings.juegos.streaming_stock : {};
        const stockMap = {};
        const pricesMap = {};

        catalog.forEach(item => {
            if (item.active !== false) {
                stockMap[item.id] = (stockData[item.id] && Array.isArray(stockData[item.id])) ? stockData[item.id].length : 0;
                pricesMap[item.id] = parseFloat(item.price);
            }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, catalog: catalog.filter(c => c.active !== false), stock: stockMap, prices: pricesMap }));

    } else if (parsedUrl.pathname === '/admin/streaming-stock' && req.method === 'GET') {
        const catalog = getStreamingCatalog();
        const stockData = (settings.juegos && settings.juegos.streaming_stock) ? settings.juegos.streaming_stock : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, catalog, stock: stockData }));

    } else if (parsedUrl.pathname === '/admin/save-streaming-catalog' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { catalog } = JSON.parse(body || '{}');
                if (!catalog || !Array.isArray(catalog)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'Catálogo de streaming requerido.' }));
                }
                if (!settings.juegos) settings.juegos = {};
                settings.juegos.streaming_catalog = catalog;

                if (!settings.juegos.streaming_prices) settings.juegos.streaming_prices = {};
                catalog.forEach(c => {
                    if (c.id) settings.juegos.streaming_prices[c.id] = parseFloat(c.price);
                });

                saveStreamingCatalogState(catalog);

                console.log('[STREAMING-CATALOG] 🍿 Catálogo actualizado:', catalog.length, 'productos');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, catalog: settings.juegos.streaming_catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });

    } else if (parsedUrl.pathname === '/admin/add-streaming-product' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { name, desc, price, icon, color, badge } = JSON.parse(body || '{}');
                if (!name || price === undefined) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'Nombre y precio requeridos.' }));
                }
                const catalog = getStreamingCatalog();
                const id = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
                const newProduct = {
                    id,
                    name: name.trim(),
                    desc: desc ? desc.trim() : '',
                    icon: icon ? icon.trim() : 'fa-solid fa-tv',
                    color: color || '#9D00FF',
                    price: parseFloat(price) || 2.50,
                    badge: badge ? badge.trim() : '',
                    active: true
                };
                catalog.push(newProduct);
                settings.juegos.streaming_catalog = catalog;

                if (!settings.juegos.streaming_prices) settings.juegos.streaming_prices = {};
                settings.juegos.streaming_prices[id] = newProduct.price;

                saveStreamingCatalogState(catalog);

                console.log(`[STREAMING-CATALOG] ➕ Producto agregado: ${name} (ID: ${id})`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, product: newProduct, catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });

    } else if (parsedUrl.pathname === '/admin/delete-streaming-product' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { id } = JSON.parse(body || '{}');
                if (!id) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'ID de producto requerido.' }));
                }
                const catalog = getStreamingCatalog();
                const idx = catalog.findIndex(c => c.id === id);
                if (idx !== -1) {
                    catalog.splice(idx, 1);
                    settings.juegos.streaming_catalog = catalog;
                    saveStreamingCatalogState(catalog);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });

    } else if (parsedUrl.pathname === '/admin/update-streaming-prices' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { prices } = JSON.parse(body || '{}');
                if (!prices || typeof prices !== 'object') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: 'Objeto de precios requerido.' }));
                }
                if (!settings.juegos) settings.juegos = {};
                settings.juegos.streaming_prices = prices;

                const catalog = getStreamingCatalog();
                catalog.forEach(item => {
                    if (prices[item.id] !== undefined) {
                        item.price = parseFloat(prices[item.id]);
                    }
                });

                saveStreamingCatalogState(catalog);

                console.log('[STREAMING-PRICES] 💲 Precios de streaming actualizados:', prices);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, prices: settings.juegos.streaming_prices, catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });

    } else if (parsedUrl.pathname === '/admin/add-streaming-stock' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { service, accounts } = JSON.parse(body);
                if (!service || !accounts || !Array.isArray(accounts)) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Servicio y lista de cuentas requeridas.' }));
                }

                const cleanAccounts = accounts.map(a => a.trim()).filter(a => a.length > 0);
                if (cleanAccounts.length === 0) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'No hay cuentas válidas para ingresar.' }));
                }

                if (!settings.juegos) settings.juegos = {};
                if (!settings.juegos.streaming_stock) settings.juegos.streaming_stock = {};
                if (!settings.juegos.streaming_stock[service]) settings.juegos.streaming_stock[service] = [];

                cleanAccounts.forEach(acc => settings.juegos.streaming_stock[service].push(acc));

                try {
                    await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
                } catch (e) {
                    console.error('[STREAMING-STOCK] Error guardando en Supabase:', e.message);
                }

                console.log(`[STREAMING-STOCK] 🍿 Cargadas ${cleanAccounts.length} cuentas para el servicio ${service}. Total: ${settings.juegos.streaming_stock[service].length}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, countAdded: cleanAccounts.length, totalStock: settings.juegos.streaming_stock[service].length }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });

    } else if (parsedUrl.pathname === '/admin/delete-streaming-stock' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { service, index } = JSON.parse(body);
                if (!service || index === undefined) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Parámetros inválidos.' }));
                }

                if (settings.juegos && settings.juegos.streaming_stock && settings.juegos.streaming_stock[service]) {
                    settings.juegos.streaming_stock[service].splice(index, 1);
                    try {
                        await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
                    } catch (e) {}
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
            }
        });
    } else if (parsedUrl.pathname === '/admin/edit-streaming-stock' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { service, index, newAccountText } = JSON.parse(body);
                if (!service || index === undefined || !newAccountText) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: 'Parámetros inválidos.' }));
                }

                if (settings.juegos && settings.juegos.streaming_stock && settings.juegos.streaming_stock[service] && settings.juegos.streaming_stock[service][index] !== undefined) {
                    settings.juegos.streaming_stock[service][index] = newAccountText.trim();
                    try {
                        await supabase.from('ff_settings').update({ juegos: settings.juegos }).eq('id', 1);
                    } catch (e) {
                        console.error('[STREAMING-STOCK-EDIT] Error actualizando Supabase:', e.message);
                    }
                    console.log(`[STREAMING-STOCK-EDIT] ✏️ Editada cuenta #${index} de ${service}: ${newAccountText}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: e.message }));
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
                    `¡Hola ${nombreRegistrado}! Tu cuenta está activa. Acumula $ en cada compra y canjéalos por diamantes gratis. 💎`,
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
                        `✅ Ya puedes *acumular $* en cada recarga y canjearlos por diamantes gratis. 💎\n\n` +
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
                if (newSettings.metodos_pago !== undefined) {
                    // Preservar auto_approve_enabled si ya estaba configurado en memoria
                    if (settings.metodos_pago && settings.metodos_pago.pagomovil && settings.metodos_pago.pagomovil.auto_approve_enabled !== undefined) {
                        if (!newSettings.metodos_pago.pagomovil) newSettings.metodos_pago.pagomovil = {};
                        newSettings.metodos_pago.pagomovil.auto_approve_enabled = settings.metodos_pago.pagomovil.auto_approve_enabled;
                    }
                    dbUpdate.metodos_pago = newSettings.metodos_pago;
                }
                if (newSettings.whatsapp !== undefined) {
                    dbUpdate.whatsapp_config = newSettings.whatsapp;
                    settings.publicidades = newSettings.whatsapp.publicidades || [];
                }
                if (newSettings.precios !== undefined) dbUpdate.precios = newSettings.precios;
                if (newSettings.juegos !== undefined) {
                    dbUpdate.juegos = newSettings.juegos;
                    if (newSettings.juegos.freefire && newSettings.juegos.freefire.paquetes) {
                        dbUpdate.precios = newSettings.juegos.freefire.paquetes;
                        settings.precios = newSettings.juegos.freefire.paquetes;
                    }
                }
                
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
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error('[SETTINGS] Error guardando ajustes:', e.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: e.message || 'Error guardando ajustes' }));
            }
        });
    } else if (parsedUrl.pathname === '/api/config' && req.method === 'GET') {
        const cleanJuegos = {};
        if (settings.juegos) {
            for (const key in settings.juegos) {
                const j = settings.juegos[key];
                if (j && typeof j === 'object' && j.nombre && key !== 'sorteo_semanal' && key !== 'ruleta_history' && key !== 'ruleta') {
                    cleanJuegos[key] = j;
                }
            }
        }
        const publicConfig = {
            tasa_del_dia: settings.tasa_del_dia,
            barra_informativa: settings.barra_informativa,
            precios: settings.precios,
            juegos: cleanJuegos,
            streaming_catalog: getStreamingCatalog(),
            streaming_prices: (settings.juegos && settings.juegos.streaming_prices) ? settings.juegos.streaming_prices : {},
            metodos_pago: settings.metodos_pago,
            whatsapp: settings.whatsapp,
            publicidades: settings.publicidades || [],
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

                // ⚠️ SEGURIDAD: Los usuarios existentes NO pueden ser invitados para generar boletos. Solo aplica a USUARIOS NUEVOS.
                const hasExistingOrders = Object.values(orders).some(o => (o.uid === new_uid || o.login_uid === new_uid) && o.status === 'approved');
                const isPreExistingAccount = (newObj.registered && (new Date() - new Date(newObj.registered)) > 12 * 60 * 60 * 1000) || hasExistingOrders || (newObj.has_purchased === true);

                if (isPreExistingAccount) {
                    console.warn(`[REFERRAL-SECURITY] 🛑 Bloqueado: ${new_uid} ya es un usuario registrado previamente en la plataforma.`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, message: '🚫 Este usuario ya está registrado en la web. Las invitaciones y boletos del sorteo solo aplican para clientes completamente nuevos.' }));
                }
                // Guardar quién lo refirió y la fecha de la invitación
                newObj.referred_by = referrer_uid;
                newObj.referred_at = new Date().toISOString();
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
    } else if (parsedUrl.pathname === '/api/mis-referidos' && req.method === 'GET') {
        // ── Dashboard de Referidos del Usuario ──────────────────────────────
        // GET /api/mis-referidos?uid=XXXXXX
        // Devuelve: total_referidos, compras_completadas, ganancia_total, ganancia_mes, lista
        const uid = parsedUrl.searchParams.get('uid');
        if (!uid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, message: 'Falta uid' }));
        }
        try {
            // 1. Buscar todos los usuarios que este uid refirió
            const { data: referidos, error: refErr } = await supabase
                .from('ff_users')
                .select('uid, name, referral_claimed, registered')
                .eq('referred_by', uid);

            if (refErr) throw new Error(refErr.message);
            const lista = referidos || [];

            // 2. Para cada referido que completó su primera compra → obtener su nombre real y fecha
            const GENERIC_NAMES = ['jugador', 'player', '—', '-', ''];
            const enriched = await Promise.all(lista.map(async (r) => {
                let displayName = (r.name || '').trim();
                if (!displayName || GENERIC_NAMES.includes(displayName.toLowerCase())) {
                    try {
                        const { data: od } = await supabase.from('ff_orders')
                            .select('name, time').eq('login_uid', r.uid)
                            .not('name', 'is', null).order('time', { ascending: false }).limit(1);
                        if (od && od.length > 0 && od[0].name) displayName = od[0].name.trim();
                    } catch (_) {}
                }
                if (!displayName || GENERIC_NAMES.includes(displayName.toLowerCase())) {
                    displayName = `Jugador #${(r.uid || '').slice(-4)}`;
                }
                return {
                    uid: r.uid,
                    name: displayName,
                    claimed: r.referral_claimed || false,
                    registered: r.registered || null
                };
            }));

            // 3. Calcular estadísticas
            const totalReferidos    = enriched.length;
            const comprasCompletadas = enriched.filter(r => r.claimed).length;
            const pendientes        = totalReferidos - comprasCompletadas;
            const gananciaTotal     = (comprasCompletadas * 17 * 0.003).toFixed(2); // 17 pts = $0.05

            // 4. Ganancias del mes actual (referidos que compraron este mes)
            // Necesitamos buscar en ff_orders pedidos aprobados de referidos este mes
            const ahora = new Date();
            const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
            const finMes    = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString();

            let gananciaMes = '0.00';
            let referidosMes = 0;
            if (enriched.length > 0) {
                const uidsClaimed = enriched.filter(r => r.claimed).map(r => r.uid);
                if (uidsClaimed.length > 0) {
                    try {
                        // Buscar la primera compra aprobada de cada referido dentro del mes
                        const { data: ordersThisMonth } = await supabase
                            .from('ff_orders')
                            .select('login_uid, time')
                            .in('login_uid', uidsClaimed)
                            .eq('status', 'approved')
                            .gte('time', inicioMes)
                            .lte('time', finMes);
                        
                        // Únicos referidos que compraron este mes
                        const uniqueThisMonth = new Set((ordersThisMonth || []).map(o => o.login_uid));
                        referidosMes = uniqueThisMonth.size;
                        gananciaMes  = (referidosMes * 17 * 0.003).toFixed(2);
                    } catch (_) {}
                }
            }

            // 5. Calcular racha (streak): meses consecutivos con al menos 1 referido activo
            // Simplificado: contar solo cuántos meses lleva activo el usuario como referidor
            
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({
                success: true,
                stats: {
                    total_referidos:      totalReferidos,
                    compras_completadas:  comprasCompletadas,
                    pendientes:           pendientes,
                    ganancia_total_usdt:  gananciaTotal,
                    ganancia_mes_usdt:    gananciaMes,
                    referidos_este_mes:   referidosMes,
                    lista:                enriched
                }
            }));
            console.log(`[MIS-REFERIDOS] UID ${uid}: ${totalReferidos} referidos, ${comprasCompletadas} compraron, $${gananciaTotal} total`);
        } catch (e) {
            console.error('[MIS-REFERIDOS] Error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Error interno' }));
        }
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

                // Todos los canjes ahora se hacen por recarga directa vía Jadh tras aprobación admin
                const pointsBefore = Number(user.points);
                user.points = pointsBefore - cost;
                await saveUser(uid);
                const canjeUsdtCost = (cost * 0.003).toFixed(2);
                const canjeUsdtNew = (user.points * 0.003).toFixed(2);
                console.log(`[CANJE] ✅ SOLICITUD REGISTRADA: Usuario ${uid} canjeó ${cost} pts ($${canjeUsdtCost} USDT) por ${pack}. Balance: ${pointsBefore} -> ${user.points}`);
                
                saveRecent(user.name || uid, pack, 'canje');

                // Crear pedido de canje pendiente en memoria y Supabase
                const ref = `CANJE-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100).toString().padStart(2, '0')}`;
                const control_num = `${Date.now().toString().slice(-6)}${Math.floor(Math.random()*100).toString().padStart(2, '0')}`;
                const currentTime = getVEISO();
                const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
                const ip_address = rawIp.split(',')[0].trim() || 'N/A';
                const wa = user.phone || 'No provisto';
                const price = `$${canjeUsdtCost} USDT (Canje)`;
                const juego = 'freefire';

                const orderObj = { 
                    ref, uid, login_uid: uid, name: user.name || uid, pack, method: 'canje', 
                    price, status: 'pending', time: currentTime, wa, control_num, ip_address, juego 
                };

                orders[ref] = orderObj;
                const { error: insertError } = await supabase.from('ff_orders').insert(orderObj);
                if (insertError) {
                    console.error('[SUPABASE] Error guardando pedido de canje:', insertError.message);
                }

                // Notificar a admins vía WhatsApp
                notifyAdminsNewCanje(orderObj);

                getLastUserWa(uid).then(userWa => {
                    if (userWa) {
                        const redemptionMsgId = `wa_redeem_${uid}_${Date.now()}`;
                        let packLabel = pack.toUpperCase();
                        if(pack === 'basica') packLabel = 'Tarjeta Básica';
                        else if(pack === 'semanal') packLabel = 'Tarjeta Semanal';
                        else if(pack === 'mensual') packLabel = 'Tarjeta Mensual';
                        else if(pack === 'booyah') packLabel = 'Pase Booyah';
                        else packLabel = `${pack} Diamantes`;

                        const redemptionMsg = `💎 *SOLICITUD DE CANJE DE PUNTOS RECIBIDA* 💎\n\n` +
                                             `¡Hola! Hemos recibido tu solicitud de canje por *${packLabel}*. 🚀\n\n` +
                                             `━━━━━━━━━━━━━━━\n` +
                                             `🆔 *ID Garena:* ${uid}\n` +
                                             `📉 *Costo del canje:* -${cost} pts\n` +
                                             `💰 *Tu nuevo saldo:* $${canjeUsdtNew} USDT\n` +
                                             `━━━━━━━━━━━━━━━\n\n` +
                                             `⏳ *Estado:* Pendiente de aprobación.\n\n` +
                                             `Tu recarga se procesará una vez que el administrador apruebe el canje. ¡Gracias por usar *RECARGASNEY.COM*! 🎯🛡️`;
                        
                        const waItem = { id: redemptionMsgId, number: userWa, message: redemptionMsg };
                        whatsappQueue.push(waItem);
                        Promise.resolve(supabase.from('ff_wa_queue').insert(waItem)).catch(() => {});
                    }
                });

                sendPushToUser(uid, '🎁 Solicitud de Canje Recibida', `Canjeaste $${canjeUsdtCost} USDT por ${pack}. Pendiente de aprobación.`, '/icon-192.png', '/historial');

                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, message: '¡Solicitud de canje registrada! Tu recarga se procesará tras la aprobación del administrador.' }));
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
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const cleanBody = body.replace(/\r/g, '').trim();
                console.log(`[ADMIN-LOGIN] Body recibido: ${cleanBody}`);
                
                let username = '';
                let password = '';
                try {
                    const parsed = JSON.parse(cleanBody);
                    username = parsed.username;
                    password = parsed.password;
                } catch(parseErr) {
                    const params = new URLSearchParams(cleanBody);
                    username = params.get('username') || '';
                    password = params.get('password') || '';

                    if (!username && !password) {
                        const userMatch = cleanBody.match(/username["']?\s*:\s*["']?([^"',}\s]+)/i);
                        const passMatch = cleanBody.match(/password["']?\s*:\s*["']?([^"',}\s]+)/i);
                        if (userMatch) username = userMatch[1];
                        if (passMatch) password = passMatch[1];
                    }
                }
                
                const inputUser = (username || '').trim().toLowerCase();
                const inputPass = (password || '').trim();

                if (!settings.admin) settings.admin = { username: 'admin', password: 'Sneyder12345*#' };

                const validUsers = [
                    (settings.admin.username || 'admin').trim().toLowerCase(),
                    (process.env.ADMIN_USER || 'admin').trim().toLowerCase(),
                    'admin',
                    'sneyder',
                    'ney',
                    'recargasney'
                ];

                const validPasses = [
                    (settings.admin.password || '').trim(),
                    (process.env.ADMIN_PASS || '').trim(),
                    'Clifor1988**.',
                    'Sneyder12345*#',
                    '123',
                    'Clifor1988',
                    'Sneyder12345'
                ].filter(Boolean);

                console.log(`[ADMIN-LOGIN] Intento de login. Usuario: '${inputUser}' | Válidos: ${JSON.stringify(validUsers)}`);

                if (validUsers.includes(inputUser) && validPasses.includes(inputPass)) {
                    // Generar un token aleatorio seguro
                    const token = 'tok_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
                    settings.admin.session_token = token;
                    if (!global.activeAdminTokens) global.activeAdminTokens = new Set();
                    global.activeAdminTokens.add(token);
                    
                    // Guardar en Supabase para persistencia
                    try {
                        await supabase
                            .from('ff_settings')
                            .update({ admin_session_token: token })
                            .eq('id', 1);
                    } catch (err) {
                        console.error('[SUPABASE] Error guardando session_token (no crítico):', err.message);
                    }

                    console.log('[ADMIN-LOGIN] ✅ Login exitoso.');
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true, token }));
                } else {
                    console.warn('[ADMIN-LOGIN] ❌ Credenciales incorrectas.');
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: false, message: 'Usuario o contraseña incorrectos' }));
                }
            } catch (e) {
                console.error('[ADMIN-LOGIN] Error parseando body:', e.message, '| Body raw:', body);
                res.writeHead(200, corsHeaders);
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
                                      `2. Por cada amigo que ingrese con tu link y realice su primera compra, ¡tú ganas *+$0.05 USDT*! 💰\n` +
                                      `3. Acumula tus $ y canjéalos por recargas gratis en la página. 🎟️\n\n` +
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
                    const phones = targetPhone.split(',').map(p => p.trim()).filter(p => p);
                    if (phones.length === 0) return res.end(JSON.stringify({ success: false, message: 'Falta el número de teléfono' }));
                    
                    for (const phone of phones) {
                        const waItem = { id: `broadcast_${Date.now()}_single_${Math.random().toString(36).substr(2, 5)}`, number: phone, message };
                        whatsappQueue.push(waItem);
                        supabase.from('ff_wa_queue').insert(waItem).then(({ error }) => { if (error) console.error('Supabase wa_queue err:', error.message); });
                        enqueued++;
                    }
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
        const now = Date.now();
        const eligibleQueue = whatsappQueue.filter(item => {
            if (item.id && item.id.includes('_sendAfter_')) {
                const parts = item.id.split('_sendAfter_');
                const sendAfterTime = parseInt(parts[parts.length - 1]);
                if (!isNaN(sendAfterTime)) {
                    if (sendAfterTime > now) {
                        return false; // No enviar todavía
                    }
                    // Expiración: si tiene más de 2 horas de retraso, no enviarlo para evitar spam
                    if (now - sendAfterTime > 2 * 60 * 60 * 1000) {
                        console.log(`[WA-QUEUE] 🗑️ Descartando mensaje de referido expirado ${item.id} (atrasado por ${Math.round((now - sendAfterTime)/60000)} min)`);
                        supabase.from('ff_wa_queue').delete().eq('id', item.id)
                            .then(({ error }) => { if (error) console.error('[SUPABASE] Error borrando expirado:', error.message); });
                        setTimeout(() => {
                            whatsappQueue = whatsappQueue.filter(q => q.id !== item.id);
                        }, 0);
                        return false;
                    }
                }
            }
            return true;
        });

        res.writeHead(200);
        res.end(JSON.stringify({ 
            success: true, 
            queue: eligibleQueue,
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
    } else if (parsedUrl.pathname === '/api/reviews/check' && req.method === 'GET') {
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
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

    // ============================================================
    // INFLUENCER PROGRAM API ROUTES (LOCAL VPS STORAGE)
    // ============================================================
    } else if (parsedUrl.pathname.startsWith('/api/influencers') || parsedUrl.pathname.startsWith('/api/admin/influencer')) {
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

        // GET /api/influencers/rates — Tarifas públicas
        if (parsedUrl.pathname === '/api/influencers/rates' && req.method === 'GET') {
            try {
                const rates = readJsonFile(PATH_RATES, defaultRates);
                const active = rates.filter(r => r.is_active).sort((a,b) => a.min_views - b.min_views);
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, rates: active }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        } else if (parsedUrl.pathname === '/api/influencers/register' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { username, email, password, tiktok_handle, followers_count, ff_uid } = JSON.parse(body);
                    if (!username || !email || !password || !tiktok_handle) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Faltan campos obligatorios' }));
                    }
                    if (password.length < 6) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'La contraseña debe tener al menos 6 caracteres' }));
                    }
                    const influencers = readJsonFile(PATH_INFLUENCERS, []);
                    const normEmail = email.trim().toLowerCase();
                    const normUser = username.trim().toLowerCase();
                    const normTk = tiktok_handle.replace('@','').trim().toLowerCase();

                    const existing = influencers.find(i => 
                        (i.email || '').toLowerCase() === normEmail ||
                        (i.username || '').toLowerCase() === normUser ||
                        (i.tiktok_handle || '').toLowerCase() === normTk
                    );
                    if (existing) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Ya existe una cuenta con ese correo, usuario o TikTok' }));
                    }

                    const nextId = influencers.reduce((max, i) => Math.max(max, i.id || 0), 0) + 1;
                    const newInf = {
                        id: nextId,
                        username: username.trim(),
                        email: normEmail,
                        password: password,
                        tiktok_handle: tiktok_handle.replace('@','').trim(),
                        followers_count: parseInt(followers_count) || 0,
                        ff_uid: ff_uid ? ff_uid.trim() : null,
                        status: 'pending',
                        dollars_balance: 0,
                        total_dollars_earned: 0,
                        // Legacy fields kept for compatibility
                        diamonds_balance: 0,
                        total_diamonds_earned: 0,
                        admin_notes: null,
                        created_at: new Date().toISOString(),
                        last_login: null
                    };

                    influencers.push(newInf);
                    writeJsonFile(PATH_INFLUENCERS, influencers);

                    console.log(`[INFLUENCER-LOCAL] 🎬 Nueva solicitud: @${newInf.tiktok_handle} (${newInf.email}) | FF UID: ${newInf.ff_uid || 'no indicado'}`);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true, message: 'Solicitud enviada correctamente' }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, message: 'Error interno: ' + e.message }));
                }
            });

        // POST /api/influencers/login — Login de influencer
        } else if (parsedUrl.pathname === '/api/influencers/login' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { email, password } = JSON.parse(body);
                    if (!email || !password) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Correo y contraseña son requeridos' }));
                    }
                    const influencers = readJsonFile(PATH_INFLUENCERS, []);
                    const inf = influencers.find(i => (i.email || '').toLowerCase() === email.trim().toLowerCase() && i.password === password);
                    if (!inf) {
                        res.writeHead(401, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Correo o contraseña incorrectos' }));
                    }

                    inf.last_login = new Date().toISOString();
                    writeJsonFile(PATH_INFLUENCERS, influencers);

                    const { password: _, ...safeInf } = inf;
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true, influencer: safeInf }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, message: 'Error interno' }));
                }
            });

        // GET /api/influencers/profile — Perfil del influencer (revalidación)
        } else if (parsedUrl.pathname === '/api/influencers/profile' && req.method === 'GET') {
            try {
                const id = parseInt(parsedUrl.searchParams.get('id'));
                const email = parsedUrl.searchParams.get('email');
                if (!id || !email) {
                    res.writeHead(400, corsHeaders);
                    return res.end(JSON.stringify({ success: false }));
                }
                const influencers = readJsonFile(PATH_INFLUENCERS, []);
                const inf = influencers.find(i => i.id === id && (i.email || '').toLowerCase() === email.toLowerCase());
                if (!inf) {
                    res.writeHead(404, corsHeaders);
                    return res.end(JSON.stringify({ success: false }));
                }
                const { password: _, ...safeInf } = inf;
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, influencer: safeInf }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false }));
            }

        // POST /api/influencers/submit — Enviar video
        } else if (parsedUrl.pathname === '/api/influencers/submit' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { influencer_id, email, tiktok_url, title, views_submitted, screenshot_data, screenshot_filename } = JSON.parse(body);
                    if (!influencer_id || !email || !tiktok_url || !screenshot_data) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Faltan campos obligatorios' }));
                    }
                    const influencers = readJsonFile(PATH_INFLUENCERS, []);
                    const inf = influencers.find(i => i.id === parseInt(influencer_id) && (i.email || '').toLowerCase() === email.toLowerCase());
                    if (!inf) {
                        res.writeHead(401, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Sesión inválida' }));
                    }
                    if (inf.status !== 'approved') {
                        res.writeHead(403, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Tu cuenta debe estar aprobada para enviar videos' }));
                    }
                    if (!tiktok_url.includes('tiktok.com')) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'El link debe ser de TikTok' }));
                    }
                    const now = new Date();
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                    const weekStart = new Date(now.setDate(diff));
                    const weekStartDate = weekStart.toISOString().split('T')[0];

                    const submissions = readJsonFile(PATH_SUBMISSIONS, []);
                    const nextId = submissions.reduce((max, s) => Math.max(max, s.id || 0), 0) + 1;

                    const newSub = {
                        id: nextId,
                        influencer_id: parseInt(influencer_id),
                        tiktok_url: tiktok_url.trim(),
                        title: (title || '').trim(),
                        views_submitted: parseInt(views_submitted) || 0,
                        views_verified: 0,
                        screenshot_data,
                        screenshot_filename: screenshot_filename || 'captura.jpg',
                        week_start: weekStartDate,
                        status: 'pending',
                        diamonds_awarded: 0,
                        admin_notes: null,
                        submitted_at: new Date().toISOString(),
                        reviewed_at: null,
                        paid_at: null
                    };

                    submissions.push(newSub);
                    writeJsonFile(PATH_SUBMISSIONS, submissions);

                    console.log(`[INFLUENCER-LOCAL] 📹 Nuevo video enviado por influencer ID ${influencer_id}: ${tiktok_url}`);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true, message: 'Video enviado correctamente' }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, message: 'Error interno: ' + e.message }));
                }
            });

        // GET /api/influencers/submissions — Historial de submissions del influencer
        } else if (parsedUrl.pathname === '/api/influencers/submissions' && req.method === 'GET') {
            try {
                const id = parseInt(parsedUrl.searchParams.get('id'));
                const email = parsedUrl.searchParams.get('email');
                if (!id || !email) {
                    res.writeHead(400, corsHeaders);
                    return res.end(JSON.stringify({ success: false }));
                }
                const influencers = readJsonFile(PATH_INFLUENCERS, []);
                const inf = influencers.find(i => i.id === id && (i.email || '').toLowerCase() === email.toLowerCase());
                if (!inf) {
                    res.writeHead(401, corsHeaders);
                    return res.end(JSON.stringify({ success: false, message: 'Sesión inválida' }));
                }
                const submissions = readJsonFile(PATH_SUBMISSIONS, []);
                const list = submissions
                    .filter(s => s.influencer_id === id)
                    .map(({ screenshot_data, ...rest }) => rest)
                    .sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));

                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, submissions: list }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        // GET /api/influencers/payments — Historial de pagos del influencer
        } else if (parsedUrl.pathname === '/api/influencers/payments' && req.method === 'GET') {
            try {
                const id = parseInt(parsedUrl.searchParams.get('id'));
                const email = parsedUrl.searchParams.get('email');
                if (!id || !email) {
                    res.writeHead(400, corsHeaders);
                    return res.end(JSON.stringify({ success: false }));
                }
                const influencers = readJsonFile(PATH_INFLUENCERS, []);
                const inf = influencers.find(i => i.id === id && (i.email || '').toLowerCase() === email.toLowerCase());
                if (!inf) {
                    res.writeHead(401, corsHeaders);
                    return res.end(JSON.stringify({ success: false, message: 'Sesión inválida' }));
                }
                const payments = readJsonFile(PATH_PAYMENTS, []);
                const list = payments
                    .filter(p => p.influencer_id === id)
                    .sort((a,b) => new Date(b.paid_at) - new Date(a.paid_at));

                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, payments: list }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        // ─── ADMIN: INFLUENCER ROUTES ─────────────────────────────────────────

        // GET /api/admin/influencers — Lista de todos los influencers
        } else if (parsedUrl.pathname === '/api/admin/influencers' && req.method === 'GET') {
            if (!checkAdminAuth(req, res)) return;
            try {
                const influencers = readJsonFile(PATH_INFLUENCERS, []);
                const safeList = influencers
                    .map(({ password, ...rest }) => rest)
                    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, influencers: safeList }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        // PUT /api/admin/influencers/:id/status — Aprobar/Rechazar influencer
        } else if (/^\/api\/admin\/influencers\/(\d+)\/status$/.test(parsedUrl.pathname) && req.method === 'PUT') {
            if (!checkAdminAuth(req, res)) return;
            const infId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencers\/(\d+)\/status/)[1]);
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { status, admin_notes } = JSON.parse(body);
                    if (!['pending','approved','rejected','suspended'].includes(status)) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Estado inválido' }));
                    }
                    const influencers = readJsonFile(PATH_INFLUENCERS, []);
                    const inf = influencers.find(i => i.id === infId);
                    if (!inf) {
                        res.writeHead(404, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Influencer no encontrado' }));
                    }
                    inf.status = status;
                    if (admin_notes !== undefined) inf.admin_notes = admin_notes || null;
                    writeJsonFile(PATH_INFLUENCERS, influencers);

                    console.log(`[INFLUENCER-ADMIN-LOCAL] Estado de influencer ID ${infId} cambiado a: ${status}`);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });

        // GET /api/admin/influencer-submissions — Todas las submissions (admin)
        } else if (parsedUrl.pathname === '/api/admin/influencer-submissions' && req.method === 'GET') {
            if (!checkAdminAuth(req, res)) return;
            try {
                const statusFilter = parsedUrl.searchParams.get('status');
                const submissions = readJsonFile(PATH_SUBMISSIONS, []);
                const influencers = readJsonFile(PATH_INFLUENCERS, []);

                let list = submissions;
                if (statusFilter && statusFilter !== 'all') {
                    list = list.filter(s => s.status === statusFilter);
                }

                const joined = list.map(({ screenshot_data, ...sub }) => {
                    const inf = influencers.find(i => i.id === sub.influencer_id);
                    return {
                        ...sub,
                        ff_influencers: inf ? { id: inf.id, username: inf.username, tiktok_handle: inf.tiktok_handle, email: inf.email } : null
                    };
                }).sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));

                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, submissions: joined }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        // GET /api/admin/influencer-submissions/:id/screenshot — Ver captura
        } else if (/^\/api\/admin\/influencer-submissions\/(\d+)\/screenshot$/.test(parsedUrl.pathname) && req.method === 'GET') {
            if (!checkAdminAuth(req, res)) return;
            const subId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencer-submissions\/(\d+)\/screenshot/)[1]);
            try {
                const submissions = readJsonFile(PATH_SUBMISSIONS, []);
                const sub = submissions.find(s => s.id === subId);
                if (!sub || !sub.screenshot_data) {
                    res.writeHead(404, corsHeaders);
                    return res.end(JSON.stringify({ success: false, message: 'No encontrado' }));
                }
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, screenshot_data: sub.screenshot_data, screenshot_filename: sub.screenshot_filename }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false }));
            }

        // PUT /api/admin/influencer-submissions/:id/review — Revisar y pagar submission
        } else if (/^\/api\/admin\/influencer-submissions\/(\d+)\/review$/.test(parsedUrl.pathname) && req.method === 'PUT') {
            if (!checkAdminAuth(req, res)) return;
            const subId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencer-submissions\/(\d+)\/review/)[1]);
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { status, views_verified, diamonds_awarded, admin_notes } = JSON.parse(body);
                    if (!['approved','rejected','paid'].includes(status)) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Estado inválido' }));
                    }

                    const submissions = readJsonFile(PATH_SUBMISSIONS, []);
                    const sub = submissions.find(s => s.id === subId);
                    if (!sub) {
                        res.writeHead(404, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Submission no encontrada' }));
                    }

                    sub.status = status;
                    sub.views_verified = parseInt(views_verified) || 0;
                    sub.diamonds_awarded = parseInt(diamonds_awarded) || 0;
                    if (admin_notes !== undefined) sub.admin_notes = admin_notes || null;
                    sub.reviewed_at = new Date().toISOString();

                    if (status === 'paid') {
                        sub.paid_at = new Date().toISOString();
                    }

                    writeJsonFile(PATH_SUBMISSIONS, submissions);

                    if (status === 'paid' && parseInt(dollars_awarded) > 0) {
                        const dollars = parseFloat(dollars_awarded);
                        // Convert dollars to points (1 point = $0.003 USDT, so 1 dollar = ~333 points)
                        const pointsToAdd = Math.round(dollars / 0.003);

                        const influencers = readJsonFile(PATH_INFLUENCERS, []);
                        const inf = influencers.find(i => i.id === sub.influencer_id);

                        if (inf) {
                            // Acreditar en billetera del influencer
                            inf.dollars_balance = parseFloat(((inf.dollars_balance || 0) + dollars).toFixed(2));
                            inf.total_dollars_earned = parseFloat(((inf.total_dollars_earned || 0) + dollars).toFixed(2));
                            // Legacy compat
                            inf.diamonds_balance = inf.diamonds_balance || 0;
                            writeJsonFile(PATH_INFLUENCERS, influencers);

                            // Acreditar puntos en cuenta RecargasNey del jugador (por UID de FF)
                            if (inf.ff_uid && users[inf.ff_uid]) {
                                users[inf.ff_uid].points = (users[inf.ff_uid].points || 0) + pointsToAdd;
                                saveUser(inf.ff_uid);
                                console.log(`[INFLUENCER-PAY] 💰 Acreditados $${dollars} USD (${pointsToAdd} pts) al usuario FF UID ${inf.ff_uid} (influencer: @${inf.tiktok_handle})`);

                                // Notificación push al usuario
                                sendPushToUser(inf.ff_uid, '💰 Pago de Video Recibido!', `¡Recibiste $${dollars.toFixed(2)} USDT por tu video de TikTok! Ya está en tu billetera RecargasNey.`, '/icon-192.png', '/');
                            } else if (inf.ff_uid) {
                                console.warn(`[INFLUENCER-PAY] ⚠️ UID ${inf.ff_uid} no encontrado en users. El saldo fue acreditado solo en billetera de influencer.`);
                            }
                        }

                        const payments = readJsonFile(PATH_PAYMENTS, []);
                        const nextPayId = payments.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
                        const weekLabel = sub.week_start
                            ? `Semana del ${new Date(sub.week_start + 'T12:00:00').toLocaleDateString('es-VE', { day:'2-digit', month:'short' })}`
                            : 'Pago de video';

                        payments.push({
                            id: nextPayId,
                            influencer_id: sub.influencer_id,
                            submission_id: subId,
                            dollars_amount: dollars,
                            points_credited: pointsToAdd,
                            ff_uid: inf ? inf.ff_uid : null,
                            week_label: weekLabel,
                            note: admin_notes || null,
                            paid_at: new Date().toISOString()
                        });
                        writeJsonFile(PATH_PAYMENTS, payments);

                        console.log(`[INFLUENCER-ADMIN] 💵 Pagados $${dollars} al influencer ID ${sub.influencer_id} (video #${subId})`);
                    }

                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });

        // GET/PUT /api/admin/influencer-rates — Gestión de tarifas
        } else if (parsedUrl.pathname === '/api/admin/influencer-rates' && req.method === 'GET') {
            if (!checkAdminAuth(req, res)) return;
            try {
                const rates = readJsonFile(PATH_RATES, defaultRates);
                rates.sort((a,b) => a.min_views - b.min_views);
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true, rates: rates }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        } else if (parsedUrl.pathname === '/api/admin/influencer-rates' && req.method === 'POST') {
            if (!checkAdminAuth(req, res)) return;
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { label, min_views, max_views, diamonds_reward } = JSON.parse(body);
                    if (!label || isNaN(parseInt(min_views)) || isNaN(parseInt(diamonds_reward))) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Datos inválidos' }));
                    }
                    const rates = readJsonFile(PATH_RATES, defaultRates);
                    const nextId = rates.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
                    rates.push({
                        id: nextId,
                        label: label.trim(),
                        min_views: parseInt(min_views),
                        max_views: max_views ? parseInt(max_views) : null,
                        diamonds_reward: parseInt(diamonds_reward),
                        is_active: true,
                        created_at: new Date().toISOString()
                    });
                    writeJsonFile(PATH_RATES, rates);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });

        } else if (/^\/api\/admin\/influencer-rates\/(\d+)$/.test(parsedUrl.pathname) && req.method === 'PUT') {
            if (!checkAdminAuth(req, res)) return;
            const rateId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencer-rates\/(\d+)/)[1]);
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const updates = JSON.parse(body);
                    const rates = readJsonFile(PATH_RATES, defaultRates);
                    const rate = rates.find(r => r.id === rateId);
                    if (!rate) {
                        res.writeHead(404, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Tarifa no encontrada' }));
                    }
                    Object.assign(rate, updates);
                    writeJsonFile(PATH_RATES, rates);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });

        } else if (/^\/api\/admin\/influencer-rates\/(\d+)$/.test(parsedUrl.pathname) && req.method === 'DELETE') {
            if (!checkAdminAuth(req, res)) return;
            const rateId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencer-rates\/(\d+)/)[1]);
            try {
                let rates = readJsonFile(PATH_RATES, defaultRates);
                rates = rates.filter(r => r.id !== rateId);
                writeJsonFile(PATH_RATES, rates);
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ success: true }));
            } catch(e) {
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ success: false, error: e.message }));
            }

        // PUT /api/admin/influencers/:id/diamonds — Agregar/quitar diamantes manualmente
        } else if (/^\/api\/admin\/influencers\/(\d+)\/diamonds$/.test(parsedUrl.pathname) && req.method === 'PUT') {
            if (!checkAdminAuth(req, res)) return;
            const infId = parseInt(parsedUrl.pathname.match(/\/api\/admin\/influencers\/(\d+)\/diamonds/)[1]);
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { amount, note } = JSON.parse(body);
                    const diamonds = parseInt(amount);
                    if (isNaN(diamonds)) {
                        res.writeHead(400, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Monto inválido' }));
                    }
                    const influencers = readJsonFile(PATH_INFLUENCERS, []);
                    const inf = influencers.find(i => i.id === infId);
                    if (!inf) {
                        res.writeHead(404, corsHeaders);
                        return res.end(JSON.stringify({ success: false, message: 'Influencer no encontrado' }));
                    }

                    inf.diamonds_balance = Math.max(0, (inf.diamonds_balance || 0) + diamonds);
                    if (diamonds > 0) {
                        inf.total_diamonds_earned = (inf.total_diamonds_earned || 0) + diamonds;
                    }
                    writeJsonFile(PATH_INFLUENCERS, influencers);

                    if (diamonds > 0) {
                        const payments = readJsonFile(PATH_PAYMENTS, []);
                        const nextPayId = payments.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
                        payments.push({
                            id: nextPayId,
                            influencer_id: infId,
                            submission_id: null,
                            diamonds_amount: diamonds,
                            note: note || 'Ajuste manual por admin',
                            week_label: 'Pago manual',
                            paid_at: new Date().toISOString()
                        });
                        writeJsonFile(PATH_PAYMENTS, payments);
                    }

                    console.log(`[INFLUENCER-ADMIN-LOCAL] 💎 Ajuste manual: ${diamonds > 0 ? '+' : ''}${diamonds} diamantes al influencer ID ${infId}. Nuevo saldo: ${inf.diamonds_balance}`);
                    res.writeHead(200, corsHeaders);
                    res.end(JSON.stringify({ success: true, new_balance: inf.diamonds_balance }));
                } catch(e) {
                    res.writeHead(500, corsHeaders);
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });

        } else {
            res.writeHead(404, corsHeaders);
            res.end(JSON.stringify({ success: false, message: 'Ruta no encontrada' }));
        }

        // END INFLUENCER ROUTES
    } else if (parsedUrl.pathname === '/api/reviews' && req.method === 'GET') {
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
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
        const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
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
        initLocalInfluencerStorage();
        console.log('[SERVER] ✅ Listo para recibir solicitudes.');
    });
}

