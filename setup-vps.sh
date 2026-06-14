#!/bin/bash
# ============================================================
# DIAMOND CENTER - Script de Configuración Inicial del VPS
# Ejecutar como root en Ubuntu 22.04 LTS
# Uso: bash setup-vps.sh TU_DOMINIO.com
# ============================================================

set -e  # Parar si hay algún error

DOMAIN=${1:-"recargasney.com"}
APP_DIR="/var/www/recargasney"
APP_NAME="recargasney"
NODE_PORT=3000

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║    RECARGASNEY - Setup Automático VPS    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "► Dominio: $DOMAIN"
echo "► Directorio: $APP_DIR"
echo "► Puerto: $NODE_PORT"
echo ""

# ─── FASE 1: Sistema base ───────────────────────────────────
echo "📦 [1/8] Actualizando sistema..."
apt update -y && apt upgrade -y

echo "📦 [2/8] Instalando herramientas esenciales..."
apt install -y git curl wget nano ufw htop unzip build-essential nginx certbot python3-certbot-nginx

# ─── FASE 2: Firewall ───────────────────────────────────────
echo "🔒 [3/8] Configurando firewall..."
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow $NODE_PORT
ufw --force enable

# ─── FASE 3: Node.js 20 ─────────────────────────────────────
echo "⚙️  [4/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

echo "   Node: $(node -v)"
echo "   NPM:  $(npm -v)"
echo "   PM2:  $(pm2 -v)"

# ─── FASE 4: Chromium para Puppeteer ────────────────────────
echo "🌐 [5/8] Instalando Chromium y dependencias gráficas..."
apt install -y chromium-browser \
  libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxi6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 \
  libasound2 libatk1.0-0 libgtk-3-0 libgbm1 libpangocairo-1.0-0 \
  fonts-liberation xdg-utils ca-certificates

echo "   Chromium: $(chromium-browser --version 2>/dev/null || echo 'instalado')"

# ─── FASE 5: Directorio de la app ───────────────────────────
echo "📁 [6/8] Creando directorio del proyecto..."
mkdir -p $APP_DIR
cd $APP_DIR

# Crear archivos JSON vacíos para inicialización
echo "[]" > pedidos.json
echo "[]" > pagos_recibidos.json
echo "[]" > recientes.json
echo "[]" > wa_queue.json
echo "{}" > pines.json
echo "[]" > usuarios.json

echo "   ✓ Archivos de datos inicializados"

# ─── FASE 6: Nginx ──────────────────────────────────────────
echo "🌍 [7/8] Configurando Nginx para $DOMAIN..."

cat > /etc/nginx/sites-available/$APP_NAME << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Bloquear acceso a archivos sensibles
    location ~ /\.(env|git|puppeteerrc) {
        deny all;
        return 404;
    }
    
    location ~ \.(json|bat|ps1|sql)$ {
        if (\$request_uri !~ "^/manifest\.json$") {
            deny all;
            return 404;
        }
    }

    location /ws {
        proxy_pass http://localhost:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# Activar sitio
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar y recargar
nginx -t && systemctl reload nginx
systemctl enable nginx

echo "   ✓ Nginx configurado para $DOMAIN"

# ─── FASE 7: PM2 Startup ────────────────────────────────────
echo "⚙️  [8/8] Configurando PM2 para inicio automático..."
pm2 startup | tail -1 | bash 2>/dev/null || true

# ─── RESUMEN FINAL ──────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              ✅ CONFIGURACIÓN COMPLETADA                 ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  PRÓXIMOS PASOS MANUALES:                               ║"
echo "║                                                          ║"
echo "║  1. Sube tu proyecto a: $APP_DIR"
echo "║                                                          ║"
echo "║  2. Crea el archivo .env:                               ║"
echo "║     nano $APP_DIR/.env                                   ║"
echo "║                                                          ║"
echo "║  3. Instala dependencias:                               ║"
echo "║     cd $APP_DIR                                          ║"
echo "║     PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install   ║"
echo "║                                                          ║"
echo "║  4. Apunta DNS de $DOMAIN a: $(curl -s ifconfig.me)    ║"
echo "║                                                          ║"
echo "║  5. Instala SSL:                                        ║"
echo "║     certbot --nginx -d $DOMAIN -d www.$DOMAIN           ║"
echo "║                                                          ║"
echo "║  6. Inicia la app:                                      ║"
echo "║     cd $APP_DIR && pm2 start server.js \\               ║"
echo "║       --name $APP_NAME --max-memory-restart 2G          ║"
echo "║     pm2 save                                            ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Tu IP del VPS: $(curl -s ifconfig.me 2>/dev/null || echo 'ejecuta: curl ifconfig.me')"
echo ""
