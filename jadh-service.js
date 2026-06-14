const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');
const puppeteer = require('puppeteer');

/**
 * Servicio de Automatización de Recargas Directas en Jadh.shop
 * @param {string} uid - ID del jugador de Free Fire
 * @param {string} packAmount - Cantidad del paquete (ej: "100", "310", "100 + 10", etc.)
 */
async function rechargeViaJadh(uid, packAmount) {
    console.log(`[JADH-BOT] 🚀 Iniciando proceso de recarga directa | ID: ${uid} | Paquete: ${packAmount}`);
    
    const email = process.env.JADH_EMAIL || 'jmnetfreelat@gmail.com';
    const password = process.env.JADH_PASSWORD || 'Clifor1988';

    if (!email || !password) {
        console.error('[JADH-BOT] ❌ Error: Faltan credenciales JADH_EMAIL o JADH_PASSWORD en variables de entorno.');
        return { success: false, message: 'Faltan credenciales del proveedor externo en el servidor.' };
    }

    // Limpiar packAmount para obtener el identificador base (ej: "100" de "100 + 10 (x1)")
    const amountKey = packAmount.toString().split(' ')[0].replace(',', '').replace('.', '').trim();
    
    // Mapear paquetes de diamantes a IDs de jadh.shop (freefire-auto)
    const packMap = {
        "100": "156",  // 110 💎
        "310": "157",  // 341 💎
        "520": "158",  // 572 💎
        "1060": "159", // 1166 💎
        "2180": "160", // 2376 💎
        "5600": "161"  // 6138 💎
    };

    const packageId = packMap[amountKey];
    if (!packageId) {
        console.error(`[JADH-BOT] ❌ Error: Paquete no mapeado para el monto: ${amountKey}`);
        return { success: false, message: `El paquete de ${amountKey} diamantes no está mapeado para recarga directa.` };
    }

    let browser = null;
    try {
        console.log('[JADH-BOT] 🌐 Lanzando navegador Puppeteer...');
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

        // 1. Ir a la página de login
        console.log('[JADH-BOT] 📡 Navegando a Jadh.shop para inicio de sesión...');
        await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });

        // Verificar si ya estamos logueados o necesitamos loguearnos
        const needsLogin = await page.evaluate(() => {
            return !!document.querySelector('#login-email');
        });

        if (needsLogin) {
            console.log('[JADH-BOT] 🔑 Rellenando datos de inicio de sesión...');
            await page.waitForSelector('#login-email', { timeout: 15000 });
            await page.type('#login-email', email);
            await page.type('#login-password', password);

            console.log('[JADH-BOT] 🖱️ Haciendo click en Iniciar Sesión...');
            await Promise.all([
                page.click('#login-form button[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            ]);
            console.log('[JADH-BOT] ✅ Sesión iniciada con éxito.');
        } else {
            console.log('[JADH-BOT] 🔄 Sesión ya estaba activa.');
        }

        // 2. Navegar al producto Freefire Auto
        console.log('[JADH-BOT] 🛒 Navegando al producto Freefire Auto...');
        await page.goto('https://jadh.shop/producto/freefire-auto', { waitUntil: 'networkidle2' });

        // 3. Completar formulario de compra
        console.log('[JADH-BOT] 📝 Rellenando formulario de recarga...');
        await page.waitForSelector('#packageSelect', { timeout: 15000 });
        await page.select('#packageSelect', packageId);

        await page.waitForSelector('#gameAccountId', { timeout: 15000 });
        await page.type('#gameAccountId', uid.toString());

        // 4. Click en Recargar
        if (process.env.TEST_MODE === 'true') {
            console.log('[JADH-BOT] 🧪 [MODO PRUEBA] Simulación activa. Evitando el click de compra final para no consumir saldo.');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return {
                success: true,
                message: 'Recarga simulada con éxito en Jadh.shop (Modo Prueba)',
                orderId: 'SIM_' + Math.floor(100000 + Math.random() * 900000),
                nickname: 'JugadorPruebaFF',
                amount: amountKey
            };
        }

        console.log('[JADH-BOT] 💎 Enviando solicitud de recarga...');
        
        // Esperamos navegación ya que el action hace POST a /purchase
        await Promise.all([
            page.click('#btnPurchase'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
        ]);

        console.log('[JADH-BOT] ⏳ Procesamiento en pasarela completado. Verificando resultado...');
        
        // 5. Verificar el resultado de la compra en la página de respuesta
        const purchaseResultText = await page.evaluate(() => document.body.innerText);
        console.log('[JADH-BOT] 📄 Texto de la página resultado (primeros 500 chars):', purchaseResultText.substring(0, 500));
        
        const lowerResult = purchaseResultText.toLowerCase();
        // Detectar errores reales en la página de resultado de compra
        if (lowerResult.includes('insuficiente') || lowerResult.includes('error') || lowerResult.includes('failed') || lowerResult.includes('rechazad')) {
            console.error('[JADH-BOT] ❌ Error detectado en la página de resultado de compra.');
            return { success: false, message: `Error en jadh.shop: ${purchaseResultText.substring(0, 200)}` };
        }
        
        // 6. Si no hay error en la compra, esperar un momento e intentar verificar en el Dashboard
        console.log('[JADH-BOT] ✅ No se detectaron errores en la compra. Esperando 5s antes de verificar historial...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('[JADH-BOT] 🔎 Volviendo al dashboard para obtener detalles de la orden...');
        await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });

        // Extraer la primera transacción del historial para obtener detalles
        const transaction = await page.evaluate((playerID) => {
            const text = document.body.innerText;
            const lines = text.split('\n');
            
            const transactions = [];
            let current = null;

            const getValue = (lines, index, prefix) => {
                const line = lines[index].trim();
                let val = line.substring(prefix.length).trim();
                if (!val && index + 1 < lines.length) {
                    val = lines[index + 1].trim();
                }
                return val;
            };
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === 'Freefire Auto') {
                    if (current) transactions.push(current);
                    current = { type: 'Freefire Auto' };
                } else if (current) {
                    if (line.startsWith('Monto total:')) {
                        current.amount = getValue(lines, i, 'Monto total:');
                    } else if (line.startsWith('Orden:')) {
                        current.orderId = getValue(lines, i, 'Orden:');
                    } else if (line.startsWith('Fecha:')) {
                        current.date = getValue(lines, i, 'Fecha:');
                    } else if (line.startsWith('Nickname:')) {
                        current.nickname = getValue(lines, i, 'Nickname:');
                    } else if (line.startsWith('ID de Jugador:')) {
                        current.uid = getValue(lines, i, 'ID de Jugador:');
                        transactions.push(current);
                        current = null;
                    }
                }
            }
            if (current) transactions.push(current);

            const match = transactions.find(t => t.uid === playerID);
            return { match, all: transactions.slice(0, 3) };
        }, uid.toString());

        console.log('[JADH-BOT] 📊 Resultado del historial:', JSON.stringify(transaction, null, 2));

        if (transaction.match) {
            console.log(`[JADH-BOT] ✨ RECARGA CONFIRMADA EN PROVEEDOR EXTERNO.`);
            console.log(`[JADH-BOT] 👤 Nickname Garena: ${transaction.match.nickname} | Orden: ${transaction.match.orderId}`);
            return {
                success: true,
                message: `Recarga realizada con éxito en Jadh.shop. Orden ${transaction.match.orderId}`,
                orderId: transaction.match.orderId,
                nickname: transaction.match.nickname,
                amount: transaction.match.amount
            };
        } else {
            // La compra se realizó sin errores pero no encontramos el match en el historial aún
            // Esto es normal si jadh.shop tarda en actualizar. Retornamos éxito igualmente.
            console.warn('[JADH-BOT] ⚠️ No se encontró match en historial, pero la compra no mostró errores. Considerando exitosa.');
            return { 
                success: true, 
                message: 'Recarga enviada con éxito en Jadh.shop (verificación pendiente en historial).',
                orderId: 'pendiente',
                nickname: null,
                amount: null
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

        // 1. Ir a la página de login
        console.log('[JADH-PAQUETES] 📡 Navegando a Jadh.shop para inicio de sesión...');
        await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });

        // Verificar si ya estamos logueados o necesitamos loguearnos
        const needsLogin = await page.evaluate(() => {
            return !!document.querySelector('#login-email');
        });

        if (needsLogin) {
            console.log('[JADH-PAQUETES] 🔑 Rellenando datos de inicio de sesión...');
            await page.waitForSelector('#login-email', { timeout: 15000 });
            await page.type('#login-email', email);
            await page.type('#login-password', password);

            console.log('[JADH-PAQUETES] 🖱️ Haciendo click en Iniciar Sesión...');
            await Promise.all([
                page.click('#login-form button[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
            ]);
            console.log('[JADH-PAQUETES] ✅ Sesión iniciada con éxito.');
        } else {
            console.log('[JADH-PAQUETES] 🔄 Sesión ya estaba activa.');
        }

        // 2. Navegar al producto Freefire Paquetes
        console.log('[JADH-PAQUETES] 🛒 Navegando al producto Freefire Paquetes...');
        await page.goto('https://jadh.shop/producto/freefire-paquetes', { waitUntil: 'networkidle2' });

        // 3. Completar formulario de compra
        console.log('[JADH-PAQUETES] 📝 Rellenando formulario de paquete especial...');
        await page.waitForSelector('#packageSelect', { timeout: 15000 });
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
        if (lowerResult.includes('insuficiente') || lowerResult.includes('error') || lowerResult.includes('failed') || lowerResult.includes('rechazad')) {
            console.error('[JADH-PAQUETES] ❌ Error detectado en la página de resultado de compra.');
            return { success: false, message: `Error en jadh.shop: ${purchaseResultText.substring(0, 200)}` };
        }
        
        // 6. Esperar y verificar en el Dashboard
        console.log('[JADH-PAQUETES] ✅ No se detectaron errores. Esperando 5s antes de verificar historial...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('[JADH-PAQUETES] 🔎 Volviendo al dashboard para obtener detalles de la orden...');
        await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });

        // Extraer la primera transacción del historial
        const transaction = await page.evaluate((playerID) => {
            const text = document.body.innerText;
            const lines = text.split('\n');
            
            const transactions = [];
            let current = null;

            const getValue = (lines, index, prefix) => {
                const line = lines[index].trim();
                let val = line.substring(prefix.length).trim();
                if (!val && index + 1 < lines.length) {
                    val = lines[index + 1].trim();
                }
                return val;
            };
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === 'Freefire Paquetes' || line === 'Freefire Auto') {
                    if (current) transactions.push(current);
                    current = { type: line };
                } else if (current) {
                    if (line.startsWith('Monto total:')) {
                        current.amount = getValue(lines, i, 'Monto total:');
                    } else if (line.startsWith('Orden:')) {
                        current.orderId = getValue(lines, i, 'Orden:');
                    } else if (line.startsWith('Fecha:')) {
                        current.date = getValue(lines, i, 'Fecha:');
                    } else if (line.startsWith('Nickname:')) {
                        current.nickname = getValue(lines, i, 'Nickname:');
                    } else if (line.startsWith('ID de Jugador:')) {
                        current.uid = getValue(lines, i, 'ID de Jugador:');
                        transactions.push(current);
                        current = null;
                    }
                }
            }
            if (current) transactions.push(current);

            const match = transactions.find(t => t.uid === playerID);
            return { match, all: transactions.slice(0, 3) };
        }, uid.toString());

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
            console.warn('[JADH-PAQUETES] ⚠️ No se encontró match en historial, pero la compra no mostró errores.');
            return { 
                success: true, 
                message: 'Paquete especial enviado con éxito en Jadh.shop (verificación pendiente).',
                orderId: 'pendiente',
                nickname: null,
                amount: null
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
