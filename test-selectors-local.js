const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');
const puppeteer = require('puppeteer');
require('dotenv').config();

const email = process.env.JADH_EMAIL || 'jmnetfreelat@gmail.com';
const password = process.env.JADH_PASSWORD || 'Clifor1988';

async function checkSelectors() {
    console.log('[TEST] 🚀 Iniciando análisis de selectores en jadh.shop...\n');

    const launchOptions = {
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    };

    if (process.platform === 'win32') {
        launchOptions.executablePath = path.join(__dirname, '.cache', 'puppeteer', 'chrome', 'win64-121.0.6167.85', 'chrome-win64', 'chrome.exe');
    }

    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);

    try {
        // --- Login ---
        console.log('[TEST] 🔑 Navegando a /auth para hacer login...');
        await page.goto('https://jadh.shop/auth', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#login-email', { timeout: 15000 });
        await page.type('#login-email', email);
        await page.type('#login-password', password);
        await Promise.all([
            page.click('#login-form button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
        ]);
        console.log('[TEST] ✅ Login completado. URL actual:', page.url());

        // --- Analizar freefire-paquetes ---
        console.log('\n[TEST] 📡 Navegando a /producto/freefire-paquetes...');
        await page.goto('https://jadh.shop/producto/freefire-paquetes', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000)); // Esperar JS dinámico

        const paquetesInfo = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id, name: s.name, class: s.className,
                options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
            }));
            const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                id: i.id, name: i.name, type: i.type, placeholder: i.placeholder
            }));
            const buttons = Array.from(document.querySelectorAll('button, [type="submit"]')).map(b => ({
                id: b.id, text: b.innerText.trim().substring(0, 50), type: b.type
            }));
            const hasPackageSelect = !!document.querySelector('#packageSelect');
            return { selects, inputs, buttons, hasPackageSelect, title: document.title, url: location.href };
        });

        console.log('\n=== FREEFIRE-PAQUETES ===');
        console.log('URL:', paquetesInfo.url);
        console.log('Título:', paquetesInfo.title);
        console.log('#packageSelect existe:', paquetesInfo.hasPackageSelect);
        console.log('Selects encontrados:', JSON.stringify(paquetesInfo.selects, null, 2));
        console.log('Inputs encontrados:', JSON.stringify(paquetesInfo.inputs, null, 2));
        console.log('Botones encontrados:', JSON.stringify(paquetesInfo.buttons, null, 2));

        await page.screenshot({ path: 'diagnostico_paquetes.png', fullPage: true });
        console.log('[TEST] 📸 Screenshot guardado: diagnostico_paquetes.png');

        // --- Analizar freefire-auto ---
        console.log('\n[TEST] 📡 Navegando a /producto/freefire-auto...');
        await page.goto('https://jadh.shop/producto/freefire-auto', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000)); // Esperar JS dinámico

        const autoInfo = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id, name: s.name, class: s.className,
                options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() }))
            }));
            const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                id: i.id, name: i.name, type: i.type, placeholder: i.placeholder
            }));
            const buttons = Array.from(document.querySelectorAll('button, [type="submit"]')).map(b => ({
                id: b.id, text: b.innerText.trim().substring(0, 50), type: b.type
            }));
            const hasPackageSelect = !!document.querySelector('#packageSelect');
            return { selects, inputs, buttons, hasPackageSelect, title: document.title, url: location.href };
        });

        console.log('\n=== FREEFIRE-AUTO ===');
        console.log('URL:', autoInfo.url);
        console.log('Título:', autoInfo.title);
        console.log('#packageSelect existe:', autoInfo.hasPackageSelect);
        console.log('Selects encontrados:', JSON.stringify(autoInfo.selects, null, 2));
        console.log('Inputs encontrados:', JSON.stringify(autoInfo.inputs, null, 2));
        console.log('Botones encontrados:', JSON.stringify(autoInfo.buttons, null, 2));

        await page.screenshot({ path: 'diagnostico_auto.png', fullPage: true });
        console.log('[TEST] 📸 Screenshot guardado: diagnostico_auto.png');

    } catch (e) {
        console.error('[TEST] ❌ Error durante el diagnóstico:', e.message);
        await page.screenshot({ path: 'diagnostico_error.png', fullPage: true });
    } finally {
        await browser.close();
        console.log('\n[TEST] 🏁 Análisis finalizado.');
    }
}

checkSelectors();
