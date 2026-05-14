const puppeteer = require('puppeteer');

/**
 * Servicio de Canje Automático para Redeempins (Chile)
 * @param {string} pin - El PIN de 36 caracteres (UUID)
 * @param {string} uid - El ID del jugador
 */
async function autoRedeemChile(pin, uid) {
    console.log(`[BOT_CHILE] 🔄 Iniciando proceso para ID: ${uid} | PIN: ${pin}`);
    
    // Configuración para Render/Linux y Windows
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });

    const page = await browser.newPage();
    
    // Bloquear recursos innecesarios para mayor velocidad
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    try {
        // 1. Ir a Redeempins
        await page.goto('https://redeempins.com/', { waitUntil: 'networkidle0', timeout: 30000 });
        
        // 2. Ingresar PIN inicial
        await page.waitForSelector('input[type="text"]', { timeout: 10000 });
        await page.type('input[type="text"]', pin);
        await page.keyboard.press('Enter');
        
        console.log('[BOT_CHILE] 🔑 PIN ingresado. Esperando formulario de datos...');

        // 3. Rellenar formulario "tedioso" automáticamente
        // Esperamos a que aparezca el campo de nombre (usualmente en un iframe o carga dinámica)
        await page.waitForSelector('input[name*="name"]', { timeout: 15000 });
        
        const randomNames = ['Juan Martinez', 'Carlos Perez', 'Andres Lopez', 'Miguel Rodriguez'];
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];
        
        await page.type('input[name*="name"]', randomName);
        await page.type('input[name*="birthday"]', '12/05/1996');
        
        // Seleccionar Nacionalidad (Chile por defecto)
        await page.select('select', '1'); // Asumiendo que 1 es Chile o primera opción válida
        
        // ID del Jugador
        await page.type('input[name*="playerid"]', uid);
        
        // Aceptar Términos
        const terms = await page.$('input[type="checkbox"]');
        if (terms) await terms.evaluate(b => b.click());

        console.log('[BOT_CHILE] 📝 Formulario auto-completado.');

        // 4. Verificar ID (Paso crucial para que se habilite el botón final)
        const buttons = await page.$$('button');
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.innerText, btn);
            if (text.includes('VERIFICAR') || text.includes('VALIDAR')) {
                await btn.click();
                break;
            }
        }
        
        await new Promise(r => setTimeout(r, 4000)); // Esperar validación de Garena

        // 5. CANJE FINAL
        console.log('[BOT_CHILE] 💎 Intentando canje final...');
        let finalBtnClicked = false;
        const allButtons = await page.$$('button');
        for (const btn of allButtons) {
            const text = await page.evaluate(el => el.innerText, btn);
            if (text.includes('CANJEAR') || text.includes('AHORA') || text.includes('CONFIRMAR')) {
                await btn.click();
                finalBtnClicked = true;
                break;
            }
        }

        if (!finalBtnClicked) throw new Error('No se encontró el botón final de canje.');

        await new Promise(r => setTimeout(r, 5000)); // Esperar respuesta de éxito

        const content = await page.content();
        if (content.includes('sucesso') || content.includes('exitoso') || content.includes('Pedido')) {
            console.log('[BOT_CHILE] ✅ ¡CANJE COMPLETADO CON ÉXITO!');
            return { success: true, message: 'Canje automático realizado con éxito.' };
        } else {
            console.log('[BOT_CHILE] ⚠️ El canje podría haber fallado o requiere intervención manual.');
            return { success: false, message: 'El sitio requiere validación manual o el PIN ya fue usado.' };
        }

    } catch (err) {
        console.error('[BOT_CHILE] ❌ Error:', err.message);
        return { success: false, error: err.message };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { autoRedeemChile };
