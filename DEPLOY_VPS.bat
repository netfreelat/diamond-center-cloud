@echo off
title Recargasney - Deploy al VPS
color 0A

echo ============================================
echo   DIAMOND CENTER - DESPLIEGUE AL VPS
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-vps-auto.ps1"

echo.
pause

