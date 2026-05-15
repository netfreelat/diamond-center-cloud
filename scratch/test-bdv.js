require('dotenv').config();
const { bdvLogin, bdvMovimientos } = require('../bdv-service.js');

async function test() {
    console.log('Testing BDV login...');
    const token = await bdvLogin();
    if (token) {
        console.log('Token obtenido!');
        const movs = await bdvMovimientos(token);
        if (movs) {
            console.log('Movimientos:', movs.slice(0, 2)); // Mostrar primeros 2
        } else {
            console.log('Fallo al obtener movimientos');
        }
    } else {
        console.log('Fallo al hacer login');
    }
}

test();
