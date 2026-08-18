/**
 * bdv-service.js
 * Servicio de verificación de pagos BDV en línea usando Puppeteer Headless
 * Navega el sitio web real del BDV (Angular Material) como un humano.
 * 
 * SELECTORES CONFIRMADOS del BDV en línea (Angular Material):
 *  - Input usuario:   input[aria-label="usuario"]  (id="mat-input-0")
 *  - Botón "Entrar":  button.mat-raised-button.mat-accent (texto "Entrar")
 *  - Input password:  input[type="password"]        (id="mat-input-1")
 *  - Botón "Continuar": button.mat-raised-button.mat-accent (texto "Continuar")
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BDV_URL = 'https://bdvenlinea.banvenez.com';
// Determinar el directorio de sesión para el bot de BDV
let SESSION_DIR;
if (process.platform === 'win32') {
    SESSION_DIR = path.join(__dirname, '.cache', 'bdv-session');
} else {
    // En Linux VPS con Snap Chromium, colocar en el path de snap permitido para evitar AppArmor Sandbox Blocks
    const snapChromiumPath = path.join(os.homedir(), 'snap', 'chromium', 'common');
    if (fs.existsSync(snapChromiumPath)) {
        SESSION_DIR = path.join(snapChromiumPath, 'bdv-session');
    } else {
        SESSION_DIR = path.join(os.homedir(), '.bdv-session');
    }
}

// Estado global de la sesión BDV
let bdvBrowser = null;
let bdvPage = null;
let bdvSessionActive = false;
let lastLoginTime = null;
let bdvLoginInProgress = false;

// La sesión BDV expira en ~30 min, renovamos cada 25 min
const SESSION_TIMEOUT_MS = 25 * 60 * 1000;

// ============================================================
// DETECTAR EJECUTABLE DE CHROMIUM SEGÚN ENTORNO
// ============================================================
function detectChromiumPath() {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH
        ? process.env.PUPPETEER_EXECUTABLE_PATH.trim()
        : null;

    // VPS Linux: usar el chromium del sistema si existe
    if (envPath && fs.existsSync(envPath)) {
        console.log(`[BDV] 🐧 Chromium del sistema: ${envPath}`);
        return envPath;
    }

    // Windows local: buscar en el cache de Puppeteer del proyecto
    const localCacheBase = path.join(__dirname, '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(localCacheBase)) {
        const dirs = fs.readdirSync(localCacheBase)
            .filter(d => d.startsWith('win64-'))
            .sort();
        if (dirs.length > 0) {
            const chromePath = path.join(localCacheBase, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe');
            if (fs.existsSync(chromePath)) {
                console.log(`[BDV] 🪟 Chromium Windows cache: ${chromePath}`);
                return chromePath;
            }
        }
    }

    // Linux cache en el proyecto
    const localCacheLinux = path.join(__dirname, '.cache', 'puppeteer', 'chrome');
    if (fs.existsSync(localCacheLinux)) {
        const dirs = fs.readdirSync(localCacheLinux)
            .filter(d => d.startsWith('linux-') || d.startsWith('chrome-'))
            .sort();
        if (dirs.length > 0) {
            for (const dir of dirs.reverse()) {
                const p = path.join(localCacheLinux, dir, 'chrome-linux64', 'chrome');
                if (fs.existsSync(p)) {
                    console.log(`[BDV] 🐧 Chromium Linux cache: ${p}`);
                    return p;
                }
            }
        }
    }

    console.log('[BDV] 🔍 Usando Chromium default de Puppeteer');
    return undefined;
}

// ============================================================
// LANZAR NAVEGADOR PERSISTENTE
// ============================================================
async function launchBrowser() {
    if (bdvBrowser) {
        try {
            await bdvBrowser.version();
            return; // ya está vivo
        } catch (e) {
            console.log('[BDV] 🔄 Navegador caído. Relanzando...');
            bdvBrowser = null;
            bdvPage = null;
            bdvSessionActive = false;
        }
    }

    // Crear directorio de sesión si no existe
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    console.log('[BDV] 🚀 Lanzando navegador Puppeteer...');
    const executablePath = detectChromiumPath();

    bdvBrowser = await puppeteer.launch({
        headless: 'new', // Nuevo modo headless (evita advertencia)
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
            '--disable-process-singleton',
            '--window-size=1280,800'
        ],
        defaultViewport: { width: 1280, height: 800 }
    });

    bdvPage = await bdvBrowser.newPage();

    // User-Agent realista de Chrome en Windows
    await bdvPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    // Bloquear imágenes y fuentes para mayor velocidad
    await bdvPage.setRequestInterception(true);
    bdvPage.on('request', (req) => {
        if (['image', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    console.log('[BDV] ✅ Navegador lanzado correctamente.');
}

// ============================================================
// LOGIN EN BDV EN LÍNEA (Angular Material - 2 pasos)
// ============================================================
let lastFailedLoginTime = 0;
const LOGIN_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos de espera si el banco falló/está lento

async function bdvLogin() {
    if (bdvLoginInProgress) {
        console.log('[BDV] ⏳ Login ya en progreso...');
        for (let i = 0; i < 30; i++) {
            await sleep(1000);
            if (!bdvLoginInProgress) break;
        }
        return bdvSessionActive;
    }

    // Si el banco falló recientemente, esperar 5 minutos antes del próximo reintento de login
    if (lastFailedLoginTime && (Date.now() - lastFailedLoginTime) < LOGIN_RETRY_INTERVAL_MS) {
        const remainingMin = Math.ceil((LOGIN_RETRY_INTERVAL_MS - (Date.now() - lastFailedLoginTime)) / 60000);
        console.log(`[BDV] ⏳ El banco estuvo lento/caído. Reintentando login automáticamente en ~${remainingMin} min...`);
        return false;
    }

    bdvLoginInProgress = true;

    try {
        const user = process.env.BDV_USER;
        const pass = process.env.BDV_PASS;

        if (!user || !pass) {
            console.error('[BDV] ❌ Faltan BDV_USER o BDV_PASS en .env');
            return false;
        }

        await launchBrowser();

        console.log('[BDV] 🔐 Navegando al BDV en línea...');
        try {
            await bdvPage.goto(BDV_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (eGoto) {
            console.warn('[BDV] ⚠️ Warning navegando a BDV (continuando igual):', eGoto.message);
        }
        await sleep(2500);

        const currentUrl = bdvPage.url();
        console.log(`[BDV] 📍 URL actual: ${currentUrl}`);

        // Verificar si ya tenemos sesión activa (cookie guardada en userDataDir)
        if (await checkIfLoggedIn()) {
            console.log('[BDV] ✅ Sesión activa desde cookie guardada.');
            bdvSessionActive = true;
            lastLoginTime = Date.now();
            return true;
        }

        // ====================================================
        // LOOP DE LOGIN (Hasta 4 intentos para sortear "sesión activa")
        // ====================================================
        let loginAttempts = 0;
        let loggedIn = false;

        while (loginAttempts < 4 && !loggedIn) {
            loginAttempts++;
            console.log(`[BDV] 🔐 Intento de login #${loginAttempts}...`);

            // Paso 1: Ingresar usuario si estamos en la pantalla de usuario
            let onUsernamePage = false;
            try {
                await bdvPage.waitForSelector('input[aria-label="usuario"]', { timeout: 6000 });
                onUsernamePage = true;
            } catch (e) {}

            if (onUsernamePage) {
                console.log('[BDV] 👤 Ingresando usuario...');
                await bdvPage.click('input[aria-label="usuario"]');
                await bdvPage.$eval('input[aria-label="usuario"]', el => {
                    el.value = '';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                });
                await sleep(500);
                await bdvPage.type('input[aria-label="usuario"]', user, { delay: randomDelay(80, 140) });
                await sleep(800);

                const entrarClicked = await clickButtonByText(bdvPage, 'Entrar');
                if (!entrarClicked) {
                    console.error('[BDV] ❌ No se encontró el botón "Entrar".');
                    await takeDebugScreenshot(`bdv_login_attempt_${loginAttempts}_no_entrar`);
                    return false;
                }
                console.log('[BDV] ✅ Clic en "Entrar" realizado.');
                await sleep(3500);
            } else {
                // Verificar si hay banner de sesión activa antes de la contraseña
                const sesionActiva = await bdvPage.evaluate(() => {
                    const content = document.body.innerText.toLowerCase();
                    return content.includes('sesion activa') || content.includes('sesión activa');
                });
                if (sesionActiva) {
                    console.log('[BDV] ⚠️ Diálogo "sesión activa" detectado antes de contraseña. Clic en Aceptar...');
                    await clickButtonByText(bdvPage, 'Aceptar');
                    await sleep(4000);
                    if (await checkIfLoggedIn()) {
                        console.log('[BDV] ✅ LOGIN EXITOSO tras aceptar sesión activa.');
                        bdvSessionActive = true;
                        lastLoginTime = Date.now();
                        loggedIn = true;
                        return true;
                    }
                    continue; // Siguiente ciclo del loop
                }

                // Si no hay banner y no estamos en la página de usuario, tal vez el input de usuario está pre-rellenado y solo hay que hacer clic en Entrar
                const hasPassword = await bdvPage.evaluate(() => !!document.querySelector('input[type="password"]'));
                if (!hasPassword) {
                    console.log('[BDV] 👤 Campo contraseña no visible, intentando clic en "Entrar" (usuario pre-rellenado)...');
                    const entrarClicked = await clickButtonByText(bdvPage, 'Entrar');
                    if (entrarClicked) {
                        await sleep(3500);
                    }
                }
            }

            // Paso 2: Ingresar contraseña
            console.log('[BDV] 🔑 Ingresando contraseña...');
            try {
                await bdvPage.waitForSelector('input[type="password"]', { timeout: 10000 });
            } catch (e) {
                // Si no apareció, verificar si apareció la advertencia de sesión activa
                const sesionActiva = await bdvPage.evaluate(() => {
                    const content = document.body.innerText.toLowerCase();
                    return content.includes('sesion activa') || content.includes('sesión activa');
                });
                if (sesionActiva) {
                    console.log('[BDV] ⚠️ Diálogo "sesión activa" detectado en paso de contraseña. Clic en Aceptar...');
                    await clickButtonByText(bdvPage, 'Aceptar');
                    await sleep(4000);
                    if (await checkIfLoggedIn()) {
                        console.log('[BDV] ✅ LOGIN EXITOSO tras aceptar sesión activa.');
                        bdvSessionActive = true;
                        lastLoginTime = Date.now();
                        loggedIn = true;
                        return true;
                    }
                    continue; // Siguiente ciclo
                }

                const errorMsg = await getPageError(bdvPage);
                if (errorMsg) {
                    console.error(`[BDV] ❌ Error visible: ${errorMsg}`);
                } else {
                    console.error('[BDV] ❌ Campo de contraseña no apareció.');
                }
                await takeDebugScreenshot(`bdv_login_attempt_${loginAttempts}_no_password`);
                return false;
            }

            await bdvPage.click('input[type="password"]');
            await bdvPage.$eval('input[type="password"]', el => {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await sleep(500);
            await bdvPage.type('input[type="password"]', pass, { delay: randomDelay(80, 140) });
            await sleep(800);

            // Hacer clic en "Continuar"
            const continuarClicked = await clickButtonByText(bdvPage, 'Continuar');
            if (!continuarClicked) {
                console.error('[BDV] ❌ No se encontró el botón "Continuar".');
                await takeDebugScreenshot(`bdv_login_attempt_${loginAttempts}_no_continuar`);
                return false;
            }
            console.log('[BDV] ✅ Clic en "Continuar" realizado.');
            await sleep(5000); // Esperar carga del dashboard o error

            // Paso 3: Verificar resultado del intento
            const sesionActiva = await bdvPage.evaluate(() => {
                const content = document.body.innerText.toLowerCase();
                return content.includes('sesion activa') || content.includes('sesión activa');
            });

            if (sesionActiva) {
                console.log('[BDV] ⚠️ Diálogo "sesión activa" detectado después de Continuar. Clic en Aceptar...');
                await clickButtonByText(bdvPage, 'Aceptar');
                await sleep(4000);
                if (await checkIfLoggedIn()) {
                    console.log('[BDV] ✅ LOGIN EXITOSO tras aceptar sesión activa.');
                    bdvSessionActive = true;
                    lastLoginTime = Date.now();
                    lastFailedLoginTime = 0;
                    loggedIn = true;
                    return true;
                }
                continue; // Siguiente ciclo
            }

            if (await checkIfLoggedIn()) {
                console.log('[BDV] ✅ LOGIN EXITOSO. Dashboard cargado.');
                bdvSessionActive = true;
                lastLoginTime = Date.now();
                lastFailedLoginTime = 0;
                loggedIn = true;
                return true;
            } else {
                const err = await getPageError(bdvPage);
                console.log(`[BDV] ⚠️ Intento de login sin éxito. Error visible: ${err || 'Ninguno'}`);
                await takeDebugScreenshot(`bdv_login_attempt_${loginAttempts}_failed`);
                await sleep(2000);
            }
        }

        if (!loggedIn) {
            console.error('[BDV] ❌ Login falló tras agotar los intentos.');
            await takeDebugScreenshot('bdv_login_failed_final');
            lastFailedLoginTime = Date.now();
            return false;
        }

    } catch (e) {
        console.error('[BDV] ❌ Error inesperado en bdvLogin:', e.message);
        bdvSessionActive = false;
        lastFailedLoginTime = Date.now();
        try { await closeBDVBrowser(); } catch (_) {}
        return false;
    } finally {
        bdvLoginInProgress = false;
    }
}

// ============================================================
// VERIFICAR SI YA ESTAMOS LOGUEADOS
// ============================================================
async function checkIfLoggedIn() {
    try {
        const url = bdvPage.url();

        // Si seguimos en la URL de login, no estamos dentro
        if (url.includes('oauthaccess') || url.includes('/login')) return false;

        const content = await bdvPage.content();
        const lower = content.toLowerCase();

        // Indicadores de estar dentro del dashboard
        const insideIndicators = [
            'cerrar sesión',
            'mis productos',
            'mis cuentas',
            'logout',
            'salir',
            'bienvenido',
            'nombre del cliente',
            'saldo disponible',
            'movimientos'
        ];

        return insideIndicators.some(ind => lower.includes(ind));
    } catch (e) {
        return false;
    }
}

// ============================================================
// OBTENER MOVIMIENTOS DE CUENTA
// Usa intercepción de red: navega por el dashboard SIN salir de él
// ============================================================
async function bdvMovimientos() {
    try {
        // Re-login si la sesión expiró o si perdimos el dashboard
        const currentUrl = bdvPage ? bdvPage.url() : '';
        const isOnDashboard = currentUrl.includes('/posicionconsolidada') || currentUrl.includes('/miscuentas');
        const sessionExpired = lastLoginTime && (Date.now() - lastLoginTime) > SESSION_TIMEOUT_MS;
        if (!bdvSessionActive || sessionExpired || !isOnDashboard) {
            console.log('[BDV] 🔄 Sesión inactiva o fuera del dashboard. Re-logueando...');
            bdvSessionActive = false;
            const ok = await bdvLogin();
            if (!ok) return null;
        }

        console.log('[BDV] 📋 Consultando movimientos BDV via intercepción de red...');
        const cuenta = process.env.BDV_CUENTA;

        // ──────────────────────────────────────────────────────────
        // Estrategia: Interceptar la respuesta de la API de movimientos
        // mientras el Angular la llama internamente.
        // No usamos page.goto() porque rompe la sesión Angular SPA.
        // ──────────────────────────────────────────────────────────
        let capturedMovimientos = null;

        // Activar intercepción de respuestas (solo para la URL de movimientos)
        const onResponse = async (response) => {
            try {
                const url = response.url();
                if (url.includes('movimientosCuenta') || url.includes('movimientos')) {
                    const text = await response.text();
                    const jsonMatch = text.match(/(\[.*\])/s);
                    if (jsonMatch) {
                        capturedMovimientos = JSON.parse(jsonMatch[1]);
                        console.log(`[BDV] 🎯 Movimientos capturados via red: ${capturedMovimientos.length}`);
                    }
                }
            } catch (e) { /* ignorar errores de parsing */ }
        };

        bdvPage.on('response', onResponse);

        try {
            // Intentar navegar a la sección de cuentas/movimientos dentro del SPA
            const navigated = await bdvPage.evaluate(() => {
                // Buscar enlaces o botones de "Mis Cuentas" o "Movimientos" en el menú
                const menuItems = Array.from(document.querySelectorAll(
                    'a, button, mat-list-item, [role="menuitem"], [routerlink], nav a, .menu-item'
                ));
                for (const el of menuItems) {
                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                    if (t.includes('mis cuentas') || t.includes('cuenta') || t.includes('movimiento')) {
                        el.click();
                        return `clicked: "${t}"`;
                    }
                }
                return null;
            });

            if (navigated) {
                console.log(`[BDV] 🖱️ Navegación: ${navigated}`);
            } else {
                console.log('[BDV] ⚠️ No se encontró menú de cuentas. Intentando URL Angular...');
                // En Angular SPA, cambiar el hash/ruta sin recargar la página
                await bdvPage.evaluate(() => {
                    // Cambiar la ruta Angular internamente
                    window.location.hash = '#/miscuentas';
                });
            }

            // Esperar hasta 10 segundos para que la API responda
            await Promise.race([
                new Promise(resolve => {
                    const check = setInterval(() => {
                        if (capturedMovimientos) {
                            clearInterval(check);
                            resolve('captured');
                        }
                    }, 500);
                }),
                sleep(10000)
            ]);

        } finally {
            bdvPage.off('response', onResponse);
        }

        if (capturedMovimientos && capturedMovimientos.length > 0) {
            console.log(`[BDV] ✅ ${capturedMovimientos.length} movimientos obtenidos.`);
            lastLoginTime = Date.now();
            return capturedMovimientos;
        }

        // Fallback: extraer tabla de la UI actual
        console.log('[BDV] ⚠️ API no capturada. Extrayendo desde la UI...');
        await takeDebugScreenshot('bdv_movimientos_ui');
        return await extraerMovimientosPorUI();

    } catch (e) {
        console.error('[BDV] ❌ Error en bdvMovimientos:', e.message);
        bdvSessionActive = false;
        return null;
    }
}

