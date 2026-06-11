@echo off
title Recargasney - Deploy al VPS
color 0A

echo ============================================
echo   DIAMOND CENTER - DESPLIEGUE AL VPS
echo ============================================
echo.

:: ===== CONFIGURACION =====
:: Cambia estos valores con los de tu VPS
set VPS_IP=TU_IP_AQUI
set VPS_USER=root
set VPS_PATH=/var/www/recargasney

echo [1/4] Verificando conexion con el VPS...
ssh -o ConnectTimeout=5 %VPS_USER%@%VPS_IP% "echo Conexion OK" 2>nul
if errorlevel 1 (
    echo ERROR: No se pudo conectar al VPS. Verifica la IP y que el VPS este encendido.
    pause
    exit /b 1
)
echo OK: Conectado al VPS

echo.
echo [2/4] Creando directorio en el VPS si no existe...
ssh %VPS_USER%@%VPS_IP% "mkdir -p %VPS_PATH%"

echo.
echo [3/4] Subiendo archivos del proyecto...
echo (Esto puede tardar unos minutos dependiendo de tu internet)

:: Subir archivos principales (excluye node_modules, .wwebjs, etc.)
scp -r ^
    "server.js" ^
    "script.js" ^
    "style.css" ^
    "index.html" ^
    "admin.html" ^
    "canjear.html" ^
    "politica-privacidad.html" ^
    "terminos-condiciones.html" ^
    "manifest.json" ^
    "sw.js" ^
    "package.json" ^
    "package-lock.json" ^
    ".puppeteerrc.cjs" ^
    "bdv-service.js" ^
    "binance-service.js" ^
    "email-bot.js" ^
    "jadh-service.js" ^
    "redeem-service.js" ^
    "whatsapp-bot.js" ^
    "config.json" ^
    "icon.svg" ^
    "icon-192.png" ^
    "icon-512.png" ^
    "badge-diamond.png" ^
    "fondo.jpg" ^
    %VPS_USER%@%VPS_IP%:%VPS_PATH%/

:: Subir carpeta .well-known si existe
if exist ".well-known" (
    scp -r ".well-known" %VPS_USER%@%VPS_IP%:%VPS_PATH%/
)

echo.
echo [4/4] Instalando dependencias y reiniciando servidor...
ssh %VPS_USER%@%VPS_IP% "cd %VPS_PATH% && PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install && pm2 restart recargasney || pm2 start server.js --name recargasney --max-memory-restart 4G && pm2 save"

echo.
echo ============================================
echo   DESPLIEGUE COMPLETADO
echo ============================================
echo.
echo Recuerda verificar los logs con:
echo   ssh %VPS_USER%@%VPS_IP% "pm2 logs diamond-center"
echo.
pause
