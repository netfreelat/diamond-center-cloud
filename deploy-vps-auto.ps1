# ============================================================
# DIAMOND CENTER - Deploy Automatico al VPS
# Usa plink (PuTTY) para autenticacion con contraseña
# ============================================================

$VPS_IP   = "13.140.142.173"
$VPS_USER = "root"
$VPS_PASS = "Clifor1988"
$VPS_PATH = "/var/www/recargasney"
$PLINK    = Join-Path $PSScriptRoot "plink.exe"
$PSCP     = Join-Path $PSScriptRoot "pscp.exe"
$HOSTKEY  = "SHA256:SntB5MZ90AodGW6Y15EE0vkiFvdJoDpoU8zm3Rtrl0A"

# Colores
function Write-Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  OK: $msg" -ForegroundColor Green }
function Write-ERR($msg)  { Write-Host "  ERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "   DIAMOND CENTER - DEPLOY AL VPS          " -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "   IP: $VPS_IP"
Write-Host "   User: $VPS_USER"
Write-Host "   Path: $VPS_PATH"
Write-Host ""

# ─── Verificar plink ─────────────────────────────────────────
if (-not (Test-Path $PLINK)) {
    Write-Step "Descargando PuTTY (plink/pscp)..."
    $plinkUrl = "https://the.earth.li/~sgtatham/putty/latest/w64/plink.exe"
    $pscpUrl  = "https://the.earth.li/~sgtatham/putty/latest/w64/pscp.exe"
    New-Item -ItemType Directory -Force -Path $PSScriptRoot | Out-Null
    Invoke-WebRequest -Uri $plinkUrl -OutFile $PLINK -UseBasicParsing
    Invoke-WebRequest -Uri $pscpUrl  -OutFile $PSCP  -UseBasicParsing
    Write-OK "plink y pscp descargados"
} else {
    Write-OK "plink encontrado en $PLINK"
}

# Funcion para ejecutar comandos SSH
function SSH-Run($cmd) {
    $output = echo "y" | & $PLINK -hostkey $HOSTKEY -ssh $VPS_IP -l $VPS_USER -pw $VPS_PASS -batch $cmd 2>&1
    return $output
}

# Funcion para subir archivo
function SCP-Upload($local, $remote) {
    echo "y" | & $PSCP -hostkey $HOSTKEY -pw $VPS_PASS -batch $local "${VPS_USER}@${VPS_IP}:${remote}" 2>&1
}

# Funcion para subir directorio
function SCP-UploadDir($local, $remote) {
    echo "y" | & $PSCP -hostkey $HOSTKEY -pw $VPS_PASS -batch -r $local "${VPS_USER}@${VPS_IP}:${remote}" 2>&1
}

# ─── FASE 1: Test de conexion ─────────────────────────────────
Write-Step "[1/6] Probando conexion al VPS..."
$test = SSH-Run "echo 'CONEXION_OK'"
if ($test -match "CONEXION_OK") {
    Write-OK "Conectado al VPS exitosamente"
} else {
    Write-Host $test
    Write-ERR "No se pudo conectar. Verifica IP y contraseña."
}

# ─── FASE 2: Setup del VPS (Node, PM2, Nginx) ─────────────────
Write-Step "[2/6] Verificando Node.js y PM2..."
$nodeVer = SSH-Run "node -v 2>/dev/null || echo 'NO_NODE'"
if ($nodeVer -match "NO_NODE") {
    Write-Host "  Node.js no encontrado. Instalando..." -ForegroundColor Yellow
    
    # Subir el script de setup
    SCP-Upload "setup-vps.sh" "$VPS_PATH/../setup-vps.sh"
    SSH-Run "chmod +x /var/www/setup-vps.sh && bash /var/www/setup-vps.sh recargasney.com"
    Write-OK "Node.js, PM2 y Nginx instalados"
} else {
    Write-OK "Node.js ya instalado: $nodeVer"
    $pm2Ver = SSH-Run "pm2 -v 2>/dev/null || echo 'NO_PM2'"
    if ($pm2Ver -match "NO_PM2") {
        SSH-Run "npm install -g pm2"
        Write-OK "PM2 instalado"
    } else {
        Write-OK "PM2 ya instalado: $pm2Ver"
    }
}

# ─── FASE 3: Crear directorio en VPS ─────────────────────────
Write-Step "[3/6] Preparando directorio del proyecto..."
SSH-Run "mkdir -p $VPS_PATH"

# Inicializar archivos JSON si no existen
SSH-Run @"
cd $VPS_PATH
[ ! -f pedidos.json ] && echo '[]' > pedidos.json
[ ! -f pagos_recibidos.json ] && echo '[]' > pagos_recibidos.json
[ ! -f recientes.json ] && echo '[]' > recientes.json
[ ! -f wa_queue.json ] && echo '[]' > wa_queue.json
[ ! -f pines.json ] && echo '{}' > pines.json
[ ! -f usuarios.json ] && echo '[]' > usuarios.json
echo 'Directorios OK'
"@
Write-OK "Directorio preparado: $VPS_PATH"

# ─── FASE 4: Subir archivos del proyecto ─────────────────────
Write-Step "[4/6] Subiendo archivos del proyecto..."

$files = @(
    "server.js", "script.js", "style.css",
    "index.html", "admin.html", "canjear.html",
    "politica-privacidad.html", "terminos-condiciones.html",
    "manifest.json", "sw.js", "package.json",
    ".puppeteerrc.cjs", "bdv-service.js", "binance-service.js",
    "email-bot.js", "jadh-service.js", "redeem-service.js",
    "whatsapp-bot.js", "config.json", "set_webhook.js",
    "icon.svg", "icon-192.png", "icon-512.png",
    "badge-diamond.png", "fondo.jpg", "settings.json"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  Subiendo: $file..." -NoNewline
        SCP-Upload $file "$VPS_PATH/$file" | Out-Null
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host "  Saltando (no existe): $file" -ForegroundColor Gray
    }
}