// ============================================================
// EXTRAER MOVIMIENTOS POR INTERFAZ WEB (FALLBACK)
// ============================================================
async function extraerMovimientosPorUI() {
    try {
        console.log('[BDV] 🖱️ Iniciando extracción de movimientos por UI...');
        
        // 1. Asegurar que estamos en el dashboard
        const currentUrl = bdvPage.url();
        if (!currentUrl.includes('/posicionconsolidada')) {
            console.log('[BDV] 📍 No estamos en el dashboard, navegando...');
            await bdvPage.goto(BDV_URL, { waitUntil: 'networkidle2', timeout: 20000 });
            await sleep(3000);
        }

        // 2. Buscar y hacer clic en el botón/icono de movimientos
        console.log('[BDV] 🖱️ Buscando icono de movimientos en el dashboard...');
        const iconClicked = await bdvPage.evaluate(() => {
            // Intentar buscar filas en la tabla de cuentas
            const rows = Array.from(document.querySelectorAll('mat-row, tr, .mat-row'));
            for (const row of rows) {
                const text = row.innerText || '';
                // Buscamos la fila que contenga el banco de venezuela standard '0102'
                if (text.includes('0102')) {
                    const icon = row.querySelector('mat-icon');
                    if (icon && icon.textContent.trim() === 'subject') {
                        icon.click();
                        return 'clicked_row_icon';
                    }
                }
            }

            // Fallback: hacer clic en cualquier mat-icon que tenga el texto 'subject'
            const icons = Array.from(document.querySelectorAll('mat-icon'));
            for (const icon of icons) {
                if (icon.textContent.trim() === 'subject') {
                    icon.click();
                    return 'clicked_fallback_icon';
                }
            }
            return null;
        });

        if (!iconClicked) {
            console.error('[BDV] ❌ No se encontró el icono de movimientos ("subject").');
            await takeDebugScreenshot('bdv_no_movimientos_icon');
            return null;
        }

        console.log(`[BDV] ✅ Icono de movimientos clicked: ${iconClicked}`);
        await sleep(4000); // Esperar a que el modal cargue

        // Guardar captura del modal cargado
        await takeDebugScreenshot('bdv_movimientos_modal_loaded');

        // 3. Extraer la tabla de movimientos del modal
        const movimientos = await bdvPage.evaluate(() => {
            const result = [];
            
            // Las filas de movimientos están dentro del diálogo
            const dialog = document.querySelector('mat-dialog-container, .mat-dialog-content, mat-dialog-content');
            if (!dialog) return null;

            const rows = Array.from(dialog.querySelectorAll('tr, mat-row, .mat-row'));
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td, mat-cell, .mat-cell'));
                if (cells.length >= 5) {
                    const values = cells.map(c => (c.innerText || '').trim());
                    
                    // La primera fila puede ser la cabecera (Fecha, Referencia, etc.)
                    // Verificamos si la primera celda parece una fecha
                    const datePattern = /\d{2}-\d{2}-\d{4}/;
                    if (datePattern.test(values[0])) {
                        // Estructura de columnas en el modal:
                        // 0: Fecha (e.g. 23-06-2026 09:58)
                        // 1: Referencia (e.g. 9627800625104)
                        // 2: Descripción (e.g. OPERACION PAGOMOVIL BDV)
                        // 3: Débito / Crédito (e.g. CREDITO / DEBITO)
                        // 4: Monto (e.g. 5.803,50 Bs. o -200,00 Bs.)
                        // 5: Saldo (e.g. 21.581,56 Bs.)
                        
                        const indicador = (values[3] || '').toUpperCase();
                        const isAbono = indicador.includes('CREDITO') || 
                                        indicador.includes('CRÉDITO') || 
                                        indicador.includes('ABONO') ||
                                        !values[4].startsWith('-'); // si el monto no empieza con menos

                        result.push({
                            fecha: values[0],
                            referencia: values[1],
                            descripcion: values[2],
                            importe: values[4],
                            indicadorCargoAbono: isAbono ? 'A' : 'C'
                        });
                    }
                }
            });
            return result;
        });

        // 4. Cerrar el modal haciendo clic en "Regresar"
        console.log('[BDV] 🖱️ Cerrando modal de movimientos...');
        const regresarClicked = await clickButtonByText(bdvPage, 'Regresar');
        if (regresarClicked) {
            console.log('[BDV] ✅ Modal cerrado.');
        } else {
            console.warn('[BDV] ⚠️ No se pudo hacer clic en el botón "Regresar". Intentando selector alternativo...');
            await bdvPage.evaluate(() => {
                const closeBtn = document.querySelector('button[aria-label="Close dialog"], button[aria-label="close"]');
                if (closeBtn) closeBtn.click();
            });
        }
        
        await sleep(1500);

        if (movimientos && movimientos.length > 0) {
            console.log(`[BDV] ✅ Se extrajeron ${movimientos.length} movimientos de la UI modal.`);
            return movimientos;
        } else {
            console.error('[BDV] ❌ No se encontraron filas de movimientos en el modal.');
            return null;
        }

    } catch (e) {
        console.error('[BDV] ❌ Error en extraerMovimientosPorUI:', e.message);
        return null;
    }
}

