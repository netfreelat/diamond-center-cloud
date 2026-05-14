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
                '--no-zygote',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        
        console.log('[BOT_CHILE] 📡 Navegando a Redeempins...');
        await page.goto('https://redeempins.com/', { waitUntil: 'networkidle2' });
        
        // 1. Ingresar PIN en la página principal
        console.log('[BOT_CHILE] 🔑 Ingresando PIN...');
        await page.waitForSelector('input[type="text"]', { timeout: 20000 });
        await page.type('input[type="text"]', pin);
        await page.keyboard.press('Enter');
        
        // Esperar a que cargue el iframe de Hype.games
        console.log('[BOT_CHILE] ⏳ Esperando carga del formulario (Hype Games)...');
        await new Promise(r => setTimeout(r, 8000)); 

        // 2. Localizar el iframe y cambiar el contexto
        const iframeHandle = await page.waitForSelector('iframe', { timeout: 20000 });
        const frame = await iframeHandle.contentFrame();
        
        if (!frame) throw new Error('No se pudo acceder al marco del formulario (Iframe).');

        console.log('[BOT_CHILE] 🎯 Dentro del formulario. Rellenando datos...');

        // 3. Rellenar campos dentro del iframe
        await frame.waitForSelector('input', { timeout: 15000 });

        const nombres = ['Juan Martinez', 'Carlos Perez', 'Miguel Rodriguez', 'Andres Lopez'];
        const nombreAleatorio = nombres[Math.floor(Math.random() * nombres.length)];

        await frame.evaluate((n, id) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            
            // Buscar por label o placeholder ya que los nombres de los campos pueden variar
            const inputNombre = inputs.find(i => i.placeholder?.toLowerCase().includes('nombre') || i.name?.toLowerCase().includes('name'));
            const inputFecha = inputs.find(i => i.placeholder?.toLowerCase().includes('fecha') || i.name?.toLowerCase().includes('birthday'));
            const inputID = inputs.find(i => i.placeholder?.toLowerCase().includes('id') || i.name?.toLowerCase().includes('player'));
            
            if (inputNombre) { inputNombre.value = n; inputNombre.dispatchEvent(new Event('input', { bubbles: true })); }
            if (inputFecha) { inputFecha.value = '15/08/1996'; inputFecha.dispatchEvent(new Event('input', { bubbles: true })); }
            if (inputID) { inputID.value = id; inputID.dispatchEvent(new Event('input', { bubbles: true })); }

            // Seleccionar Chile en el dropdown
            const select = document.querySelector('select');
            if (select) {
                // Buscar la opción de Chile
                for (let i = 0; i < select.options.length; i++) {
                    if (select.options[i].text.includes('Chile')) {
                        select.selectedIndex = i;
                        break;
                    }
                }
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Aceptar Términos
            const checkbox = document.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.click();
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, nombreAleatorio, uid);

        console.log('[BOT_CHILE] ✅ Datos ingresados. Verificando ID...');

        // 4. Clic en Verificar
        await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const verifyBtn = buttons.find(b => b.innerText.includes('VERIFICAR') || b.innerText.includes('VALIDAR'));
            if (verifyBtn) verifyBtn.click();
        });

        await new Promise(r => setTimeout(r, 5000));

        // 5. Clic Final en Canjear
        console.log('[BOT_CHILE] 💎 Intentando canje final...');
        const clickCanje = await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const finalBtn = buttons.find(b => b.innerText.includes('CANJEAR') || b.innerText.includes('AHORA') || b.innerText.includes('CONFIRMAR'));
            if (finalBtn) {
                finalBtn.click();
                return true;
            }
            return false;
        });

        if (!clickCanje) throw new Error('No se encontró el botón final de canje.');

        await new Promise(r => setTimeout(r, 8000));

        // 6. Verificar éxito
        const bodyText = await frame.evaluate(() => document.body.innerText.toLowerCase());
        if (bodyText.includes('sucesso') || bodyText.includes('exitoso') || bodyText.includes('parabéns') || bodyText.includes('pedido')) {
            console.log('[BOT_CHILE] ✨ CANJE COMPLETADO CON ÉXITO');
            return { success: true, message: '¡Canje realizado con éxito!' };
        } else {
            console.log('[BOT_CHILE] ⚠️ Resultado dudoso.');
            return { success: false, message: 'El PIN podría ser inválido o ya fue usado.' };
        }

    } catch (err) {
        console.error('[BOT_CHILE] ❌ ERROR:', err.message);
        return { success: false, message: 'Error en el bot', error: err.message };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { autoRedeemChile };
