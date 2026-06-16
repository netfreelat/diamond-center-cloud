const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');
const puppeteer = require('puppeteer');
require('dotenv').config();

const email = process.env.JADH_EMAIL || 'jmnetfreelat@gmail.com';
const password = process.env.JADH_PASSWORD || 'Clifor1988';

console.log('[TEST-LOGIN] Email a usar:', email);
console.log('[TEST-LOGIN] Password tiene longitud:', password.length);

async function testLogin() {
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
        console.log('[TEST-LOGIN] Navegando a jadh.shop/auth...');
        await page.goto('https://jadh.shop/auth', { waitUntil: 'networkidle2' });
        console.log('[TEST-LOGIN] URL inicial:', page.url());

        await page.waitForSelector('#login-email', { timeout: 15000 });

        // Limpiar campos y escribir
        await page.$eval('#login-email', el => el.value = '');
        await page.type('#login-email', email);
        await page.$eval('#login-password', el => el.value = '');
        await page.type('#login-password', password);

        console.log('[TEST-LOGIN] Credenciales ingresadas. Haciendo click...');

        await Promise.all([
            page.click('#login-form button[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(e => console.log('[TEST-LOGIN] nav error (esperado):', e.message))
        ]);

        await new Promise(r => setTimeout(r, 2000));

        const afterUrl = page.url();
        console.log('[TEST-LOGIN] URL después del login:', afterUrl);

        if (afterUrl.includes('/auth') || afterUrl.includes('/login')) {
            console.log('[TEST-LOGIN] ❌ LOGIN FALLIDO - Sigue en /auth');
            // Capturar mensaje de error
            const errorText = await page.evaluate(() => {
                const all = document.querySelectorAll('*');
                let texts = [];
                all.forEach(el => {
                    if (el.children.length === 0 && el.innerText && el.innerText.trim().length > 0 && el.innerText.trim().length < 200) {
                        const style = getComputedStyle(el);
                        if (style.color.includes('255, 0') || style.color.includes('220, 53') || el.className.toLowerCase().includes('error') || el.className.toLowerCase().includes('alert')) {
                            texts.push(`[${el.tagName}.${el.className}] ${el.innerText.trim()}`);
                        }
                    }
                });
                return texts.join('\n') || 'Sin mensajes de error específicos';
            });
            console.log('[TEST-LOGIN] Mensajes de error en página:', errorText);
            
            // También capturar todo el texto de la página
            const pageText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
            console.log('[TEST-LOGIN] Texto de la página (primeros 1000 chars):\n', pageText);
        } else {
            console.log('[TEST-LOGIN] ✅ LOGIN EXITOSO');
        }

        await page.screenshot({ path: 'test_login_result.png', fullPage: true });
        console.log('[TEST-LOGIN] Screenshot guardado: test_login_result.png');

    } catch (e) {
        console.error('[TEST-LOGIN] Error:', e.message);
        await page.screenshot({ path: 'test_login_error.png', fullPage: true });
    } finally {
        await browser.close();
    }
}

testLogin();