// ============================================================
// VERIFICAR PAGO BDV
// Cruza referencia (últimos 4-8 dígitos) y monto con los movimientos
// @param {number} montoBs   - Monto esperado en Bolívares
// @param {string} ref4      - Últimos 4 u 8 dígitos de la referencia
// @returns {{ success, movimiento } | { success: false, checked, pending, error }}
// ============================================================
async function verificarPagoBDV(montoBs, ref4) {
    try {
        const movimientos = await bdvMovimientos();

        if (!movimientos) {
            return { success: false, checked: false, pending: true };
        }

        const cleanRefReported = ref4.trim();

        // Seguridad: la referencia reportada debe tener al menos 3 dígitos
        if (cleanRefReported.length < 3) {
            console.log(`[BDV] ⚠️ Referencia demasiado corta (${cleanRefReported.length} chars): '${cleanRefReported}'`);
            return { success: false, checked: false, error: 'Referencia muy corta' };
        }

        const stripZ = (s) => s.replace(/^0+/, '') || '0';
        const parseMontoBs = (importeStr) => {
            if (!importeStr) return 0;
            let clean = importeStr.toString().replace(/[^0-9.,-]/g, '').trim();
            if (!clean) return 0;
            if (clean.includes(',')) {
                clean = clean.replace(/\./g, '').replace(',', '.');
            }
            return parseFloat(clean) || 0;
        };
        const sigReported = stripZ(cleanRefReported);

        // Limpiar prefijos de banco comunes (0108 para Provincial, 0169 o UBII para Ubii App)
        let cleanRefUnprefixed = cleanRefReported;
        if (cleanRefUnprefixed.startsWith('0108') && cleanRefUnprefixed.length > 6) {
            cleanRefUnprefixed = cleanRefUnprefixed.slice(4);
        } else if (cleanRefUnprefixed.startsWith('0169') && cleanRefUnprefixed.length > 6) {
            cleanRefUnprefixed = cleanRefUnprefixed.slice(4);
        } else if (cleanRefUnprefixed.toLowerCase().startsWith('ubii') && cleanRefUnprefixed.length > 6) {
            cleanRefUnprefixed = cleanRefUnprefixed.slice(4);
        }
        const sigReportedUnprefixed = stripZ(cleanRefUnprefixed);

        // Helper para determinar si un movimiento es crédito/abono recibido
        const esMovimientoAbono = (m) => {
            const ind = (m.indicadorCargoAbono || '').trim().toUpperCase();
            const desc = (m.descripcion || '').toLowerCase();
            const imp = (m.importe || '0').toString();
            if (ind === 'A' || ind === 'ABONO' || ind === 'CREDITO' || ind === 'CRÉDITO') return true;
            if (desc.includes('abono') || desc.includes('crédito') || desc.includes('credito') || desc.includes('recib')) return true;
            if (desc.includes('pago movil') || desc.includes('pagomovil') || desc.includes('provincial') || desc.includes('ubii') || desc.includes('interbancario') || desc.includes('c2p')) return true;
            if (!imp.startsWith('-') && ind !== 'D' && ind !== 'DEBITO' && ind !== 'DÉBITO') return true;
            return false;
        };

        // ── LOG DE DIAGNÓSTICO: mostrar todas las refs del BDV para comparar ──
        const abonosEncontrados = movimientos.filter(esMovimientoAbono);
        console.log(`[BDV] 🔍 Buscando ref="${cleanRefReported}" (sig="${sigReported}") monto≈${montoBs}Bs`);
        console.log(`[BDV] 📋 ${abonosEncontrados.length} abonos en BDV:`);
        abonosEncontrados.forEach(m => {
            const ref = (m.referencia || '').replace(/\s/g, '');
            const imp = (m.importe || '0').toString();
            const montoMov = parseMontoBs(imp);
            console.log(`[BDV]   • Ref=${ref} | Monto=${imp} (${montoMov}Bs) | Desc=${m.descripcion}`);
        });
        // ────────────────────────────────────────────────────────────────────

        for (const mov of movimientos) {
            const indicador = (mov.indicadorCargoAbono || '').trim().toUpperCase();
            const descripcion = (mov.descripcion || '').trim();
            const referencia = (mov.referencia || '').replace(/\s/g, '');
            const importe = (mov.importe || '0').toString();

            // Solo abonos (créditos recibidos)
            if (!esMovimientoAbono(mov)) continue;

            // Calcular monto del movimiento
            const montoMov = parseMontoBs(importe);

            const sigBank = stripZ(referencia);

            let refMatch = false;

            // ============================================================
            // ESTRATEGIA DE MATCHING DE REFERENCIA (PAGOS INTERBANCARIOS)
            // ============================================================
            // Problema real: cada banco muestra la referencia de forma distinta.
            //   • BDV (emisor/receptor):  genera su propia ref interna.
            //   • Provincial, Mercantil, Banesco, Ubii etc. muestran la ref que ELLOS generan.
            // Las refs pueden compartir sufijos pero NO ser idénticas.
            //
            // Estrategia en capas:
            //   1. Coincidencia exacta (ref completa o sig a sig)
            //   2. Sufijo con múltiples longitudes (3..8 dígitos de cleanRefReported)
            //      y también de sigReported — para manejar refs con ceros iniciales
            //      como "000000969" cuya sig es solo "969".
            //   3. Para transferencias/traspasos: últimos 8 sig.
            //   4. Ref larga (>8 sig): últimos 7 sig de ambas.
            //   5. Especial Provincial (0108) y Ubii App (0169): Búsqueda en DESCRIPCIÓN.
            // ============================================================

            // Capa 1: Coincidencia exacta
            if (referencia === cleanRefReported || sigBank === sigReported ||
                referencia === cleanRefUnprefixed || sigBank === sigReportedUnprefixed) {
                refMatch = true;
            }

            // Capa 2: Sufijo múltiple — busca que la ref del BDV TERMINE en
            // alguno de los sufijos de la ref reportada (desde 3 hasta 8 dígitos).
            if (!refMatch) {
                const candidatosSufijo = new Set();
                for (let n = 3; n <= Math.min(cleanRefReported.length, 10); n++) {
                    candidatosSufijo.add(cleanRefReported.slice(-n));
                }
                for (let n = 3; n <= Math.min(sigReported.length, 8); n++) {
                    candidatosSufijo.add(sigReported.slice(-n));
                }
                for (let n = 3; n <= Math.min(sigReportedUnprefixed.length, 8); n++) {
                    candidatosSufijo.add(sigReportedUnprefixed.slice(-n));
                }

                for (const sufijo of candidatosSufijo) {
                    if (sufijo.length < 3) continue;
                    if (referencia.endsWith(sufijo) || sigBank.endsWith(sufijo)) {
                        console.log(`[BDV] 🔗 Match por sufijo "${sufijo}" | BDVRef=${referencia} | ClienteRef=${cleanRefReported}`);
                        refMatch = true;
                        break;
                    }
                }
            }

            // Capa 3: Para transferencias/traspasos — últimos 8 sig de ambas
            if (!refMatch && (
                descripcion.includes('ABO TRASP') ||
                descripcion.includes('TRASPASO') ||
                descripcion.includes('TRANSFERENCIA')
            )) {
                const sigR = sigReported.slice(-8);
                const sigB = sigBank.slice(-8);
                if (sigR.length >= 3 && (sigB.endsWith(sigR) || sigR.endsWith(sigB))) {
                    console.log(`[BDV] 🔗 Match por traspaso sig8: sigR="${sigR}" sigB="${sigB}"`);
                    refMatch = true;
                }
            }

            // Capa 4: Ref larga (>8 sig) — últimos 7 sig de ambas
            if (!refMatch && sigReported.length > 8) {
                const LAST_N = 7;
                const sigR = sigReported.slice(-LAST_N);
                const sigB = sigBank.slice(-LAST_N);
                if (sigR.length >= 3 && sigB === sigR) {
                    console.log(`[BDV] 🔗 Match por sig7: sigR="${sigR}" sigB="${sigB}"`);
                    refMatch = true;
                }
            }

            // Capa 5: Búsqueda en DESCRIPCIÓN (Especial para Provincial 0108 y Ubii App 0169)
            // En pagos interbancarios de Provincial o Ubii, BDV a menudo guarda el nro de ref del cliente en la descripción.
            if (!refMatch) {
                const candidatosDesc = new Set([
                    cleanRefReported,
                    sigReported,
                    cleanRefUnprefixed,
                    sigReportedUnprefixed
                ]);

                for (let n = 4; n <= Math.min(sigReportedUnprefixed.length, 8); n++) {
                    candidatosDesc.add(sigReportedUnprefixed.slice(-n));
                }

                for (const cand of candidatosDesc) {
                    if (!cand || cand.length < 3) continue;
                    if (descripcion.includes(cand) || referencia.includes(cand) || sigBank.includes(cand)) {
                        console.log(`[BDV] 🔗 Match por ref/descripción "${cand}" | BDVRef=${referencia} | Desc="${descripcion}" | ClienteRef=${cleanRefReported}`);
                        refMatch = true;
                        break;
                    }
                }
            }

            // Tolerancia de monto: (esperado - 5 Bs) a (esperado + 200 Bs)
            const montoMin = montoBs - 5;
            const montoMax = montoBs + 200;
            const montoMatch = montoMov >= montoMin && montoMov <= montoMax;

            // Seguridad extra: si la ref sig es muy corta (≤4 dígitos), exigir
            // monto más ajustado (±1 Bs) para evitar falsos positivos.
            const refMuyCorta = sigReported.length <= 4;
            const montoMatchEstricto = Math.abs(montoMov - montoBs) <= 1;

            const coincide = refMatch && (refMuyCorta ? montoMatchEstricto : montoMatch);

            if (coincide) {
                const diff = montoMov - montoBs;
                const diffStr = diff === 0 ? 'exacto' : (diff > 0 ? `+${diff.toFixed(2)} Bs` : `${diff.toFixed(2)} Bs`);
                console.log(`[BDV] ✅ PAGO VERIFICADO | Ref: ${referencia} | Monto: ${importe} Bs (${diffStr}) | Desc: ${descripcion}`);
                return {
                    success: true,
                    movimiento: { fecha: mov.fecha, referencia, importe, descripcion }
                };
            }
        }

        console.log(`[BDV] ℹ️ Sin coincidencia para ref="${ref4}" monto≈${montoBs}Bs en ${movimientos.length} movimientos.`);
        return { success: false, checked: true, pending: true };

    } catch (e) {
        console.error('[BDV] ❌ Error en verificarPagoBDV:', e.message);
        return { success: false, checked: false, error: e.message };
    }
}

