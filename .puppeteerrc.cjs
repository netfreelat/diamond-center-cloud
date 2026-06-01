const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cambiar la ruta del cache para que se instale dentro del proyecto
  // y Render lo copie al contenedor de ejecución.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
