const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');
const puppeteer = require('puppeteer');

/**
 * Helper: Realiza el login en jadh.shop y verifica que fue exitoso.
 * Lanza un error descriptivo si las credenciales son incorrectas o el login falla.
 */
async function jadhLogin(page, email, password, prefix = '[JADH]') {
    console.log(`${prefix} 🔑 Iniciando sesión en jadh.shop...`);
    await page.goto('https://jadh.shop/auth', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#login-email', { timeout: 15000 });

    // Limpiar campos y escribir credenciales
    await page.$eval('#login-email', el => el.value = '');
    await page.type('#login-email', email);
    await page.$eval('#login-password', el => el.value = '');
    await page.type('#login-password', password);

    console.log(`${prefix} 🖱️ Haciendo click en Iniciar Sesión...`);
    // Esperar a que la navegación ocurra O a que se muestre un error en la página
    await Promise.all([
        page.click('#login-form button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    // Verificar que el login fue exitoso (salimos de /auth)
    const afterLoginUrl = page.url();
    if (afterLoginUrl.includes('/auth') || afterLoginUrl.includes('/login')) {
        // Login falló - capturar diagnóstico
        const errorMsg = await page.evaluate(() => {
            const errEl = document.querySelector('.alert-danger, .error, [class*="error"], [class*="alert"]');
            return errEl ? errEl.innerText.trim() : 'Sin mensaje de error visible en la página.';
        });
        await page.screenshot({ path: `jadh_login_error.png`, fullPage: true });
        console.error(`${prefix} ❌ Login fallido. URL: ${afterLoginUrl}`);
        console.error(`${prefix} 📋 Mensaje de error en página: ${errorMsg}`);
        throw new Error(`Login en jadh.shop falló. Verifica las credenciales JADH_EMAIL/JADH_PASSWORD. Error: ${errorMsg}`);
    }

    console.log(`${prefix} ✅ Sesión iniciada con éxito. URL: ${afterLoginUrl}`);
}

/**
 * Servicio de Automatización de Recargas Directas en Jadh.shop
 * @param {string} uid - ID del jugador de Free Fire o Roblox
 * @param {string} packAmount - Cantidad del paquete (ej: "100", "10 USD", etc.)
 * @param {string} game - El juego ("freefire" o "roblox")
 */
async function rechargeViaJadh(uid, packAmount, game = 'freefire', providerOption = null) {
    const activeProvider = providerOption || (global.settings && global.settings.freefire_provider_option) || process.env.FREEFIRE_PROVIDER_OPTION || 'directas';
    console.log(`[JADH-BOT] 🚀 Iniciando proceso de recarga directa | Juego: ${game} | ID: ${uid} | Paquete: ${packAmount} | Ruta Jadh: ${activeProvider}`);
    
    const email = process.env.JADH_EMAIL || 'jmnetfreelat@gmail.com';
    const password = process.env.JADH_PASSWORD || 'Clifor1988';

    if (!email || !password) {
        console.error('[JADH-BOT] ❌ Error: Faltan credenciales JADH_EMAIL o JADH_PASSWORD en variables de entorno.');
        return { success: false, message: 'Faltan credenciales del proveedor externo en el servidor.' };
    }

    let packageId = null;
    let amountKey = packAmount.toString().trim();
    if (game === 'freefire') {
        // Limpiar packAmount para obtener el identificador base (ej: "100" de "100 + 10 (x1)")
        amountKey = amountKey.split(' ')[0].replace(',', '').replace('.', '').trim();
        
        if (activeProvider === 'auto') {
            // Mapear paquetes de diamantes a IDs de jadh.shop (freefire-auto)
            const packMapAuto = {
                "100":  "156",  // 110 💎
                "310":  "157",  // 341 💎
                "520":  "158",  // 572 💎
                "1060": "159",  // 1166 💎
                "2180": "160",  // 2376 💎
                "5600": "161"   // 6138 💎
            };
            packageId = packMapAuto[amountKey];
        } else {
            // Mapear paquetes de diamantes a IDs de jadh.shop (freefire-recargas-directas)
            const packMapDirectas = {
                "100":  "269",  // 100+10 💎
                "310":  "270",  // 310+31 💎
                "520":  "271",  // 520+52 💎
                "1060": "272",  // 1060+106 💎
                "2160": "273",  // 2160+218 💎
                "2180": "273",  // 2160+218 💎
                "5600": "274"   // 5600+560 💎
            };
            packageId = packMapDirectas[amountKey];
        }

        if (!packageId) {
            console.error(`[JADH-BOT] ❌ Error: Paquete no mapeado para el monto: ${amountKey} (Opción: ${activeProvider})`);
            return { success: false, message: `El paquete de ${amountKey} diamantes no está mapeado en Jadh (${activeProvider}).` };
        }
    } else if (game === 'bloodstrike') {
        // Limpiar amountKey para obtener el identificador base
        amountKey = amountKey.split(' ')[0].replace(',', '').replace('.', '').trim();
        
        // Mapear paquetes de monedas a IDs de jadh.shop (bloodstrike)
        const packMap = {
            "100":  "162",  // 100+5🪙   $0.77
            "300":  "163",  // 300+20🪙  $2.35
            "500":  "164",  // 500+40🪙  $3.85
            "1000": "165",  // 1000+100🪙 $7.81
            "2000": "166",  // 2000+260🪙 $15.34
            "5000": "167"   // 5000+800🪙 $38.04
        };

        packageId = packMap[amountKey];
        if (!packageId) {
            console.error(`[JADH-BOT] ❌ Error: Paquete Blood Strike no mapeado: ${amountKey}`);
            return { success: false, message: `El paquete de ${amountKey} monedas de Blood Strike no está mapeado para recarga directa.` };
        }
    } else if (game === 'mobilelegends' || game === 'mobilelegendsus') {
        // Limpiar amountKey para obtener el identificador base
        amountKey = amountKey.split(' ')[0].replace(',', '').replace('.', '').trim();
        
        // Mapear paquetes de diamantes a IDs de jadh.shop (mobile-legends-us)
        const packMap = {
            "51":   "176",  // 51+5 💎      $0.90
            "102":  "177",  // 102+10 💎    $1.85
            "253":  "178",  // 253+25 💎    $4.69
            "505":  "179",  // 505+66 💎    $9.33
            "1010": "180",  // 1010+182 💎  $18.94
            "1515": "181"   // 1515+273 💎  $28.60
        };

        packageId = packMap[amountKey];
        if (!packageId) {
            console.error(`[JADH-BOT] ❌ Error: Paquete Mobile Legends US no mapeado: ${amountKey}`);
            return { success: false, message: `El paquete de ${amountKey} diamantes de Mobile Legends US no está mapeado para recarga directa.` };
        }
    }

    let browser = null;
    try {
        console.log('[JADH-BOT] 🌐 Lanzando navegador Puppeteer...');
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote'
        ];
        if (process.platform !== 'win32') {
            args.push('--single-process');
        }

        const launchOptions = {
            headless: "new",
            args
        };

        if (process.platform === 'win32') {
            launchOptions.executablePath = path.join(__dirname, '.cache', 'puppeteer', 'chrome', 'win64-121.0.6167.85', 'chrome-win64', 'chrome.exe');
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        const freefireUrl = activeProvider === 'auto'
            ? 'https://jadh.shop/producto/freefire-auto'
            : 'https://jadh.shop/producto/freefire-recargas-directas';

        const productUrlMap = {
            'freefire':        freefireUrl,
            'roblox':          'https://jadh.shop/producto/roblox-usa',
            'bloodstrike':     'https://jadh.shop/producto/bloodstrike',
            'mobilelegends':   'https://jadh.shop/producto/mobile-legends-us',
            'mobilelegendsus': 'https://jadh.shop/producto/mobile-legends-us'
        };
        const productUrl = productUrlMap[game] || freefireUrl;
        // 1. Navegar directamente al producto (Jadh redirige a /auth si no hay sesión)
        console.log(`[JADH-BOT] 📡 Navegando al producto ${productUrl}...`);
        await page.goto(productUrl, { waitUntil: 'networkidle2' });

        // Si nos redirigió al login, hacer login con verificación robusta
        const currentUrl = page.url();
        const needsLogin = currentUrl.includes('/auth') || currentUrl.includes('/login') || !!(await page.$('#login-email'));

        if (needsLogin) {
            await jadhLogin(page, email, password, '[JADH-BOT]');
            // Navegar al producto después del login exitoso
            console.log(`[JADH-BOT] 📡 Navegando al producto tras login: ${productUrl}`);
            await page.goto(productUrl, { waitUntil: 'networkidle2' });
            // Verificar que llegamos al producto y no fuimos redirigidos de nuevo
            if (page.url().includes('/auth')) {
                throw new Error('Redirigido a /auth tras login exitoso. La cuenta puede no tener acceso al producto.');
            }
        } else {
            console.log('[JADH-BOT] 🔄 Sesión ya estaba activa.');
        }

        // Esperar un momento para que el JavaScript dinámico de la página cargue el formulario
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 2. Completar formulario de compra
        console.log('[JADH-BOT] 📝 Seleccionando paquete...');
        try {
            await page.waitForSelector('#packageSelect', { timeout: 30000 });
        } catch (selectorErr) {
            console.error('[JADH-BOT] ❌ #packageSelect no encontrado. Capturando diagnóstico...');
            await page.screenshot({ path: 'jadh_bot_error.png', fullPage: true });
            const pageHtml = await page.content();
            const pageTitle = await page.title();
            const currentPageUrl = page.url();
            console.error(`[JADH-BOT] URL actual: ${currentPageUrl} | Título: ${pageTitle}`);
            console.error('[JADH-BOT] HTML (primeros 2000 chars):', pageHtml.substring(0, 2000));
            throw selectorErr;
        }
        
        if (game === 'freefire' || game === 'bloodstrike' || game === 'mobilelegends' || game === 'mobilelegendsus') {
            await page.select('#packageSelect', packageId);
        } else {
            const packageSelected = await page.evaluate((amountToFind) => {
                const select = document.querySelector('#packageSelect');
                if (!select) return false;
                const options = Array.from(select.querySelectorAll('option'));
                
                // Buscar coincidencia exacta del número (ej: "10" no debe coincidir con "100")
                const targetOption = options.find(o => {
                    const text = o.textContent.toLowerCase();
                    const match = text.match(/\b(\d+)\s*(usd|s)/i) || text.match(/\b(\d+)\b/);
                    if (match) {
                        return parseInt(match[1]) === parseInt(amountToFind);
                    }
                    return text.includes(amountToFind.toString().toLowerCase());
                });

                if (targetOption) {
                    select.value = targetOption.value;
                    // IMPORTANTE: Disparar el evento 'change' para actualizar el precio y habilitar la validación
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            }, packAmount);
            
            if (!packageSelected) {
                console.error(`[JADH-BOT] ❌ No se encontró el paquete con texto: ${packAmount}`);
                return { success: false, message: `No se encontró el paquete de ${packAmount} en Jadh.shop.` };
            }
        }

        if (game === 'mobilelegends' || game === 'mobilelegendsus') {
            console.log('[JADH-BOT] 📝 Ingresando User ID y Zone ID de Mobile Legends...');
            const parts = uid.toString().trim().split(/[\s\(\)\|\,\-]+/).filter(Boolean);
            const userId = parts[0] || '';
            const zoneId = parts[1] || '';

            const input1 = await page.waitForSelector('input[name="gp_input1"]', { timeout: 15000 }).catch(() => null);
            if (input1) {
                await page.type('input[name="gp_input1"]', userId);
                if (zoneId) {
                    const input2 = await page.$('input[name="gp_input2"]');
                    if (input2) {
                        await page.type('input[name="gp_input2"]', zoneId);
                    }
                }
            } else {
                console.error('[JADH-BOT] ❌ Error: No se encontró el campo de User ID (gp_input1)');
                return { success: false, message: 'No se encontró el campo de ID para Mobile Legends en Jadh.shop.' };
            }
        } else if (game !== 'roblox') {
            console.log('[JADH-BOT] 📝 Ingresando ID del jugador...');
            const inputSelector = await page.evaluate(() => {
                // jadh.shop usa #pcrPlayerId en freefire-recargas-directas, #gameAccountId en freefire-auto, o input[name="player_id"] / input[name^="gp_"]
                const pcrEl = document.querySelector('#pcrPlayerId') || document.querySelector('input[name="player_id"]');
                if (pcrEl) return pcrEl.id ? '#' + pcrEl.id : 'input[name="player_id"]';
                const newEl = document.querySelector('#gameAccountId');
                if (newEl) return '#gameAccountId';
                const legacyEl = document.querySelector('input[name^="gp_"]');
                return legacyEl ? (legacyEl.id ? '#' + legacyEl.id : 'input[name="' + legacyEl.name + '"]') : null;
            });
            
            if (inputSelector) {
                await page.type(inputSelector, uid.toString());
            } else {
                console.error('[JADH-BOT] ❌ Error: No se encontró el campo de ID (gp_input)');
                return { success: false, message: 'No se encontró el campo para ingresar el ID en Jadh.shop.' };
            }
        } else {
            console.log('[JADH-BOT] ℹ️ Roblox seleccionado. Omitiendo ingreso de ID de jugador (producto tipo PIN).');
        }

        // 4. Click en Recargar
        if (process.env.TEST_MODE === 'true') {
            console.log('[JADH-BOT] 🧪 [MODO PRUEBA] Simulación activa. Evitando el click de compra final para no consumir saldo.');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return {
                success: true,
                message: 'Recarga simulada con éxito en Jadh.shop (Modo Prueba)',
                orderId: 'SIM_' + Math.floor(100000 + Math.random() * 900000),
                nickname: game === 'roblox' ? 'RobloxPlayer' : 'JugadorPruebaFF',
                amount: amountKey,
                pin: game === 'roblox' ? 'SIM-ROBLOX-PIN-123456' : null
            };
        }

        console.log('[JADH-BOT] 💎 Enviando solicitud de recarga...');
        
        // Esperamos navegación ya que el action hace POST a /purchase
        await Promise.all([
            page.click('#btnPurchase'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
        ]);

        console.log('[JADH-BOT] ⏳ Esperando a que finalice el procesamiento en la página...');
        let purchaseResultText = '';
        
        // Esperar hasta 40 segundos a que la página cambie de "Procesando" a "Éxito" o "Error"
        for (let attempt = 0; attempt < 40; attempt++) {
            purchaseResultText = await page.evaluate(() => document.body.innerText);
            const lowerText = purchaseResultText.toLowerCase();
            
            // Si ya no dice "procesando" y muestra señales de haber terminado
            if (!lowerText.includes('procesando recarga') && !lowerText.includes('siendo procesada')) {
                break;
            }
            if (lowerText.includes('no se pudo completar') || lowerText.includes('no encontrado') || lowerText.includes('exito') || lowerText.includes('completada')) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('[JADH-BOT] 📄 Texto final del resultado (primeros 500 chars):', purchaseResultText.substring(0, 500));
        
        const lowerResult = purchaseResultText.toLowerCase();
        // Detectar errores reales en la página de resultado de compra
        const errorKeywords = ['insuficiente', 'insufficient', 'error', 'failed', 'rechazad', 'no tiene', 'invalid', 'inválid', 'no encontrado', 'not found', 'denied', 'denegado', 'cancelado', 'cancelled', 'no se pudo completar'];
        const hasError = errorKeywords.some(kw => lowerResult.includes(kw));
        if (hasError) {
            console.error('[JADH-BOT] ❌ Error detectado en la página de resultado de compra.');
            let errorMsg = 'Error en jadh.shop';
            if (lowerResult.includes('no se pudo completar')) {
                const startIdx = lowerResult.indexOf('no se pudo completar');
                errorMsg = purchaseResultText.substring(startIdx, startIdx + 300).trim();
            } else {
                errorMsg = `Error en jadh.shop: ${purchaseResultText.substring(0, 300)}`;
            }
            return { success: false, message: errorMsg };
        }
        
        // 6. Si no hay error en la compra, intentar verificar en el Dashboard con reintentos
        let transaction = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`[JADH-BOT] 🔎 Volviendo al dashboard para obtener detalles de la orden (Intento ${attempt}/3)...`);
            await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 4000));

            transaction = await page.evaluate((playerID, gameName) => {
                const cards = Array.from(document.querySelectorAll('.card, .transaction-card, div')).filter(el => {
                    if (el.children.length === 0) return false;
                    const text = el.innerText || '';
                    return text.includes('Monto total:') && text.includes('Orden:');
                });

                const uniqueCards = [];
                cards.forEach(card => {
                    const isParentOfExisting = uniqueCards.some(existing => card.contains(existing));
                    const isChildOfExisting = uniqueCards.some(existing => existing.contains(card));
                    if (isChildOfExisting) {
                        const idx = uniqueCards.findIndex(existing => existing.contains(card));
                        if (idx !== -1) uniqueCards[idx] = card;
                    } else if (!isParentOfExisting) {
                        uniqueCards.push(card);
                    }
                });

                const transactions = uniqueCards.map(card => {
                    const text = card.innerText || '';
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                    
                    const getValue = (lines, prefix) => {
                        const idx = lines.findIndex(l => l.startsWith(prefix));
                        if (idx === -1) return '';
                        let val = lines[idx].substring(prefix.length).trim();
                        if (!val && idx + 1 < lines.length) {
                            val = lines[idx + 1].trim();
                        }
                        return val;
                    };

                    const orderId = getValue(lines, 'Orden:');
                    const amount = getValue(lines, 'Monto total:');
                    const date = getValue(lines, 'Fecha:');
                    const nickname = getValue(lines, 'Nickname:');
                    const uid = getValue(lines, 'ID de Jugador:') || getValue(lines, 'Datos:');
                    const packageVal = getValue(lines, 'Paquete:');
                    const status = getValue(lines, 'Estado:');

                    // Extraer PINs
                    const pinRows = Array.from(card.querySelectorAll('.pin-row'));
                    const pins = pinRows.map(row => {
                        const labelEl = row.querySelector('.pin-label, label');
                        const inputEl = row.querySelector('.pin-input, input');
                        return {
                            label: labelEl ? labelEl.innerText.trim() : '',
                            pin: inputEl ? inputEl.value.trim() : ''
                        };
                    });

                    if (pins.length === 0) {
                        const inputs = Array.from(card.querySelectorAll('input.pin-input, input[readonly]'));
                        inputs.forEach(input => {
                            pins.push({
                                label: 'PIN',
                                pin: input.value.trim()
                            });
                        });
                    }

                    const knownFields = ['Monto total:', 'Orden:', 'Fecha:', 'Nickname:', 'ID de Jugador:', 'Datos:', 'Paquete:', 'Estado:', 'Artículos', 'Copiar'];
                    const firstLine = lines.find(l => !knownFields.some(f => l.startsWith(f)));

                    return {
                        type: firstLine || 'Desconocido',
                        orderId,
                        amount,
                        date,
                        nickname,
                        uid,
                        packageName: packageVal,
                        status,
                        pins
                    };
                });

                // Si es roblox, buscamos la transacción más reciente que sea de Roblox y que NO haya fallado
                if (gameName === 'roblox') {
                    const match = transactions.find(t => 
                        !(t.status && ['fallido', 'cancelado', 'rechazado', 'error', 'failed', 'declined'].some(s => t.status.toLowerCase().includes(s))) && (
                            (t.type && t.type.toLowerCase().includes('roblox')) ||
                            (t.packageName && t.packageName.toLowerCase().includes('roblox')) ||
                            (t.pins && t.pins.some(p => p.label && p.label.toLowerCase().includes('roblox'))) ||
                            (!t.uid && t.type !== 'Desconocido' && t.type.toLowerCase().includes('roblox')) ||
                            (!t.uid && t.packageName && t.packageName.toLowerCase().includes('roblox'))
                        )
                    );
                    if (match) {
                        return { match, all: transactions.slice(0, 3) };
                    }
                    // Si no se encuentra un match específico de Roblox, pero la primera transacción es de Roblox y no ha fallado
                    const firstIsRoblox = transactions[0] && (
                        !(transactions[0].status && ['fallido', 'cancelado', 'rechazado', 'error', 'failed', 'declined'].some(s => transactions[0].status.toLowerCase().includes(s))) && (
                            (transactions[0].type && transactions[0].type.toLowerCase().includes('roblox')) ||
                            (transactions[0].packageName && transactions[0].packageName.toLowerCase().includes('roblox')) ||
                            (transactions[0].pins && transactions[0].pins.some(p => p.label && p.label.toLowerCase().includes('roblox'))) ||
                            (!transactions[0].uid && transactions[0].type !== 'Desconocido')
                        )
                    );
                    return { match: firstIsRoblox ? transactions[0] : null, all: transactions.slice(0, 3) };
                }

                // Si es freefire/bloodstrike/mobilelegends/otros, buscamos por ID de jugador y que NO haya fallado
                const cleanPlayerID = playerID.trim().split(/[\s\(\)\|\,\-]+/)[0];
                const match = transactions.find(t => 
                    (t.uid && (t.uid.trim() === cleanPlayerID || t.uid.includes(cleanPlayerID))) &&
                    !(t.status && ['fallido', 'cancelado', 'rechazado', 'error', 'failed', 'declined'].some(s => t.status.toLowerCase().includes(s)))
                );
                return { match, all: transactions.slice(0, 3) };
            }, uid.toString(), game);

            if (transaction && transaction.match) {
                break;
            }

            console.log('[JADH-BOT] ⚠️ No se encontró la transacción aún. Esperando antes de reintentar...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('[JADH-BOT] 📊 Resultado del historial:', JSON.stringify(transaction, null, 2));

        if (transaction && transaction.match) {
            console.log(`[JADH-BOT] ✨ RECARGA/COMPRA CONFIRMADA EN PROVEEDOR EXTERNO.`);
            console.log(`[JADH-BOT] 👤 Nickname: ${transaction.match.nickname || 'Cliente'} | Orden: ${transaction.match.orderId}`);
            
            // Solo devolver PIN si es Roblox (que sí usa PINs).
            // Free Fire usa recarga directa — el campo 'pins' del dashboard de Jadh es solo un artefacto visual.
            const extractedPin = (game === 'roblox' && transaction.match.pins && transaction.match.pins.length > 0)
                ? transaction.match.pins.map(p => p.pin).filter(Boolean).join(' / ')
                : null;

            return {
                success: true,
                message: `Recarga realizada con éxito en Jadh.shop. Orden ${transaction.match.orderId}`,
                orderId: transaction.match.orderId,
                nickname: transaction.match.nickname || (game === 'roblox' ? 'Roblox User' : 'Cliente'),
                amount: transaction.match.amount,
                pin: extractedPin
            };
        } else {
            // ⚠️ CORRECCIÓN CRÍTICA: Si no se encuentra la transacción en el historial de jadh.shop
            // después de 3 reintentos, la compra NO se confirmó. Devolver fallo para evitar
            // que el cliente reciba WhatsApp de "recarga exitosa" sin haber recibido nada.
            console.error('[JADH-BOT] ❌ FALLO: No se encontró la transacción en el historial de jadh.shop después de 3 intentos.');
            console.error('[JADH-BOT] 📊 Últimas transacciones vistas:', JSON.stringify(transaction && transaction.all ? transaction.all : [], null, 2));
            return { 
                success: false, 
                message: 'La compra no pudo verificarse en el historial de jadh.shop después de 3 intentos. Posible fallo en la transacción o saldo insuficiente en el proveedor.',
                orderId: null
            };
        }

    } catch (err) {
        console.error('[JADH-BOT] ❌ Error crítico durante la recarga:', err.message);
        return { success: false, message: `Error en el bot de recargas: ${err.message}` };
    } finally {
        if (browser) {
            await browser.close();
            console.log('[JADH-BOT] 🌐 Navegador Puppeteer cerrado.');
        }
    }
}

/**
 * Servicio de Automatización de Paquetes Especiales en Jadh.shop
 * Producto: freefire-paquetes
 * @param {string} uid - ID del jugador de Free Fire
 * @param {string} packName - Nombre del paquete (ej: "basica", "semanal", "mensual", "booyah")
 */
async function rechargeViaJadhPaquetes(uid, packName) {
    console.log(`[JADH-PAQUETES] 🚀 Iniciando proceso de paquete especial | ID: ${uid} | Paquete: ${packName}`);
    
    const email = process.env.JADH_EMAIL || 'jmnetfreelat@gmail.com';
    const password = process.env.JADH_PASSWORD || 'Clifor1988';

    if (!email || !password) {
        console.error('[JADH-PAQUETES] ❌ Error: Faltan credenciales JADH_EMAIL o JADH_PASSWORD en variables de entorno.');
        return { success: false, message: 'Faltan credenciales del proveedor externo en el servidor.' };
    }

    // Limpiar packName para obtener el identificador base
    const packKey = packName.toString().toLowerCase().replace(/[^a-z]/g, '').trim();
    
    // Mapear paquetes especiales a IDs de jadh.shop (freefire-paquetes)
    const packMap = {
        "basica":   "261",  // Tarjeta Básica   - $0.63
        "semanal":  "262",  // Tarjeta Semanal  - $2.47
        "mensual":  "263",  // Tarjeta Mensual  - $11.88
        "booyah":   "264"   // Pase Booyah      - $3.78
    };

    const packageId = packMap[packKey];
    if (!packageId) {
        console.error(`[JADH-PAQUETES] ❌ Error: Paquete no mapeado: ${packKey}`);
        return { success: false, message: `El paquete '${packKey}' no está mapeado. Use: basica, semanal, mensual, booyah.` };
    }

    let browser = null;
    try {
        console.log('[JADH-PAQUETES] 🌐 Lanzando navegador Puppeteer...');
        const launchOptions = {
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        };

        if (process.platform === 'win32') {
            launchOptions.executablePath = path.join(__dirname, '.cache', 'puppeteer', 'chrome', 'win64-121.0.6167.85', 'chrome-win64', 'chrome.exe');
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        // 1. Navegar directamente al producto (Jadh usa /auth si no hay sesión)
        const productUrlPaquetes = 'https://jadh.shop/producto/freefire-paquetes';
        console.log('[JADH-PAQUETES] 📡 Navegando al producto Freefire Paquetes...');
        await page.goto(productUrlPaquetes, { waitUntil: 'networkidle2' });

        // Si nos redirigió al login, hacer login con verificación robusta
        const currentUrl = page.url();
        const needsLogin = currentUrl.includes('/auth') || currentUrl.includes('/login') || !!(await page.$('#login-email'));

        if (needsLogin) {
            await jadhLogin(page, email, password, '[JADH-PAQUETES]');
            // Navegar al producto después del login exitoso
            console.log('[JADH-PAQUETES] 📡 Navegando al producto tras login...');
            await page.goto(productUrlPaquetes, { waitUntil: 'networkidle2' });
            // Verificar que llegamos al producto y no fuimos redirigidos de nuevo
            if (page.url().includes('/auth')) {
                throw new Error('Redirigido a /auth tras login exitoso. La cuenta puede no tener acceso al producto.');
            }
        } else {
            console.log('[JADH-PAQUETES] 🔄 Sesión ya estaba activa.');
        }

        // Esperar un momento para que el JavaScript dinámico de la página cargue el formulario
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Completar formulario de compra
        console.log('[JADH-PAQUETES] 📝 Rellenando formulario de paquete especial...');
        try {
            await page.waitForSelector('#packageSelect', { timeout: 30000 });
        } catch (selectorErr) {
            // Capturar screenshot y HTML para diagnóstico
            console.error('[JADH-PAQUETES] ❌ #packageSelect no encontrado. Capturando diagnóstico...');
            await page.screenshot({ path: 'jadh_paquetes_error.png', fullPage: true });
            const pageHtml = await page.content();
            const pageTitle = await page.title();
            const currentPageUrl = page.url();
            console.error(`[JADH-PAQUETES] URL actual: ${currentPageUrl} | Título: ${pageTitle}`);
            console.error('[JADH-PAQUETES] HTML (primeros 2000 chars):', pageHtml.substring(0, 2000));
            throw selectorErr;
        }
        await page.select('#packageSelect', packageId);

        await page.waitForSelector('input[name="gp_input1"]', { timeout: 15000 });
        await page.type('input[name="gp_input1"]', uid.toString());

        // 4. Click en Comprar
        if (process.env.TEST_MODE === 'true') {
            console.log('[JADH-PAQUETES] 🧪 [MODO PRUEBA] Simulación activa. Evitando el click de compra final.');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return {
                success: true,
                message: 'Paquete especial simulado con éxito en Jadh.shop (Modo Prueba)',
                orderId: 'SIM_PKG_' + Math.floor(100000 + Math.random() * 900000),
                nickname: 'JugadorPruebaFF',
                amount: packKey
            };
        }

        console.log('[JADH-PAQUETES] 🎁 Enviando solicitud de paquete especial...');
        
        // Esperamos navegación ya que el action hace POST a /purchase
        await Promise.all([
            page.click('#btnPurchase'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
        ]);

        console.log('[JADH-PAQUETES] ⏳ Procesamiento en pasarela completado. Verificando resultado...');
        
        // 5. Verificar el resultado de la compra en la página de respuesta
        const purchaseResultText = await page.evaluate(() => document.body.innerText);
        console.log('[JADH-PAQUETES] 📄 Texto de la página resultado (primeros 500 chars):', purchaseResultText.substring(0, 500));
        
        const lowerResult = purchaseResultText.toLowerCase();
        const errorKeywordsPkg = ['insuficiente', 'insufficient', 'error', 'failed', 'rechazad', 'no tiene', 'invalid', 'inválid', 'no encontrado', 'not found', 'denied', 'denegado', 'cancelado', 'cancelled'];
        const hasErrorPkg = errorKeywordsPkg.some(kw => lowerResult.includes(kw));
        if (hasErrorPkg) {
            console.error('[JADH-PAQUETES] ❌ Error detectado en la página de resultado de compra.');
            return { success: false, message: `Error en jadh.shop: ${purchaseResultText.substring(0, 300)}` };
        }
        
        // 6. Esperar y verificar en el Dashboard con reintentos
        let transaction = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
            console.log(`[JADH-PAQUETES] 🔎 Volviendo al dashboard para obtener detalles de la orden (Intento ${attempt}/5)...`);
            await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });
            await new Promise(resolve => setTimeout(resolve, 4000));

            transaction = await page.evaluate((playerID) => {
                const cleanPlayerID = playerID.trim();
                const cards = Array.from(document.querySelectorAll('.card, .transaction-card, div')).filter(el => {
                    if (el.children.length === 0) return false;
                    const text = el.innerText || '';
                    return text.includes('Monto total:') && text.includes('Orden:');
                });

                const uniqueCards = [];
                cards.forEach(card => {
                    const isParentOfExisting = uniqueCards.some(existing => card.contains(existing));
                    const isChildOfExisting = uniqueCards.some(existing => existing.contains(card));
                    if (isChildOfExisting) {
                        const idx = uniqueCards.findIndex(existing => existing.contains(card));
                        if (idx !== -1) uniqueCards[idx] = card;
                    } else if (!isParentOfExisting) {
                        uniqueCards.push(card);
                    }
                });

                const transactions = uniqueCards.map(card => {
                    const text = card.innerText || '';
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                    
                    const getValue = (lines, prefix) => {
                        const idx = lines.findIndex(l => l.startsWith(prefix));
                        if (idx === -1) return '';
                        let val = lines[idx].substring(prefix.length).trim();
                        if (!val && idx + 1 < lines.length) {
                            val = lines[idx + 1].trim();
                        }
                        return val;
                    };

                    const orderId = getValue(lines, 'Orden:');
                    const amount = getValue(lines, 'Monto total:');
                    const date = getValue(lines, 'Fecha:');
                    const nickname = getValue(lines, 'Nickname:');
                    const uid = getValue(lines, 'ID de Jugador:') || getValue(lines, 'Datos:');
                    const packageVal = getValue(lines, 'Paquete:');
                    const status = getValue(lines, 'Estado:');

                    const knownFields = ['Monto total:', 'Orden:', 'Fecha:', 'Nickname:', 'ID de Jugador:', 'Datos:', 'Paquete:', 'Estado:', 'Artículos', 'Copiar'];
                    const firstLine = lines.find(l => !knownFields.some(f => l.startsWith(f)));

                    return {
                        type: firstLine || 'Desconocido',
                        orderId,
                        amount,
                        date,
                        nickname,
                        uid,
                        packageName: packageVal,
                        status
                    };
                });

                const match = transactions.find(t => t.uid === cleanPlayerID);
                return { match, all: transactions.slice(0, 3) };
            }, uid.toString());

            if (transaction && transaction.match) {
                break;
            }

            console.log('[JADH-PAQUETES] ⚠️ No se encontró la transacción aún. Esperando antes de reintentar...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('[JADH-PAQUETES] 📊 Resultado del historial:', JSON.stringify(transaction, null, 2));

        if (transaction.match) {
            console.log(`[JADH-PAQUETES] ✨ PAQUETE ESPECIAL CONFIRMADO EN PROVEEDOR EXTERNO.`);
            return {
                success: true,
                message: `Paquete especial enviado con éxito en Jadh.shop. Orden ${transaction.match.orderId}`,
                orderId: transaction.match.orderId,
                nickname: transaction.match.nickname,
                amount: transaction.match.amount
            };
        } else {
            // ⚠️ CORRECCIÓN CRÍTICA: Si no se encuentra la transacción en el historial, la compra NO se confirmó.
            console.error('[JADH-PAQUETES] ❌ FALLO: No se encontró el paquete especial en el historial de jadh.shop.');
            return { 
                success: false, 
                message: 'El paquete especial no pudo verificarse en el historial de jadh.shop. Posible saldo insuficiente en el proveedor.',
                orderId: null
            };
        }

    } catch (err) {
        console.error('[JADH-PAQUETES] ❌ Error crítico durante el envío del paquete:', err.message);
        return { success: false, message: `Error en el bot de paquetes: ${err.message}` };
    } finally {
        if (browser) {
            await browser.close();
            console.log('[JADH-PAQUETES] 🌐 Navegador Puppeteer cerrado.');
        }
    }
}

module.exports = { rechargeViaJadh, rechargeViaJadhPaquetes };