// ============================================================
// ESTADO DEL SERVICIO (para el panel admin)
// ============================================================
function getBDVStatus() {
    return {
        sessionActive: bdvSessionActive,
        lastLogin: lastLoginTime ? new Date(lastLoginTime).toISOString() : null,
        browserActive: !!bdvBrowser,
        loginInProgress: bdvLoginInProgress
    };
}

// ============================================================
// CERRAR NAVEGADOR (shutdown limpio)
// ============================================================
async function closeBDVBrowser() {
    if (bdvBrowser) {
        try { await bdvBrowser.close(); } catch (e) {}
        bdvBrowser = null;
        bdvPage = null;
        bdvSessionActive = false;
        console.log('[BDV] 🔒 Navegador BDV cerrado.');
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

/**
 * Hace clic en un botón de Angular Material buscándolo por su texto visible
 */
async function clickButtonByText(page, text) {
    try {
        const clicked = await page.evaluate((btnText) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const btn of buttons) {
                if ((btn.innerText || '').trim().toLowerCase() === btnText.toLowerCase()) {
                    btn.click();
                    return true;
                }
            }
            return false;
        }, text);
        return clicked;
    } catch (e) {
        return false;
    }
}

/**
 * Obtiene el texto de cualquier mensaje de error visible en la página
 */
async function getPageError(page) {
    try {
        return await page.evaluate(() => {
            const selectors = [
                'mat-error', '.mat-error', '.error-message',
                '.alert-danger', '.mensaje-error',
                '[class*="error" i]', '.snack-bar-container',
                'mat-snack-bar-container', '.mat-snack-bar-container'
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.innerText && el.innerText.trim()) {
                    return el.innerText.trim();
                }
            }
            return null;
        });
    } catch (e) { return null; }
}

/**
 * Guarda screenshot de diagnóstico en scratch/
 */
async function takeDebugScreenshot(name) {
    try {
        const scratchDir = path.join(__dirname, 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        await bdvPage.screenshot({ path: path.join(scratchDir, `${name}.png`) });
        console.log(`[BDV] 📸 Screenshot guardado: scratch/${name}.png`);
    } catch (e) { /* ignorar */ }
}

module.exports = {
    bdvLogin,
    bdvMovimientos,
    verificarPagoBDV,
    closeBDVBrowser,
    getBDVStatus
};