# Subir .well-known si existe
if (Test-Path ".well-known") {
    Write-Host "  Subiendo: .well-known/..." -NoNewline
    SCP-UploadDir ".well-known" "$VPS_PATH/" | Out-Null
    Write-Host " OK" -ForegroundColor Green
}

Write-OK "Archivos subidos correctamente"

# ─── FASE 5: Crear .env en el VPS ────────────────────────────
Write-Step "[5/6] Configurando variables de entorno (.env)..."

$envContent = @"
TELEGRAM_BOT_TOKEN=8289162386:AAHLCDRF1OVerD95szOdWCDfQViH4CT_FGY
TELEGRAM_CHAT_ID=908668962
SERVER_URL=https://recargasney.com
NETFREELAT_USER=Netfreelat1
NETFREELAT_PASS=Clifor1988
TEST_MODE=false
EMAIL_USER=juanmartinez_890@outlook.com
EMAIL_PASSWORD=Clifor1987
BDV_TOKEN=n3NjPhPCO1etlLelCDgA6t94bnOustsm3dkTqsAlE9o
BDV_PASSWORD=Juaquina14.
SUPABASE_URL=https://gtvlraxlszucoglbnzen.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0dmxyYXhsc3p1Y29nbGJuemVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Mzg3MTcsImV4cCI6MjA5MTQxNDcxN30.IfbOm2PzrJx_Ycui1GPOeS30_18x4h7W4aMzSzYkr_Y
ADMIN_USER=admin
ADMIN_PASS=1234
BDV_USER=Sneyder2107
BDV_PASS=Juaquina11.
BDV_CUENTA=01020350340000557061
BDV_CUENTA_POS=0
BDV_MEDIA_HUELLA=I0+nx3T/kAjP/sNwSmHST785id3jyTny7TDY2Zklg3HcziphhZycDJaPQvZTMfHCl0n1Dwn4coTF/dn5uEIv9peKOQ6al9g5OAXH7Dg7nnp/ukBrFpAbq2KMP65OXifZp5IvLTk/dcyBWjTWa9zLqJ6ERDSOxtrQUdMwvlgHKoh9QGRVy7q3AYoEMUVm+N2lBBXv3pYmA3eNCJOqwr8ozJb5wvVBFPog+jh9Xa6xdsU+itzKMsCJJ0nAkwGZ3kJ7OFaD2u1kgqLAAN93aeBt5hp+XS6VbDFQpqpsRnkio/Dz4r94jW9NmGbrcO23wbpvN+wwbvZdq+zlrRXNAsHgbA==
BDV_F5_COOKIE=f5avraaaaaaaaaaaaaaaa_session_=FEIILAEODOPGOFGBPCGAAJCNDCPIFCHBPCFKINLNGEIANOMCMLDHDCOBINOFLEPDFCKDFGBKDOGLBHPNJPIAMEMBPHFFIFJDIPPOGMGBKLKANMIILHIOAFEJINGAFCDB
BINANCE_EMAIL_USER=juanmartinez.890.jcm@gmail.com
BINANCE_EMAIL_PASSWORD=azro nitk bvkx tplm
VAPID_EMAIL=mailto:netfreelat@gmail.com
VAPID_PUBLIC_KEY=BGn7IJ9jDJtkOAwUMXMP6PqEvmGgwAhxWF4yrxoUgMUZSs5dU5shBmT-Bd2T7sAbgmPxorsCvLTR08dyznBOykg
VAPID_PRIVATE_KEY=RmpUuOcCY3owV5bV562VaPdJsGOZQcoOlbj2gve0dxM
JADH_EMAIL=jmnetfreelat@gmail.com
JADH_PASSWORD=Clifor1988
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
"@

# Escribir .env en el VPS via heredoc
$envEscaped = $envContent -replace "'", "'\''"
SSH-Run "cat > $VPS_PATH/.env << 'ENVEOF'
$envContent
ENVEOF"
Write-OK ".env creado en el VPS"

# ─── FASE 6: Instalar dependencias y arrancar ─────────────────
Write-Step "[6/6] Instalando dependencias y arrancando servidor..."

$startCmd = @"
cd $VPS_PATH
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install --production
pm2 delete recargasney 2>/dev/null || true
pm2 start server.js --name recargasney --max-memory-restart 3G
pm2 restart recargasney-wa || pm2 start whatsapp-bot.js --name recargasney-wa --max-memory-restart 2G
pm2 save
pm2 status
"@

$result = SSH-Run $startCmd
Write-Host $result

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   DESPLIEGUE COMPLETADO                   " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Servidor corriendo en: http://$VPS_IP:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Comandos utiles:" -ForegroundColor Yellow
Write-Host "  Ver logs:    ssh root@$VPS_IP 'pm2 logs recargasney'"
Write-Host "  Ver status:  ssh root@$VPS_IP 'pm2 status'"
Write-Host "  Reiniciar:   ssh root@$VPS_IP 'pm2 restart recargasney'"
Write-Host ""
