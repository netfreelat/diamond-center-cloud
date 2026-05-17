require('dotenv').config();
const { checkBinanceEmails } = require('../binance-service.js');

async function test() {
    console.log('Iniciando escaneo de correos para debug...');
    const result = await checkBinanceEmails();
    console.log('Resultado del filtro de recibidos:', result);
}

test();
