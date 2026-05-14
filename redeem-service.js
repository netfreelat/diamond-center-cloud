const puppeteer = require('puppeteer');

/**
 * Servicio de Canje Automático para Redeempins (Chile)
 * @param {string} pin - El PIN de 36 caracteres (UUID)
 * @param {string} uid - El ID del jugador
 */
async function autoRedeemChile(pin, uid) {
    console.log(`[BOT_CHILE] 🚀 Iniciando proceso | ID: ${uid} | PIN: ${pin}`);
    
    let browser = null;
    try {
        console.log('[BOT_CHILE] 🌐 Lanzando navegador...');
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000); // 60 segundos de margen
        
        console.log('[BOT_CHILE] 📡 Navegando a Redeempins...');
        await page.goto('https://redeempins.com/', { waitUntil: 'networkidle2' });
        
        // 1. Ingresar PIN
        console.log('[BOT_CHILE] 🔑 Ingresando PIN...');
        await page.waitForSelector('input[type="text"]', { timeout: 15000 });
        await page.type('input[type="text"]', pin, { delay: 50 });
        await page.keyboard.press('Enter');
        
        // Esperar un momento a que cargue la siguiente sección
        await new Promise(r => setTimeout(r, 3000));

        // 2. Rellenar formulario de datos
        console.log('[BOT_CHILE] 📝 Detectando formulario de datos...');
        // Buscamos cualquier input que parezca de nombre o el contenedor del formulario
        try {
            await page.waitForSelector('input', { timeout: 10000 });
        } catch (e) {
            // Si no aparece el formulario, puede que el PIN sea inválido o ya usado
            const bodyText = await page.evaluate(() => document.body.innerText);
            if (bodyText.includes('inválido') || bodyText.includes('usado') || bodyText.includes('error')) {
                throw new Error('El PIN parece no ser válido o ya fue utilizado.');
            }
            throw new Error('No se cargó el formulario de canje a tiempo.');
        }

        // Datos aleatorios para el formulario
        const nombres = ['Juan Perez', 'Carlos Ruiz', 'Miguel Angel', 'Andres Bello'];
        const nombre = nombres[Math.floor(Math.random() * nombres.length)];

        // Intentar llenar los campos (usando selectores más flexibles)
        await page.evaluate((n, id) => {
            const inputs = document.querySelectorAll('input');
            inputs.forEach(i => {
                const name = (i.getAttribute('name') || '').toLowerCase();
                const placeholder = (i.getAttribute('placeholder') || '').toLowerCase();
                
                if (name.includes('name') || placeholder.includes('nombre')) i.value = n;
                if (name.includes('birthday') || placeholder.includes('fecha')) i.value = '10/10/1995';
                if (name.includes('player') || placeholder.includes('id')) i.value = id;
            });
            
            // Seleccionar nacionalidad (Chile es usualmente el primer option con valor o el 1)
            const select = document.querySelector('select');
            if (select) select.value = select.options[1].value;

            // Aceptar términos
            const check = document.querySelector('input[type="checkbox"]');
            if (check) check.click();
        }, nombre, uid);

        console.log('[BOT_CHILE] ✅ Formulario completado. Validando ID...');

        // 3. Botón de Verificación
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const verifyBtn = btns.find(b => b.innerText.includes('VERIFICAR') || b.innerText.includes('VALIDAR'));
            if (verifyBtn) verifyBtn.click();
        });

        await new Promise(r => setTimeout(r, 4000));

        // 4. Botón Final de Canje
        console.log('[BOT_CHILE] 💎 Intentando canje final...');
        const canjeExitoso = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const finalBtn = btns.find(b => b.innerText.includes('CANJEAR') || b.innerText.includes('AHORA') || b.innerText.includes('CONFIRMAR'));
            if (finalBtn) {
                finalBtn.click();
                return true;
            }
            return false;
        });

        if (!canjeExitoso) throw new Error('No se encontró el botón final de canje.');

        await new Promise(r => setTimeout(r, 6000));

        const finalContent = await page.evaluate(() => document.body.innerText.toLowerCase());
        if (finalContent.includes('sucesso') || finalContent.includes('exitoso') || finalContent.includes('parabéns')) {
            console.log('[BOT_CHILE] ✨ CANJE COMPLETADO CON ÉXITO');
            return { success: true, message: '¡Canje realizado con éxito automáticamente!' };
        } else {
            console.log('[BOT_CHILE] ⚠️ Resultado incierto. Revisar manualmente.');
            return { success: false, message: 'El PIN podría ser inválido o el sistema requiere un CAPTCHA manual.' };
        }

    } catch (err) {
        console.error('[BOT_CHILE] ❌ ERROR CRÍTICO:', err.message);
        return { success: false, message: 'Error en el proceso automático', error: err.message };
    } finally {
        if (browser) {
            console.log('[BOT_CHILE] 🔒 Cerrando navegador.');
            await browser.close();
        }
    }
}

module.exports = { autoRedeemChile };
