const puppeteer = require('puppeteer');
require('dotenv').config({ path: '/var/www/recargasney/.env' });

async function testLogin() {
    console.log('[TEST] Iniciando prueba de conexión a Jadh Shop...');
    console.log(`[TEST] Usando email: ${process.env.JADH_EMAIL}`);

    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        console.log('[TEST] Navegando a Jadh Shop...');
        await page.goto('https://jadh.shop/mi-cuenta/', { waitUntil: 'networkidle2', timeout: 30000 });

        const needsLogin = await page.evaluate(() => {
            return !!document.querySelector('#login-email') || !!document.querySelector('form.login');
        });

        if (needsLogin) {
            console.log('[TEST] Formularios de login detectados. Ingresando credenciales...');
            
            // Jadh Shop sometimes uses #login-email or standard WooCommerce login inputs
            // Let's try the selectors from jadh-service.js
            try {
                await page.waitForSelector('#login-email', { timeout: 5000 });
                await page.type('#login-email', process.env.JADH_EMAIL);
                await page.type('#login-password', process.env.JADH_PASSWORD);
                
                console.log('[TEST] Haciendo clic en iniciar sesión...');
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                    page.click('#login-form button[type="submit"]')
                ]);
            } catch (e) {
                console.log('[TEST] Fallo con selectores estándar, intentando genéricos de WooCommerce...');
                await page.type('#username', process.env.JADH_EMAIL);
                await page.type('#password', process.env.JADH_PASSWORD);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                    page.click('button[name="login"]')
                ]);
            }

            console.log('[TEST] Página cargada después del login. Verificando estado...');
            
            // Verificamos si estamos logueados
            const isError = await page.evaluate(() => {
                return !!document.querySelector('.woocommerce-error');
            });

            if (isError) {
                console.log('❌ [TEST-FALLO] Jadh Shop rechazó las credenciales. Revisa la contraseña.');
                const errorText = await page.$eval('.woocommerce-error', el => el.innerText);
                console.log(`❌ [TEST-DETALLE]: ${errorText}`);
            } else {
                console.log('✅ [TEST-EXITO] ¡Conexión a Jadh Shop exitosa! El bot logró iniciar sesión.');
            }

        } else {
            console.log('✅ [TEST-EXITO] La sesión ya estaba iniciada por caché. El bot tiene acceso.');
        }

    } catch (e) {
        console.error('❌ [TEST-ERROR CRITICO] Ocurrió un error ejecutando la prueba:', e.message);
    } finally {
        await browser.close();
        console.log('[TEST] Prueba finalizada.');
    }
}

testLogin();
