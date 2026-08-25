# ============================================================
# RECARGASNEY.COM - Deploy Automatico al VPS
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
Write-Host "   RECARGASNEY.COM - DEPLOY AL VPS         " -ForegroundColor Yellow
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
    $cleanCmd = $cmd -replace "\r", ""
    $output = echo "y" | & $PLINK -hostkey $HOSTKEY -ssh $VPS_IP -l $VPS_USER -pw $VPS_PASS -batch $cleanCmd 2>&1
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
[ ! -f influencers.json ] && echo '[]' > influencers.json
[ ! -f influencer_submissions.json ] && echo '[]' > influencer_submissions.json
[ ! -f influencer_payments.json ] && echo '[]' > influencer_payments.json
[ ! -f coupons.json ] && echo '[]' > coupons.json
[ ! -f coupon_usages.json ] && echo '[]' > coupon_usages.json
[ ! -f influencer_rates.json ] && echo '[{"id":1,"label":"Basico","min_views":1000,"max_views":4999,"diamonds_reward":50,"is_active":true},{"id":2,"label":"Intermedio","min_views":5000,"max_views":9999,"diamonds_reward":150,"is_active":true},{"id":3,"label":"Popular","min_views":10000,"max_views":49999,"diamonds_reward":400,"is_active":true},{"id":4,"label":"Viral","min_views":50000,"max_views":99999,"diamonds_reward":1000,"is_active":true},{"id":5,"label":"Mega Viral","min_views":100000,"max_views":null,"diamonds_reward":2500,"is_active":true}]' > influencer_rates.json
echo 'Directorios OK'
"@
Write-OK "Directorio preparado: $VPS_PATH"

# ─── FASE 4: Subir archivos del proyecto ─────────────────────
Write-Step "[4/6] Subiendo archivos del proyecto..."

$files = @(
    "server.js", "script.js", "style.css",
    "index.html", "admin.html", "canjear.html", "influencers.html",
    "politica-privacidad.html", "terminos-condiciones.html",
    "manifest.json", "sw.js", "package.json",
    ".puppeteerrc.cjs", "bdv-service.js", "banesco-service.js", "binance-service.js",

    "email-bot.js", "jadh-service.js", "redeem-service.js",
    "whatsapp-bot.js", "set_webhook.js",
    "icon.svg", "icon-192.png", "icon-512.png",
    "influencer_rates.json", "coupons.json"
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

# Subir carpeta img si existe
if (Test-Path "img") {
    Write-Host "  Subiendo: img/..." -NoNewline
    SCP-UploadDir "img" "$VPS_PATH/" | Out-Null
    Write-Host " OK" -ForegroundColor Green
}

Write-OK "Archivos subidos correctamente"

# ─── FASE 5: Subir .env al VPS directamente ─────────────────
Write-Step "[5/6] Subiendo .env al VPS..."

# Usamos pscp para subir el .env local directamente - evita problemas con
# caracteres especiales (#, *, comillas) que se corrompen en heredocs SSH.
if (Test-Path ".env") {
    Write-Host "  Subiendo: .env..." -NoNewline
    SCP-Upload ".env" "$VPS_PATH/.env" | Out-Null
    Write-Host " OK" -ForegroundColor Green
    Write-OK ".env subido al VPS correctamente"
} else {
    Write-ERR "No se encontró el archivo .env local. Crea el .env antes de hacer deploy."
}

# ─── FASE 6: Instalar dependencias y arrancar ─────────────────
Write-Step "[6/6] Instalando dependencias y arrancando servidor..."

$startCmd = @"
cd $VPS_PATH
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install --production
pm2 delete recargasney 2>/dev/null || true
pm2 start server.js --name recargasney --max-memory-restart 3G
pm2 restart recargasney-wa --update-env || pm2 start whatsapp-bot.js --name recargasney-wa --max-memory-restart 2G
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
