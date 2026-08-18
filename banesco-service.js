/**
 * banesco-service.js
 * Servicio de verificación de pagos Banesco en línea usando Puppeteer Headless
 * Navega el sitio web real de BanescOnline como un humano.
 *
 * SELECTORES CONFIRMADOS de banesconline.com (ASP.NET WebForms):
 *  URL Login:       https://www.banesconline.com/mantis/Website/Login.aspx
 *  URL Movimientos: https://www.banesconline.com/Mantis/WebSite/ConsultaMovimientosCuenta/MovimientosCuenta.aspx
 *
 *  - Input usuario:     #txtUsuario
 *  - Input password:    #txtClave
 *  - Botón Aceptar:     #bAceptar  (mismo ID en paso 1 y paso 2)
 *  - Tabla movimientos: columnas: Fecha | Descripción | Referencia | Monto | D/C | Saldo
 *  - Preguntas seguridad: texto de la pregunta + input de respuesta
 *  - Filtro período:    #ctl00_cp_ddlPeriodo
 *  - Botón Consultar:   #ctl00_cp_btnMostrar
 *
 * FORMATO MOVIMIENTOS BANESCO:
 *  - Descripción "Banesco Pago Movil" o "PAGO MOVIL CCE" para pagos recibidos
 *  - Referencia: 11 dígitos (ej: 81126010984)
 *  - Monto: formato venezolano "30.000,00" (punto=miles, coma=decimal)
 *  - D/C: "+" para crédito (abono), "-" para débito (cargo)
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BANESCO_LOGIN_URL = 'https://www.banesconline.com/mantis/Website/Login.aspx';
const BANESCO_DEFAULT_URL = 'https://www.banesconline.com/Mantis/WebSite/Default.aspx';
const BANESCO_MOVIMIENTOS_URL = 'https://www.banesconline.com/Mantis/WebSite/ConsultaMovimientosCuenta/MovimientosCuenta.aspx';

// Directorio de sesión para persistencia de cookies
let SESSION_DIR;
if (process.platform === 'win32') {
    SESSION_DIR = path.join(__dirname, '.cache', 'banesco-session');
} else {
    const snapChromiumPath = path.join(os.homedir(), 'snap', 'chromium', 'common');
    if (fs.existsSync(snapChromiumPath)) {
        SESSION_DIR = path.join(snapChromiumPath, 'banesco-session');
    } else {
        SESSION_DIR = path.join(os.homedir(), '.banesco-session');
    }
}

// Estado global de la sesión Banesco
let banescosBrowser = null;
let banescoPage = null;
let banescoSessionActive = false;
let lastLoginTime = null;
let banescoLoginInProgress = false;
let lastFailedLoginTime = 0;

// La sesión Banesco dura ~20 min de inactividad; renovamos cada 15 min
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const LOGIN_RETRY_INTERVAL_MS = 5 * 60 * 1000;

// Mapa de preguntas de seguridad (palabras clave → respuesta)
// Configurado desde variables de entorno o valores por defecto
const getSecurityAnswers = () => ({
    perro:      process.env.BANESCO_SEC_PERRO      || 'Clifor',
    carro:      process.env.BANESCO_SEC_CARRO      || 'nova',
    marca:      process.env.BANESCO_SEC_CARRO      || 'nova',
    pasatiempo: process.env.BANESCO_SEC_PASATIEMPO || 'futbol',
    apellido:   process.env.BANESCO_SEC_APELLIDO   || 'martinez',
    deporte:    process.env.BANESCO_SEC_PASATIEMPO || 'futbol',
    mascota:    process.env.BANESCO_SEC_PERRO      || 'Clifor',
});

// ============================================================
// DETECTAR EJECUTABLE DE CHROMIUM SEGÚN ENTORNO
// ============================================================
function detectChromiumPath() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH
        ? process.env.PUPPETEER_EXECUTABLE_PATH.trim()
        : null;

    if (envPath && fs.existsSync(envPath)) {
        console.log(`[BANESCO] 🐧 Chromium del sistema: ${envPath}`);
        return envPath;
    }

    const localCacheBase = path.join(__dirname, '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(localCacheBase)) {
        const dirs = fs.readdirSync(localCacheBase)
            .filter(d => d.startsWith('win64-'))
            .sort();
        if (dirs.length > 0) {
            const chromePath = path.join(localCacheBase, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe');
            if (fs.existsSync(chromePath)) {
                console.log(`[BANESCO] 🪟 Chromium Windows cache: ${chromePath}`);
                return chromePath;
            }
        }
    }

    const localCacheLinux = path.join(__dirname, '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(localCacheLinux)) {
        const dirs = fs.readdirSync(localCacheLinux)
            .filter(d => d.startsWith('linux-') || d.startsWith('chrome-'))
            .sort();
        if (dirs.length > 0) {
            for (const dir of dirs.reverse()) {
                const p = path.join(localCacheLinux, dir, 'chrome-linux64', 'chrome');
                if (fs.existsSync(p)) {
                    console.log(`[BANESCO] 🐧 Chromium Linux cache: ${p}`);
                    return p;
                }
            }
        }
    }

    console.log('[BANESCO] 🔍 Usando Chromium default de Puppeteer');
    return undefined;
}

// ============================================================
// LANZAR NAVEGADOR PERSISTENTE
// ============================================================
async function launchBrowser() {
    if (banescosBrowser) {
        try {
            await banescosBrowser.version();
            return; // ya está vivo
        } catch (e) {
            console.log('[BANESCO] 🔄 Navegador caído. Relanzando...');
            try { await banescosBrowser.close(); } catch (_) {}
            banescosBrowser = null;
            banescoPage = null;
        }
    }

    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    console.log('[BANESCO] 🚀 Lanzando navegador Puppeteer...');
    const executablePath = detectChromiumPath();

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            banescosBrowser = await puppeteer.launch({
                headless: 'new',
                userDataDir: SESSION_DIR,
                executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--window-size=1280,900'
                ],
                defaultViewport: { width: 1280, height: 900 }
            });
            break;
        } catch (launchErr) {
            console.warn(`[BANESCO] ⚠️ Intento ${attempt}/3 de lanzar navegador falló: ${launchErr.message}`);
            if (attempt === 3) throw launchErr;
            await sleep(2000);
        }
    }

    banescoPage = await banescosBrowser.newPage();

    // User-Agent realista
    await banescoPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    // Bloquear imágenes y fuentes para mayor velocidad
    await banescoPage.setRequestInterception(true);
    banescoPage.on('request', (req) => {
        if (['image', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('[BANESCO] ✅ Navegador lanzado correctamente.');
}

// Helper para buscar elementos dentro de frames (Banesco usa un iframe en el login)
async function getBanescoFrame(selector, timeoutMs = 8000) {
    if (!banescoPage) return null;
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const frames = banescoPage.frames();
        for (const frame of frames) {
            try {
                const el = await frame.$(selector);
                if (el) return frame;
            } catch (_) {}
        }
        await sleep(300);
    }
    return banescoPage;
}

// ============================================================
// LOGIN EN BANESCO ONLINE (ASP.NET WebForms - 2 pasos + preguntas opcionales)
// ============================================================
async function banescoLogin(force = false) {
    if (force) lastFailedLoginTime = 0;

    if (banescoLoginInProgress) {
        console.log('[BANESCO] ⏳ Login ya en progreso...');
        for (let i = 0; i < 30; i++) {
            await sleep(1000);
            if (!banescoLoginInProgress) break;
        }
        return banescoSessionActive;
    }

    if (!force && lastFailedLoginTime && (Date.now() - lastFailedLoginTime) < LOGIN_RETRY_INTERVAL_MS) {
        const remainingMin = Math.ceil((LOGIN_RETRY_INTERVAL_MS - (Date.now() - lastFailedLoginTime)) / 60000);
        console.log(`[BANESCO] ⏳ Login fallido recientemente. Reintentando en ~${remainingMin} min...`);
        return false;
    }

    banescoLoginInProgress = true;

    try {
        const user = process.env.BANESCO_USER;
        const pass = process.env.BANESCO_PASS;

        if (!user || !pass) {
            console.error('[BANESCO] ❌ Faltan BANESCO_USER o BANESCO_PASS en .env');
            return false;
        }

        await launchBrowser();

        console.log('[BANESCO] 🔐 Navegando a BanescOnline...');
        try {
            await banescoPage.goto(BANESCO_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (eGoto) {
            console.warn('[BANESCO] ⚠️ Timeout al navegar (continuando):', eGoto.message);
        }
        await sleep(2500);

        // Verificar si ya tenemos sesión activa
        if (await checkIfBanescoLoggedIn()) {
            console.log('[BANESCO] ✅ Sesión activa desde cookie guardada.');
            banescoSessionActive = true;
            lastLoginTime = Date.now();
            return true;
        }

        // ── PASO 1: Ingresar usuario ──
        console.log('[BANESCO] 👤 Paso 1: Ingresando usuario...');
        let userFrame = await getBanescoFrame('#txtUsuario', 10000);
        try {
            await userFrame.waitForSelector('#txtUsuario', { timeout: 10000 });
        } catch (e) {
            console.error('[BANESCO] ❌ Campo de usuario no encontrado en la página de login.');
            await takeDebugScreenshot('banesco_no_usuario_field');
            lastFailedLoginTime = Date.now();
            return false;
        }

        await userFrame.click('#txtUsuario');
        await userFrame.$eval('#txtUsuario', el => { el.value = ''; });
        await sleep(300);
        await userFrame.type('#txtUsuario', user, { delay: randomDelay(80, 140) });
        await sleep(600);

        await userFrame.click('#bAceptar');
        await sleep(3500);

        // ── PASO 2: Ingresar contraseña ──
        console.log('[BANESCO] 🔑 Paso 2: Ingresando contraseña...');

        let onPasswordPage = false;
        let passFrame = await getBanescoFrame('#txtClave', 8000);
        try {
            await passFrame.waitForSelector('#txtClave', { timeout: 8000 });
            onPasswordPage = true;
        } catch (e) {
            // Puede haber saltado directamente a preguntas de seguridad o al dashboard
        }

        if (onPasswordPage) {
            await passFrame.click('#txtClave');
            await passFrame.$eval('#txtClave', el => { el.value = ''; });
            await sleep(300);
            await passFrame.type('#txtClave', pass, { delay: randomDelay(80, 140) });
            await sleep(600);

            await passFrame.click('#bAceptar');
            await sleep(4000);
        }

        // ── PASO 3: Verificar preguntas de seguridad (opcionales) ──
        const hasSecurityQuestion = await checkForSecurityQuestion();
        if (hasSecurityQuestion) {
            console.log('[BANESCO] ❓ Preguntas de seguridad detectadas...');
            const answered = await answerSecurityQuestions();
            if (!answered) {
                console.error('[BANESCO] ❌ No se pudo responder las preguntas de seguridad.');
                await takeDebugScreenshot('banesco_security_question_failed');
                lastFailedLoginTime = Date.now();
                return false;
            }
            await sleep(3500);
        }

        // ── PASO 4: Verificar pantalla de "Equipo de uso frecuente" o confirmación de clave ──
        await handleFrequentDeviceScreen();

        // ── VERIFICAR LOGIN EXITOSO ──
        if (await checkIfBanescoLoggedIn()) {
            console.log('[BANESCO] ✅ LOGIN EXITOSO. Dashboard cargado.');
            banescoSessionActive = true;
            lastLoginTime = Date.now();
            lastFailedLoginTime = 0;
            return true;
        }

        // Si llegamos aquí, el login falló
        const errorMsg = await getBanescoPageError();
        console.error(`[BANESCO] ❌ Login fallido. Error visible: ${errorMsg || 'Ninguno'}`);
        await takeDebugScreenshot('banesco_login_failed');
        lastFailedLoginTime = Date.now();
        return false;

    } catch (e) {
        console.error('[BANESCO] ❌ Error inesperado en banescoLogin:', e.message);
        banescoSessionActive = false;
        lastFailedLoginTime = Date.now();
        try { await closeBanescoBrowser(); } catch (_) {}
        return false;
    } finally {
        banescoLoginInProgress = false;
    }
}

// ============================================================
// VERIFICAR SI HAY PREGUNTAS DE SEGURIDAD
// ============================================================
async function checkForSecurityQuestion() {
    try {
        const frames = banescoPage.frames();
        for (const frame of frames) {
            try {
                const found = await frame.evaluate(() => {
                    const body = document.body ? document.body.innerText.toLowerCase() : '';
                    if (body.includes('equipo de uso frecuente') || body.includes('confirmo que estoy ingresando')) {
                        return false;
                    }
                    return (
                        body.includes('validación de preguntas de seguridad') ||
                        body.includes('responda las siguientes preguntas') ||
                        body.includes('pregunta de seguridad') ||
                        body.includes('preguntas de seguridad') ||
                        body.includes('nombre de su perro') ||
                        body.includes('marca de su carro') ||
                        body.includes('pasatiempo') ||
                        body.includes('apellido')
                    );
                });
                if (found) return true;
            } catch (_) {}
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ============================================================
// RESPONDER PREGUNTAS DE SEGURIDAD
// Banesco puede hacer 1 o más preguntas simultáneas en la misma página
// ============================================================
async function answerSecurityQuestions() {
    const answers = getSecurityAnswers();
    console.log('[BANESCO] ❓ Procesando preguntas de seguridad...');

    for (let round = 0; round < 5; round++) {
        const hasQuestion = await checkForSecurityQuestion();
        if (!hasQuestion) break;

        // Buscar el frame que contiene las preguntas
        let targetFrame = banescoPage;
        const frames = banescoPage.frames();
        for (const f of frames) {
            try {
                const text = await f.evaluate(() => document.body ? document.body.innerText.toLowerCase() : '');
                if (text.includes('pregunta') || text.includes('perro') || text.includes('carro') || text.includes('pasatiempo') || text.includes('apellido')) {
                    targetFrame = f;
                    break;
                }
            } catch (_) {}
        }

        // Extraer todos los pares de (contexto -> inputId) en el marco objetivo
        const pairs = await targetFrame.evaluate(() => {
            const results = [];
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="password"]'));
            
            inputs.forEach((input, index) => {
                if (!input.id) input.id = 'sec_input_' + index;
                let parent = input.parentElement;
                let text = '';
                for (let k = 0; k < 5 && parent; k++) {
                    text += ' ' + (parent.innerText || parent.textContent || '');
                    parent = parent.parentElement;
                }
                results.push({
                    inputId: input.id,
                    contextText: text.toLowerCase()
                });
            });
            return results;
        });

        if (pairs.length === 0) {
            console.warn('[BANESCO] ⚠️ No se encontraron campos de respuesta en la página de preguntas.');
            break;
        }

        let answeredCount = 0;
        for (const pair of pairs) {
            let matchedAnswer = null;
            let matchedKeyword = '';

            for (const [keyword, answer] of Object.entries(answers)) {
                if (pair.contextText.includes(keyword)) {
                    matchedAnswer = answer;
                    matchedKeyword = keyword;
                    break;
                }
            }

            if (matchedAnswer) {
                console.log(`[BANESCO] ✅ Llenando campo #${pair.inputId} ("${matchedKeyword}") → "${matchedAnswer}"`);
                try {
                    await targetFrame.click(`#${pair.inputId}`);
                    await targetFrame.$eval(`#${pair.inputId}`, el => { el.value = ''; });
                    await sleep(200);
                    await targetFrame.type(`#${pair.inputId}`, matchedAnswer, { delay: randomDelay(70, 120) });
                    answeredCount++;
                } catch (e) {
                    console.error(`[BANESCO] Error escribiendo en #${pair.inputId}:`, e.message);
                }
            } else {
                console.warn(`[BANESCO] ⚠️ No se identificó keyword para el contexto: "${pair.contextText.slice(0, 80)}"`);
            }
        }

        if (answeredCount === 0) {
            console.error('[BANESCO] ❌ No se pudo responder ninguna pregunta.');
            await takeDebugScreenshot('banesco_unknown_security_question');
            return false;
        }

        // Hacer clic en el botón Aceptar
        console.log('[BANESCO] 🔘 Enviando respuestas de seguridad...');
        try {
            let submitBtn = await targetFrame.$('#bAceptar') || await targetFrame.$('#btnAceptar');
            if (!submitBtn) {
                const btns = await targetFrame.$$('input[type="submit"], input[type="button"], button');
                for (const b of btns) {
                    const val = await targetFrame.evaluate(el => (el.value || el.innerText || '').toLowerCase(), b);
                    if (val.includes('aceptar') || val.includes('continuar')) {
                        submitBtn = b;
                        break;
                    }
                }
            }
            if (submitBtn) {
                await submitBtn.click();
            } else {
                await targetFrame.click('#bAceptar');
            }
        } catch (e) {
            console.error('[BANESCO] Error al hacer clic en Aceptar:', e.message);
        }

        await sleep(4500);
    }

    return true;
}

// ============================================================
// PROCESAR PANTALLA POST-SEGURIDAD: CONFIRMAR CLAVE Y EQUIPO FRECUENTE
// ============================================================
async function handleFrequentDeviceScreen() {
    try {
        await sleep(2000);
        let frame = banescoPage;
        try {
            const frames = banescoPage.frames();
            for (const f of frames) {
                try {
                    const text = await f.evaluate(() => document.body ? document.body.innerText.toLowerCase() : '');
                    if (text.includes('equipo de uso frecuente') || (text.includes('clave') && text.includes('confirmo'))) {
                        frame = f;
                        break;
                    }
                } catch (_) {}
            }
        } catch (_) {}

        const isFrequentScreen = await frame.evaluate(() => {
            const body = document.body ? document.body.innerText.toLowerCase() : '';
            return body.includes('equipo de uso frecuente') || body.includes('confirmo que estoy ingresando') || body.includes('olvidó su usuario');
        });

        if (isFrequentScreen) {
            console.log('[BANESCO] 🔒 Detectada pantalla de confirmación "Equipo de uso frecuente"...');
            const pass = process.env.BANESCO_PASS || 'Clifor2#';

            // Llenar el campo de clave si existe
            const passInput = await frame.$('input[type="password"]') || await frame.$('#txtClave') || await frame.$('input[name*="Clave"]');
            if (passInput) {
                console.log('[BANESCO] 🔑 Re-ingresando contraseña para confirmación...');
                await passInput.click();
                await frame.evaluate(el => { el.value = ''; }, passInput);
                await sleep(200);
                await passInput.type(pass, { delay: randomDelay(80, 130) });
            }

            // Marcar el checkbox de equipo frecuente
            const chk = await frame.$('input[type="checkbox"]') || await frame.$('#chkEquipoFrecuente');
            if (chk) {
                console.log('[BANESCO] ☑️ Marcando "Equipo de uso frecuente"...');
                const checked = await frame.evaluate(el => el.checked, chk);
                if (!checked) await chk.click();
            }

            // Hacer clic en Aceptar
            console.log('[BANESCO] 🔘 Enviando confirmación de equipo frecuente...');
            let btn = await frame.$('#bAceptar') || await frame.$('#btnAceptar');
            if (!btn) {
                const btns = await frame.$$('input[type="submit"], input[type="button"], button');
                for (const b of btns) {
                    const val = await frame.evaluate(el => (el.value || el.innerText || '').toLowerCase(), b);
                    if (val.includes('aceptar') || val.includes('continuar')) {
                        btn = b;
                        break;
                    }
                }
            }
            if (btn) await btn.click();
            await sleep(5000);
            return true;
        }
    } catch (e) {
        console.warn('[BANESCO] ⚠️ Excepción en handleFrequentDeviceScreen:', e.message);
    }
    return false;
}

// ============================================================
// VERIFICAR SI ESTAMOS LOGUEADOS EN BANESCO
// ============================================================
async function checkIfBanescoLoggedIn() {
    try {
        const url = banescoPage.url().toLowerCase();

        // Si seguimos en la página de login, no estamos dentro
        if (url.includes('login.aspx')) return false;

        const content = await banescoPage.content();
        const lower = content.toLowerCase();

        const insideIndicators = [
            'cerrar sesión',
            'llave virtual',
            'pago móvil',
            'mis solicitudes',
            'multipagos',
            'cuentas',
            'saldo',
            'juan carlos',    // nombre del usuario
            'martinez marcano' // apellido
        ];

        return insideIndicators.some(ind => lower.includes(ind.toLowerCase()));
    } catch (e) {
        return false;
    }
}

// ============================================================
// OBTENER MOVIMIENTOS DE CUENTA BANESCO
// Navega directamente a la URL de movimientos
// ============================================================
async function banescoMovimientos() {
    try {
        // Re-login si la sesión expiró
        const sessionExpired = lastLoginTime && (Date.now() - lastLoginTime) > SESSION_TIMEOUT_MS;
        if (!banescoSessionActive || sessionExpired) {
            console.log('[BANESCO] 🔄 Sesión inactiva o expirada. Re-logueando...');
            banescoSessionActive = false;
            const ok = await banescoLogin();
            if (!ok) return null;
        }

        console.log('[BANESCO] 📋 Navegando a página de movimientos...');

        // Navegar directamente a la URL de movimientos
        try {
            await banescoPage.goto(BANESCO_MOVIMIENTOS_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (eGoto) {
            console.warn('[BANESCO] ⚠️ Timeout al navegar a movimientos:', eGoto.message);
        }
        await sleep(3000);

        // Verificar si la sesión sigue activa (podría haber redirigido al login)
        const currentUrl = banescoPage.url().toLowerCase();
        if (currentUrl.includes('login.aspx')) {
            console.log('[BANESCO] ⚠️ Sesión expirada detectada. Re-logueando...');
            banescoSessionActive = false;
            const ok = await banescoLogin();
            if (!ok) return null;

            // Intentar navegar de nuevo
            await banescoPage.goto(BANESCO_MOVIMIENTOS_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
            await sleep(3000);
        }

        // Seleccionar período "Día" para ver los movimientos de hoy
        // El dropdown de período ya debería estar en "Día" por defecto
        // Hacer clic en "Consultar"
        try {
            await banescoPage.waitForSelector('#ctl00_cp_btnMostrar', { timeout: 8000 });
            await banescoPage.click('#ctl00_cp_btnMostrar');
            await sleep(3000);
        } catch (e) {
            console.warn('[BANESCO] ⚠️ Botón Consultar no encontrado, intentando con tabla existente...');
        }

        // Extraer movimientos de la tabla
        const movimientos = await extraerMovimientosBanesco();

        if (movimientos && movimientos.length > 0) {
            console.log(`[BANESCO] ✅ ${movimientos.length} movimientos obtenidos.`);
            lastLoginTime = Date.now(); // renovar timeout
            return movimientos;
        }

        console.log('[BANESCO] ⚠️ No se encontraron movimientos en la tabla.');
        await takeDebugScreenshot('banesco_no_movimientos');
        return [];

    } catch (e) {
        console.error('[BANESCO] ❌ Error en banescoMovimientos:', e.message);
        banescoSessionActive = false;
        return null;
    }
}

// ============================================================
// EXTRAER MOVIMIENTOS DE LA TABLA HTML DE BANESCO
// Estructura confirmada: Fecha | Descripción | Referencia | Monto | D/C | Saldo
// ============================================================
async function extraerMovimientosBanesco() {
    try {
        return await banescoPage.evaluate(() => {
            const result = [];

            // Buscar todas las filas de la tabla de movimientos
            // Banesco usa una tabla HTML estándar dentro del área de contenido
            const rows = Array.from(document.querySelectorAll('table tr'));

            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 5) continue;

                const values = cells.map(c => (c.innerText || c.textContent || '').trim());

                // Verificar que la primera celda parezca una fecha DD/MM/AAAA
                const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
                if (!datePattern.test(values[0])) continue;

                // Estructura confirmada de columnas:
                // 0: Fecha (DD/MM/AAAA)
                // 1: Descripción (ej: "Banesco Pago Movil")
                // 2: Referencia (ej: "81126010984")
                // 3: Monto (ej: "30.000,00")
                // 4: D/C ("+" crédito / "-" débito)
                // 5: Saldo

                const dc = (values[4] || '').trim();
                const esAbono = dc === '+';

                result.push({
                    fecha: values[0],
                    descripcion: values[1] || '',
                    referencia: (values[2] || '').replace(/\s/g, ''),
                    importe: values[3] || '0',
                    indicadorCargoAbono: esAbono ? 'A' : 'C',
                    saldo: values[5] || '0'
                });
            }

            return result;
        });
    } catch (e) {
        console.error('[BANESCO] ❌ Error extrayendo movimientos:', e.message);
        return [];
    }
}

// ============================================================
// VERIFICAR PAGO BANESCO
// Cruza referencia y monto con los movimientos del día
// @param {number} montoBs   - Monto esperado en Bolívares
// @param {string} refCliente - Referencia reportada por el cliente
// @returns {{ success, movimiento } | { success: false, checked, pending, error }}
// ============================================================
async function verificarPagoBanesco(montoBs, refCliente) {
    try {
        const movimientos = await banescoMovimientos();

        if (!movimientos) {
            return { success: false, checked: false, pending: true };
        }

        if (movimientos.length === 0) {
            return { success: false, checked: true, pending: true };
        }

        const cleanRef = refCliente.trim().replace(/\s/g, '');

        if (cleanRef.length < 3) {
            return { success: false, checked: false, error: 'Referencia muy corta' };
        }

        const stripZ = (s) => s.replace(/^0+/, '') || '0';

        // Parser de monto venezolano: "30.000,00" → 30000.00
        const parseMontoBs = (importeStr) => {
            if (!importeStr) return 0;
            let clean = importeStr.toString().replace(/[^0-9.,-]/g, '').trim();
            if (!clean) return 0;
            // Formato venezolano: punto=miles, coma=decimal
            if (clean.includes(',')) {
                clean = clean.replace(/\./g, '').replace(',', '.');
            }
            return parseFloat(clean) || 0;
        };

        const sigReported = stripZ(cleanRef);

        // LOG de diagnóstico
        const abonosRecibidos = movimientos.filter(m => m.indicadorCargoAbono === 'A');
        console.log(`[BANESCO] 🔍 Buscando ref="${cleanRef}" (sig="${sigReported}") monto≈${montoBs}Bs`);
        console.log(`[BANESCO] 📋 ${abonosRecibidos.length} abonos encontrados:`);
        abonosRecibidos.forEach(m => {
            const montoMov = parseMontoBs(m.importe);
            console.log(`[BANESCO]   • Ref=${m.referencia} | Monto=${m.importe} (${montoMov}Bs) | Desc=${m.descripcion}`);
        });

        for (const mov of movimientos) {
            // Solo abonos (pagos recibidos)
            if (mov.indicadorCargoAbono !== 'A') continue;

            const referencia = (mov.referencia || '').replace(/\s/g, '');
            const descripcion = (mov.descripcion || '').toLowerCase();
            const montoMov = parseMontoBs(mov.importe);
            const sigBank = stripZ(referencia);

            // Solo procesar pagos móviles o pagos recibidos
            const esPagoMovil = (
                descripcion.includes('pago movil') ||
                descripcion.includes('pagomovil') ||
                descripcion.includes('pago móvil') ||
                descripcion.includes('movil cce') ||
                descripcion.includes('com. pago movil')
            );
            if (!esPagoMovil) continue;

            // ── MATCHING DE REFERENCIA ──
            let refMatch = false;

            // Capa 1: Coincidencia exacta
            if (referencia === cleanRef || sigBank === sigReported) {
                refMatch = true;
            }

            // Capa 2: Sufijo múltiple (3 a 8 dígitos)
            if (!refMatch) {
                for (let n = 3; n <= Math.min(cleanRef.length, 10); n++) {
                    const sufijo = cleanRef.slice(-n);
                    if (sufijo.length >= 3 && (referencia.endsWith(sufijo) || sigBank.endsWith(sufijo))) {
                        console.log(`[BANESCO] 🔗 Match por sufijo "${sufijo}" | BanescoRef=${referencia} | ClienteRef=${cleanRef}`);
                        refMatch = true;
                        break;
                    }
                }
            }

            // Capa 3: Sufijo de sigReported (sin ceros iniciales)
            if (!refMatch) {
                for (let n = 3; n <= Math.min(sigReported.length, 8); n++) {
                    const sufijo = sigReported.slice(-n);
                    if (sufijo.length >= 3 && (referencia.endsWith(sufijo) || sigBank.endsWith(sufijo))) {
                        console.log(`[BANESCO] 🔗 Match por sig-sufijo "${sufijo}" | BanescoRef=${referencia} | ClienteRef=${cleanRef}`);
                        refMatch = true;
                        break;
                    }
                }
            }

            // Capa 4: Búsqueda de ref en descripción
            if (!refMatch && cleanRef.length >= 4) {
                for (let n = 4; n <= Math.min(cleanRef.length, 8); n++) {
                    const cand = cleanRef.slice(-n);
                    if (descripcion.includes(cand) || referencia.includes(cand)) {
                        console.log(`[BANESCO] 🔗 Match en descripción "${cand}" | BanescoRef=${referencia} | Desc="${descripcion}"`);
                        refMatch = true;
                        break;
                    }
                }
            }

            if (!refMatch) continue;

            // ── MATCHING DE MONTO ──
            // Tolerancia: (esperado - 5 Bs) a (esperado + 200 Bs) para fees/comisiones
            const montoMin = montoBs - 5;
            const montoMax = montoBs + 200;
            const montoMatch = montoMov >= montoMin && montoMov <= montoMax;

            // Si la ref es muy corta (≤4 sig), exigir monto más estricto
            const refMuyCorta = sigReported.length <= 4;
            const montoMatchEstricto = Math.abs(montoMov - montoBs) <= 1;

            const coincide = refMatch && (refMuyCorta ? montoMatchEstricto : montoMatch);

            if (coincide) {
                const diff = montoMov - montoBs;
                const diffStr = diff === 0 ? 'exacto' : (diff > 0 ? `+${diff.toFixed(2)} Bs` : `${diff.toFixed(2)} Bs`);
                console.log(`[BANESCO] ✅ PAGO VERIFICADO | Ref: ${referencia} | Monto: ${mov.importe} Bs (${diffStr}) | Desc: ${mov.descripcion}`);
                return {
                    success: true,
                    movimiento: {
                        fecha: mov.fecha,
                        referencia,
                        importe: mov.importe,
                        descripcion: mov.descripcion
                    }
                };
            }
        }

        console.log(`[BANESCO] ℹ️ Sin coincidencia para ref="${refCliente}" monto≈${montoBs}Bs en ${movimientos.length} movimientos.`);
        return { success: false, checked: true, pending: true };

    } catch (e) {
        console.error('[BANESCO] ❌ Error en verificarPagoBanesco:', e.message);
        return { success: false, checked: false, error: e.message };
    }
}

// ============================================================
// ESTADO DEL SERVICIO (para el panel admin)
// ============================================================
function getBanescoStatus() {
    return {
        sessionActive: banescoSessionActive,
        lastLogin: lastLoginTime ? new Date(lastLoginTime).toISOString() : null,
        browserActive: !!banescosBrowser,
        loginInProgress: banescoLoginInProgress
    };
}

// ============================================================
// CERRAR NAVEGADOR (shutdown limpio)
// ============================================================
async function closeBanescoBrowser() {
    if (banescosBrowser) {
        try { await banescosBrowser.close(); } catch (e) {}
        banescosBrowser = null;
        banescoPage = null;
        banescoSessionActive = false;
        console.log('[BANESCO] 🔒 Navegador Banesco cerrado.');
    }
}

// ============================================================
// UTILS INTERNOS
// ============================================================
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getBanescoPageError() {
    try {
        return await banescoPage.evaluate(() => {
            const selectors = [
                '.ErrorMsg', '#lblMensaje', '.mensaje-error',
                '[id*="lblError"]', '[id*="lblMensaje"]',
                '.alert-danger', 'span[style*="color:red"]',
                'font[color="red"]', '.Error'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.innerText && el.innerText.trim()) {
                    return el.innerText.trim();
                }
            }
            // Buscar texto de error en el body
            const body = document.body.innerText || '';
            const errorMatch = body.match(/Usuario o clave inv[aá]lida[^.]*\./i);
            if (errorMatch) return errorMatch[0];
            return null;
        });
    } catch (e) { return null; }
}

async function takeDebugScreenshot(name) {
    try {
        const scratchDir = path.join(__dirname, 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        await banescoPage.screenshot({ path: path.join(scratchDir, `${name}.png`) });
        console.log(`[BANESCO] 📸 Screenshot: scratch/${name}.png`);
    } catch (e) { /* ignorar */ }
}

module.exports = {
    banescoLogin,
    banescoMovimientos,
    verificarPagoBanesco,
    closeBanescoBrowser,
    getBanescoStatus
};
