const puppeteer = require('puppeteer');
require('dotenv').config({ path: '/var/www/recargasney/.env' });

async function checkSelectors() {
    console.log('[TEST] Iniciando análisis de selectores...');

    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.goto('https://jadh.shop/producto/freefire-paquetes/', { waitUntil: 'networkidle2' });
        
        const selectors = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id,
                name: s.name,
                class: s.className,
                options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
            }));
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).map(i => ({
                id: i.id,
                name: i.name,
                placeholder: i.placeholder
            }));
            return { selects, inputs };
        });

        console.log("SELECTORS EN PAQUETES:");
        console.log(JSON.stringify(selectors, null, 2));

        await page.goto('https://jadh.shop/producto/freefire-auto/', { waitUntil: 'networkidle2' });
        const autoSelectors = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id,
                name: s.name,
                class: s.className,
                options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
            }));
            const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]')).map(i => ({
                id: i.id,
                name: i.name,
                placeholder: i.placeholder
            }));
            return { selects, inputs };
        });

        console.log("SELECTORS EN AUTO:");
        console.log(JSON.stringify(autoSelectors, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

checkSelectors();
