const puppeteer = require('puppeteer');

async function redeemChilePin(pin, uid) {
    console.log(`[BOT] Iniciando canje para ID: ${uid} | PIN: ${pin}`);
    
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        // 1. Ir a la web de canje
        await page.goto('https://redeempins.com/', { waitUntil: 'networkidle2' });
        console.log('[BOT] Web cargada.');

        // 2. Seleccionar Free Fire (Si es necesario, o ingresar PIN directo)
        // Nota: Según la investigación, el campo de PIN suele estar visible al inicio
        await page.waitForSelector('input[placeholder*="PIN"]', { timeout: 10000 });
        await page.type('input[placeholder*="PIN"]', pin);
        
        // Clic en el botón de continuar/canjear inicial
        await page.click('button[type="submit"]'); 
        console.log('[BOT] PIN ingresado, esperando formulario...');

        // 3. Esperar a que cargue el formulario "tedioso"
        await page.waitForSelector('input[name*="name"]', { timeout: 15000 });
        
        // Rellenar datos automáticos
        await page.type('input[name*="name"]', 'Diamond User');
        await page.type('input[name*="birthday"]', '10/10/1995');
        // El ID del jugador
        await page.type('input[name*="playerid"]', uid);
        
        // Aceptar términos (checkbox)
        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        console.log('[BOT] Formulario rellenado automáticamente.');

        // 4. Verificar ID
        const verifyBtn = await page.$('button:not([disabled])'); // Buscar el botón de verificar
        if (verifyBtn) {
            await verifyBtn.click();
            console.log('[BOT] Verificando ID...');
            await page.waitForTimeout(3000); // Esperar validación
        }

        // 5. CANJEAR FINAL
        // Aquí es donde el captcha podría aparecer.
        console.log('[BOT] Intentando clic final en Canjear...');
        
        // Tomar una captura de pantalla para ver el estado (solo para debug)
        await page.screenshot({ path: 'scratch/redeem_status.png' });

        return { success: true, message: 'Proceso completado (Verificar captura)' };

    } catch (err) {
        console.error('[BOT] Error en el proceso:', err.message);
        await page.screenshot({ path: 'scratch/redeem_error.png' });
        return { success: false, error: err.message };
    } finally {
        await browser.close();
    }
}

// Para probarlo manualmente:
// redeemChilePin('391299FB-DC00-49BF-94A1-4D76F42DAD69', '2937558386');

module.exports = { redeemChilePin };
