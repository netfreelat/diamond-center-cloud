require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const RENDER_URL = 'https://diamond-center-cloud.onrender.com';
const SERVER_URL = process.env.SERVER_URL || RENDER_URL;
const isHttps = SERVER_URL.startsWith('https');
const httpMod = isHttps ? require('https') : require('http');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    }
});

function updateStatus(status, qr = '') {
    const data = JSON.stringify({ status, qr });
    const url = new URL(SERVER_URL);
    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/wa_status_update',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };
    const req = httpMod.request(options, (res) => {
        console.log(`[WA-STATUS] Notificado al servidor: ${status} (Respuesta: ${res.statusCode})`);
    });
    req.on('error', (e) => {
        console.error(`[WA-STATUS] ❌ Error notificando al servidor:`, e.message);
    });
    req.write(data);
    req.end();
}

client.on('qr', (qr) => {
    console.log('\n=========================================');
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP');
    console.log('=========================================\n');
    qrcode.generate(qr, { small: true });
    updateStatus('Esperando QR', qr);
});

client.on('ready', () => {
    console.log('\n✅ ¡Bot de WhatsApp conectado y listo!');
    console.log(`Escuchando mensajes pendientes desde: ${SERVER_URL}\n`);
    updateStatus('Conectado', '');
    
    // Iniciar el polling cada 10 segundos
    setInterval(checkQueue, 10000);
});

client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
    updateStatus('Error de autenticación');
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
    updateStatus('Desconectado');
    
    // Intentar reiniciar el cliente después de 5 segundos
    setTimeout(() => {
        console.log('🔄 Intentando reiniciar el bot de WhatsApp...');
        client.initialize();
    }, 5000);
});

client.initialize();

let isProcessingQueue = false;

async function checkQueue() {
    if (isProcessingQueue) return; // ⚠️ Evitar llamadas superpuestas
    
    try {
        isProcessingQueue = true;
        const req = httpMod.get(`${SERVER_URL}/api/whatsapp_queue`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(body);
                        
                        if (data.restart) {
                            console.log('🔄 [WHATSAPP] Reinicio remoto solicitado desde el servidor.');
                            client.destroy().then(() => {
                                console.log('Client destroyed. Re-initializing...');
                                client.initialize();
                                isProcessingQueue = false;
                            });
                            return;
                        }

                        if (data.success && data.queue && data.queue.length > 0) {
                            console.log(`[WHATSAPP] Hay ${data.queue.length} mensajes pendientes.`);
                            for (const item of data.queue) {
                                await sendMessage(item);
                            }
                        }
                    } catch(e) {
                        console.error('[WHATSAPP] Error parseando JSON de cola:', e.message);
                    } finally {
                        isProcessingQueue = false; // Liberar lock al terminar el lote
                    }
                } else {
                    isProcessingQueue = false;
                }
            });
        });
        req.on('error', (e) => {
            console.error('[WHATSAPP] Error conectando al servidor web:', e.message);
            isProcessingQueue = false;
        });
    } catch (e) {
        console.error('[WHATSAPP] Error en checkQueue:', e.message);
        isProcessingQueue = false;
    }
}

async function sendMessage(item) {
    try {
        // Formatear número (Ej. 584121234567@c.us)
        const numberId = `${item.number}@c.us`;
        
        console.log(`[WHATSAPP] Enviando mensaje a ${item.number}...`);
        
        // Verificamos si el cliente está listo
        if (!client || !client.pupPage) {
            throw new Error('El navegador de WhatsApp no está listo todavía.');
        }

        await client.sendMessage(numberId, item.message);
        console.log(`[WHATSAPP] ✅ Mensaje enviado a ${item.number}`);
        
        // Marcar como enviado en el servidor
        markAsSent(item.id);
        
        // Pausa aleatoria para parecer más humano y evitar bloqueos (entre 4 y 8 segundos)
        const delay = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
        await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
        console.error(`[WHATSAPP] ❌ Error enviando a ${item.number}:`, error.message);
        
        // 🛡️ RECOUPERACIÓN: Si el error es un frame desconectado, el navegador está en un estado corrupto
        if (error.message.includes('detached Frame') || error.message.includes('Execution context was destroyed')) {
            console.log('🔄 [WHATSAPP] Detectado error de frame/contexto. Intentando refrescar el navegador...');
            if (client && client.pupPage) {
                try {
                    await client.pupPage.reload();
                    console.log('✅ [WHATSAPP] Navegador refrescado. Reintentando en la próxima vuelta.');
                } catch (reloadErr) {
                    console.error('❌ [WHATSAPP] No se pudo refrescar el navegador:', reloadErr.message);
                }
            }
        }
    }
}

function markAsSent(id) {
    const data = JSON.stringify({ id });
    const url = new URL(SERVER_URL);
    
    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/whatsapp_sent',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };
    
    const req = httpMod.request(options, (res) => {
        // OK
    });
    
    req.on('error', (error) => {
        console.error('[WHATSAPP] Error al marcar como enviado:', error.message);
    });
    
    req.write(data);
    req.end();
}
