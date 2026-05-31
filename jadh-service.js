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
    
    // Mapear paquetes a IDs de jadh.shop
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
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        });

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
        console.log('[JADH-BOT] 💎 Enviando solicitud de recarga...');
        
        // Esperamos navegación ya que el action hace POST a /purchase
        await Promise.all([
            page.click('#btnPurchase'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 })
        ]);

        console.log('[JADH-BOT] ⏳ Procesamiento en pasarela completado. Verificando estado...');
        
        // 5. Verificar transacción en el Dashboard
        console.log('[JADH-BOT] 🔎 Volviendo al dashboard para validar la orden...');
        await page.goto('https://jadh.shop/', { waitUntil: 'networkidle2' });

        // Extraer la primera transacción del historial para comprobar si coincide
        const transaction = await page.evaluate((playerID, packageVal) => {
            // Buscamos elementos en el historial de transacciones
            const text = document.body.innerText;
            const lines = text.split('\n');
            
            // Buscar la sección de historial. El formato es:
            // Freefire Auto
            // Monto total: $0.84
            // Orden: #192892
            // Nickname: Sneyder2107
            // ID de Jugador: 2937558386
            
            const transactions = [];
            let current = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === 'Freefire Auto') {
                    if (current) transactions.push(current);
                    current = { type: 'Freefire Auto' };
                } else if (current) {
                    if (line.startsWith('Monto total:')) {
                        current.amount = line.replace('Monto total:', '').trim();
                    } else if (line.startsWith('Orden:')) {
                        current.orderId = line.replace('Orden:', '').trim();
                    } else if (line.startsWith('Fecha:')) {
                        current.date = line.replace('Fecha:', '').trim();
                    } else if (line.startsWith('Nickname:')) {
                        current.nickname = line.replace('Nickname:', '').trim();
                    } else if (line.startsWith('ID de Jugador:')) {
                        current.uid = line.replace('ID de Jugador:', '').trim();
                        transactions.push(current);
                        current = null;
                    }
                }
            }
            if (current) transactions.push(current);

            // Buscar si la última transacción coincide con nuestro jugador
            const match = transactions.find(t => t.uid === playerID);
            return { match, all: transactions.slice(0, 3) };
        }, uid.toString(), amountKey);

        console.log('[JADH-BOT] 📊 Resultado del historial:', JSON.stringify(transaction, null, 2));

        if (transaction.match) {
            console.log(`[JADH-BOT] ✨ RECARGA CONFIRMADA EN PROVEEDOR EXTERNO.`);
            console.log(`[JADH-BOT] 👤 Nickname Garena: ${transaction.match.nickname} | Orden: ${transaction.match.orderId}`);
            return {
                success: true,
                message: `Recarga realizada con éxito en Jadh.shop. Orden #${transaction.match.orderId}`,
                orderId: transaction.match.orderId,
                nickname: transaction.match.nickname,
                amount: transaction.match.amount
            };
        } else {
            // Si no hay match en el historial inmediato, leer el cuerpo por mensajes de error
            const bodyText = await page.evaluate(() => document.body.innerText);
            console.warn('[JADH-BOT] ⚠️ Advertencia: No se encontró la orden en el historial reciente.');
            
            if (bodyText.toLowerCase().includes('insuficiente') || bodyText.toLowerCase().includes('saldo')) {
                return { success: false, message: 'Saldo insuficiente en tu cuenta de Jadh.shop.' };
            }
            
            return { 
                success: false, 
                message: 'No se pudo verificar la transacción en el historial reciente de Jadh.shop.' 
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

module.exports = { rechargeViaJadh };
