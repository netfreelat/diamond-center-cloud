@echo off
title Resetear Sesion de WhatsApp
echo ====================================================
echo RESETEAR SESION DE WHATSAPP - RECARGASNEY.COM
echo ====================================================
echo.
echo Este script cerrara los procesos Node activos para desbloquear
echo los archivos de sesion, y luego eliminara la cache de
echo WhatsApp (.wwebjs_auth) para un escaneo limpio de QR.
echo.
set /p confirmar="¿Deseas continuar? (S/N): "
if /i "%confirmar%" neq "S" goto fin

echo.
echo Cerrando procesos de Node (esto detendra temporalmente el bot y el servidor local)...
taskkill /f /im node.exe >nul 2>&1

echo.
echo Borrando la carpeta de sesion .wwebjs_auth...
if exist ".wwebjs_auth" (
    rmdir /s /q ".wwebjs_auth"
    echo.
    echo ✅ Sesion borrada exitosamente. La proxima vez que inicies el bot se generara un nuevo QR.
) else (
    echo.
    echo ℹ️ La carpeta .wwebjs_auth no existe. La sesion ya estaba limpia.
)

echo.
echo Si estas corriendo la tienda de forma local, recuerda reiniciar el servidor con INICIAR_SERVIDOR.bat
echo.
pause
:fin
exit
