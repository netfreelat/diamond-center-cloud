require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const RENDER_URL = 'https://diamond-center-cloud.onrender.com';
const SERVER_URL = process.env.SERVER_URL || RENDER_URL;
const isHttps = SERVER_URL.startsWith('https');
const httpMod = isHttps ? require('https') : require('http');

let isProcessingQueue = false;
let isRestarting = false;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        protocolTimeout: 300000, // 5 minutos de timeout del protocolo
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ? process.env.PUPPETEER_EXECUTABLE_PATH.trim() : undefined,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            // Prevenir suspensión/estrangulamiento en segundo plano (background throttling)
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection'
        ]
    }
});

async function restartClient() {
    if (isRestarting) {
        console.log('⚠️ [WHATSAPP] Ya hay un proceso de reinicio activo. Ignorando...');
        return;
    }
    isRestarting = true;
    isProcessingQueue = true; // Pausar cola temporalmente
    console.log('🔄 [WHATSAPP] Iniciando proceso de reinicio del bot...');
    updateStatus('Reiniciando');

    try {
        if (client) {
            console.log('🔄 [WHATSAPP] Cerrando navegador y limpiando sesión previa...');
            await client.destroy();
            console.log('✅ [WHATSAPP] Cliente previo destruido con éxito.');
        }
    } catch (destroyErr) {
        console.error('⚠️ [WHATSAPP] Error al destruir cliente previo:', destroyErr.message);
    }

    console.log('🔄 [WHATSAPP] Esperando 5 segundos antes de re-inicializar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        console.log('🔄 [WHATSAPP] Inicializando nuevo cliente de WhatsApp...');
        await client.initialize();
        console.log('✅ [WHATSAPP] Cliente de WhatsApp inicializado.');
    } catch (initErr) {
        console.error('❌ [WHATSAPP] Error en initialize durante reinicio:', initErr.message);
        isRestarting = false;
        // Si falla, reintentar automáticamente en 15 segundos
        setTimeout(restartClient, 15000);
    } finally {
        isRestarting = false;
        isProcessingQueue = false;
    }
}

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
    restartClient();
});

client.initialize();
// Lógica de procesamiento de cola

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
                            restartClient();
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
        let targetNumber = item.number;
        // Auto-fix: Quitar el 0 extra después del código de país 58 (Venezuela) si existe
        if (targetNumber.startsWith('580')) {
            console.log(`[WHATSAPP] 🔧 Corrigiendo número: ${targetNumber} -> 58${targetNumber.substring(3)}`);
            targetNumber = '58' + targetNumber.substring(3);
        }
        const numberId = `${targetNumber}@c.us`;
        
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
        
        // 🛡️ RECUPERACIÓN: Si el error es un frame desconectado, contexto destruido o sesión cerrada, reiniciar por completo
        const isFatalError = error.message.includes('detached Frame') || 
                             error.message.includes('Execution context was destroyed') || 
                             error.message.includes('Session closed') ||
                             error.message.includes('Protocol error');
                             
        if (isFatalError) {
            console.log('🔄 [WHATSAPP] Detectado error fatal en Puppeteer/Navegador. Iniciando reinicio...');
            restartClient();
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
