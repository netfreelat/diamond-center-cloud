const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function run() {
    const svgPath = path.join(__dirname, '..', 'icon.svg');
    if (!fs.existsSync(svgPath)) {
        throw new Error('icon.svg not found at: ' + svgPath);
    }
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    // Create a simple HTML wrapping the SVG
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: transparent;
            }
            svg {
                display: block;
                width: 100vw;
                height: 100vh;
            }
        </style>
    </head>
    <body>
        ${svgContent}
    </body>
    </html>
    `;

    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    console.log('Setting content...');
    await page.setContent(htmlContent);

    // 192x192 PNG
    console.log('Generating 192x192 PNG...');
    await page.setViewport({ width: 192, height: 192, deviceScaleFactor: 1 });
    await page.screenshot({
        path: path.join(__dirname, '..', 'icon-192.png'),
        type: 'png',
        omitBackground: false // Keep the `#07030D` rounded background
    });

    // 512x512 PNG
    console.log('Generating 512x512 PNG...');
    await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
    await page.screenshot({
        path: path.join(__dirname, '..', 'icon-512.png'),
        type: 'png',
        omitBackground: false // Keep the `#07030D` rounded background
    });

    console.log('Successfully generated PNG icons!');
    await browser.close();
}

run().catch(err => {
    console.error('Error in script:', err);
    process.exit(1);
});
