document.addEventListener('DOMContentLoaded', () => {
    let DOLAR_RATE = 635.00;
    let APP_CONFIG = {};
    let adminMarqueeText = "";
    let recentReloadsText = "";
    let currentJuego = 'freefire';

    function getPackagesForCurrentGame() {
        if (currentJuego === 'freefire') {
            return APP_CONFIG.precios;
        }
        if (APP_CONFIG.juegos && APP_CONFIG.juegos[currentJuego]) {
            return APP_CONFIG.juegos[currentJuego].paquetes;
        }
        return APP_CONFIG.precios;
    }

    function renderGames(juegos) {
        const container = document.getElementById('game-selector-container');
        const list = document.getElementById('game-list');
        if (!container || !list) return;

        if (!juegos || Object.keys(juegos).length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        list.innerHTML = '';

        const preferredOrder = ['freefire', 'mobilelegends', 'roblox', 'bloodstrike'];
        const validGameKeys = Object.keys(juegos || {}).filter(key => {
            const j = juegos[key];
            return j && typeof j === 'object' && j.nombre && key !== 'sorteo_semanal' && key !== 'ruleta_history' && key !== 'ruleta';
        });
        const sortedKeys = preferredOrder.filter(k => validGameKeys.includes(k)).concat(validGameKeys.filter(k => !preferredOrder.includes(k)));

        sortedKeys.forEach(key => {
            const juego = juegos[key];
            const btn = document.createElement('button');
            btn.className = 'btn-secondary-outline game-btn' + (key === currentJuego ? ' active' : '');
            btn.style.borderColor = key === currentJuego ? 'var(--secondary)' : 'rgba(255,255,255,0.2)';
            btn.style.color = key === currentJuego ? 'var(--secondary)' : '#fff';
            
            const logoImgSrc = juego.logo || `img/${key}_logo.png`;
            btn.innerHTML = `<img src="${logoImgSrc}" alt="${juego.nombre}" class="game-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';"><span style="display: none; font-weight: 700; font-size: 0.9rem;">${juego.nombre}</span>`;
            
            btn.onclick = () => {
                document.querySelectorAll('.game-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderColor = 'rgba(255,255,255,0.2)';
                    b.style.color = '#fff';
                });
                btn.classList.add('active');
                btn.style.borderColor = 'var(--secondary)';
                btn.style.color = 'var(--secondary)';
                currentJuego = key;
                
                const input = document.getElementById('player-id');
                const zoneContainer = document.getElementById('zone-id-container');

                if (key === 'mobilelegends') {
                    if (input) input.placeholder = 'User ID (Ej: 12345678)';
                    if (zoneContainer) zoneContainer.style.display = 'flex';
                } else {
                    if (input) input.placeholder = juego.inputPlaceholder || 'Ingresa ID / Usuario';
                    if (zoneContainer) zoneContainer.style.display = 'none';
                }
                
                renderPackages(getPackagesForCurrentGame(), APP_CONFIG.tasa_del_dia);

                // ── Roblox: saltar directamente a paquetes sin pedir ID ──
                if (key === 'roblox') {
                    document.querySelector('.input-group').style.display = 'none';
                    if (zoneContainer) zoneContainer.style.display = 'none';
                    document.getElementById('verify-btn').style.display = 'none';
                    document.getElementById('welcome-section').style.display = 'none';
                    document.getElementById('packages-section').style.display = 'block';
                    const titleEl = document.getElementById('packages-section-title');
                    if (titleEl) titleEl.textContent = 'Selecciona tu Paquete de Robux';
                } else {
                    // Restaurar vista normal al cambiar a otro juego
                    document.querySelector('.input-group').style.display = 'flex';
                    document.getElementById('verify-btn').style.display = 'flex';
                    document.getElementById('packages-section').style.display = 'none';
                    document.getElementById('welcome-section').style.display = 'none';
                    const titleEl = document.getElementById('packages-section-title');
                    if (titleEl) titleEl.textContent = key === 'bloodstrike' ? 'Selecciona tu Paquete de Monedas' : 'Selecciona tu Paquete de Diamantes';
                }
            };
            list.appendChild(btn);
        });

        // Botón de Streaming en la barra de juegos (arriba), solo la imagen del logo
        const streamingTab = document.createElement('button');
        streamingTab.id = 'streaming-btn';
        streamingTab.className = 'btn-secondary-outline game-btn btn-streaming-highlight';
        streamingTab.style.cssText = 'position: relative; background: rgba(157, 0, 255, 0.12); border: 1px solid rgba(157, 0, 255, 0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); padding: 4px 10px;';
        streamingTab.innerHTML = `
            <img src="img/streaming_logo.png" alt="Streaming" class="game-logo-img" style="height: 36px; width: auto; max-width: 70px; border-radius: 6px; object-fit: contain; filter: drop-shadow(0 0 6px rgba(157, 0, 255, 0.7));">
        `;
        streamingTab.onclick = (e) => {
            e.preventDefault();
            const modal = document.getElementById('streaming-services-modal');
            if (modal) {
                modal.style.display = 'flex';
                if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges();
            }
        };
        list.appendChild(streamingTab);
    }

    // Detectar si estamos en local, en el túnel o en la nube
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // URL del servidor en Render (TU URL REAL)
    const SERVER_URL = isLocal ? 'http://localhost:3500' : window.location.origin;
    window.SERVER_URL = SERVER_URL; // Exponer globalmente para funciones fuera de DOMContentLoaded

    // Unificar y actualizar marquesina con velocidad constante
    function updateMarqueeDisplay() {
        const marquee = document.getElementById('marquee-content');
        if (!marquee) return;
        
        const marqueeContainer = marquee.closest('.marquee');
        
        let parts = [];
        if (adminMarqueeText && adminMarqueeText.trim()) {
            parts.push(adminMarqueeText.trim());
        }
        if (recentReloadsText && recentReloadsText.trim()) {
            parts.push(recentReloadsText.trim());
        }
        
        let combinedText = parts.join(' ⚡ ');
        if (!combinedText) {
            combinedText = "¡BIENVENIDOS A RECARGASNEY.COM! Recargas automáticas 24/7. ¡Booyah! 💎";
        }
        
        if (marquee.textContent.trim() !== combinedText.trim()) {
            marquee.textContent = combinedText;
            
            if (marqueeContainer) {
                // Detener temporalmente la animación para forzar al navegador a aplicar el nuevo valor de duración inmediatamente
                marqueeContainer.style.animation = 'none';
                
                // Forzar un reflow leyendo offsetWidth (ancho real)
                const width = marqueeContainer.offsetWidth;
                const speed = 75; // 75px por segundo es una velocidad media y muy legible
                const duration = width > 0 ? (width / speed) : Math.max(25, combinedText.length * 0.20);
                
                marqueeContainer.style.setProperty('--marquee-duration', `${duration.toFixed(2)}s`);
                
                // Reiniciar la animación en el siguiente frame de renderizado
                requestAnimationFrame(() => {
                    marqueeContainer.style.animation = '';
                });
            }
        }
    }

    async function loadConfig() {
        try {
            const res = await fetch(`${SERVER_URL}/api/config`);
            const data = await res.json();
            
            const shouldRender = !APP_CONFIG.precios || 
                               JSON.stringify(APP_CONFIG.precios) !== JSON.stringify(data.precios) ||
                               JSON.stringify(APP_CONFIG.juegos) !== JSON.stringify(data.juegos) ||
                               JSON.stringify(APP_CONFIG.streaming_prices) !== JSON.stringify(data.streaming_prices) ||
                               JSON.stringify(APP_CONFIG.streaming_catalog) !== JSON.stringify(data.streaming_catalog) ||
                               APP_CONFIG.tasa_del_dia !== data.tasa_del_dia ||
                               JSON.stringify(APP_CONFIG.stock) !== JSON.stringify(data.stock) ||
                               JSON.stringify(APP_CONFIG.publicidades) !== JSON.stringify(data.publicidades);

            APP_CONFIG = data;
            window.APP_CONFIG = data;
            DOLAR_RATE = data.tasa_del_dia;
            window._tasaAdmin = data.tasa_del_dia;

            adminMarqueeText = data.barra_informativa || "";
            updateMarqueeDisplay();

            if (shouldRender) {
                console.log('[CONFIG] 🔄 Actualizando tienda (Precios, Catálogo o Stock cambiaron)');
                if (data.juegos) renderGames(data.juegos);
                renderPackages(getPackagesForCurrentGame(), data.tasa_del_dia);
                if (typeof renderAds === 'function') renderAds(data.publicidades);
                if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges(data.streaming_catalog);
            }

            // Actualizar métodos de pago (solo si cambiaron)
            if (data.metodos_pago) {
                const pm = data.metodos_pago.pagomovil;
                const bin = data.metodos_pago.binance;
                const ban = data.metodos_pago.pagomovil_banesco;
                if (document.getElementById('display-pm-banco')) document.getElementById('display-pm-banco').innerText = pm.banco;
                if (document.getElementById('display-pm-telefono')) document.getElementById('display-pm-telefono').innerText = pm.telefono;
                if (document.getElementById('display-pm-cedula')) document.getElementById('display-pm-cedula').innerText = pm.cedula;
                if (document.getElementById('display-bin-id')) document.getElementById('display-bin-id').innerText = bin.id;
                if (document.getElementById('display-bin-nombre')) document.getElementById('display-bin-nombre').innerText = bin.nombre;
                if (ban) {
                    if (document.getElementById('display-banesco-banco')) document.getElementById('display-banesco-banco').innerText = ban.banco || 'Banesco Banco Universal';
                    if (document.getElementById('display-banesco-telefono')) document.getElementById('display-banesco-telefono').innerText = ban.telefono || '';
                    if (document.getElementById('display-banesco-cedula')) document.getElementById('display-banesco-cedula').innerText = ban.cedula || '';
                }
                // ── BANCO ACTIVO DE PAGO MÓVIL (controlado por admin) ──
                // El admin elige BDV o Banesco — el cliente solo ve UNA opción
                const activeBank = data.active_pagomovil_bank || 'bdv';
                const bdvCard    = document.querySelector('.payment-method-card[data-method="pagomovil"]');
                const banescoCard= document.getElementById('pm-card-banesco');
                if (bdvCard)     bdvCard.style.display     = (activeBank === 'bdv')     ? '' : 'none';
                if (banescoCard) banescoCard.style.display  = (activeBank === 'banesco') ? '' : 'none';
            }

            // Actualizar Enlaces de WhatsApp dinámicamente en todos los botones de la página
            if (data.whatsapp) {
                const waSoporte = document.getElementById('wa-soporte-link');
                if (waSoporte && data.whatsapp.soporte) {
                    const cleanSoporte = data.whatsapp.soporte.replace(/\D/g, '');
                    waSoporte.href = `https://wa.me/${cleanSoporte}`;
                }

                if (data.whatsapp.canal && data.whatsapp.canal.trim() !== '') {
                    const canalUrl = data.whatsapp.canal.trim();
                    // Actualizar todos los botones y enlaces del canal de WhatsApp en la página
                    const selector = 'a[id*="wa-canal"], a[id*="pwa-wa-canal"], a[class*="wa-canal"], a[href*="whatsapp.com/channel"]';
                    document.querySelectorAll(selector).forEach(el => {
                        el.href = canalUrl;
                    });
                }
            }
        } catch (e) { console.error('Error cargando config:', e); }
    }
    
    // Carga inicial y sondeo automático cada 5 segundos
    loadConfig();
    if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges();
    setInterval(loadConfig, 5000);
    setInterval(() => {
        if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges();
    }, 5000);

    // Escuchar actualizaciones en directo del panel de administración (en la misma sesión de navegador)
    try {
        const storeBC = new BroadcastChannel('recargasney_store_updates');
        storeBC.onmessage = (event) => {
            if (event.data && event.data.type === 'PRICES_UPDATED') {
                console.log('[STORE-BC] 🔔 Actualización de precios detectada en tiempo real.');
                loadConfig();
                if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges();
            }
        };
    } catch(e) {}

    // ===== SECCIÓN DE RESEÑAS =====
    async function loadReviews() {
        try {
            const res = await fetch(`${SERVER_URL}/api/reviews`);
            const data = await res.json();
            if (!data.success || !data.reviews || data.reviews.length === 0) return;

            const section = document.getElementById('reviews-section');
            const carousel = document.getElementById('reviews-carousel');
            const avgScoreEl = document.getElementById('reviews-avg-score');
            const avgStarsEl = document.getElementById('reviews-avg-stars');
            const totalCountEl = document.getElementById('reviews-total-count');
            if (!section || !carousel) return;

            const reviews = data.reviews;
            // Calcular promedio
            const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
            avgScoreEl.textContent = avg.toFixed(1);
            avgStarsEl.innerHTML = renderStars(Math.round(avg));
            totalCountEl.textContent = `${reviews.length} reseña${reviews.length !== 1 ? 's' : ''}`;

            // Renderizar tarjetas (máximo 8)
            carousel.innerHTML = '';
            reviews.slice(0, 8).forEach((r, idx) => {
                const initials = (r.name || '?').charAt(0).toUpperCase();
                const timeAgo = getTimeAgo(r.created_at);
                const card = document.createElement('div');
                card.className = 'review-card';
                card.style.animationDelay = `${idx * 0.08}s`;
                card.innerHTML = `
                    <div class="review-card-header">
                        <div class="review-avatar">${initials}</div>
                        <div class="review-meta">
                            <span class="review-name">${maskName(r.name)}</span>
                            <span class="review-pack">💎 ${r.pack || 'Diamantes'}</span>
                        </div>
                        <small style="color:var(--text-gray);font-size:0.65rem;white-space:nowrap;">${timeAgo}</small>
                    </div>
                    <div class="review-card-stars">${renderStars(r.rating)}</div>
                    <p class="review-text">${r.comment || getDefaultComment(r.rating)}</p>
                    <div class="review-verified"><i class="fa-solid fa-circle-check"></i> Compra verificada</div>
                `;
                carousel.appendChild(card);
            });

            // La sección de reseñas siempre es visible al final de la página
        } catch (e) { /* sin reseñas aún */ }
    }

    function renderStars(count) {
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += `<i class="fa-${i <= count ? 'solid' : 'regular'} fa-star"></i>`;
        }
        return html;
    }

    function maskName(name) {
        if (!name || name.length < 3) return name || '***';
        return name.charAt(0).toUpperCase() + '*'.repeat(Math.min(name.length - 2, 4)) + name.charAt(name.length - 1).toUpperCase();
    }

    function getTimeAgo(isoDate) {
        if (!isoDate) return '';
        const diff = Date.now() - new Date(isoDate).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        return `hace ${Math.floor(hrs / 24)}d`;
    }

    function getDefaultComment(rating) {
        const comments = {
            5: ['¡Súper rápido, lo recomiendo! 🔥', '¡Excelente servicio! Los diamantes llegaron al instante.', '¡Increíble, el mejor servicio de recargas!', 'Seguro y rápido, 100% recomendado 💎'],
            4: ['Muy buen servicio, llegaron rápido.', 'Todo perfecto, los diamantes llegaron en minutos.'],
            3: ['Bien, llegaron mis diamantes sin problemas.']
        };
        const opts = comments[rating] || comments[4];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    loadReviews();


    // Mostrar banner de bienvenida si nunca ha iniciado sesión
    const newUserBanner = document.getElementById('new-user-banner');
    if (!localStorage.getItem('ff_user_id') && newUserBanner) {
        newUserBanner.style.display = 'block';
    }

    // Detectar link de referido en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref');
    if (refParam && refParam !== localStorage.getItem('ff_user_id')) {
        localStorage.setItem('ff_pending_ref', refParam); // guardar para usarlo cuando inicie sesión
    }

    // Etiquetas de marketing para cada paquete
    const PROMO_TAGS = {
        '100':     { text: 'Para Empezar', icon: '🎮', className: 'promo-starter' },
        '310':     { text: 'Popular',      icon: '🔥', className: 'promo-popular' },
        '520':     { text: 'Más Vendido',  icon: '⚡', className: 'promo-bestseller' },
        '1060':    { text: 'Mejor Valor',  icon: '💰', className: 'promo-value' },
        '2180':    { text: 'Premium',      icon: '👑', className: 'promo-premium' },
        '5600':    { text: 'VIP Élite',    icon: '🏆', className: 'promo-vip' },
        'basica':  { text: 'Paquete Especial', icon: '🃏', className: 'promo-starter' },
        'semanal': { text: 'Recarga Semanal',  icon: '📅', className: 'promo-popular' },
        'mensual': { text: 'Recarga Mensual',  icon: '🌙', className: 'promo-premium' },
        'booyah':  { text: 'Pase Élite',       icon: '🏆', className: 'promo-vip' }
    };

    function renderPackages(precios, tasa) {
        const grid = document.querySelector('.packages-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const PAQUETES_ESPECIALES = ['basica', 'semanal', 'mensual', 'booyah'];
        Object.entries(precios).forEach(([amount, data]) => {
            const priceBs = (data.usdt * tasa).toFixed(2).replace('.', ',');
            const isAvailable = true; // Todos los paquetes disponibles
            const stockLabel = `<span class="stock-badge available">Disponible</span>`;
            const disabledClass = '';
            const esEspecial = PAQUETES_ESPECIALES.includes(amount.toLowerCase());

            // Etiqueta promocional (personalizable desde admin)
            let promoTag = '';
            const customTag = (data.tag !== undefined) ? data.tag : data.badge;
            const customIcon = data.tag_icon || data.badge_icon || '🔥';
            if (customTag) {
                promoTag = `<span class="promo-tag promo-popular">${customIcon} ${customTag}</span>`;
            } else if (customTag === '') {
                promoTag = '';
            } else {
                const promo = PROMO_TAGS[amount];
                promoTag = promo ? `<span class="promo-tag ${promo.className}">${promo.icon} ${promo.text}</span>` : '';
            }

            // Imagen 3D para paquetes especiales, ícono de gema para diamantes
            const specialImgs = {
                'basica':  '/img/tarjeta_basica.png',
                'semanal': '/img/tarjeta_semanal.png',
                'mensual': '/img/tarjeta_mensual.png',
                'booyah':  '/img/pase_booyah.png'
            };
            let iconHtml = '';
            if (currentJuego === 'roblox') {
                const robloxImgMap = { '10': '/img/roblox_10usd.jpg' };
                const robloxImg = robloxImgMap[amount] || '/img/roblox.png';
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="${robloxImg}" alt="Roblox" style="width:100%; height:100%; object-fit:contain; border-radius:10px; display:block;"></div>`;
            } else if (esEspecial) {
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="${specialImgs[amount.toLowerCase()]}" alt="${amount}" style="width:100%; height:100%; object-fit:cover; border-radius:10px; display:block;"></div>`;
            } else if (currentJuego === 'bloodstrike') {
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="/img/bloodstrike_coin.png" alt="Monedas" style="width:100%; height:100%; object-fit:contain; border-radius:10px; display:block;"></div>`;
            } else if (currentJuego === 'mobilelegends') {
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="/badge-diamond.png" alt="Diamantes" style="width:100%; height:100%; object-fit:contain; border-radius:10px; display:block;"></div>`;
            } else {
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="/img/diamante.png" alt="Diamantes" style="width:100%; height:100%; object-fit:contain; border-radius:10px; display:block;"></div>`;
            }

            // Bonus: solo aplica a paquetes de diamantes numéricos
            const bonusNum = (currentJuego === 'freefire' && !esEspecial) ? Math.round(parseInt(amount) * 0.1) : 0;
            const displayLabel = esEspecial ? data.label : data.label.replace(/ diamantes/gi, '');
            
            const isSelected = selectedPackage && String(selectedPackage.amount) === String(amount);
            const selectedClass = isSelected ? 'selected' : '';

            grid.innerHTML += `
                <div class="package-card ${disabledClass} ${selectedClass}" data-amount="${amount}" data-bonus="${bonusNum}" data-price="${data.usdt}" ${!isAvailable ? 'style="pointer-events:none; opacity:0.6;"' : ''}>
                    ${stockLabel}
                    ${promoTag}
                    ${iconHtml}
                    <div class="pack-info">
                        <span class="amount">${displayLabel}</span>
                        <span class="price-usdt">${data.usdt} USDT</span>
                        <span class="price-bs">${priceBs} Bs</span>
                    </div>
                </div>
            `;
        });
        initPackageEvents();
    }

    const playerInput = document.getElementById('player-id');
    const verifyBtn = document.getElementById('verify-btn');
    const loadLastIdBtn = document.getElementById('load-last-id');
    const historyBtn = document.getElementById('history-btn');
    const favoritesBtn = document.getElementById('favorites-btn');
    const pricesBtn = document.getElementById('prices-btn');
    const addFavoriteBtn = document.getElementById('add-favorite-btn');
    const changeIdBtn = document.getElementById('change-id-btn');
    const resetUiBtn = document.getElementById('reset-ui-btn');

    // Historial en tiempo real del jugador verificado
    let currentPlayerHistory = [];
    let historyLoadedForUid = null;

    async function fetchPlayerHistory(uid) {
        try {
            const res = await fetch(`${SERVER_URL}/historial?uid=${uid}`);
            if (!res.ok) throw new Error('Error al cargar historial');
            const data = await res.json();
            if (data.success) {
                currentPlayerHistory = data.orders || [];
                historyLoadedForUid = uid;
                console.log(`[HISTORIAL] Cargadas ${currentPlayerHistory.length} compras para UID: ${uid}`);
            }
        } catch (e) {
            console.error('[HISTORIAL] Error fetching:', e);
            currentPlayerHistory = [];
        }
    }

    window.showOrderTicket = (ref) => {
        let order = (currentPlayerHistory || []).find(o => o.ref === ref);
        if (!order) {
            const localOrders = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');
            order = localOrders.find(o => o.ref === ref);
        }
        if (!order && window._lastHistoryOrders) {
            order = window._lastHistoryOrders.find(o => o.ref === ref);
        }
        if (!order) {
            return Swal.fire({
                icon: 'warning',
                title: 'No encontrado',
                text: 'No se encontró el detalle de la compra.',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                confirmButtonColor: '#9D00FF'
            });
        }

        const isRoblox = order.juego === 'roblox';
        const isStreaming = order.juego === 'streaming' || (order.pack || '').toLowerCase().includes('netflix') || (order.pack || '').toLowerCase().includes('disney') || (order.pack || '').toLowerCase().includes('max') || (order.pack || '').toLowerCase().includes('vix') || (order.pack || '').toLowerCase().includes('canva') || (order.pack || '').toLowerCase().includes('spotify') || (order.pack || '').toLowerCase().includes('prime') || (order.pack || '').toLowerCase().includes('crunchyroll');
        const statusText  = order.status === 'approved' ? 'APROBADO' : (order.status === 'rejected' ? 'RECHAZADO' : 'PENDIENTE');
        const dateStr     = order.time ? new Date(order.time).toLocaleString('es-VE', { timeZone: 'America/Caracas', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/D';
        const juegoName   = isRoblox ? 'Roblox' : (order.juego ? (order.juego.charAt(0).toUpperCase() + order.juego.slice(1)) : 'Free Fire');
        
        let currencyLabel = 'diamantes';
        if (isRoblox) currencyLabel = 'Robux';
        else if (order.juego === 'bloodstrike') currencyLabel = 'oro';
        else if (order.juego === 'mobilelegends') currencyLabel = 'diamantes';

        let productText = `${order.pack} ${currencyLabel}`;
        if (isRoblox) {
            const amount = order.pack.split('+')[0].trim().replace(/usd/i, '');
            productText = `Roblox US ${amount}USD`;
        }

        const ticketHtml = `
            <div id="ticket-receipt" style="text-align: left; padding: 18px; background: #0c0617; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); font-family: 'Inter', sans-serif; position: relative; overflow: hidden; box-shadow: inset 0 0 15px rgba(157,0,255,0.15);">
                <div style="text-align: center; margin-bottom: 18px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 14px;">
                    <h3 style="margin: 0; color: #9D00FF; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 1.25rem; letter-spacing: 0.5px;">${isRoblox ? 'ROBLOX' : 'RECARGASNEY.COM'}</h3>
                    <p style="font-size: 0.72rem; color: #888; margin: 4px 0 0; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Comprobante de Pago</p>
                </div>
                ${isStreaming ? (() => {
                    const purchaseDate = order.date ? new Date(order.date) : new Date();
                    const expDate = new Date(purchaseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                    const dayE = String(expDate.getDate()).padStart(2, '0');
                    const monthE = String(expDate.getMonth() + 1).padStart(2, '0');
                    const yearE = expDate.getFullYear();
                    const formattedExpireDate = `${dayE}-${monthE}-${yearE}`;

                    let packType = order.pack || 'Perfil';
                    if ((order.pack || '').toLowerCase().includes('perfil')) packType = 'Perfil';
                    else if ((order.pack || '').toLowerCase().includes('pantalla')) packType = 'Pantalla';
                    else if ((order.pack || '').toLowerCase().includes('cuenta')) packType = 'Cuenta Completa';

                    let credsHtml = '';
                    if (order.pin && order.status === 'approved') {
                        const pinLines = order.pin.split(/[\n|]+/).map(l => l.trim()).filter(l => l && l !== 'Manual');
                        credsHtml = pinLines.map(line => {
                            if (line.includes(':')) {
                                const idx = line.indexOf(':');
                                const k = line.substring(0, idx).trim();
                                const v = line.substring(idx + 1).trim();
                                return `<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.84rem;"><span style="color:#aaa;">${k}:</span><strong style="color:#00FF94; font-family:monospace; word-break:break-all;">${v}</strong></div>`;
                            }
                            return `<div style="font-family:monospace; font-size:0.84rem; color:#00FF94; font-weight:700; word-break:break-all; background:rgba(0,0,0,0.3); border-radius:6px; padding:4px 8px; margin-bottom:4px; text-align:left;">${line}</div>`;
                        }).join('');
                    }

                    return `
                    <div style="background: rgba(15, 8, 30, 0.95); border: 1px solid rgba(0, 240, 255, 0.35); border-radius: 20px; padding: 18px 16px; box-shadow: 0 15px 35px rgba(0,0,0,0.8), 0 0 25px rgba(0,240,255,0.12); font-family: 'Inter', sans-serif; text-align: left;">
                        <img src="img/streaming_logo.png" alt="Streaming" style="width: 75px; height: 75px; object-fit: contain; display: block; margin: 0 auto 14px auto; border-radius: 14px; filter: drop-shadow(0 4px 12px rgba(157,0,255,0.4));">
                        
                        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.84rem; color: #d0d0d0;">
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Tipo de paquete:</span><strong style="color: #fff;">${packType}</strong></div>
                            ${credsHtml}
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Plan:</span><strong style="color: #fff;">30 días</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Fecha Vencimiento:</span><strong style="color: #00FF94;">${formattedExpireDate}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Nº Control:</span><strong style="color: #00F0FF;">#${order.control_num || order.ref}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Estado:</span><strong style="color: ${order.status === 'approved' ? '#00FF94' : order.status === 'rejected' ? '#FF3D71' : '#FFD93D'};">${statusText}</strong></div>
                        </div>

                        ${(order.pin && order.status === 'approved') ? `
                        <div style="margin-top: 10px; text-align: center;">
                            <button onclick="const btn=this; navigator.clipboard.writeText('${order.pin.replace(/'/g, "\\'").replace(/\n/g, ' | ')}').then(()=>{ btn.innerText='✓ Copiado!'; setTimeout(()=>btn.innerText='📋 Copiar Credenciales', 2000); })" style="background:linear-gradient(135deg,#E50914,#9D00FF); color:#fff; border:none; border-radius:8px; padding:8px 16px; font-weight:800; font-size:0.8rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(229,9,20,0.3);">
                                📋 Copiar Credenciales
                            </button>
                        </div>
                        ` : ''}

                        <!-- Aviso Importante -->
                        <div style="margin-top: 14px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 12px;">
                            <div style="color: #ff4b2b; font-weight: 800; font-size: 0.78rem; text-align: center; margin-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Aviso Importante</div>
                            <p style="color: rgba(255, 100, 100, 0.85); font-size: 0.68rem; text-align: center; line-height: 1.4; margin: 0; background: rgba(255, 75, 43, 0.08); border: 1px dashed rgba(255, 75, 43, 0.3); padding: 8px 10px; border-radius: 8px;">
                                No está permitido modificar la cuenta, perfil, PIN, correo o contraseña. Úsalo únicamente en un dispositivo a la vez. El incumplimiento de estas normas conllevará a la pérdida de la garantía del servicio sin previo aviso.
                            </p>
                        </div>

                        <div style="text-align: center; font-size: 0.82rem; color: #FFD700; font-weight: 700; letter-spacing: 1px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
                            Comprobante de Pago
                        </div>
                    </div>`;
                })() : `
                <div style="display: grid; gap: 8px; font-size: 0.82rem; margin-bottom: 14px; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">N° Control:</span><strong style="color: #fff;">#${order.control_num || '-'}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Paquete / Recarga:</span><strong style="color: #00F0FF; font-weight: 800;">${order.pack || productText}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Precio / Costo:</span><strong style="color: #00FF94; font-weight: 800;">${order.price || 'N/A'}</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Fecha/Hora:</span><span style="color: #fff;">${dateStr}</span></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Juego:</span><span style="color: #fff; font-weight: 700; text-transform: uppercase;">${juegoName}</span></div>
                    ${!isRoblox ? `<div style="display: flex; justify-content: space-between;"><span style="color: #888;">ID Jugador:</span><span style="color: #fff; font-family: monospace; font-weight: 700;">${order.uid || '-'}${order.name ? ` <span style="color:#aaa; font-size:0.78rem; font-family:inherit; font-weight:400;">(${order.name})</span>` : ''}</span></div>` : ''}
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Método de Pago:</span><span style="color: #fff;">${order.method === 'binance' ? 'Binance Pay' : 'Pago Móvil'}</span></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Referencia:</span><code style="color: var(--secondary); font-weight: 700;">${order.ref}</code></div>
                    <div style="display: flex; justify-content: space-between;"><span style="color: #888;">Estado:</span><span style="color: ${order.status === 'approved' ? '#00FF94' : order.status === 'rejected' ? '#FF3D71' : '#FFD93D'}; font-weight: 900; letter-spacing: 0.5px;">${statusText}</span></div>
                </div>`}
                ${(!isStreaming && order.pin && isRoblox) ? `
                <div style="background: rgba(0,240,255,0.08); border: 1px dashed #00f0ff; border-radius: 10px; padding: 12px; text-align: center; margin-bottom: 14px;">
                    <span style="font-size: 0.72rem; color: #00f0ff; display: block; text-transform: uppercase; font-weight: bold; margin-bottom: 6px; letter-spacing: 0.5px;">🔑 PIN DE ROBLOX ADQUIRIDO</span>
                    <code style="font-family: monospace; font-size: 1.1rem; color: #00FF94; font-weight: bold; word-break: break-all; display: block; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 6px; letter-spacing: 1.5px; margin-bottom: 8px;">${order.pin}</code>
                    <button onclick="const btn=this; navigator.clipboard.writeText('${order.pin}').then(()=>{ btn.innerText='✓ PIN Copiado!'; setTimeout(()=>btn.innerText='📋 Copiar PIN', 2000); })" style="background:#00f0ff; color:#07030D; border:none; border-radius:8px; padding:7px 14px; font-weight:800; font-size:0.8rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(0,240,255,0.3);">
                        📋 Copiar PIN
                    </button>
                </div>
                ` : ''}
                <div style="margin-top: 14px; text-align: center;">
                    <a href="https://wa.me/${((APP_CONFIG.whatsapp && APP_CONFIG.whatsapp.bot) ? APP_CONFIG.whatsapp.bot : '584123491068').replace(/\D/g, '')}?text=${encodeURIComponent(order.ref)}" target="_blank" style="background: #25D366; color: #fff; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: 10px 14px; font-size: 0.82rem; font-weight: 700; box-shadow: 0 4px 12px rgba(37,211,102,0.2); border: 1px solid #20ba5a;">
                        <i class="fa-brands fa-whatsapp" style="font-size: 1.15rem;"></i> Consultar estado por WhatsApp
                    </a>
                    <p style="font-size: 0.68rem; color: #888; margin: 6px 0 0;">El bot responderá automáticamente con el estado de tu pedido</p>
                </div>
            </div>
        `;

        Swal.fire({
            title: '<i class="fa-solid fa-receipt"></i> Ticket de Compra',
            html: ticketHtml,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-share-nodes"></i> Compartir',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#9D00FF',
            cancelButtonColor: '#444',
            width: '380px'
        }).then(res => {
            if (res.isConfirmed) {
                const shareText = `🧾 *TICKET DE COMPRA - RECARGASNEY.COM* 🧾\n\n` +
                    `*N° Control:* #${order.control_num || '-'}\n` +
                    `*Fecha/Hora:* ${dateStr}\n` +
                    `*Juego:* ${juegoName.toUpperCase()}\n` +
                    (!isRoblox ? `*ID Jugador:* ${order.uid || '-'}${order.name ? ` (${order.name})` : ''}\n` : '') +
                    `*Producto:* ${productText}\n` +
                    `*Precio:* ${order.price || 'N/A'}\n` +
                    `*Método:* ${order.method === 'binance' ? 'Binance Pay' : 'Pago Móvil'}\n` +
                    `*Referencia:* ${order.ref}\n` +
                    `*Estado:* ${statusText}\n` +
                    (order.pin ? `*PIN Adquirido:* ${order.pin}\n` : '') +
                    `\n¡Gracias por tu preferencia! 🚀`;

                if (navigator.share) {
                    navigator.share({
                        title: 'RecargasNey - Comprobante',
                        text: shareText
                    }).catch(e => console.log('Share aborted', e));
                } else {
                    navigator.clipboard.writeText(shareText).then(() => {
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'Ticket copiado al portapapeles',
                            showConfirmButton: false,
                            timer: 2000,
                            background: 'rgba(20, 10, 35, 0.95)',
                            color: '#fff'
                        });
                    });
                }
            }
        });
    };

    // Manejar Último ID usado
    const lastId = localStorage.getItem('ff_last_id');
    if (lastId && loadLastIdBtn) {
        loadLastIdBtn.style.display = 'block';
        loadLastIdBtn.addEventListener('click', () => {
            playerInput.value = lastId;
        });
    }

    // Función para actualizar estados de pedidos pendientes en el historial
    async function refreshHistoryStatuses() {
        let myOrders = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');
        const pendingOrders = myOrders.filter(o => o.status === 'pending');
        
        if (pendingOrders.length === 0) return;

        for (let order of pendingOrders) {
            try {
                const res = await fetch(`${SERVER_URL}/status?ref=${order.ref}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status !== 'pending') {
                        const idx = myOrders.findIndex(o => o.ref === order.ref);
                        if (idx !== -1) {
                            myOrders[idx].status = data.status;
                            if (data.pin) myOrders[idx].pin = data.pin;
                        }
                    }
                }
            } catch (e) { console.error(e); }
        }
        localStorage.setItem('ff_my_orders', JSON.stringify(myOrders));
    }

    // ─────────────────────────────────────────────────────────────
    // HISTORIAL DE COMPRAS — Muestra directo, sin pedir ID
    // ─────────────────────────────────────────────────────────────
    function buildOrderRow(order) {
        const statusText = order.status === 'approved' ? '✅ APROBADO' : (order.status === 'rejected' ? '❌ RECHAZADO' : '⏳ PENDIENTE');
        const statusBg   = order.status === 'approved' ? 'rgba(37,211,102,0.1)' : (order.status === 'rejected' ? 'rgba(255,75,43,0.1)' : 'rgba(255,200,0,0.08)');
        const statusColor= order.status === 'approved' ? '#00FF94' : (order.status === 'rejected' ? '#FF3D71' : '#FFD93D');
        const methodIcon = order.method === 'binance' ? '₿' : '📱';
        const dateStr    = order.time ? new Date(order.time).toLocaleString('es-VE', { timeZone: 'America/Caracas', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/D';

        let packFormatted = `💎 ${order.pack} diamantes`;
        if (order.juego === 'roblox') {
            const amount = order.pack.split('+')[0].trim().replace(/usd/i, '');
            packFormatted = `🎮 Roblox US ${amount}USD`;
        } else if (order.juego === 'bloodstrike') {
            packFormatted = `🔫 Bloodstrike ${order.pack} oro`;
        } else if (order.juego === 'mobilelegends') {
            packFormatted = `🛡️ Mobile Legends ${order.pack} 💎`;
        } else if (order.juego === 'streaming') {
            packFormatted = `🍿 Streaming: ${order.pack}`;
        }

        return `
            <div style="border-bottom:1px solid rgba(255,255,255,0.07); padding:12px 0; text-align:left; cursor:pointer;" onclick="window.showOrderTicket('${order.ref}')" title="Ver Ticket">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div style="flex:1;">
                        <p style="margin:0; font-size:0.67rem; color:#666;">${dateStr} · ${methodIcon} ${order.method === 'binance' ? 'Binance' : 'Pago Móvil'}</p>
                        <p style="margin:4px 0 0; font-weight:800; font-size:0.9rem; color:#fff;">${packFormatted}</p>
                        ${order.price ? `<p style="margin:2px 0 0; font-size:0.7rem; color:#888;">Precio: ${order.price}</p>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                        <span style="background:${statusBg}; color:${statusColor}; font-size:0.65rem; font-weight:900; padding:3px 8px; border-radius:6px; white-space:nowrap;">${statusText}</span>
                        <span style="font-size:0.65rem; color:#666; display:flex; align-items:center; gap:3px;"><i class="fa-solid fa-ticket" style="color:#9D00FF;"></i> Ver Ticket</span>
                    </div>
                </div>
                <div style="margin-top:4px; font-size:0.68rem; color:#555;">Ref: <code style="color:var(--secondary);">${order.ref}</code>${order.control_num ? ` · N°: <code style="color:#aaa;">${order.control_num}</code>` : ''}</div>
            </div>`;
    }

    window.showMyHistory = async function() {
        // 1. Órdenes locales guardadas en este dispositivo
        let localOrders = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');

        // 2. Si hay UID verificado, también traer del servidor
        if (historyLoadedForUid) {
            Swal.fire({ title: 'Cargando...', allowOutsideClick: false, showConfirmButton: false, background: 'rgba(20,10,35,0.97)', color:'#fff', didOpen: () => Swal.showLoading() });
            await fetchPlayerHistory(historyLoadedForUid);
            Swal.close();
            // Combinar: servidor + locales únicos (no duplicar por ref)
            const serverRefs = new Set(currentPlayerHistory.map(o => o.ref));
            const extraLocal = localOrders.filter(o => !serverRefs.has(o.ref));
            localOrders = [...currentPlayerHistory, ...extraLocal];
        }

        // Ordenar del más reciente al más antiguo
        localOrders.sort((a, b) => (b.time || 0) - (a.time || 0));
        window._lastHistoryOrders = localOrders;

        if (localOrders.length === 0) {
            return Swal.fire({
                icon: 'info',
                title: '📭 Sin Compras',
                html: `<p style="color:#aaa; font-size:0.9rem;">Aún no tienes compras registradas en este dispositivo.<br><br>Tus compras se guardan automáticamente cuando realizas un pedido.</p>`,
                background: 'rgba(20, 10, 35, 0.97)',
                color: '#fff',
                confirmButtonColor: '#9D00FF',
                confirmButtonText: 'Entendido'
            });
        }

        const headerInfo = historyLoadedForUid
            ? `<div style="margin-bottom:10px; padding:6px 10px; background:rgba(0,255,148,0.06); border-radius:8px; border:1px solid rgba(0,255,148,0.15); font-size:0.72rem; color:#aaa; text-align:left;"><i class="fa-solid fa-circle-check" style="color:#00FF94;"></i> ID verificado: <strong style="color:#fff;">${historyLoadedForUid}</strong> &nbsp;·&nbsp; ${localOrders.length} compra${localOrders.length !== 1 ? 's' : ''}</div>`
            : `<div style="margin-bottom:10px; padding:6px 10px; background:rgba(157,0,255,0.06); border-radius:8px; border:1px solid rgba(157,0,255,0.2); font-size:0.72rem; color:#aaa; text-align:left;"><i class="fa-solid fa-mobile-screen" style="color:#9D00FF;"></i> ${localOrders.length} compra${localOrders.length !== 1 ? 's' : ''} en este dispositivo &nbsp;·&nbsp; <span style="color:#9D00FF;">Toca para ver ticket</span></div>`;

        let rowsHtml = '';
        localOrders.forEach(order => { rowsHtml += buildOrderRow(order); });

        Swal.fire({
            title: '<i class="fa-solid fa-receipt"></i> Mis Compras',
            html: `${headerInfo}<div style="max-height:370px; overflow-y:auto; padding-right:4px;">${rowsHtml}</div>`,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            confirmButtonText: '🔄 Actualizar',
            confirmButtonColor: '#9D00FF',
            showCloseButton: true,
            width: '420px'
        }).then(result => {
            if (result.isConfirmed) window.showMyHistory();
        });
    };

    historyBtn.addEventListener('click', () => window.showMyHistory());

    // Botón Llamativo Mini Influencer (Próximamente)
    const miniInfBtn = document.getElementById('mini-influencer-btn');
    if (miniInfBtn) {
        miniInfBtn.addEventListener('click', () => {
            Swal.fire({
                title: '<span style="color:#FFD700; font-family:\'Montserrat\',sans-serif; font-weight:900;"><i class="fa-brands fa-tiktok" style="color:#FF0050;"></i> MINI INFLUENCER</span>',
                html: `
                    <div style="text-align:center; padding:10px 5px;">
                        <div style="font-size:3rem; margin-bottom:12px; filter:drop-shadow(0 0 15px rgba(255,0,80,0.6));">🔥🎥✨</div>
                        <span style="background:linear-gradient(135deg,#FFD700,#FF8C00); color:#000; font-weight:900; font-size:0.78rem; padding:4px 14px; border-radius:20px; text-transform:uppercase; letter-spacing:1px; box-shadow:0 0 10px rgba(255,215,0,0.5);">✨ ¡PRÓXIMAMENTE!</span>
                        <p style="color:#e0e0e0; font-size:0.92rem; margin-top:16px; line-height:1.6;">
                            ¡Muy pronto podrás ganar <strong>saldo en USDT y diamantes gratis</strong> creando videos cortos en TikTok, Shorts o Reels promocionando RecargasNey!
                        </p>
                        <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(157,0,255,0.3); border-radius:14px; padding:14px; margin-top:16px; text-align:left; font-size:0.84rem; color:#ccc;">
                            <div style="color:#00F0FF; font-weight:800; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                                <i class="fa-solid fa-gift" style="color:#FFD700;"></i> Beneficios para Mini Influencers:
                            </div>
                            • 💰 Recompensas acumulables en USDT por vistas.<br>
                            • 🎟️ Código de descuento exclusivo de 1ra recarga para tus seguidores.<br>
                            • 💎 Retiro directo a tu saldo o paquete de diamantes.
                        </div>
                    </div>
                `,
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                confirmButtonText: '¡Excelente! Me mantendré atento 🔥',
                confirmButtonColor: '#9D00FF'
            });
        });
    }


    // Manejar Botón de Precios
    if (pricesBtn) {
        pricesBtn.addEventListener('click', () => {
            const currentPrecios = getPackagesForCurrentGame();
            if (!currentPrecios || Object.keys(currentPrecios).length === 0) {
                Swal.fire({ icon: 'warning', title: 'Cargando...', text: 'Los precios aún se están cargando. Intenta de nuevo en unos segundos.', background: 'rgba(20, 10, 35, 0.95)', color: '#fff' });
                return;
            }


            let htmlContent = '<div style="text-align: left; font-size: 0.9rem; margin-top: 10px;">';
            
            Object.entries(currentPrecios).forEach(([amount, data]) => {
                const priceBs = (data.usdt * DOLAR_RATE).toFixed(2).replace('.', ',');
                const amountNum = parseInt(amount);
                const isSpecial = isNaN(amountNum);
                const displayTitle = data.label || amount;
                const hasPlus = displayTitle.includes('+');
                const bonusHtml = (!isSpecial && !hasPlus && currentJuego === 'freefire') ? `<span style="color:var(--secondary); font-size:0.8em;">+ ${(amountNum * 0.1).toFixed(0)}</span>` : '';

                htmlContent += `
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-weight: bold; color: #fff;">💎 ${displayTitle} ${bonusHtml}</div>
                        <div style="text-align: right;">
                            <div style="color: #25D366; font-weight: bold;">${priceBs} Bs</div>
                            <div style="color: #aaa; font-size: 0.8em;">${parseFloat(data.usdt).toFixed(2)} USDT</div>
                        </div>
                    </div>
                `;
            });
            
            htmlContent += '</div>';

            Swal.fire({
                title: '<i class="fa-solid fa-tag"></i> Lista de Precios',
                html: htmlContent,
                showConfirmButton: true,
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });
        });
    }

    // --- LÓGICA DE CUENTA ---
    const loginTriggerBtn = document.getElementById('login-trigger-btn');
    const userDisplay = document.getElementById('user-display');
    const headerPointsVal = document.getElementById('header-points-val');
    const logoutBtn = document.getElementById('logout-btn');
    const pushBellBtn = document.getElementById('push-bell-btn');
    let isPushEnabled = false;

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function checkSubscriptionState() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            return;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            isPushEnabled = !!sub;
        } catch (e) {
            console.error('Error verificando suscripción push:', e);
        }
    }

    function updateBellUI(enabled) {
        if (!pushBellBtn) return;
        pushBellBtn.style.display = 'flex';
    }

    async function subscribeUser(uid) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        try {
            const response = await fetch(`${SERVER_URL}/api/push/vapid-key`);
            const { publicKey } = await response.json();
            
            if (!publicKey) {
                console.error('No se pudo obtener la clave VAPID pública.');
                return;
            }

            const reg = await navigator.serviceWorker.ready;
            
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            const subData = JSON.parse(JSON.stringify(subscription));
            // Asegurar la correcta extracción de las claves si JSON.stringify falla
            if (!subData.keys || !subData.keys.p256dh || !subData.keys.auth) {
                subData.keys = {
                    p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh'))))
                        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
                        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
                };
            }
            const subResponse = await fetch(`${SERVER_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: uid, subscription: subData })
            });

            const result = await subResponse.json();
            if (result.success) {
                isPushEnabled = true;
                updateBellUI(true);
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2500,
                    timerProgressBar: true
                });
                Toast.fire({ icon: 'success', title: 'Notificaciones activadas 🔔' });
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error('Error al suscribir usuario:', e);
            updateBellUI(false);
        }
    }
    window.subscribeUser = subscribeUser;

    async function unsubscribeUser() {
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            
            if (sub) {
                await fetch(`${SERVER_URL}/api/push/unsubscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint })
                });
                
                await sub.unsubscribe();
            }

            isPushEnabled = false;
            updateBellUI(false);
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });
            Toast.fire({ icon: 'info', title: 'Notificaciones desactivadas 🔕' });
        } catch (e) {
            console.error('Error al des-suscribir:', e);
        }
    }

    const updateAccountUI = (id) => {
        if (pushBellBtn) pushBellBtn.style.display = 'flex';
        if (id) {
            loginTriggerBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            // Mostrar $0 mientras carga el saldo real
            if (headerPointsVal) headerPointsVal.textContent = '0';
            loadUserPoints(id); // loadUserPoints ya actualiza header-points-val internamente
            checkSubscriptionState().then(() => {
                if (Notification.permission === 'granted') {
                    subscribeUser(id);
                }
            });
        } else {
            loginTriggerBtn.style.display = 'flex';
            userDisplay.style.display = 'none';
            if (headerPointsVal) headerPointsVal.textContent = '0';
        }
    };

    // Auto-login al cargar
    const savedId = localStorage.getItem('ff_user_id');
    if (savedId) {
        updateAccountUI(savedId);
        if (newUserBanner) newUserBanner.style.display = 'none';
    }

    // Botón Copiar Link de Referido (en la tarjeta de bienvenida)
    const copyRefBtn = document.getElementById('copy-ref-link-btn');
    if (copyRefBtn) {
        copyRefBtn.addEventListener('click', () => {
            const uid = localStorage.getItem('ff_user_id');
            if (uid) window.shareReferralLink(uid);
        });
    }

    // ── Botón del Dashboard de Referidos ────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-ver-dashboard-referidos')) {
            const uid = localStorage.getItem('ff_user_id') || document.getElementById('player-id').value.trim();
            if (uid) showReferralDashboard(uid);
        }
    });

    async function showReferralDashboard(uid) {
        // Loading state
        Swal.fire({
            title: '<span style="font-family:Montserrat,sans-serif;font-size:1.1rem;">📊 Cargando tus stats...</span>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'rgba(10,5,25,0.98)',
            color: '#fff',
            didOpen: () => Swal.showLoading()
        });

        let stats = null;
        try {
            const res = await fetch(`${SERVER_URL}/api/mis-referidos?uid=${uid}`);
            const data = await res.json();
            if (data.success) stats = data.stats;
        } catch (e) {
            console.error('[DASHBOARD] Error cargando stats:', e);
        }

        if (!stats) {
            return Swal.fire({
                icon: 'error', title: 'Error',
                text: 'No se pudieron cargar tus estadísticas. Intenta de nuevo.',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(10,5,25,0.98)', color: '#fff'
            });
        }

        const { total_referidos, compras_completadas, pendientes, ganancia_total_usdt, ganancia_mes_usdt, referidos_este_mes, lista } = stats;
        const mesActual = new Date().toLocaleString('es-VE', { month: 'long' }).replace(/^\w/, c => c.toUpperCase());

        // Renderizar lista de referidos
        const listaHTML = lista.length === 0
            ? `<div style="text-align:center;padding:20px;color:#666;font-size:0.85rem;">
                 <div style="font-size:2rem;margin-bottom:8px;">🌱</div>
                 Aún no tienes referidos. ¡Comparte tu link!
               </div>`
            : lista.slice(0, 10).map((r, i) => {
                const estado = r.claimed
                    ? `<span style="color:#00FF94;font-size:0.7rem;font-weight:700;background:rgba(0,255,148,0.1);border:1px solid rgba(0,255,148,0.3);border-radius:20px;padding:2px 8px;">✓ Compró</span>`
                    : `<span style="color:#FFD93D;font-size:0.7rem;font-weight:700;background:rgba(255,217,61,0.1);border:1px solid rgba(255,217,61,0.3);border-radius:20px;padding:2px 8px;">⏳ Pendiente</span>`;
                const fecha = r.registered
                    ? new Date(r.registered).toLocaleDateString('es-VE', { day:'2-digit', month:'short' })
                    : '—';
                const ganancia = r.claimed ? '+$0.05' : '';
                return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:6px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,rgba(157,0,255,0.4),rgba(0,240,255,0.3));display:flex;align-items:center;justify-content:center;font-size:0.85rem;font-weight:800;color:#fff;flex-shrink:0;">${i + 1}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.88rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.name}</div>
                        <div style="font-size:0.72rem;color:#666;margin-top:1px;">${fecha}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
                        ${estado}
                        ${ganancia ? `<span style="color:#00FF94;font-size:0.72rem;font-weight:700;">${ganancia}</span>` : ''}
                    </div>
                </div>`;
            }).join('');

        const masHTML = lista.length > 10
            ? `<div style="text-align:center;font-size:0.75rem;color:#666;padding:6px 0;">+${lista.length - 10} más...</div>`
            : '';

        // Porcentaje de conversión
        const conversionPct = total_referidos > 0 ? Math.round((compras_completadas / total_referidos) * 100) : 0;
        const barWidth = Math.min(conversionPct, 100);

        Swal.fire({
            width: '92%',
            background: 'rgba(8,4,20,0.99)',
            color: '#fff',
            showConfirmButton: false,
            showCloseButton: true,
            html: `
            <div style="font-family:'Montserrat',sans-serif;text-align:left;max-height:80vh;overflow-y:auto;padding-right:4px;">

                <!-- Encabezado -->
                <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="font-size:2rem;margin-bottom:6px;">📊</div>
                    <h2 style="margin:0;font-size:1.15rem;color:#fff;letter-spacing:0.5px;">Mi Dashboard de Referidos</h2>
                    <p style="margin:4px 0 0;font-size:0.75rem;color:#666;">Actualizado ahora mismo</p>
                </div>

                <!-- Tarjetas de stats principales -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">

                    <!-- Ganancias este mes -->
                    <div style="background:linear-gradient(135deg,rgba(0,255,148,0.12),rgba(0,240,255,0.06));border:1px solid rgba(0,255,148,0.3);border-radius:14px;padding:14px;position:relative;overflow:hidden;">
                        <div style="position:absolute;top:-10px;right:-10px;font-size:3rem;opacity:0.07;">💰</div>
                        <div style="font-size:0.68rem;color:#00FF94;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;">${mesActual}</div>
                        <div style="font-size:1.45rem;font-weight:900;color:#00FF94;line-height:1;">$${ganancia_mes_usdt}</div>
                        <div style="font-size:0.7rem;color:#aaa;margin-top:3px;">USDT ganados</div>
                        <div style="font-size:0.72rem;color:#555;margin-top:4px;">${referidos_este_mes} compra${referidos_este_mes !== 1 ? 's' : ''} este mes</div>
                    </div>

                    <!-- Ganancias totales -->
                    <div style="background:linear-gradient(135deg,rgba(157,0,255,0.15),rgba(0,240,255,0.06));border:1px solid rgba(157,0,255,0.3);border-radius:14px;padding:14px;position:relative;overflow:hidden;">
                        <div style="position:absolute;top:-10px;right:-10px;font-size:3rem;opacity:0.07;">🏆</div>
                        <div style="font-size:0.68rem;color:#9D00FF;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:6px;">Total histórico</div>
                        <div style="font-size:1.45rem;font-weight:900;color:#c264fe;line-height:1;">$${ganancia_total_usdt}</div>
                        <div style="font-size:0.7rem;color:#aaa;margin-top:3px;">USDT acumulados</div>
                        <div style="font-size:0.72rem;color:#555;margin-top:4px;">${compras_completadas} referido${compras_completadas !== 1 ? 's' : ''} convertido${compras_completadas !== 1 ? 's' : ''}</div>
                    </div>
                </div>

                <!-- Fila de métricas secundarias -->
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px;text-align:center;">
                        <div style="font-size:1.4rem;font-weight:900;color:#fff;">${total_referidos}</div>
                        <div style="font-size:0.65rem;color:#888;margin-top:2px;">Total invitados</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px;text-align:center;">
                        <div style="font-size:1.4rem;font-weight:900;color:#00FF94;">${compras_completadas}</div>
                        <div style="font-size:0.65rem;color:#888;margin-top:2px;">Compraron</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px;text-align:center;">
                        <div style="font-size:1.4rem;font-weight:900;color:#FFD93D;">${pendientes}</div>
                        <div style="font-size:0.65rem;color:#888;margin-top:2px;">Pendientes</div>
                    </div>
                </div>

                <!-- Barra de conversión -->
                <div style="margin-bottom:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:0.75rem;color:#aaa;font-weight:600;">Tasa de conversión</span>
                        <span style="font-size:0.85rem;font-weight:800;color:${conversionPct >= 50 ? '#00FF94' : conversionPct >= 20 ? '#FFD93D' : '#ff6b6b'};">${conversionPct}%</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.08);border-radius:99px;height:8px;overflow:hidden;">
                        <div style="width:${barWidth}%;height:100%;background:linear-gradient(90deg,${conversionPct >= 50 ? '#00FF94,#00d4aa' : conversionPct >= 20 ? '#FFD93D,#f5a623' : '#ff6b6b,#ff3d71'});border-radius:99px;transition:width 1s ease;"></div>
                    </div>
                    <div style="font-size:0.68rem;color:#555;margin-top:6px;">${compras_completadas} de ${total_referidos} invitados completaron una compra</div>
                </div>

                <!-- Lista de referidos -->
                <div style="margin-bottom:14px;">
                    <div style="font-size:0.75rem;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Tus Referidos</div>
                    ${listaHTML}
                    ${masHTML}
                </div>

                <!-- Motivación si hay pendientes -->
                ${pendientes > 0 ? `
                <div style="background:linear-gradient(135deg,rgba(255,217,61,0.08),rgba(255,107,107,0.05));border:1px solid rgba(255,217,61,0.25);border-radius:12px;padding:12px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start;">
                    <span style="font-size:1.3rem;flex-shrink:0;">💡</span>
                    <div>
                        <div style="font-size:0.8rem;font-weight:700;color:#FFD93D;margin-bottom:3px;">Tienes ${pendientes} amigo${pendientes !== 1 ? 's' : ''} que aún no ha recargado</div>
                        <div style="font-size:0.72rem;color:#aaa;">Recuérdales que tienen <strong style="color:#00FF94;">-3% de descuento</strong> esperándoles en su primera compra. ¡Mándales el link de nuevo!</div>
                    </div>
                </div>` : (total_referidos > 0 ? `
                <div style="background:linear-gradient(135deg,rgba(0,255,148,0.08),rgba(0,240,255,0.05));border:1px solid rgba(0,255,148,0.25);border-radius:12px;padding:12px;margin-bottom:14px;display:flex;gap:10px;align-items:center;">
                    <span style="font-size:1.3rem;">🏆</span>
                    <div style="font-size:0.8rem;font-weight:700;color:#00FF94;">¡100% de conversión! Todos tus referidos han comprado.</div>
                </div>` : '')}

                <!-- Botón compartir -->
                <button onclick="document.querySelector('.swal2-close')?.click(); setTimeout(() => { const uid = localStorage.getItem('ff_user_id'); if(uid) window.shareReferralLink(uid); }, 300);"
                    style="width:100%;background:linear-gradient(135deg,#9D00FF,#00F0FF);border:none;color:#fff;font-weight:800;font-size:0.95rem;padding:14px;border-radius:12px;cursor:pointer;font-family:'Montserrat',sans-serif;letter-spacing:0.5px;box-shadow:0 4px 20px rgba(157,0,255,0.4);transition:transform 0.2s;"
                    onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <i class="fa-solid fa-share-nodes" style="margin-right:8px;"></i>
                    Compartir mi Link y ganar más
                </button>
            </div>
            `,
            customClass: { popup: 'swal2-referral-dashboard' }
        });
    }

    loginTriggerBtn.addEventListener('click', async () => {
        let activeTab = 'login';
        
        const { value: result } = await Swal.fire({
            title: '👤 Mi Cuenta',
            html: `
                <div class="swal-tabs-container" style="display:flex; justify-content:space-around; border-bottom:2px solid rgba(255,255,255,0.1); margin-bottom:20px; font-family:'Montserrat', sans-serif;">
                    <button id="swal-tab-login" type="button" style="flex:1; background:none; border:none; color:#00F0FF; padding:10px; font-weight:800; font-size:0.95rem; cursor:pointer; border-bottom:3px solid #00F0FF; transition: all 0.3s ease; outline:none;">Iniciar Sesión</button>
                    <button id="swal-tab-register" type="button" style="flex:1; background:none; border:none; color:#aaa; padding:10px; font-weight:800; font-size:0.95rem; cursor:pointer; border-bottom:3px solid transparent; transition: all 0.3s ease; outline:none;">Registrarse</button>
                </div>

                <!-- Sección Iniciar Sesión -->
                <div id="swal-section-login" style="display:block; text-align:left; font-family:'Inter', sans-serif;">
                    <div style="margin-bottom:15px;">
                        <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">ID de Jugador (UID)</label>
                        <input id="swal-login-uid" type="text" class="swal2-input" placeholder="Ej: 12345678" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:45px; padding:0 15px; font-size:0.95rem;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">Contraseña</label>
                        <input id="swal-login-password" type="password" class="swal2-input" placeholder="Ingresa tu contraseña" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:45px; padding:0 15px; font-size:0.95rem;">
                    </div>
                </div>

                <!-- Sección Registrarse -->
                <div id="swal-section-register" style="display:none; text-align:left; font-family:'Inter', sans-serif;">
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">ID de Jugador (UID) <span style="color:#00F0FF;">*</span></label>
                        <input id="swal-reg-uid" type="text" class="swal2-input" placeholder="Ej: 12345678" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                        <small style="font-size:0.75rem; color:#666; display:block; margin-top:3px;">Se verificará que exista en Free Fire.</small>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                        <div>
                            <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">Nombre <span style="color:#00F0FF;">*</span></label>
                            <input id="swal-reg-nombre" type="text" class="swal2-input" placeholder="Tu nombre" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">Apellido <span style="color:#00F0FF;">*</span></label>
                            <input id="swal-reg-apellido" type="text" class="swal2-input" placeholder="Tu apellido" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">Teléfono WhatsApp <span style="color:#00F0FF;">*</span></label>
                        <input id="swal-reg-phone" type="text" inputmode="numeric" class="swal2-input" placeholder="Ej: 04121234567" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="font-size:0.8rem; color:#aaa; display:block; margin-bottom:5px;">Crea una Contraseña <span style="color:#00F0FF;">*</span></label>
                        <input id="swal-reg-password" type="password" class="swal2-input" placeholder="Mínimo 4 caracteres" style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar',
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            confirmButtonColor: '#9D00FF',
            didOpen: () => {
                const tabLogin = document.getElementById('swal-tab-login');
                const tabRegister = document.getElementById('swal-tab-register');
                const secLogin = document.getElementById('swal-section-login');
                const secRegister = document.getElementById('swal-section-register');

                tabLogin.addEventListener('click', () => {
                    activeTab = 'login';
                    tabLogin.style.color = '#00F0FF';
                    tabLogin.style.borderBottom = '3px solid #00F0FF';
                    tabRegister.style.color = '#aaa';
                    tabRegister.style.borderBottom = '3px solid transparent';
                    secLogin.style.display = 'block';
                    secRegister.style.display = 'none';
                    
                    const inp = document.getElementById('swal-login-uid');
                    if (inp) inp.focus();
                });

                tabRegister.addEventListener('click', () => {
                    activeTab = 'register';
                    tabRegister.style.color = '#00F0FF';
                    tabRegister.style.borderBottom = '3px solid #00F0FF';
                    tabLogin.style.color = '#aaa';
                    tabLogin.style.borderBottom = '3px solid transparent';
                    secRegister.style.display = 'block';
                    secLogin.style.display = 'none';
                    
                    const inp = document.getElementById('swal-reg-uid');
                    if (inp) inp.focus();
                });

                // Focus inicial
                const initialInp = document.getElementById('swal-login-uid');
                if (initialInp) initialInp.focus();
            },
            preConfirm: () => {
                if (activeTab === 'login') {
                    const uid = document.getElementById('swal-login-uid').value.trim();
                    const password = document.getElementById('swal-login-password').value;

                    if (!uid) {
                        Swal.showValidationMessage('Por favor ingresa tu ID de jugador');
                        return false;
                    }
                    if (!password) {
                        Swal.showValidationMessage('Por favor ingresa tu contraseña');
                        return false;
                    }

                    return { tab: 'login', uid, password };
                } else {
                    const uid = document.getElementById('swal-reg-uid').value.trim();
                    const nombre = document.getElementById('swal-reg-nombre').value.trim();
                    const apellido = document.getElementById('swal-reg-apellido').value.trim();
                    const phone = document.getElementById('swal-reg-phone').value.trim();
                    const password = document.getElementById('swal-reg-password').value;

                    if (!uid) {
                        Swal.showValidationMessage('Por favor ingresa tu ID de jugador (UID)');
                        return false;
                    }
                    if (!nombre) {
                        Swal.showValidationMessage('Por favor ingresa tu Nombre');
                        return false;
                    }
                    if (!apellido) {
                        Swal.showValidationMessage('Por favor ingresa tu Apellido');
                        return false;
                    }
                    if (!phone) {
                        Swal.showValidationMessage('Por favor ingresa tu Teléfono WhatsApp');
                        return false;
                    }
                    if (!password || password.length < 4) {
                        Swal.showValidationMessage('La contraseña debe tener al menos 4 caracteres');
                        return false;
                    }

                    return { tab: 'register', uid, nombre, apellido, phone, password };
                }
            }
        });

        if (!result) return;

        if (result.tab === 'login') {
            // PROCESO DE LOGIN
            Swal.fire({ 
                title: 'Verificando credenciales...', 
                allowOutsideClick: false, 
                didOpen: () => Swal.showLoading() 
            });

            try {
                const chkRes = await fetch(`${SERVER_URL}/api/check_password?uid=${result.uid}&pass=${encodeURIComponent(result.password)}`);
                const authRes = await chkRes.json();

                if (authRes && authRes.success) {
                    localStorage.setItem('ff_user_id', result.uid);
                    updateAccountUI(result.uid);
                    if (newUserBanner) newUserBanner.style.display = 'none';
                    playerInput.value = result.uid;
                    
                    Swal.fire({
                        icon: 'success',
                        title: `¡Bienvenido, ${authRes.name || result.uid}!`,
                        text: 'Has iniciado sesión con éxito.',
                        timer: 2000,
                        showConfirmButton: false,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de Inicio de Sesión',
                        text: authRes.message || 'ID o contraseña incorrectos.',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    });
                }
            } catch (e) {
                console.error('[LOGIN] Error:', e);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo conectar con el servidor.',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });
            }
        } else if (result.tab === 'register') {
            // PROCESO DE REGISTRO
            Swal.fire({ 
                title: 'Verificando con Garena...', 
                html: '<p style="color:#aaa;font-size:0.85rem;">Estamos validando tu ID en el juego...</p>',
                allowOutsideClick: false, 
                didOpen: () => Swal.showLoading() 
            });

            try {
                // 1. Validar ID en Garena
                const playerInfo = await checkPlayerId(result.uid);
                
                if (!playerInfo.found && playerInfo.networkError) {
                    return Swal.fire({
                        icon: 'warning',
                        title: '⚠️ Error de Conexión',
                        text: 'No se pudo verificar tu ID con Garena en este momento. Por favor, intenta de nuevo.',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    });
                }

                if (!playerInfo.found) {
                    return Swal.fire({
                        icon: 'error',
                        title: 'ID de Jugador no encontrado',
                        text: 'No pudimos verificar tu ID de jugador. Asegúrate de ingresar un ID real y activo.',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    });
                }

                // 2. ID verificado, proceder al registro
                Swal.fire({ 
                    title: 'Creando cuenta...', 
                    html: `<p style="color:#aaa;font-size:0.85rem;">Registrando a <strong>${playerInfo.name || 'Jugador'}</strong>...</p>`,
                    allowOutsideClick: false, 
                    didOpen: () => Swal.showLoading() 
                });

                const regRes = await fetch(`${SERVER_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid: result.uid,
                        name: result.nombre || playerInfo.name || 'Jugador',
                        apellido: result.apellido,
                        phone: result.phone,
                        password: result.password
                    })
                });

                const regData = await regRes.json();

                if (regData && regData.success) {
                    localStorage.setItem('ff_user_id', result.uid);
                    updateAccountUI(result.uid);
                    if (newUserBanner) newUserBanner.style.display = 'none';
                    playerInput.value = result.uid;

                    // Celebración con confetti
                    confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 },
                        colors: ['#00F0FF', '#9D00FF', '#ffd700']
                    });

                    Swal.fire({
                        icon: 'success',
                        title: '¡Registro Exitoso! 🏆💎',
                        html: `<p style="color:#fff;font-size:0.95rem;">¡Hola, <strong>${name}</strong>!<br>Tu cuenta ha sido creada y protegida correctamente. Ya estás listo para acumular $.</p>`,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    }).then(() => {
                        // Preguntar por notificaciones si no están concedidas
                        if ('Notification' in window && Notification.permission !== 'granted') {
                            Swal.fire({
                                title: '🔔 ¿Activar Notificaciones?',
                                text: 'Te enviaremos alertas al instante cuando tus recargas sean aprobadas y cuando ganes $.',
                                icon: 'info',
                                showCancelButton: true,
                                confirmButtonText: 'Sí, activar 🔔',
                                cancelButtonText: 'Más tarde',
                                confirmButtonColor: '#9D00FF',
                                cancelButtonColor: '#444',
                                background: 'rgba(20, 10, 35, 0.98)',
                                color: '#fff'
                            }).then(async (pushRes) => {
                                if (pushRes.isConfirmed) {
                                    try {
                                        const permission = await Notification.requestPermission();
                                        if (permission === 'granted') {
                                            await subscribeUser(result.uid);
                                        } else {
                                            Swal.fire({
                                                icon: 'warning',
                                                title: 'Permiso Denegado',
                                                text: 'Puedes activar las notificaciones más tarde presionando el ícono de la campana en tu Cuenta.',
                                                background: 'rgba(20, 10, 35, 0.98)',
                                                color: '#fff',
                                                confirmButtonColor: '#9D00FF'
                                            });
                                        }
                                    } catch (err) {
                                        console.error('Error al solicitar permiso de notificación:', err);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error al Registrarse',
                        text: regData.message || 'No se pudo completar el registro.',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    });
                }
            } catch (e) {
                console.error('[REGISTRO] Error:', e);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Ocurrió un error inesperado al procesar el registro.',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });
            }
        }
    });

    // Función para que el usuario establezca/cambie su contraseña
    async function promptSetPassword(uid) {
        const { value: newPass } = await Swal.fire({
            title: '🔐 Crear Contraseña',
            html: `
                <p style="font-size:0.85rem;color:#aaa;margin-bottom:10px;">ID: <strong>${uid}</strong></p>
                <input id="swal-set-pass1" type="password" class="swal2-input" placeholder="Nueva contraseña">
                <input id="swal-set-pass2" type="password" class="swal2-input" placeholder="Repetir contraseña" style="margin-top:8px;">
            `,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                const inp1 = document.getElementById('swal-set-pass1');
                const inp2 = document.getElementById('swal-set-pass2');
                if (inp1) {
                    inp1.focus();
                    inp1.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') inp2.focus();
                    });
                }
                if (inp2) {
                    inp2.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') Swal.clickConfirm();
                    });
                }
            },
            preConfirm: () => {
                const p1 = document.getElementById('swal-set-pass1').value;
                const p2 = document.getElementById('swal-set-pass2').value;
                if (!p1 || p1.length < 4) {
                    Swal.showValidationMessage('La contraseña debe tener al menos 4 caracteres');
                    return false;
                }
                if (p1 !== p2) {
                    Swal.showValidationMessage('Las contraseñas no coinciden');
                    return false;
                }
                return p1;
            }
        });

        if (newPass) {
            try {
                const res = await fetch(`${SERVER_URL}/api/set_password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid, password: newPass })
                });
                const result = await res.json();
                if (result.success) {
                    Swal.fire({ icon: 'success', title: '¡Contraseña creada!', text: 'Tu cuenta está protegida.', timer: 2000, showConfirmButton: false });
                } else {
                    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar la contraseña.' });
                }
            } catch (e) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar la contraseña.' });
            }
        }
    }

    // Gestión al hacer clic en el header de usuario (ya logueado)
    document.getElementById('user-display').addEventListener('click', async (e) => {
        if (e.target.closest('#logout-btn')) return;
        if (e.target.closest('#push-bell-btn')) return;
        const uid = localStorage.getItem('ff_user_id');
        if (!uid) return;

        const refLink = `${window.location.origin}${window.location.pathname}?ref=${uid}`;

        // Mostrar cargando mientras obtenemos el perfil actualizado del servidor
        Swal.fire({ 
            title: 'Cargando perfil...', 
            allowOutsideClick: false, 
            didOpen: () => Swal.showLoading() 
        });

        let userProfile = { name: 'Jugador', points: 0, cedula: '', phone: '' };
        try {
            const res = await fetch(`${SERVER_URL}/perfil?uid=${uid}`);
            const data = await res.json();
            if (data.success && data.user) {
                userProfile = data.user;
            }
        } catch (error) {
            console.error('Error al obtener perfil del usuario:', error);
        }

        await Swal.fire({
            title: '🎮 Perfil de Jugador',
            html: `
                <div class="profile-dashboard" style="text-align:left; font-family:'Inter', sans-serif;">
                    <!-- Cabecera del Perfil -->
                    <div style="display:flex; align-items:center; gap:15px; margin-bottom:20px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.08);">
                        <div style="width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg, #00F0FF, #9D00FF); display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:#fff; font-weight:800; text-shadow:0 0 10px rgba(255,255,255,0.5);">
                            ${(userProfile.name || 'J').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 style="margin:0; font-family:'Montserrat', sans-serif; font-size:1.15rem; color:#fff;">${userProfile.name || 'Jugador'}</h3>
                            <span style="font-size:0.75rem; color:#00F0FF; font-weight:700; text-transform:uppercase; letter-spacing:1px;"><i class="fa-solid fa-gamepad"></i> Verificado</span>
                        </div>
                    </div>

                    <!-- Datos de la Cuenta -->
                    <div style="display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:20px; font-size:0.85rem; color:#ccc;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                            <span style="color:#aaa;"><i class="fa-solid fa-id-card"></i> ID de Jugador:</span>
                            <strong style="color:#fff;">${uid}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; align-items:center;">
                            <span style="color:#aaa;"><i class="fa-solid fa-dollar-sign"></i> Cashback USDT:</span>
                            <span class="points-badge" style="margin:0; padding:4px 10px; font-size:0.8rem; background:rgba(0, 230, 118, 0.15); border:1px solid rgba(0, 230, 118, 0.4); display:inline-flex; align-items:center; gap:5px; color:#00e676; border-radius:20px; font-weight:700;"><i class="fa-solid fa-dollar-sign"></i> $${((userProfile.points || 0) * 0.003).toFixed(2)} USDT</span>
                        </div>
                    </div>

                    <!-- Enlace de Referido -->
                    <div style="background:rgba(0, 240, 255, 0.04); border:1px dashed rgba(0, 240, 255, 0.3); border-radius:10px; padding:12px; margin-bottom:20px; text-align:center;">
                        <p style="font-size:0.75rem; color:#aaa; margin-bottom:8px;">Gana <strong>+$0.05 USDT</strong> de cashback cuando un amigo se registre y compre con tu link.</p>
                        <button id="btn-share-ref" class="swal2-confirm swal2-styled" style="margin:0; width:100%; font-size:0.8rem; padding:8px 12px; background:linear-gradient(135deg, #00F0FF, #00B2FF); border-radius:8px; font-weight:700; border:none; color:#000; box-shadow:0 4px 12px rgba(0,240,255,0.25); cursor:pointer;">
                            <i class="fa-solid fa-share-nodes"></i> Compartir Link de Referido
                        </button>
                    </div>

                    <!-- Botones de Acción -->
                    <div style="display:grid; grid-template-columns:1fr; gap:10px;">
                        <button id="btn-logout-dashboard" style="background:rgba(255, 75, 43, 0.1); border:1px solid rgba(255, 75, 43, 0.3); color:#ff4b2b; padding:10px; border-radius:8px; font-size:0.8rem; font-weight:700; cursor:pointer; transition:all 0.3s; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <i class="fa-solid fa-right-from-bracket"></i> Cerrar Sesión
                        </button>
                    </div>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                // Compartir Link de Referido
                document.getElementById('btn-share-ref').addEventListener('click', () => {
                    const uid = localStorage.getItem('ff_user_id');
                    if (uid) window.shareReferralLink(uid);
                });

                // Cerrar Sesión
                document.getElementById('btn-logout-dashboard').addEventListener('click', () => {
                    Swal.close();
                    logoutBtn.click();
                });
            }
        });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('ff_user_id');
        updateAccountUI(null);
        location.reload();
    });

    // --- BOTÓN PERFIL (ícono usuario-lápiz en el header) ---
    const perfilBtn = document.getElementById('perfil-btn');
    if (perfilBtn) {
        perfilBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = localStorage.getItem('ff_user_id');
            if (!uid) return;

            // Solicitar contraseña antes de abrir el perfil
            Swal.fire({ title: 'Verificando seguridad...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                const authCheck = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}`);
                const authRes = await authCheck.json();

                if (authRes.success && authRes.hasPassword) {
                    const { value: enteredPassword } = await Swal.fire({
                        title: '🔐 Perfil Protegido',
                        html: `
                            <p style="font-size:0.9rem;color:#aaa;margin-bottom:15px;">Ingresa tu contraseña para acceder a tu perfil:</p>
                            <input id="swal-perfil-pass" type="password" class="swal2-input" placeholder="Tu contraseña">
                        `,
                        showCancelButton: true,
                        confirmButtonText: 'Ingresar',
                        cancelButtonText: 'Cancelar',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        didOpen: () => {
                            const inp = document.getElementById('swal-perfil-pass');
                            if (inp) {
                                inp.focus();
                                inp.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') Swal.clickConfirm();
                                });
                            }
                        },
                        preConfirm: () => {
                            const pass = document.getElementById('swal-perfil-pass').value;
                            if (!pass) {
                                Swal.showValidationMessage('Debes ingresar tu contraseña');
                                return false;
                            }
                            return pass;
                        }
                    });

                    if (!enteredPassword) return; // Cancelado

                    Swal.fire({ title: 'Validando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    const verifyRes = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}&pass=${encodeURIComponent(enteredPassword)}`);
                    const verifyData = await verifyRes.json();

                    if (!verifyData.success) {
                        Swal.fire({ icon: 'error', title: 'Error', text: 'Contraseña incorrecta. Inténtalo de nuevo.' });
                        return;
                    }
                } else if (authCheck.status !== 404) {
                    // Si el usuario existe pero no tiene contraseña (usuarios viejos), debería crear una
                    const { isConfirmed } = await Swal.fire({
                        title: '🛡️ Protege tu Cuenta',
                        text: 'Aún no tienes una contraseña. Para proteger tus $ y perfil, por favor crea una contraseña.',
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: 'Crear Contraseña',
                        cancelButtonText: 'Cancelar',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                    if (isConfirmed && typeof promptSetPassword === 'function') {
                        await promptSetPassword(uid);
                        return; // Detenemos aquí, que vuelva a entrar luego
                    } else {
                        return; // Si no crea, no entra
                    }
                }
            } catch (err) {
                console.error(err);
                Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo verificar la seguridad de la cuenta.' });
                return;
            }

            // Si pasa la contraseña, cargar datos actuales del perfil
            Swal.fire({ title: 'Cargando perfil...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let perfil = { name: '', apellido: '', phone: '' };
            try {
                const res = await fetch(`${SERVER_URL}/perfil?uid=${uid}`);
                const data = await res.json();
                if (data.success && data.user) {
                    perfil = data.user;
                }
            } catch (e) { console.error(e); }

            const { value: formData } = await Swal.fire({
                title: '👤 Mi Perfil',
                html: `
                    <div style="text-align:left; font-family:'Inter', sans-serif;">
                        <div style="background:rgba(0,240,255,0.05); border:1px solid rgba(0,240,255,0.15); border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:0.8rem; color:#aaa;">
                            <i class="fa-solid fa-gamepad" style="color:#00F0FF;"></i>
                            ID de Jugador: <strong style="color:#fff; font-family:monospace;">${uid}</strong>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                            <div>
                                <label style="font-size:0.78rem; color:#aaa; display:block; margin-bottom:4px;">Nombre <span style="color:#00F0FF;">*</span></label>
                                <input id="p-nombre" type="text" class="swal2-input" value="${perfil.name || ''}" placeholder="Tu nombre"
                                    style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                            </div>
                            <div>
                                <label style="font-size:0.78rem; color:#aaa; display:block; margin-bottom:4px;">Apellido <span style="color:#00F0FF;">*</span></label>
                                <input id="p-apellido" type="text" class="swal2-input" value="${perfil.apellido || ''}" placeholder="Tu apellido"
                                    style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:0.78rem; color:#aaa; display:block; margin-bottom:4px;"><i class="fa-brands fa-whatsapp" style="color:#25D366;"></i> Teléfono WhatsApp <span style="color:#00F0FF;">*</span></label>
                            <input id="p-phone" type="text" inputmode="numeric" class="swal2-input" value="${perfil.phone || ''}" placeholder="Ej: 04121234567"
                                style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                        </div>
                        <div style="margin-bottom:4px;">
                            <label style="font-size:0.78rem; color:#aaa; display:block; margin-bottom:4px;"><i class="fa-solid fa-key"></i> Nueva Contraseña <span style="color:#666; font-size:0.72rem;">(dejar vacío para no cambiar)</span></label>
                            <input id="p-password" type="password" class="swal2-input" placeholder="Mínimo 4 caracteres"
                                style="margin:0; width:100%; box-sizing:border-box; background:rgba(0,0,0,0.3); color:#fff; border:1px solid rgba(255,255,255,0.1); border-radius:8px; height:40px; padding:0 12px; font-size:0.9rem;">
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-floppy-disk"></i> Guardar Perfil',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                preConfirm: () => {
                    const nombre = document.getElementById('p-nombre').value.trim();
                    const apellido = document.getElementById('p-apellido').value.trim();
                    const phone = document.getElementById('p-phone').value.trim();
                    const password = document.getElementById('p-password').value;

                    if (!nombre) { Swal.showValidationMessage('El nombre es obligatorio'); return false; }
                    if (!apellido) { Swal.showValidationMessage('El apellido es obligatorio'); return false; }
                    if (!phone) { Swal.showValidationMessage('El teléfono WhatsApp es obligatorio'); return false; }
                    if (password && password.length < 4) { Swal.showValidationMessage('La contraseña debe tener al menos 4 caracteres'); return false; }

                    return { nombre, apellido, phone, password };
                }
            });

            if (!formData) return;

            Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                const body = {
                    uid,
                    name: formData.nombre,
                    apellido: formData.apellido,
                    phone: formData.phone
                };
                // Solo enviar contraseña si el usuario escribió una nueva
                if (formData.password) body.password = formData.password;

                const res = await fetch(`${SERVER_URL}/api/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();

                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '✅ Perfil Actualizado',
                        text: `¡Hola, ${formData.nombre} ${formData.apellido}! Tu perfil ha sido guardado correctamente.`,
                        timer: 2500,
                        showConfirmButton: false,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                } else {
                    Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'No se pudo guardar el perfil.', background: 'rgba(20, 10, 35, 0.98)', color: '#fff' });
                }
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'No se pudo conectar con el servidor.', background: 'rgba(20, 10, 35, 0.98)', color: '#fff' });
            }
        });
    }
    // --- FIN LÓGICA DE CUENTA ---

    // ─────────────────────────────────────────────────────────────────────────
    // MODO REGALO: "Recargar a otro ID"
    // El usuario logueado compra diamantes para OTRO jugador,
    // pero los puntos/cashback se acreditan a SU cuenta.
    // ─────────────────────────────────────────────────────────────────────────
    let giftingMode = false;         // ¿Estamos en modo regalo?
    let giftingTargetUid = null;     // UID del jugador que RECIBE los diamantes
    let giftingTargetName = null;    // Nombre del jugador receptor

    function setGiftingMode(uid, name) {
        giftingMode = true;
        giftingTargetUid = uid;
        giftingTargetName = name;

        // Mostrar banner informativo
        const banner = document.getElementById('gifting-mode-banner');
        const nameEl = document.getElementById('gifting-target-name');
        const idEl   = document.getElementById('gifting-target-id');
        if (banner)  banner.style.display  = 'block';
        if (nameEl)  nameEl.textContent    = name;
        if (idEl)    idEl.textContent      = uid;

        // Ocultar el botón para no activarlo dos veces
        const rechargeBtn = document.getElementById('recharge-other-btn');
        if (rechargeBtn) rechargeBtn.style.display = 'none';
    }

    function clearGiftingMode() {
        giftingMode = false;
        giftingTargetUid  = null;
        giftingTargetName = null;

        const banner = document.getElementById('gifting-mode-banner');
        if (banner) banner.style.display = 'none';

        const rechargeBtn = document.getElementById('recharge-other-btn');
        if (rechargeBtn) rechargeBtn.style.display = 'flex';
    }

    // Botón "Cancelar" dentro del banner de modo regalo
    const cancelGiftingBtn = document.getElementById('cancel-gifting-btn');
    if (cancelGiftingBtn) {
        cancelGiftingBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearGiftingMode();
        });
    }

    // Botón principal "Recargar a otro ID"
    const rechargeOtherBtn = document.getElementById('recharge-other-btn');
    if (rechargeOtherBtn) {
        rechargeOtherBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            const myUid = localStorage.getItem('ff_user_id');
            if (!myUid) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Inicia sesión primero',
                    text: 'Debes estar logueado con tu ID para poder regalar diamantes a otro jugador.',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });
                return;
            }

            // Paso 1: Pedir el ID del otro jugador
            const { value: targetId } = await Swal.fire({
                title: '<i class="fa-solid fa-people-arrows" style="color:#FFD93D;"></i> Recargar a otro ID',
                html: `
                    <p style="font-size:0.88rem; color:#aaa; margin-bottom:16px; line-height:1.5;">
                        Los diamantes irán al <strong style="color:#fff;">ID del otro jugador</strong>.<br>
                        <span style="color:#FFD93D;"><i class="fa-solid fa-star"></i> Los puntos/cashback se acreditan a <em>tu</em> cuenta.</span>
                    </p>
                    <input id="swal-gift-uid" type="text" class="swal2-input" inputmode="numeric"
                        placeholder="ID del jugador a regalar"
                        style="margin:0; width:100%; box-sizing:border-box;
                               background:rgba(0,0,0,0.3); color:#fff;
                               border:1px solid rgba(255,215,0,0.4); border-radius:8px;
                               height:48px; padding:0 14px; font-size:1.1rem;
                               font-family:monospace; text-align:center;">
                    <p id="swal-gift-uid-hint" style="font-size:0.75rem; color:rgba(255,255,255,0.35); margin-top:8px;">
                        Solo números · Puedes encontrar el ID en el perfil del juego
                    </p>
                `,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-magnifying-glass"></i> Verificar ID',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                didOpen: () => {
                    const inp = document.getElementById('swal-gift-uid');
                    if (inp) {
                        inp.focus();
                        inp.addEventListener('keydown', (ev) => {
                            if (ev.key === 'Enter') Swal.clickConfirm();
                        });
                    }
                },
                preConfirm: () => {
                    const val = document.getElementById('swal-gift-uid').value.trim().replace(/\D/g, '');
                    if (!val || val.length < 4) {
                        Swal.showValidationMessage('Ingresa un ID de jugador válido (mínimo 4 dígitos)');
                        return false;
                    }
                    if (val === myUid) {
                        Swal.showValidationMessage('No puedes regalarle a tu propio ID. Usa la compra normal.');
                        return false;
                    }
                    return val;
                }
            });

            if (!targetId) return; // Cancelado

            // Paso 2: Verificar que el ID existe en Garena
            Swal.fire({
                title: 'Verificando ID...',
                html: `
                    <div class="ff-loader-container">
                        <div class="ff-loader-text">Verificando ID del jugador...</div>
                        <div class="ff-progress-bar"><div class="ff-progress-fill"></div></div>
                    </div>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                background: 'rgba(20, 10, 35, 0.95)',
                color: '#fff'
            });

            try {
                const result = await checkPlayerId(targetId);

                if (!result.found && result.networkError) {
                    const { isConfirmed } = await Swal.fire({
                        icon: 'warning',
                        title: '⚠️ Error de Conexión',
                        html: `<p style="color:#eee;">No se pudo conectar con el servicio de verificación.<br>
                               <strong style="color:#ffd700;">El ID puede ser válido.</strong><br>
                               <span style="color:#aaa;font-size:0.85rem;">¿Deseas continuar de todos modos?</span></p>`,
                        showCancelButton: true,
                        confirmButtonText: '✅ Continuar igual',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#9D00FF',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                    if (!isConfirmed) return;
                    // Si el usuario decide continuar sin verificación, usar el ID sin nombre
                    setGiftingMode(targetId, `Jugador ${targetId}`);
                    // Mostrar paquetes para el modo regalo
                    _showGiftingPackages(targetId, `Jugador ${targetId}`);
                    return;
                }

                if (!result.found) {
                    Swal.fire({
                        icon: 'error',
                        title: '❌ ID No Válido',
                        html: `<p style="color:#eee;">El ID <strong style="color:#ff4b2b;">${targetId}</strong> no fue encontrado o es inválido.</p>
                               <p style="color:#aaa;font-size:0.82rem;">Verifica que el ID sea correcto e intenta de nuevo.</p>`,
                        confirmButtonText: '🔄 Intentar de nuevo',
                        confirmButtonColor: '#9D00FF',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                    return;
                }

                // ID válido — activar modo regalo
                const targetName = result.name || `Jugador ${targetId}`;
                Swal.close();

                setGiftingMode(targetId, targetName);
                _showGiftingPackages(targetId, targetName);

            } catch (err) {
                console.error('[GIFTING] Error verificando ID:', err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error Inesperado',
                    text: 'No se pudo verificar el ID. Intenta de nuevo.',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });
            }
        });
    }

    // Mostrar la sección de paquetes apuntando al jugador receptor
    function _showGiftingPackages(targetUid, targetName) {
        // Actualizar el display de nombre (aunque sea temporal, para que el recibo sea correcto)
        const nameDisplay = document.getElementById('player-name-display');
        if (nameDisplay) nameDisplay.innerText = targetName;

        // Mostrar paquetes
        document.getElementById('packages-section').style.display = 'block';
        document.querySelector('.main-container').classList.add('expanded');
        document.querySelector('.input-group').style.display = 'none';
        document.getElementById('verify-btn').style.display = 'none';

        // Scroll suave a los paquetes
        const pkgSection = document.getElementById('packages-section');
        if (pkgSection) setTimeout(() => pkgSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
    // ─────────────────────────────────────────────────────────────────────────


    favoritesBtn.addEventListener('click', () => {
        const favorites = JSON.parse(localStorage.getItem('ff_favorites') || '[]');
        if (favorites.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Favoritos Vacíos',
                text: 'No tienes IDs guardados. Verifica un ID y toca la estrella para guardarlo.',
                background: 'rgba(20, 10, 35, 0.95)',
                color: '#fff',
                confirmButtonColor: '#9D00FF'
            });
            return;
        }

        let favHtml = '<div class="fav-list" style="max-height: 300px; overflow-y: auto;">';
        favorites.forEach((fav, index) => {
            favHtml += `
                <div class="fav-item" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 12px 0;">
                    <div style="cursor: pointer; flex: 1;" onclick="window.loadFavorite('${fav.id}')">
                        <p style="margin: 0; font-weight: 700; color: #fff; text-align: left;">${fav.name}</p>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--secondary); text-align: left;">${fav.id}</p>
                    </div>
                    <button onclick="window.removeFavorite(${index})" style="background:transparent; border:none; color:#ff4b2b; cursor:pointer; padding: 5px 10px;">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
        });
        favHtml += '</div>';

        Swal.fire({
            title: '<i class="fa-solid fa-star" style="color: #ffd700;"></i> Mis Favoritos',
            html: favHtml,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            showConfirmButton: false,
            showCloseButton: true,
            width: '400px'
        });
    });

    window.loadFavorite = (id) => {
        Swal.close();
        playerInput.value = id;
        verifyBtn.click(); // Esto llevará directo a recargas
    };

    window.removeFavorite = (index) => {
        const favorites = JSON.parse(localStorage.getItem('ff_favorites') || '[]');
        favorites.splice(index, 1);
        localStorage.setItem('ff_favorites', JSON.stringify(favorites));
        favoritesBtn.click(); // Recargar modal
    };

    addFavoriteBtn.addEventListener('click', () => {
        const currentName = document.getElementById('player-name-display').innerText;
        const currentId = playerInput.value;
        const favorites = JSON.parse(localStorage.getItem('ff_favorites') || '[]');
        
        if (favorites.some(f => f.id === currentId)) {
            Swal.fire({ icon: 'info', title: 'Ya existe', text: 'Este ID ya está en tus favoritos.', timer: 2000, showConfirmButton: false });
            return;
        }

        favorites.push({ id: currentId, name: currentName });
        localStorage.setItem('ff_favorites', JSON.stringify(favorites));
        
        addFavoriteBtn.innerHTML = '<i class="fa-solid fa-star"></i>'; // Cambiar a estrella llena
        Swal.fire({ icon: 'success', title: 'Guardado', text: 'ID añadido a favoritos.', timer: 1500, showConfirmButton: false });
    });

    // Inicializar Precios
    const updatePrices = () => {
        const rateDisplay = document.getElementById('current-rate');
        if (rateDisplay) rateDisplay.innerText = DOLAR_RATE.toFixed(2);
    };
    updatePrices();

    // Cargar últimas recargas aprobadas en la marquesina
    const loadRecentReloads = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/recientes`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                const text = data.map(r => {
                    if (r.type === 'canje') {
                        return `🎁 ${r.name} CANJEÓ ${r.pack} diamantes con sus $!`;
                    }
                    return `✅ ${r.name} recargó ${r.pack} diamantes`;
                }).join(' | ');
                recentReloadsText = `ÚLTIMAS COMPRAS: ${text} | ¡Únete a los miles de jugadores que confían en nosotros!`;
            } else {
                recentReloadsText = "¡BIENVENIDOS AL CENTRO DE RECARGAS! – Selecciona tu paquete y recibe tus diamantes al instante.";
            }
            updateMarqueeDisplay();
        } catch (e) {
            console.error('Error cargando recientes:', e);
        }
    };
    loadRecentReloads();
    setInterval(loadRecentReloads, 30000); // Actualizar cada 30 segundos

    // ===== SISTEMA DE ALERTAS FOMO (Compras en Vivo) =====
    (function initFOMO() {
        // Crear el contenedor de notificaciones
        const fomoEl = document.createElement('div');
        fomoEl.id = 'fomo-toast';
        fomoEl.innerHTML = `
            <div class="fomo-icon">🔥</div>
            <div class="fomo-body">
                <div class="fomo-title" id="fomo-title"></div>
                <div class="fomo-sub" id="fomo-sub"></div>
            </div>
            <button class="fomo-close" id="fomo-close" title="Cerrar">✕</button>
        `;
        document.body.appendChild(fomoEl);

        document.getElementById('fomo-close').addEventListener('click', () => {
            fomoEl.classList.remove('fomo-show');
        });

        let fomoQueue = [];
        let fomoTimer = null;

        function maskFomoName(name) {
            if (!name || name.length < 3) return name || 'Un jugador';
            return name.charAt(0).toUpperCase() + '*'.repeat(Math.min(name.length - 2, 3)) + name.charAt(name.length - 1).toUpperCase();
        }

        function getRelativeTime(timeStr) {
            // timeStr viene como "HH:MM AM/PM DD/MM/YYYY" o similar
            // Intentamos interpretarlo; si falla usamos tiempos genéricos
            const opts = ['hace 1 min', 'hace 2 min', 'hace 5 min', 'hace 8 min', 'hace 12 min', 'hace 18 min', 'hace 25 min'];
            return opts[Math.floor(Math.random() * opts.length)];
        }

        function showFomoToast(item) {
            const titleEl = document.getElementById('fomo-title');
            const subEl = document.getElementById('fomo-sub');
            if (!titleEl || !subEl) return;

            const name = maskFomoName(item.name);
            const when = getRelativeTime(item.time);

            // Variador de paquetes para marketing (Efecto FOMO de paquetes altos)
            let displayPack = item.pack;
            if (displayPack && displayPack.includes('100')) {
                // 60% de probabilidad de mostrar un paquete más alto para animar compras grandes
                if (Math.random() > 0.4) {
                    const marketingPacks = ['310 + 31', '520 + 52', '1060 + 106', '310 + 31', '520 + 52', '2180 + 218'];
                    displayPack = marketingPacks[Math.floor(Math.random() * marketingPacks.length)];
                }
            }

            if (item.type === 'canje') {
                fomoEl.querySelector('.fomo-icon').textContent = '🎁';
                titleEl.textContent = `${name} canjeó ${displayPack} 💎`;
                subEl.textContent = `con sus $ acumulados · ${when}`;
            } else {
                fomoEl.querySelector('.fomo-icon').textContent = '🔥';
                titleEl.textContent = `${name} compró ${displayPack} 💎`;
                subEl.textContent = `recarga exitosa · ${when}`;
            }

            fomoEl.classList.add('fomo-show');

            // Auto-ocultar después de 5 segundos
            clearTimeout(fomoTimer);
            fomoTimer = setTimeout(() => {
                fomoEl.classList.remove('fomo-show');
            }, 5000);
        }

        async function fetchAndQueueFomo() {
            try {
                const res = await fetch(`${SERVER_URL}/recientes`);
                const data = await res.json();
                if (data && data.length > 0) {
                    fomoQueue = [...data]; // Rellenar cola con datos reales
                }
            } catch (e) { /* silent */ }
        }

        function showNextFomo() {
            if (fomoQueue.length === 0) return;
            // Tomar uno aleatorio de la cola
            const idx = Math.floor(Math.random() * fomoQueue.length);
            showFomoToast(fomoQueue[idx]);
        }

        // Inicializar: cargar datos y luego mostrar la primera notificación a los 8 segundos
        fetchAndQueueFomo();
        setTimeout(() => {
            showNextFomo();
            // Seguir mostrando cada 20-35 segundos aleatoriamente
            function scheduleNext() {
                const delay = (Math.random() * 15000) + 20000; // entre 20s y 35s
                setTimeout(() => {
                    if (fomoQueue.length > 0) showNextFomo();
                    scheduleNext();
                }, delay);
            }
            scheduleNext();
        }, 8000);

        // Re-cargar datos frescos cada 2 minutos
        setInterval(fetchAndQueueFomo, 120000);
    })();


    // Permitir verificar presionando Enter
    playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyBtn.click();
    });
    const zoneInput = document.getElementById('zone-id');
    if (zoneInput) {
        zoneInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') verifyBtn.click();
        });
    }

    verifyBtn.addEventListener('click', async () => {
        // ── Roblox no requiere ID: mostrar paquetes directamente ──
        if (currentJuego === 'roblox') {
            document.querySelector('.input-group').style.display = 'none';
            const zoneContainer = document.getElementById('zone-id-container');
            if (zoneContainer) zoneContainer.style.display = 'none';
            document.getElementById('verify-btn').style.display = 'none';
            document.getElementById('welcome-section').style.display = 'none';
            document.getElementById('packages-section').style.display = 'block';
            document.querySelector('.main-container').classList.add('expanded');
            return;
        }

        let uid = playerInput.value.trim();
        const zoneVal = zoneInput ? zoneInput.value.trim() : '';

        if (currentJuego === 'mobilelegends') {
            if (!uid || !zoneVal) {
                Swal.fire({ icon: 'warning', title: 'Campos Incompletos', text: 'Por favor ingresa tanto el User ID como el Zone ID.', confirmButtonText: 'OK' });
                return;
            }
            uid = `${uid} (${zoneVal})`;
        } else {
            if (!uid) {
                Swal.fire({ icon: 'warning', title: 'Campo Vacío', text: 'Ingresa un ID.', confirmButtonText: 'OK' });
                return;
            }
        }

        // Verificación normal con Garena (sin pedir contraseña para compras)
        Swal.fire({
            title: 'Validando ID...',
            html: `
                <div class="ff-loader-container">
                    <div class="ff-loader-text">Verificando ID del jugador...</div>
                    <div class="ff-progress-bar">
                        <div class="ff-progress-fill"></div>
                    </div>
                </div>
            `,
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'rgba(20, 10, 35, 0.95)',
            color: '#fff'
        });

        try {
            const result = await checkPlayerId(uid);

            if (!result.found && result.networkError) {
                // Error de red / timeout — no bloquear, pedir reintento
                Swal.fire({
                    icon: 'warning',
                    title: '⚠️ Error de Conexión',
                    html: `
                        <p style="color:#eee; font-size:0.95rem; margin-bottom:10px;">
                            No se pudo conectar con el servidor del juego.<br>
                            <strong style="color:#ffd700;">Tu ID puede ser válido.</strong>
                        </p>
                        <p style="color:#aaa; font-size:0.82rem;">
                            Por favor verifica tu conexión a internet e intenta de nuevo.
                        </p>
                    `,
                    confirmButtonText: '🔄 Intentar de nuevo',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    allowOutsideClick: true
                });
                return;
            }

            if (!result.found) {
                // ID definitivamente no existe en Garena — bloquear acceso
                if (playerInput) {
                    playerInput.classList.add('input-shake');
                    setTimeout(() => playerInput.classList.remove('input-shake'), 600);
                    playerInput.focus();
                }
                Swal.fire({
                    icon: 'error',
                    title: '❌ ID No Válido',
                    html: `
                        <p style="color:#eee; font-size:0.95rem; margin-bottom:10px;">
                            El ID <strong style="color:#ff4b2b;">${uid}</strong> no fue encontrado en los servidores del juego.
                        </p>
                        <p style="color:#aaa; font-size:0.82rem;">
                            ⚠️ Verifica que el ID sea correcto e intenta de nuevo.<br>
                            <span style="color:rgba(255,255,255,0.4); font-size:0.75rem;">Puedes encontrar tu ID en tu perfil dentro del juego.</span>
                        </p>
                    `,
                    confirmButtonText: '🔄 Intentar de nuevo',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    allowOutsideClick: true
                });
                return;
            }

            const playerName = result.name;

            if (playerName) {
                // --- TÉRMINOS Y CONDICIONES ---
                const { isConfirmed: acceptedTerms } = await Swal.fire({
                    title: '📜 TÉRMINOS Y CONDICIONES',
                    html: `
                        <div style="text-align: left; font-size: 0.85rem; line-height: 1.4; color: #eee; max-height: 300px; overflow-y: auto;">
                            <p style="color: var(--secondary); font-weight: 800; margin-bottom: 5px; font-size: 0.9rem;">💰 SOBRE EL PAGO</p>
                            <p style="margin-bottom: 12px; color: #aaa;">Debe pagar exactamente el monto que indica la página para el producto que seleccione. No pague sin revisar el monto antes.</p>
                            
                            <p style="color: var(--secondary); font-weight: 800; margin-bottom: 5px; font-size: 0.9rem;">⏰ REPORTE INMEDIATO</p>
                            <p style="margin-bottom: 12px; color: #aaa;">Debe reportar su pago al momento de realizarlo. Los pagos de días anteriores NO son válidos y no serán procesados.</p>
                            
                            <p style="color: #FF3D71; font-weight: 800; margin-bottom: 5px; font-size: 0.9rem;">⚠️ IMPORTANTE</p>
                            <p style="color: #aaa; margin-bottom: 12px;">No se realizan reembolsos ni se aceptan reclamos por errores del usuario. Verifique su ID de jugador y el producto antes de confirmar.</p>
                            
                            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0;">
                            <p style="text-align: center; font-weight: 700; color: #fff;">He leído y entiendo las condiciones del servicio</p>
                        </div>
                    `,
                    confirmButtonText: 'Aceptar y continuar',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    showCloseButton: false
                });

                if (!acceptedTerms) {
                    resetUI();
                    return;
                }

                Swal.close();
                
                // Guardar como último ID usado
                localStorage.setItem('ff_last_id', uid);
                localStorage.setItem('ff_user_id', uid); // Auto-login
                loadLastIdBtn.style.display = 'block';

                // Mostrar sección de paquetes
                document.getElementById('packages-section').style.display = 'block';
                document.querySelector('.main-container').classList.add('expanded');
                
                // Ocultar input y boton, mostrar bienvenida
                document.querySelector('.input-group').style.display = 'none';
                verifyBtn.style.display = 'none';
                
                const welcomeSection = document.getElementById('welcome-section');
                document.getElementById('player-name-display').innerText = playerName;
                
                updateAccountUI(uid);
                welcomeSection.style.display = 'block';

                // Cargar puntos del usuario
                loadUserPoints(uid);

                // ✅ AUTO-CARGAR historial de compras en tiempo real
                fetchPlayerHistory(uid);


            }
        } catch (error) {
            console.error('Error inesperado en verificación ID:', error);
            resetUI();
            Swal.fire({
                icon: 'error',
                title: 'Error Inesperado',
                text: 'Ocurrió un error al verificar el ID. Por favor intenta de nuevo.',
                confirmButtonText: '🔄 Reintentar',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });
        }
    });

    // Lógica de selección de paquetes (Encapsulada para recarga dinámica)
    const buyBtn = document.getElementById('buy-btn');
    let selectedPackage = null;
    let selectedQty = 1;
    if (typeof selectedGame === 'undefined') window.selectedGame = null;
    if (typeof selectedPack === 'undefined') window.selectedPack = null;
    if (typeof selectedPriceUsdt === 'undefined') window.selectedPriceUsdt = null;

    const qtyValueDisplay = document.getElementById('qty-value');
    const totalPreviewUsdt = document.getElementById('total-preview-usdt');
    const totalPreviewBs = document.getElementById('total-preview-bs');
    const quantitySection = document.getElementById('quantity-section');
    
    function updateTotalsPreview() {
        if (!selectedPackage) return;
        const selectedCard = document.querySelector('.package-card.selected');
        let rawPriceUSDT = 0;
        if (selectedCard && selectedCard.dataset && selectedCard.dataset.price) {
            rawPriceUSDT = parseFloat(selectedCard.dataset.price) || 0;
        } else if (selectedPackage && selectedPackage.price) {
            rawPriceUSDT = parseFloat(selectedPackage.price) || 0;
        }
        if (!rawPriceUSDT) return;
        
        const currentRate = (typeof DOLAR_RATE !== 'undefined' && DOLAR_RATE > 0) ? DOLAR_RATE : 635.00;
        const discountMult = window.referralDiscountActive ? 0.97 : 1;
        const priceUSDT = rawPriceUSDT * discountMult;
        const totalUSDT = (priceUSDT * selectedQty).toFixed(2);
        const totalBs = (priceUSDT * selectedQty * currentRate).toFixed(2).replace('.', ',');
        
        if (window.referralDiscountActive) {
            const originalUSDT = (rawPriceUSDT * selectedQty).toFixed(2);
            totalPreviewUsdt.innerHTML = `<span style="text-decoration:line-through;color:#888;font-size:0.9em;">${originalUSDT}</span> <span style="color:#00FF94;">${totalUSDT} USDT</span> <span style="background:#00FF94;color:#000;border-radius:4px;padding:1px 5px;font-size:0.7em;font-weight:700;">-3%</span>`;
        } else {
            totalPreviewUsdt.innerText = `${totalUSDT} USDT`;
        }
        totalPreviewBs.innerText = `${totalBs} Bs`;
        
        qtyValueDisplay.innerText = selectedQty;
    }

    document.getElementById('qty-minus').addEventListener('click', () => {
        if (selectedQty > 1) {
            selectedQty--;
            updateTotalsPreview();
        }
    });

    document.getElementById('qty-plus').addEventListener('click', () => {
        if (!selectedPackage) return;
        const stockCount = 99; // Límite razonable por compra, sin depender del stock del almacén
        if (selectedQty < stockCount) {
            selectedQty++;
            updateTotalsPreview();
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Límite de compra',
                text: `Puedes comprar hasta 99 paquetes por pedido.`,
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });
        }
    });

    function initPackageEvents() {
        const packageCards = document.querySelectorAll('.package-card');
        const floatBar   = document.getElementById('float-cta-bar');
        const floatDiams = document.getElementById('float-cta-diamonds');
        const floatPrice = document.getElementById('float-cta-price');
        const guideToast = document.getElementById('guide-toast');
        let toastTimer   = null;

        function showFloatCTA(card) {
            const rawPriceUSDT = parseFloat(card.dataset.price) * selectedQty;
            const discountMult = window.referralDiscountActive ? 0.97 : 1;
            const priceUSDT = rawPriceUSDT * discountMult;
            const priceBS   = (priceUSDT * DOLAR_RATE).toFixed(2).replace('.', ',');
            const totalAmt  = parseInt(card.dataset.amount) + parseInt(card.dataset.bonus || 0);

            if (floatDiams) floatDiams.textContent = `💎 ${totalAmt.toLocaleString()} diamantes`;
            if (floatPrice) {
                if (window.referralDiscountActive) {
                    const origBS = (rawPriceUSDT * DOLAR_RATE).toFixed(2).replace('.', ',');
                    floatPrice.innerHTML = `<span style="text-decoration:line-through;opacity:0.6;font-size:0.85em;">${origBS}</span> ${priceBS} Bs <span style="background:#00FF94;color:#000;border-radius:3px;padding:1px 4px;font-size:0.7em;font-weight:700;">-3%</span>`;
                } else {
                    floatPrice.textContent = `${priceBS} Bs`;
                }
            }

            // Mostrar barra flotante
            if (floatBar) {
                floatBar.style.display = 'block';
                requestAnimationFrame(() => floatBar.classList.add('visible'));
                document.body.classList.add('float-cta-active');
            }

            // Toast guía (solo las primeras veces)
            if (guideToast) {
                clearTimeout(toastTimer);
                guideToast.style.display = 'block';
                requestAnimationFrame(() => guideToast.classList.add('show'));
                toastTimer = setTimeout(() => {
                    guideToast.classList.remove('show');
                    setTimeout(() => { guideToast.style.display = 'none'; }, 400);
                }, 3000);
            }
        }

        packageCards.forEach(card => {
            card.addEventListener('click', () => {
                // Quitar selección previa
                packageCards.forEach(c => c.classList.remove('selected'));
                
                // Seleccionar actual
                card.classList.add('selected');
                selectedPackage = {
                    amount: card.dataset.amount,
                    bonus: card.dataset.bonus,
                    price: card.dataset.price
                };
                
                // Resetear cantidad
                selectedQty = 1;
                if (quantitySection) quantitySection.style.display = 'none';
                updateTotalsPreview();
                
                // Habilitar botón de compra estático y actualizar texto
                buyBtn.disabled = false;
                buyBtn.innerHTML = '<i class="fa-solid fa-arrow-right" style="margin-right:6px;"></i> Continuar Pedido';

                // Actualizar automáticamente el campo de monto en Pago Móvil
                const priceUSDT = parseFloat(card.dataset.price);
                const priceBS = (priceUSDT * DOLAR_RATE).toFixed(2).replace('.', ',');
                const amountInput = document.getElementById('amount-pagomovil');
                if (amountInput) amountInput.value = `${priceBS} Bs`;

                // Mostrar barra flotante con info del paquete
                showFloatCTA(card);
            });
        });
    }

    function goToPayment() {
        if (!selectedPackage) return;
        // Ocultar barra flotante
        const floatBar = document.getElementById('float-cta-bar');
        if (floatBar) {
            floatBar.classList.remove('visible');
            setTimeout(() => { floatBar.style.display = 'none'; }, 400);
            document.body.classList.remove('float-cta-active');
        }
        const paymentSection = document.getElementById('payment-section');
        document.getElementById('packages-section').style.display = 'none';
        paymentSection.style.display = 'block';

        // Auto-seleccionar Pago Móvil por defecto
        const pmCard = document.querySelector('.payment-method-card[data-method="pagomovil"]');
        if (pmCard) {
            pmCard.click();
        }

        // Scroll exacto: compensa la cabecera fija (banner ~36px + barra de acciones ~46px + margen)
        // para que "MÉTODO DE PAGO" quede visible justo debajo de los botones fijos
        setTimeout(() => {
            if (paymentSection) {
                const FIXED_HEADER_HEIGHT = 90; // px de cabecera fija total
                const rect = paymentSection.getBoundingClientRect();
                const absoluteTop = rect.top + window.pageYOffset - FIXED_HEADER_HEIGHT;
                window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
            }
        }, 60);
    }

    buyBtn.addEventListener('click', goToPayment);

    // Botón flotante hace lo mismo
    const floatCtaBtn = document.getElementById('float-cta-btn');
    if (floatCtaBtn) floatCtaBtn.addEventListener('click', goToPayment);

    // Lógica de Métodos de Pago
    const paymentCards = document.querySelectorAll('.payment-method-card');
    const finishBtn = document.getElementById('finish-btn');
    const backBtn = document.getElementById('back-btn');
    let selectedMethod = null;

    paymentCards.forEach(card => {
        card.addEventListener('click', () => {
            paymentCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedMethod = card.dataset.method;

            // Mostrar detalles correspondientes
            document.getElementById('details-pagomovil').style.display = selectedMethod === 'pagomovil' ? 'block' : 'none';
            document.getElementById('details-binance').style.display = selectedMethod === 'binance' ? 'block' : 'none';
            const detailsBanesco = document.getElementById('details-pagomovil_banesco');
            if (detailsBanesco) detailsBanesco.style.display = selectedMethod === 'pagomovil_banesco' ? 'block' : 'none';
            
            // Llenar montos automáticamente (aplicar descuento del 3% si es referido en primera compra)
            const selectedCardPayment = document.querySelector('.package-card.selected');
            let basePricePayment = 0;
            if (selectedCardPayment && selectedCardPayment.dataset && selectedCardPayment.dataset.price) {
                basePricePayment = parseFloat(selectedCardPayment.dataset.price) || 0;
            } else if (selectedPackage && selectedPackage.price) {
                basePricePayment = parseFloat(selectedPackage.price) || 0;
            } else if (typeof selectedPriceUsdt !== 'undefined' && selectedPriceUsdt) {
                basePricePayment = parseFloat(selectedPriceUsdt) || 0;
            }
            const rawPricePayment = basePricePayment * (selectedQty || 1);
            const discountMultPayment = window.referralDiscountActive ? 0.97 : 1;
            let priceUSDT = rawPricePayment * discountMultPayment;
            if (window.appliedCoupon && window.appliedCoupon.valid && window.appliedCoupon.final_amount !== undefined) {
                priceUSDT = window.appliedCoupon.final_amount;
            }
            const currentRate = (typeof DOLAR_RATE !== 'undefined' && DOLAR_RATE > 0) ? DOLAR_RATE : 635.00;
            const priceBS = (priceUSDT * currentRate).toFixed(2);
            
            const pmAmt = document.getElementById('amount-pagomovil');
            if (pmAmt) pmAmt.value = `${priceBS.replace('.', ',')} Bs`;
            const banescoAmt = document.getElementById('amount-pagomovil_banesco');
            if (banescoAmt) banescoAmt.value = `${priceBS.replace('.', ',')} Bs`;
            const binAmt = document.getElementById('amount-binance');
            if (binAmt) binAmt.value = `${priceUSDT.toFixed(2)} USDT`;

            checkFinishButton();
        });
    });

    const refPagoMovil = document.getElementById('ref-pagomovil');
    const refBanesco   = document.getElementById('ref-pagomovil_banesco');
    const refBinance = document.getElementById('ref-binance');
    const whatsappNumber = document.getElementById('whatsapp-number');
    const countryCode = document.getElementById('country-code');

    // Cargar número de WhatsApp guardado anteriormente de forma persistente
    const savedWaNum = localStorage.getItem('ff_last_wa_num');
    const savedWaCode = localStorage.getItem('ff_last_wa_code');
    if (savedWaNum && whatsappNumber) {
        whatsappNumber.value = savedWaNum;
    }
    if (savedWaCode && countryCode) {
        countryCode.value = savedWaCode;
    }

    refPagoMovil.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, ''); // Solo números
        e.target.value = val;
        checkFinishButton();
    });

    if (refBanesco) {
        refBanesco.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, ''); // Solo números
            checkFinishButton();
        });
    }

    refBinance.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, ''); // Solo números
        checkFinishButton();
    });

    whatsappNumber.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, ''); // Solo números
        localStorage.setItem('ff_last_wa_num', e.target.value);
        checkFinishButton();
    });

    if (countryCode) {
        countryCode.addEventListener('change', (e) => {
            localStorage.setItem('ff_last_wa_code', e.target.value);
        });
    }

    function checkFinishButton() {
        // El botón ya no se desactiva para poder mostrar los mensajes de error al hacer clic
        finishBtn.disabled = false;
    }

    // ─── APLICAR CÓDIGO DE DESCUENTO EN CHECKOUT ─────────────────────────────
    window.appliedCoupon = null;

    window.applyCouponCode = async function() {
        const input = document.getElementById('coupon-code-input');
        const msgEl = document.getElementById('coupon-message');
        if (!input || !msgEl) return;

        const code = input.value.trim().toUpperCase();
        const uid = localStorage.getItem('ff_user_id') || document.getElementById('player-id')?.value.trim();

        if (!code) {
            msgEl.style.display = 'block';
            msgEl.style.color = '#FF3D71';
            msgEl.innerHTML = '⚠️ Por favor ingresa un código de descuento.';
            return;
        }

        if (!uid) {
            msgEl.style.display = 'block';
            msgEl.style.color = '#FF3D71';
            msgEl.innerHTML = '⚠️ Debes ingresar o consultar tu ID de jugador primero.';
            return;
        }

        const selectedCard = document.querySelector('.package-card.selected');
        let basePriceUsdt = 0;
        if (selectedCard && selectedCard.dataset && selectedCard.dataset.price) {
            basePriceUsdt = parseFloat(selectedCard.dataset.price) || 0;
        } else if (typeof selectedPriceUsdt !== 'undefined' && selectedPriceUsdt) {
            basePriceUsdt = parseFloat(selectedPriceUsdt) || 0;
        } else if (selectedPackage && selectedPackage.price) {
            basePriceUsdt = parseFloat(selectedPackage.price) || 0;
        }
        const totalBaseUsdt = basePriceUsdt * (selectedQty || 1);

        msgEl.style.display = 'block';
        msgEl.style.color = '#FFD93D';
        msgEl.innerHTML = '⏳ Validando código de descuento...';

        try {
            const res = await fetch(`${SERVER_URL}/api/coupons/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, uid, amount: totalBaseUsdt })
            });
            const data = await res.json();

            if (data.success && data.valid) {
                window.appliedCoupon = data;
                msgEl.style.color = '#00FF94';
                msgEl.innerHTML = `🎉 <strong>¡Código ${data.code} APLICADO!</strong><br>${data.discount_percent}% de descuento en tu 1era recarga (-$${data.savings} USDT ahorro).<br>Nuevo total: <strong style="font-size:0.95rem;color:#00FF94;">$${data.final_amount} USDT</strong>.`;

                // Recalcular montos mostrados en Pago Móvil y Binance Pay
                const finalBs = (data.final_amount * DOLAR_RATE).toFixed(2);
                const pmAmt = document.getElementById('amount-pagomovil');
                if (pmAmt) pmAmt.value = `${finalBs.replace('.', ',')} Bs`;
                const banescoAmt = document.getElementById('amount-pagomovil_banesco');
                if (banescoAmt) banescoAmt.value = `${finalBs.replace('.', ',')} Bs`;
                const binAmt = document.getElementById('amount-binance');
                if (binAmt) binAmt.value = `${data.final_amount.toFixed(2)} USDT`;

            } else {
                window.appliedCoupon = null;
                msgEl.style.color = '#FF3D71';
                msgEl.innerHTML = data.message || '⚠️ Código no válido.';
            }
        } catch(e) {
            window.appliedCoupon = null;
            msgEl.style.color = '#FF3D71';
            msgEl.innerHTML = 'Error al validar el código: ' + e.message;
        }
    };

    backBtn.addEventListener('click', () => {
        const packagesSection = document.getElementById('packages-section');
        document.getElementById('payment-section').style.display = 'none';
        packagesSection.style.display = 'block';
        // Re-mostrar barra flotante si hay paquete seleccionado
        if (selectedPackage) {
            const floatBar = document.getElementById('float-cta-bar');
            if (floatBar) {
                floatBar.style.display = 'block';
                requestAnimationFrame(() => floatBar.classList.add('visible'));
                document.body.classList.add('float-cta-active');
            }
        }
        const card = document.querySelector('.card');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    let isSubmittingOrder = false;
    window.confirmarPagoDirecto = async function() {
        if (isSubmittingOrder) return;
        isSubmittingOrder = true;
        setTimeout(() => { isSubmittingOrder = false; }, 3000);

        // Validación detallada
        if (!selectedMethod) {
            isSubmittingOrder = false;
            return Swal.fire({ icon: 'warning', title: 'Método de pago', text: 'Por favor, selecciona un método de pago (Pago Móvil o Binance) antes de continuar.', confirmButtonColor: '#9D00FF' });
        }

        const waInput = document.getElementById('whatsapp-number');
        const refPMInput = document.getElementById('ref-pagomovil');
        const refBInput = document.getElementById('ref-binance');
        const refBanInput = document.getElementById('ref-pagomovil_banesco');
        const codeSelect = document.getElementById('country-code');

        const waNum = waInput ? waInput.value.trim() : '';
        const refPM = refPMInput ? refPMInput.value.trim() : '';
        const refB = refBInput ? refBInput.value.trim() : '';
        const refBan = refBanInput ? refBanInput.value.trim() : '';
        const countryVal = codeSelect ? codeSelect.value : '58';

        if (selectedMethod === 'pagomovil' && refPM.length < 3) {
            isSubmittingOrder = false;
            return Swal.fire({ icon: 'warning', title: 'Referencia muy corta', text: 'Por favor, ingresa los últimos 3 dígitos o más de tu referencia de Pago Móvil.', confirmButtonColor: '#9D00FF' });
        }
        if (selectedMethod === 'pagomovil_banesco' && refBan.length < 3) {
            isSubmittingOrder = false;
            return Swal.fire({ icon: 'warning', title: 'Referencia muy corta', text: 'Por favor, ingresa los últimos 3 dígitos o más de tu referencia de Pago Móvil Banesco.', confirmButtonColor: '#9D00FF' });
        }
        if (selectedMethod === 'binance' && refB.length < 1) {
            isSubmittingOrder = false;
            return Swal.fire({ icon: 'warning', title: 'Falta ID Binance', text: 'Por favor, ingresa tu ID de transacción de Binance Pay.', confirmButtonColor: '#9D00FF' });
        }
        if (waNum.length < 7) {
            isSubmittingOrder = false;
            return Swal.fire({ icon: 'warning', title: 'WhatsApp incompleto', text: 'Por favor, ingresa un número de WhatsApp válido (mínimo 7 dígitos) para recibir tu comprobante.', confirmButtonColor: '#9D00FF' });
        }

        const ref = selectedMethod === 'pagomovil' ? refPM : (selectedMethod === 'pagomovil_banesco' ? refBan : refB);
        // Para Roblox y Streaming usamos identificadores adaptados
        const selGame = typeof selectedGame !== 'undefined' ? selectedGame : null;
        const selPack = typeof selectedPack !== 'undefined' ? selectedPack : null;
        const selPriceUsdt = typeof selectedPriceUsdt !== 'undefined' ? selectedPriceUsdt : null;

        const isRobloxOrder = currentJuego === 'roblox';
        const isStreamingOrder = selGame === 'streaming' || currentJuego === 'streaming';
        const rawName = document.getElementById('player-name-display') ? document.getElementById('player-name-display').innerText.trim() : '';
        const name = (isRobloxOrder || isStreamingOrder) ? (rawName || `WA:${waNum}`) : rawName;
        const PAQUETES_ESPECIALES_KEYS = ['basica', 'semanal', 'mensual', 'booyah'];

        let packText = '';
        let priceUSDT = 0;
        let esEspecialOrder = false;

        if (isStreamingOrder) {
            packText = selPack || 'Servicio Streaming';
            priceUSDT = selPriceUsdt || 2.50;
        } else {
            esEspecialOrder = selectedPackage && PAQUETES_ESPECIALES_KEYS.includes((selectedPackage.amount || '').toString().toLowerCase());
            if (esEspecialOrder) {
                packText = selectedPackage ? selectedPackage.amount : (selPack || 'Especial');
            } else if (selectedPackage && selectedPackage.amount) {
                packText = (selectedQty > 1 ? `${selectedPackage.amount} + ${selectedPackage.bonus || 0} (x${selectedQty})` : `${selectedPackage.amount} + ${selectedPackage.bonus || 0}`);
            } else {
                packText = selPack || 'Paquete';
            }

            const selectedCard = document.querySelector('.package-card.selected');
            let basePriceConfirm = 0;
            if (selectedCard && selectedCard.dataset && selectedCard.dataset.price) {
                basePriceConfirm = parseFloat(selectedCard.dataset.price) || 0;
            } else if (selectedPackage && selectedPackage.price) {
                basePriceConfirm = parseFloat(selectedPackage.price) || 0;
            } else if (selPriceUsdt) {
                basePriceConfirm = parseFloat(selPriceUsdt) || 0;
            }
            const rawPriceConfirm = basePriceConfirm * (selectedQty || 1);
            const discountMultConfirm = window.referralDiscountActive ? 0.97 : 1;
            priceUSDT = rawPriceConfirm * discountMultConfirm;
            if (window.appliedCoupon && window.appliedCoupon.valid && window.appliedCoupon.final_amount !== undefined) {
                priceUSDT = window.appliedCoupon.final_amount;
                console.log(`[CUPON_APLICADO] Aplicando precio con descuento: $${priceUSDT.toFixed(2)} USDT (${window.appliedCoupon.code})`);
            } else if (window.referralDiscountActive) {
                console.log(`[DESCUENTO_REFERIDO] Aplicando -3% en primera compra. Original: $${rawPriceConfirm.toFixed(2)} → Con descuento: $${priceUSDT.toFixed(2)} USDT`);
            }
        }

        const priceBS = (priceUSDT * (typeof DOLAR_RATE !== 'undefined' ? DOLAR_RATE : 1)).toFixed(2);
        let waClean = waNum.replace(/^0+/, ''); // Quitar ceros a la izquierda (ej: 0424 -> 424)
        const waFull = countryVal + waClean;

        Swal.fire({
            title: 'Procesando pago...',
            html: `
                <div class="ff-loader-container">
                    <div class="ff-loader-text">Notificando a la tienda...</div>
                    <div class="ff-progress-bar">
                        <div class="ff-progress-fill"></div>
                    </div>
                </div>
            `,
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'rgba(20, 10, 35, 0.95)',
            color: '#fff'
        });

        try {
            // Para Roblox/Streaming: uid = número WA (no hay ID Garena)
            // En modo regalo: uid = jugador receptor, loginUid = tú (quien gana los puntos)
            let effectiveUid;
            const pInput = document.getElementById('player-id');
            if (giftingMode && giftingTargetUid) {
                effectiveUid = giftingTargetUid;
            } else {
                effectiveUid = (isRobloxOrder || isStreamingOrder) ? waFull : (pInput ? pInput.value.trim() : (playerInput ? playerInput.value.trim() : ''));
            }
            const loginUid = localStorage.getItem('ff_user_id') || effectiveUid;
            const juegoParam = isStreamingOrder ? 'streaming' : currentJuego;
            const couponCode = (window.appliedCoupon && window.appliedCoupon.valid && window.appliedCoupon.code) ? encodeURIComponent(window.appliedCoupon.code) : '';
            const messageParams = `uid=${effectiveUid}&login_uid=${loginUid}&name=${encodeURIComponent(name)}&pack=${encodeURIComponent(packText)}&method=${selectedMethod}&ref=${encodeURIComponent(ref)}&price=${priceUSDT.toFixed(2)}USDT/${priceBS}Bs&wa=${waFull}&juego=${juegoParam}&coupon=${couponCode}`;
            const notifyUrl = `${SERVER_URL}/notificar?${messageParams}`;
            
            const notifyRes = await fetch(notifyUrl);
            if (!notifyRes.ok) throw new Error('Error al notificar');
            const notifyData = await notifyRes.json();

            // ⚠️ SEGURIDAD: Si el servidor rechazó la referencia (duplicada / ya aprobada), mostrar error y detener
            if (notifyData.success === false) {
                Swal.fire({
                    icon: 'warning',
                    title: '⚠️ Referencia Inválida',
                    html: `<b>${notifyData.message || 'Esta referencia de pago ya fue utilizada.'}</b><br><br>Por favor, verifica tu comprobante de pago y comunícate con soporte si crees que es un error.`,
                    confirmButtonText: 'Entendido',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });
                return; // ← Detiene completamente el flujo. NO abre el recibo.
            }

            const controlNum = notifyData.control_num || 'N/A';

            // Guardar en historial local
            const myOrders = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');
            const newOrder = {
                ref: ref,
                control_num: controlNum,
                pack: isStreamingOrder ? packText : (selectedQty > 1 ? `${selectedPackage.amount} (x${selectedQty})` : selectedPackage.amount),
                date: new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" }),
                status: 'pending'
            };
            myOrders.push(newOrder);
            localStorage.setItem('ff_my_orders', JSON.stringify(myOrders));

            const approvalNum = Math.floor(Math.random() * 90000) + 10000;
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
            const timeStr = now.toLocaleTimeString('es-VE', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hour12: true });
            const fullDateTime = `${dateStr} ${timeStr}`;

            const receiptLogoTitle = isStreamingOrder ? 'STREAMING' : (isRobloxOrder ? 'ROBLOX' : (currentJuego === 'bloodstrike' ? 'BLOODSTRIKE' : (currentJuego === 'mobilelegends' ? 'MOBILE LEGENDS' : 'FREE F<span>I</span>RE')));
            const productTitleVal = isStreamingOrder ? packText : (isRobloxOrder ? `Roblox US ${selectedPackage ? selectedPackage.amount : ''}USD` : (esEspecialOrder ? packText : `${selectedPackage ? selectedPackage.amount : ''} + ${selectedPackage ? selectedPackage.bonus : ''} Bonus`));

            const expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            const dayE = String(expireDate.getDate()).padStart(2, '0');
            const monthE = String(expireDate.getMonth() + 1).padStart(2, '0');
            const yearE = expireDate.getFullYear();
            const formattedExpireDate = `${dayE}-${monthE}-${yearE}`;

            let packType = packText || 'Perfil';
            if ((packText || '').toLowerCase().includes('perfil')) packType = 'Perfil';
            else if ((packText || '').toLowerCase().includes('pantalla')) packType = 'Pantalla';
            else if ((packText || '').toLowerCase().includes('cuenta')) packType = 'Cuenta Completa';

            const liveModalHtml = isStreamingOrder ? `
                <div class="receipt-container" style="padding: 4px;">
                    <div class="receipt-success-icon" style="background: rgba(37,211,102,0.15); border: 2px solid #25D366; color: #25D366; width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin: 0 auto 10px; box-shadow: 0 0 20px rgba(37,211,102,0.3);">
                        <i class="fa-solid fa-check"></i>
                    </div>
                    <h2 class="receipt-title" id="receipt-title" style="color: #25D366; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 1.25rem; text-align: center; margin: 0 0 14px 0;">¡Ejecución exitosa!</h2>
                    
                    <div class="receipt-card" style="background: rgba(15, 8, 30, 0.95); border: 1px solid rgba(0, 240, 255, 0.35); border-radius: 20px; padding: 18px 16px; box-shadow: 0 15px 35px rgba(0,0,0,0.8), 0 0 25px rgba(0,240,255,0.12); font-family: 'Inter', sans-serif; text-align: left;">
                        <img src="img/streaming_logo.png" alt="Streaming" style="width: 75px; height: 75px; object-fit: contain; display: block; margin: 0 auto 14px auto; border-radius: 14px; filter: drop-shadow(0 4px 12px rgba(157,0,255,0.4));">
                        
                        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.84rem; color: #d0d0d0;">
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Tipo de paquete:</span><strong style="color: #fff;">${packType}</strong></div>
                            
                            <!-- Credenciales entregadas (Email, Clave, Perfil, Pin) -->
                            <div id="receipt-streaming-credentials" style="display:none; flex-direction: column; gap: 6px; margin: 4px 0;">
                                <div id="receipt-streaming-pin-lines" style="display: flex; flex-direction: column; gap: 6px;"></div>
                            </div>

                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Plan:</span><strong style="color: #fff;">30 días</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Fecha Vencimiento:</span><strong style="color: #00FF94;">${formattedExpireDate}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Nº Control:</span><strong style="color: #00F0FF;">#${controlNum}</strong></div>
                            <div style="display: flex; justify-content: space-between;"><span style="color: #aaa;">Estado:</span><strong id="order-status" style="color: #FFC107;">VERIFICANDO...</strong></div>
                        </div>

                        <!-- Aviso Importante -->
                        <div style="margin-top: 12px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 10px;">
                            <div style="color: #ff4b2b; font-weight: 800; font-size: 0.75rem; text-align: center; margin-bottom: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> Aviso Importante</div>
                            <p style="color: rgba(255, 100, 100, 0.85); font-size: 0.65rem; text-align: center; line-height: 1.3; margin: 0; background: rgba(255, 75, 43, 0.08); border: 1px dashed rgba(255, 75, 43, 0.3); padding: 6px 8px; border-radius: 8px;">
                                No está permitido modificar la cuenta, perfil, PIN, correo o contraseña. Úsalo únicamente en un dispositivo a la vez. El incumplimiento de estas normas conllevará a la pérdida de la garantía del servicio sin previo aviso.
                            </p>
                        </div>

                        <div style="text-align: center; font-size: 0.78rem; color: #FFD700; font-weight: 700; letter-spacing: 1px; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px;">
                            Comprobante de Pago
                        </div>
                    </div>

                    <div class="receipt-actions" style="display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 10px;">
                        <button id="btn-copy-streaming-creds" style="display:none; background: linear-gradient(135deg,#E50914,#9D00FF); color:#fff; border:none; border-radius:10px; padding:10px; font-weight:800; font-size:0.85rem; cursor:pointer; width:100%; box-shadow:0 4px 15px rgba(229,9,20,0.3); align-items:center; justify-content:center; gap:6px;">
                            📋 Copiar Credenciales
                        </button>
                        <a href="https://wa.me/${((APP_CONFIG.whatsapp && APP_CONFIG.whatsapp.bot) ? APP_CONFIG.whatsapp.bot : '584123491068').replace(/\D/g, '')}?text=${encodeURIComponent(ref)}" target="_blank" style="background: #25D366; color: #fff; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px; padding: 10px; font-size: 0.85rem; cursor: pointer; text-decoration: none; box-sizing: border-box; box-shadow: 0 4px 15px rgba(37,211,102,0.25); margin: 0;">
                            <i class="fa-brands fa-whatsapp" style="font-size: 1.1rem;"></i> Consultar por WhatsApp
                        </a>
                        <button class="btn-action btn-continue-receipt" onclick="location.reload()" style="width: 100%; margin: 0; background: linear-gradient(135deg, #9D00FF, #00F0FF); color: #fff; font-weight: 800; border: none; border-radius: 10px; padding: 10px; font-size: 0.85rem; cursor: pointer; box-shadow: 0 4px 15px rgba(157,0,255,0.3);">OK</button>
                    </div>
                </div>
            ` : `
                <div class="receipt-container">
                    <div class="receipt-success-icon"><i class="fa-solid fa-check"></i></div>
                    <h2 class="receipt-title" id="receipt-title">Procesando Pago...</h2>
                    
                    <div class="receipt-card">
                        <div class="receipt-logo" style="letter-spacing: 5px; font-weight: 900; background: linear-gradient(to bottom, #fff 0%, #aaa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${receiptLogoTitle}</div>
                        <div style="font-size: 0.6rem; color: var(--secondary); margin-top: -10px; margin-bottom: 15px; letter-spacing: 2px; font-weight: 700;">RECARGASNEY.COM</div>
                        
                        <div class="receipt-info" style="font-size: 0.8rem; line-height: 1.2;">
                            <p><strong>PLAN:</strong> <span class="val">${productTitleVal}</span></p>
                            ${(!isRobloxOrder && !isStreamingOrder) ? `<p><strong>ID / JUGADOR:</strong> <span class="val">${effectiveUid} (${name})</span></p>` : ''}
                            ${giftingMode ? `<p style="color:#FFD93D; font-size:0.72rem;"><i class="fa-solid fa-gift"></i> <strong>REGALO</strong> — Puntos acreditados a tu ID: <code>${loginUid}</code></p>` : ''}
                            <p><strong>CONTROL / REF:</strong> <span class="val">${controlNum} / ${ref}</span></p>
                            <p><strong>FECHA:</strong> <span class="val">${fullDateTime}</span></p>
                            <p><strong>ESTADO:</strong> <span class="val status-pending" id="order-status">VERIFICANDO...</span></p>
                        </div>

                        <div id="receipt-pin-container" style="display:none; margin-top: 12px; background: rgba(0,240,255,0.08); border: 1px dashed #00f0ff; border-radius: 10px; padding: 12px; text-align: center;">
                            <span style="font-size: 0.72rem; color: #00f0ff; font-weight: 700; display: block; margin-bottom: 6px; letter-spacing: 1px;">🔑 PIN DE ROBLOX ADQUIRIDO</span>
                            <code id="receipt-pin-code" style="font-family: monospace; font-size: 1.15rem; color: #00FF94; font-weight: 800; display: block; letter-spacing: 2px; word-break: break-all; margin-bottom: 8px;"></code>
                            <button id="btn-copy-receipt-pin" onclick="const p=document.getElementById('receipt-pin-code').innerText; if(p){ navigator.clipboard.writeText(p).then(()=>{ this.innerText='✓ PIN Copiado!'; setTimeout(()=>this.innerText='📋 Copiar PIN', 2000); }); }" style="background: #00f0ff; color: #07030D; border: none; border-radius: 8px; padding: 8px 16px; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,240,255,0.3);">
                                📋 Copiar PIN
                            </button>
                        </div>
                        
                        <div class="receipt-ticket" style="margin-top: 10px; font-size: 0.7rem; opacity: 0.5;">
                            <i class="fa-solid fa-shield-halved"></i> RECARGASNEY.COM - Transacción Segura
                        </div>
                    </div>

                    <div class="receipt-actions" style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 15px;">
                        <div style="display: flex; gap: 8px; width: 100%; justify-content: center;">
                            <button class="btn-action btn-share" title="Compartir" style="flex: 1; margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px;"><i class="fa-solid fa-share-nodes"></i> Compartir</button>
                            <button class="btn-action btn-fav" title="Favorito" style="margin: 0;"><i class="fa-solid fa-star"></i></button>
                        </div>
                        <button id="receipt-push-btn" class="btn-action" style="background: #9D00FF !important; border: 1px solid #7c00cc !important; color: #fff !important; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: 12px; font-size: 0.9rem; cursor: pointer; margin: 0; box-sizing: border-box;">
                            <i class="fa-solid fa-bell" style="font-size: 1.1rem;"></i> Recibir Alerta en este Navegador 🔔
                        </button>
                        <a href="https://wa.me/${((APP_CONFIG.whatsapp && APP_CONFIG.whatsapp.bot) ? APP_CONFIG.whatsapp.bot : '584123491068').replace(/\D/g, '')}?text=${encodeURIComponent(ref)}" target="_blank" class="btn-action" style="background: #25D366 !important; border: 1px solid #20ba5a !important; color: #fff !important; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; border-radius: 8px; padding: 12px; font-size: 0.9rem; cursor: pointer; box-shadow: 0 4px 15px rgba(37,211,102,0.25); margin: 0; text-decoration: none; box-sizing: border-box;">
                            <i class="fa-brands fa-whatsapp" style="font-size: 1.25rem;"></i> Consultar estado por WhatsApp
                        </a>
                        <button class="btn-action btn-continue-receipt" onclick="location.reload()" style="width: 100%; margin: 0;">Continuar</button>
                    </div>
                </div>
            `;

            Swal.fire({
                html: liveModalHtml,
                showConfirmButton: false,
                background: 'transparent',
                width: window.innerWidth < 600 ? '95%' : '450px',
                allowOutsideClick: false,
                didOpen: () => {
                    // Si era modo regalo, limpiar el estado para el siguiente ciclo
                    clearGiftingMode();

                    // Lógica para el botón de notificaciones push en el recibo
                    const receiptPushBtn = document.getElementById('receipt-push-btn');
                    const pushSupported = ('serviceWorker' in navigator) && ('PushManager' in window);

                    // Función reutilizable para solicitar permiso y suscribir
                    const requestAndSubscribePush = async () => {
                        try {
                            const permission = await Notification.requestPermission();
                            if (permission === 'granted') {
                                await subscribeUser(loginUid);
                                if (receiptPushBtn) receiptPushBtn.style.display = 'none';
                            }
                        } catch (err) {
                            console.error('[PUSH] Error activando desde recibo:', err);
                        }
                    };

                    if (receiptPushBtn) {
                        if (!pushSupported) {
                            receiptPushBtn.style.display = 'none';
                        } else {
                            navigator.serviceWorker.ready.then(reg => {
                                reg.pushManager.getSubscription().then(sub => {
                                    if (sub) {
                                        // Ya suscrito: ocultar botón y no pedir nada
                                        receiptPushBtn.style.display = 'none';
                                    } else if (Notification.permission !== 'denied') {
                                        // ═══════════════════════════════════════════════════════
                                        // AUTO-PROMPT: pedir permiso 1.5s después del recibo
                                        // El cliente acaba de enviar su pedido → motivación máxima
                                        // ═══════════════════════════════════════════════════════
                                        setTimeout(() => {
                                            Swal.fire({
                                                title: '🔔 ¿Avísame cuando llegue mi recarga?',
                                                html: `
                                                    <div style="text-align:center; font-family:'Inter',sans-serif;">
                                                        <div style="font-size:2.8rem; margin-bottom:10px;">💎</div>
                                                        <p style="color:#ddd; font-size:0.9rem; line-height:1.5; margin:0 0 14px 0;">
                                                            Activa las notificaciones y te avisaremos <strong style="color:#00F0FF;">al instante</strong>
                                                            en este celular/navegador cuando tu recarga sea
                                                            <strong style="color:#00FF94;">✅ aprobada</strong> o
                                                            <strong style="color:#ff4b2b;">❌ rechazada</strong>.
                                                        </p>
                                                        <p style="color:#888; font-size:0.75rem; margin:0;">
                                                            Sin WhatsApp. Sin esperar. Directo en tu pantalla.
                                                        </p>
                                                    </div>
                                                `,
                                                showCancelButton: true,
                                                confirmButtonText: '🔔 Sí, avisarme',
                                                cancelButtonText: 'Ahora no',
                                                confirmButtonColor: '#9D00FF',
                                                cancelButtonColor: '#444',
                                                background: 'rgba(15, 8, 30, 0.98)',
                                                color: '#fff',
                                                width: window.innerWidth < 600 ? '92%' : '400px',
                                                customClass: { popup: 'swal2-push-prompt' }
                                            }).then(async (pushRes) => {
                                                if (pushRes.isConfirmed) {
                                                    await requestAndSubscribePush();
                                                }
                                            });
                                        }, 1500);
                                    }
                                });
                            });

                            // Clic manual en botón (como respaldo)
                            receiptPushBtn.addEventListener('click', async () => {
                                receiptPushBtn.disabled = true;
                                receiptPushBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Activando...';
                                await requestAndSubscribePush();
                                receiptPushBtn.disabled = false;
                                receiptPushBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Recibir Alerta en este Navegador 🔔';
                            });
                        }
                    }
                    const shareBtn = document.querySelector('.btn-share');
                    const favBtn = document.querySelector('.btn-fav');
                    const statusEl = document.getElementById('order-status');
                    const successIcon = document.querySelector('.receipt-success-icon');
                    
                    // Polling para el estado del pedido
                    const checkStatus = async () => {
                        try {
                            const res = await fetch(`${SERVER_URL}/status?ref=${ref}`);
                            const data = await res.json();
                            
                            if (data.status === 'approved' || data.status === 'rejected') {
                                // Actualizar localStorage
                                const myOrders = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');
                                const orderIdx = myOrders.findIndex(o => o.ref === ref);
                                if (orderIdx !== -1) {
                                    myOrders[orderIdx].status = data.status;
                                    if (data.pin) myOrders[orderIdx].pin = data.pin;
                                    localStorage.setItem('ff_my_orders', JSON.stringify(myOrders));
                                }

                                if (data.status === 'approved') {
                                    // Sonido de éxito (Caja registradora premium)
                                    new Audio('https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3').play().catch(e => {});
                                    
                                    statusEl.innerText = '✅ APROBADO';
                                    statusEl.className = 'val status-approved';
                                    successIcon.style.color = '#25D366';
                                    successIcon.style.borderColor = '#25D366';
                                    
                                    // Lanzar confeti (EFECTO JACKPOT)
                                    const duration = 3 * 1000;
                                    const animationEnd = Date.now() + duration;
                                    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
                                    function randomInRange(min, max) { return Math.random() * (max - min) + min; }
                                    const interval = setInterval(function() {
                                        const timeLeft = animationEnd - Date.now();
                                        if (timeLeft <= 0) return clearInterval(interval);
                                        const particleCount = 50 * (timeLeft / duration);
                                        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#ffd700', '#00c853', '#ffffff'] }));
                                        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#ffd700', '#00c853', '#ffffff'] }));
                                    }, 250);

                                    // Desplegar credenciales en pantalla si es streaming
                                    if (data.pin && isStreamingOrder) {
                                        const streamingCreds = document.getElementById('receipt-streaming-credentials');
                                        const streamingPinLines = document.getElementById('receipt-streaming-pin-lines');
                                        const copyBtn = document.getElementById('btn-copy-streaming-creds');
                                        if (streamingCreds && streamingPinLines) {
                                            const pinLines = data.pin.split(/[\n|]+/).map(l => l.trim()).filter(l => l && l !== 'Manual');
                                            streamingPinLines.innerHTML = (pinLines.length > 0 ? pinLines : [data.pin])
                                                .map(line => {
                                                    if (line.includes(':')) {
                                                        const idx = line.indexOf(':');
                                                        const k = line.substring(0, idx).trim();
                                                        const v = line.substring(idx + 1).trim();
                                                        return `<div style="display:flex; justify-content:space-between; font-size:0.84rem;"><span style="color:#aaa;">${k}:</span><strong style="color:#00FF94; font-family:monospace; word-break:break-all;">${v}</strong></div>`;
                                                    }
                                                    return `<div style="font-family:monospace; font-size:0.84rem; color:#00FF94; font-weight:700; word-break:break-all; background:rgba(0,0,0,0.3); border-radius:6px; padding:4px 8px; margin-bottom:4px; text-align:left;">${line}</div>`;
                                                })
                                                .join('');
                                            streamingCreds.style.display = 'flex';
                                            if (copyBtn) {
                                                copyBtn.style.display = 'flex';
                                                copyBtn.onclick = () => {
                                                    navigator.clipboard.writeText(data.pin.replace(/[|]/g, ' | ')).then(() => {
                                                        copyBtn.innerText = '✓ ¡Copiado!';
                                                        setTimeout(() => { copyBtn.innerHTML = '📋 Copiar Credenciales'; }, 2000);
                                                    });
                                                };
                                            }
                                        }
                                        // Actualizar en localStorage
                                        const myOrds = JSON.parse(localStorage.getItem('ff_my_orders') || '[]');
                                        const oIdx = myOrds.findIndex(o => o.ref === ref);
                                        if (oIdx !== -1) { myOrds[oIdx].pin = data.pin; myOrds[oIdx].juego = 'streaming'; localStorage.setItem('ff_my_orders', JSON.stringify(myOrds)); }
                                    }

                                    const titleEl = document.getElementById('receipt-title');
                                    if (titleEl) {
                                        titleEl.innerHTML = isRobloxOrder
                                            ? '<span style="color:var(--success); font-weight:800; letter-spacing:2px; text-shadow: 0 0 15px rgba(0,255,148,0.5);">🎉 ¡PIN ENTREGADO! 🎉</span>'
                                            : (isStreamingOrder
                                                ? '<span style="color:var(--success); font-weight:800; letter-spacing:2px; text-shadow: 0 0 15px rgba(229,9,20,0.5);">🍿 ¡STREAMING ENTREGADO! 🍿</span>'
                                                : '<span style="color:var(--success); font-weight:800; letter-spacing:2px; text-shadow: 0 0 15px rgba(0,255,148,0.5);">🔥 ¡BOOYAH! 🔥</span>');
                                        titleEl.style.animation = 'pulse 1s infinite alternate';
                                    }

                                    // 🎰 RULETA DE LA SUERTE: mostrar después de 3.5s (solo para recargas de juegos, NO streaming)
                                    if (selectedGame !== 'streaming') {
                                        setTimeout(() => {
                                            if (typeof window.showRouletteAfterApproval === 'function') {
                                                window.showRouletteAfterApproval(loginUid, ref, priceUSDT);
                                            }
                                        }, 3500);
                                    }
                                } else {
                                    // Sonido de error (Buzzer corto y limpio)
                                    new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3').play().catch(e => {});

                                    statusEl.innerText = '❌ RECHAZADO: VERIFIQUE MONTO Y REFERENCIA';
                                    statusEl.className = 'val status-rejected';
                                    const titleEl = document.getElementById('receipt-title');
                                    if (titleEl) titleEl.innerText = '¡Operación Rechazada!';
                                    successIcon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                                    successIcon.style.color = '#ff4b2b';
                                    successIcon.style.borderColor = '#ff4b2b';
                                }
                                clearInterval(statusInterval);
                            }
                        } catch (e) {
                            console.error('Error verificando estado:', e);
                        }
                    };

                    const statusInterval = setInterval(checkStatus, 3000);
                    
                    shareBtn.addEventListener('click', () => {
                        const statusText = statusEl.innerText;
                        const shareHeader = isRobloxOrder ? '🎮 *COMPROBANTE DE RECARGA - ROBLOX* 🎮' : '💎 *COMPROBANTE DE RECARGA - FREE FIRE* 💎';
                        let shareText = `${shareHeader}\n` +
                                        `------------------------------------------\n`;
                        if (!isRobloxOrder) {
                            shareText += `👤 *Jugador:* ${name}\n` +
                                         `🆔 *ID:* ${playerInput.value}\n`;
                        }
                        shareText += `📦 *Producto:* ${productTitleVal}\n`;
                        if (!isRobloxOrder && !esEspecialOrder) {
                            shareText += `✨ *Bonus:* ${selectedPackage.bonus} diamantes\n`;
                        }
                        const currentPin = document.getElementById('receipt-pin-code')?.innerText;
                        if (currentPin) {
                            shareText += `🔑 *PIN Adquirido:* ${currentPin}\n`;
                        }
                        shareText += `🔢 *N° Control:* ${controlNum}\n` +
                                     `🔢 *Ref:* ${approvalNum}\n` +
                                     `📅 *Fecha:* ${fullDateTime}\n` +
                                     `✅ *Estado:* ${statusText}\n` +
                                     `------------------------------------------\n` +
                                     `¡Gracias por tu compra! 🎮`;

                        if (navigator.share) {
                            navigator.share({
                                title: 'Comprobante de Recarga',
                                text: shareText
                            }).catch(err => console.log('Error sharing:', err));
                        } else {
                            // Fallback a WhatsApp Web/App si no hay Web Share API
                            const encodedText = encodeURIComponent(shareText);
                            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
                        }
                    });

                    favBtn.addEventListener('click', () => {
                        favBtn.style.color = favBtn.style.color === 'yellow' ? 'white' : 'yellow';
                        const Toast = Swal.mixin({
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true
                        });
                        Toast.fire({ icon: 'success', title: 'Agregado a favoritos' });
                    });
                }
            });
        } catch (error) {
            console.error('Error enviando notificación:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo enviar la notificación, pero tu pago fue registrado.' });
        }
    };

    async function checkPlayerId(uid) {
        const localServerUrl = `${SERVER_URL}/verificar?uid=${uid}&juego=${currentJuego}`;

        try {
            console.log('Consultando servidor local...');
            const response = await fetch(localServerUrl, { signal: AbortSignal.timeout(15000) });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            console.log('Respuesta del servidor:', data);

            if (data.success && data.nombre) {
                return { found: true, name: data.nombre, networkError: false };
            }

            // El servidor respondió pero el ID no existe en Garena
            return { found: false, name: null, networkError: false };
        } catch (e) {
            console.error('Error al consultar servidor local:', e);
            // Error de red, timeout, etc.
            return { found: false, name: null, networkError: true };
        }
    }
    
    window.copyData = function(method) {
        let textToCopy = '';
        if (method === 'pagomovil') {
            const amount = document.getElementById('amount-pagomovil').value.replace(' Bs', '').trim();
            const pm = APP_CONFIG.metodos_pago.pagomovil;
            // Extraer solo números de teléfono y cédula
            const tel = pm.telefono.replace(/\D/g, '');
            const ced = pm.cedula.replace(/\D/g, '');
            // Buscar el código de banco en paréntesis (ej: 0105)
            const bancoMatch = pm.banco.match(/\d{4}/);
            const codBanco = bancoMatch ? bancoMatch[0] : pm.banco;
            textToCopy = `${codBanco} ${tel} ${ced} ${amount}`;
        } else if (method === 'pagomovil_banesco') {
            const amount = (document.getElementById('amount-pagomovil_banesco') || {}).value || '';
            const amountClean = amount.replace(' Bs', '').trim();
            const ban = APP_CONFIG.metodos_pago && APP_CONFIG.metodos_pago.pagomovil_banesco;
            if (ban) {
                const tel = (ban.telefono || '').replace(/\D/g, '');
                const ced = (ban.cedula || '').replace(/\D/g, '');
                const bancoMatch = (ban.banco || '').match(/\d{4}/);
                const codBanco = bancoMatch ? bancoMatch[0] : (ban.banco || 'Banesco');
                textToCopy = `${codBanco} ${tel} ${ced} ${amountClean}`;
            }
        } else if (method === 'binance') {
            const amount = document.getElementById('amount-binance').value.replace(' USDT', '').trim();
            textToCopy = `${APP_CONFIG.metodos_pago.binance.id} ${amount}`;
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            Swal.fire({
                icon: 'success',
                title: '¡Copiado!',
                text: 'Datos copiados al portapapeles.',
                timer: 1500,
                showConfirmButton: false,
                background: 'rgba(20, 10, 35, 0.95)',
                color: '#fff'
            });
        }).catch(err => {
            console.error('Error al copiar: ', err);
        });
    };

    // ===== PAGO DIRECTO: BDVapp =====
    window.pagarBDVapp = function() {
        if (!APP_CONFIG || !APP_CONFIG.metodos_pago || !APP_CONFIG.metodos_pago.pagomovil) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los datos de pago. Intenta de nuevo.', background: 'rgba(20,10,35,0.97)', color: '#fff' });
            return;
        }

        const pm = APP_CONFIG.metodos_pago.pagomovil;
        const amountRaw = document.getElementById('amount-pagomovil').value;

        if (!amountRaw || amountRaw.trim() === '') {
            Swal.fire({ icon: 'warning', title: 'Selecciona un paquete', text: 'Primero selecciona un paquete para ver el monto.', background: 'rgba(20,10,35,0.97)', color: '#fff' });
            return;
        }

        const montoStr = amountRaw.replace(/\s*Bs/i, '').replace(',', '.').trim();
        const monto    = parseFloat(montoStr);

        if (isNaN(monto) || monto <= 0) {
            Swal.fire({ icon: 'warning', title: 'Monto inválido', text: 'El monto no es válido. Selecciona un paquete primero.', background: 'rgba(20,10,35,0.97)', color: '#fff' });
            return;
        }

        // Texto optimizado para "Pegar datos" de BDVapp — el banco lo detecta automáticamente
        const pasteText = `${pm.telefono} ${pm.banco} ${pm.cedula} ${monto.toFixed(2)}`;

        // 1️⃣ Copiar datos al portapapeles
        navigator.clipboard.writeText(pasteText).catch(() => {});

        // 2️⃣ Abrir la app de BDV directamente (sin cuadro de diálogo)
        const isAndroid = /Android/i.test(navigator.userAgent);
        if (isAndroid) {
            window.location.href = 'intent://#Intent;package=com.bancodevenezuela.bdvdigital;end;';
        } else {
            window.open('https://play.google.com/store/apps/details?id=com.bancodevenezuela.bdvdigital', '_blank');
        }

        // 3️⃣ Mostrar guía paso a paso con los datos visibles (tras medio segundo)
        setTimeout(() => {
            Swal.fire({
                icon: 'success',
                title: '<span style="font-size:0.95rem; font-family:Montserrat,sans-serif;">✅ Datos Copiados</span>',
                html: `
                    <div style="font-family:'Montserrat',sans-serif; font-size:0.85rem; color:#ccc; text-align:left; line-height:1.6;">
                        <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:10px 14px; margin-bottom:14px; font-size:0.8rem; color:#00f0ff; word-break:break-all;">
                            ${pasteText}
                        </div>
                        <p style="font-size:0.75rem; color:#aaa; margin-bottom:10px;">
                            <i class="fa-solid fa-circle-check" style="color:#25D366;"></i>
                            Los datos están copiados en tu portapapeles. Sigue estos pasos en la app del banco:
                        </p>
                        <ol style="padding-left:18px; margin:0; font-size:0.8rem; line-height:1.8;">
                            <li>Abre <strong style="color:#fff;">BDVApp</strong> e inicia sesión</li>
                            <li>Ve a <strong style="color:#fff;">Pagos → PagomóvilBDV</strong></li>
                            <li>Toca el botón <strong style="color:#FFD93D;">"Pegar datos"</strong></li>
                            <li>Los datos se llenarán solos ✔</li>
                            <li>Confirma el pago</li>
                        </ol>
                    </div>
                `,
                showConfirmButton: true,
                confirmButtonText: 'Entendido ✓',
                confirmButtonColor: '#dc1417',
                showCloseButton: true,
                background: 'rgba(20,10,35,0.98)',
                color: '#fff'
            });
        }, 500);
    };

    window.copyPin = () => {
        const pinText = document.getElementById('assigned-pin').innerText;
        navigator.clipboard.writeText(pinText).then(() => {
            Swal.fire({
                icon: 'success',
                title: 'PIN Copiado',
                text: 'Ya puedes canjear tus diamantes.',
                timer: 1500,
                showConfirmButton: false,
                background: 'rgba(20, 10, 35, 0.95)',
                color: '#fff'
            });
        });
    };

    window.shareReferralLink = function(uid) {
        if (!uid) return;
        const refLink = `${window.location.origin}${window.location.pathname}?ref=${uid}`;
        
        // Mensaje persuasivo con emojis — menciona el bono doble
        const promoMessage = `🔥 ¡Recarga tus DIAMANTES de Free Fire al instante, 100% automático y seguro! 💎\n\n✅ Recibe un 3% de DESCUENTO en tu primera recarga usando mi link.\n⚡ Recargas las 24 horas al mejor precio del mercado.\n\n👇 Entra aquí con mi link y activa tu descuento automáticamente:\n${refLink}\n\n¡Nos vemos en el juego! 🎮⚔️`;
        const encodedMessage = encodeURIComponent(promoMessage);
        
        const canNativeShare = typeof navigator.share === 'function';

        Swal.fire({
            title: '<span style="font-size:1.15rem; font-family:Montserrat,sans-serif;">🎁 Compartir Link de Referido</span>',
            html: `
                <div style="text-align:left; font-size:0.85rem; color:#ccc; line-height:1.6; font-family:'Montserrat',sans-serif;">
                    <p style="margin-bottom:12px; font-size:0.8rem; color:#aaa; text-align:center;">Gana <strong style="color:#25D366;">+$0.05 USDT</strong> de saldo acumulable por cada amigo que haga su primera recarga.</p>
                    
                    <div style="background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.15); border-radius:12px; padding:12px; margin-bottom:18px; font-size:0.78rem; font-style:italic; max-height:90px; overflow-y:auto; color:#00f0ff; line-height:1.4; word-break:break-word;">
                        "${promoMessage}"
                    </div>

                    <div style="display:flex; flex-direction:column; gap:10px;">
                        <a href="https://api.whatsapp.com/send?text=${encodedMessage}" target="_blank" class="swal-share-btn wa-share">
                            <i class="fa-brands fa-whatsapp"></i> Compartir por WhatsApp
                        </a>
                        <button id="swal-share-copy-msg" class="swal-share-btn msg-share">
                            <i class="fa-solid fa-message"></i> Copiar Mensaje + Link
                        </button>
                        <button id="swal-share-copy-link" class="swal-share-btn link-share">
                            <i class="fa-solid fa-link"></i> Copiar Solo Link
                        </button>
                        ${canNativeShare ? `
                        <button id="swal-share-native" class="swal-share-btn native-share">
                            <i class="fa-solid fa-share-nodes"></i> Más opciones de envío
                        </button>
                        ` : ''}
                    </div>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                document.getElementById('swal-share-copy-msg').addEventListener('click', () => {
                    navigator.clipboard.writeText(promoMessage).then(() => {
                        Swal.fire({
                            icon: 'success',
                            title: '¡Mensaje Copiado! 📝',
                            text: 'El mensaje promocional con tu link se copió al portapapeles. ¡Listo para pegar!',
                            timer: 2000,
                            showConfirmButton: false,
                            background: 'rgba(20, 10, 35, 0.95)',
                            color: '#fff'
                        });
                        confetti({ particleCount: 25, spread: 35, origin: { y: 0.8 } });
                    });
                });

                document.getElementById('swal-share-copy-link').addEventListener('click', () => {
                    navigator.clipboard.writeText(refLink).then(() => {
                        Swal.fire({
                            icon: 'success',
                            title: '¡Enlace Copiado! 🔗',
                            text: 'El link de referido directo se copió al portapapeles.',
                            timer: 2000,
                            showConfirmButton: false,
                            background: 'rgba(20, 10, 35, 0.95)',
                            color: '#fff'
                        });
                        confetti({ particleCount: 25, spread: 35, origin: { y: 0.8 } });
                    });
                });

                if (canNativeShare) {
                    document.getElementById('swal-share-native').addEventListener('click', async () => {
                        try {
                            await navigator.share({
                                title: 'RecargasNey.com',
                                text: promoMessage,
                                url: refLink
                            });
                        } catch (err) {
                            console.error('Error al compartir nativamente:', err);
                        }
                    });
                }
            }
        });
    };
    async function loadUserPoints(uid) {
        try {
            const pendingRef = localStorage.getItem('ff_pending_ref');
            const url = pendingRef ? `${SERVER_URL}/perfil?uid=${uid}&ref=${pendingRef}` : `${SERVER_URL}/perfil?uid=${uid}`;
            const res = await fetch(url);
            const data = await res.json();
            const points = (data.success && data.user) ? (data.user.points || 0) : 0;
            const usdtDisplay = (points * 0.003).toFixed(2);

            // Si es usuario NUEVO y hay un referido pendiente, vincularlo
            if (data.isNew && pendingRef && pendingRef !== uid) {
                localStorage.removeItem('ff_pending_ref');
                try {
                    await fetch(`${SERVER_URL}/api/referral`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ referrer_uid: pendingRef, new_uid: uid })
                    });
                    console.log(`[REFERRAL] Vinculación pendiente: ${pendingRef} refirió a ${uid}`);
                } catch (e) { console.error('Error procesando referido:', e); }
            } else if (!data.isNew && pendingRef) {
                // Usuario ya existía, no aplica referido
                localStorage.removeItem('ff_pending_ref');
            }

            // ── DESCUENTO 3% PRIMERA COMPRA (BONO REFERIDO) ──
            // Aplica si: el usuario fue referido Y todavía no ha hecho su primera compra
            let hasReferralDiscount = !!(data.user && data.user.referred_by && !data.user.referral_claimed);
            
            // Si acabamos de vincularlo en esta sesión como nuevo referido, forzar el descuento como activo
            if (data.isNew && pendingRef && pendingRef !== uid) {
                hasReferralDiscount = true;
            }
            
            window.referralDiscountActive = hasReferralDiscount;

            // Mostrar / ocultar banner de descuento en sección de paquetes
            let discountBanner = document.getElementById('referral-discount-banner');
            if (hasReferralDiscount) {
                if (!discountBanner) {
                    discountBanner = document.createElement('div');
                    discountBanner.id = 'referral-discount-banner';
                    discountBanner.innerHTML = `
                        <span style="font-size:1.3rem;">🎁</span>
                        <div>
                            <strong style="color:#00FF94; font-size:0.95rem;">¡3% de descuento en tu primera compra!</strong><br>
                            <span style="color:#aaa; font-size:0.78rem;">Fuiste invitado por un amigo. El descuento se aplica automáticamente.</span>
                        </div>`;
                    discountBanner.style.cssText = 'display:flex; align-items:center; gap:10px; background:linear-gradient(135deg,rgba(0,255,148,0.1),rgba(0,240,255,0.05)); border:1px solid rgba(0,255,148,0.35); border-radius:12px; padding:12px 16px; margin-bottom:16px; animation:fadeIn 0.4s ease;';
                }
                const packagesSection = document.getElementById('packages-section');
                if (packagesSection) {
                    const sectionHeader = packagesSection.querySelector('.section-header');
                    if (sectionHeader && !document.getElementById('referral-discount-banner')) {
                        packagesSection.insertBefore(discountBanner, sectionHeader.nextSibling);
                    }
                }
            } else if (discountBanner) {
                discountBanner.remove();
            }
            // ── FIN DESCUENTO ──

            const pointsEl = document.getElementById('user-points');
            const headerPointsEl = document.getElementById('header-points-val');
            
            if (pointsEl) {
                // El HTML ya tiene el ícono $ (fa-dollar-sign) antes del span, no duplicar
                pointsEl.textContent = `${usdtDisplay} USDT`;
                pointsEl.dataset.rawPoints = points; // Guardar valor real para el canje
            }
            if (headerPointsEl) {
                // El HTML ya tiene el símbolo $ fuera del span, solo escribir el número
                headerPointsEl.textContent = usdtDisplay;
                headerPointsEl.dataset.rawPoints = points;
            }
            
            // Actualizar la Barra de Progreso Gamificada de Recompensas
            try { updateRewardProgressBar(points); } catch (_) {}

            return points;
        } catch (e) {
            console.error('Error cargando puntos:', e);
            return 0;
        }
    }

    function updateRewardProgressBar(points) {
        const card = document.getElementById('reward-progress-container');
        if (!card) return;

        const currentUsdt = parseFloat((points * 0.003).toFixed(2));
        const targetUsdt = 0.80; // Meta: Tarjeta Básica / 100 Diamantes ($0.80 USDT)
        const percent = Math.min(100, Math.floor((currentUsdt / targetUsdt) * 100));

        const fillEl = document.getElementById('reward-bar-fill');
        const badgeEl = document.getElementById('reward-percent-badge');
        const statusEl = document.getElementById('reward-status-text');
        const claimBtn = document.getElementById('reward-claim-btn');

        card.style.display = 'block';

        if (fillEl) fillEl.style.width = `${percent}%`;
        if (badgeEl) badgeEl.textContent = `${percent}%`;

        if (percent >= 100) {
            if (badgeEl) {
                badgeEl.style.background = 'rgba(0,255,148,0.25)';
                badgeEl.style.color = '#00FF94';
                badgeEl.textContent = '¡DESBLOQUEADO! 🎉';
            }
            if (statusEl) {
                statusEl.innerHTML = `<strong style="color:#00FF94;">¡Felicidades!</strong> Tienes <strong>$${currentUsdt.toFixed(2)} USDT</strong>. ¡Puedes reclamar tu Tarjeta Básica / 100 Diamantes gratis!`;
            }
            if (claimBtn) {
                claimBtn.style.display = 'inline-block';
                claimBtn.onclick = () => {
                    const redeemBtn = document.getElementById('redeem-btn');
                    if (redeemBtn) redeemBtn.click();
                };
            }
        } else {
            const neededUsdt = (targetUsdt - currentUsdt).toFixed(2);
            const neededPts = Math.ceil((targetUsdt - currentUsdt) / 0.003);
            
            if (statusEl) {
                statusEl.innerHTML = `Tienes <strong>$${currentUsdt.toFixed(2)} USDT</strong>. Te faltan <strong style="color:#00F0FF;">$${neededUsdt} USDT (${neededPts} pts)</strong> para tu premio gratis.`;
            }
            if (claimBtn) claimBtn.style.display = 'none';
        }
    }

    document.getElementById('redeem-btn').addEventListener('click', async () => {
        const uid = playerInput.value;
        // Leer el valor real de puntos desde el atributo data-raw-points
        const pointsRawEl = document.getElementById('user-points');
        const currentPoints = parseInt(pointsRawEl ? (pointsRawEl.dataset.rawPoints || 0) : 0);

        Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            // Verificar si el usuario tiene contraseña
            const authCheck = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}`);
            
            if (authCheck.status === 404) {
                // Usuario no registrado
                const { isConfirmed } = await Swal.fire({
                    icon: 'warning',
                    title: 'Registro Requerido',
                    html: `
                        <p style="font-size:0.95rem;color:#aaa;line-height:1.5;">
                            Este ID de jugador no se encuentra registrado en nuestro sistema.<br><br>
                            Para acumular $ con tus recargas y poder canjearlos por diamantes gratis, debes registrar tu cuenta primero.
                        </p>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '👤 Registrarme Ahora',
                    cancelButtonText: 'Cerrar',
                    confirmButtonColor: '#9D00FF',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });

                if (isConfirmed) {
                    loginTriggerBtn.click();
                    setTimeout(() => {
                        const tabRegister = document.getElementById('swal-tab-register');
                        if (tabRegister) tabRegister.click();
                        const regUidInput = document.getElementById('swal-reg-uid');
                        if (regUidInput) regUidInput.value = uid;
                    }, 500);
                }
                return;
            }

            const authRes = await authCheck.json();

            if (authRes.success && authRes.hasPassword) {
                // El usuario tiene contraseña configurada: solicitarla directamente
                const { value: enteredPassword } = await Swal.fire({
                    title: '🔐 Cuenta Protegida',
                    html: `
                        <p style="font-size:0.9rem;color:#aaa;margin-bottom:15px;">Ingresa tu contraseña para canjear tus $:</p>
                        <input id="swal-redeem-pass" type="password" class="swal2-input" placeholder="Tu contraseña">
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Verificar',
                    cancelButtonText: 'Cancelar',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    didOpen: () => {
                        const inp = document.getElementById('swal-redeem-pass');
                        if (inp) {
                            inp.focus();
                            inp.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') Swal.clickConfirm();
                            });
                        }
                    },
                    preConfirm: () => {
                        const pass = document.getElementById('swal-redeem-pass').value;
                        if (!pass) {
                            Swal.showValidationMessage('Debes ingresar tu contraseña');
                            return false;
                        }
                        return pass;
                    }
                });

                if (!enteredPassword) return; // Cancelado

                // Validar la contraseña en el servidor antes de proceder
                Swal.fire({ title: 'Validando contraseña...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const verifyRes = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}&pass=${encodeURIComponent(enteredPassword)}`);
                const verifyData = await verifyRes.json();

                if (!verifyData.success) {
                    Swal.fire({ icon: 'error', title: 'Error', text: 'Contraseña incorrecta. Inténtalo de nuevo.' });
                    return;
                }

                // Guardar la contraseña validada para la transacción
                window.validatedRedeemPassword = enteredPassword;

            } else {
                // Fallback para usuarios sin contraseña configurada (legacy)
                const { isConfirmed } = await Swal.fire({
                    title: '🛡️ Protege tus $',
                    html: `
                        <p style="font-size:0.9rem;color:#aaa;line-height:1.4;">
                            Aún no has configurado una contraseña. Cualquier persona que conozca tu ID de Free Fire podría canjear tus $ acumulados.<br><br>
                            ¿Te gustaría crear una contraseña ahora para bloquear tus $ de forma segura?
                        </p>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '🔐 Crear Contraseña',
                    cancelButtonText: '⚡ Canjear sin contraseña',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff'
                });

                if (isConfirmed) {
                    // Abrir flujo de creación de contraseña
                    await promptSetPassword(uid);
                    return; // Detener flujo actual para que usen su nueva contraseña
                } else {
                    // Decidió continuar sin contraseña
                    window.validatedRedeemPassword = null;
                }
            }

            // Mostrar el modal de opciones de canje
            showRedeemOptions(currentPoints);

        } catch (e) {
            console.error('Error en el flujo de canje:', e);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo verificar la protección de la cuenta.' });
        }
    });

    function showRedeemOptions(currentPoints) {
        const currentUsdt = (currentPoints * 0.003).toFixed(2);
        Swal.fire({
            title: '💰 Canjear Cashback USDT',
            html: `
                <p style="font-size: 0.9rem; color: #aaa; margin-bottom: 20px;">Tienes <strong style="color:#00e676;">$${currentUsdt} USDT</strong> de cashback disponible.</p>
                <div class="redeem-options" style="display: grid; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('basica')">🃏 Tarjeta Básica ($1.20 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('100')">💎 100 Diamantes ($1.50 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('semanal')">📅 Tarjeta Semanal ($4.50 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('310')">💎 310 Diamantes ($4.50 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('booyah')">🏆 Pase Booyah ($6.90 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('520')">💎 520 Diamantes ($7.50 USDT)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('mensual')">👑 Tarjeta Mensual ($22.50 USDT)</button>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff'
        });
    }

    window.redeem = async (pack) => {
        const uid = playerInput.value;
        const newUserBanner = document.getElementById('new-user-banner');
        Swal.fire({ title: 'Procesando canje...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await fetch(`${SERVER_URL}/canjear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    uid, 
                    pack, 
                    password: window.validatedRedeemPassword || null 
                })
            });
            const data = await res.json();

            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '¡Canje Exitoso!',
                    html: `Tu PIN es: <code style="font-size: 1.2rem; color: var(--secondary);">${data.pin}</code>`,
                    confirmButtonText: 'Copiar PIN y Cerrar'
                }).then(() => {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(data.pin).catch(err => console.log('Error al copiar PIN:', err));
                    }
                    loadUserPoints(uid);
                });
            } else {
                Swal.fire({ icon: 'error', title: 'Fallo en Canje', text: data.message });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar el canje.' });
        } finally {
            // Limpiar la contraseña validada
            window.validatedRedeemPassword = null;
        }
        if (newUserBanner) newUserBanner.style.display = 'none';
    };

    function resetUI() {
        // Mostrar input y botón inicial
        document.querySelector('.input-group').style.display = 'flex';
        document.getElementById('player-id').value = '';
        verifyBtn.style.display = 'flex';

        // Ocultar secciones secundarias
        document.getElementById('welcome-section').style.display = 'none';
        document.getElementById('packages-section').style.display = 'none';
        document.getElementById('payment-section').style.display = 'none';
        document.querySelector('.main-container').classList.remove('expanded');
        
        // Resetear selección de paquetes
        selectedPackage = null;
        selectedQty = 1;
        if (quantitySection) quantitySection.style.display = 'none';
        document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
        buyBtn.disabled = true;

        // Limpiar historial en memoria al cambiar de ID
        currentPlayerHistory = [];
        historyLoadedForUid = null;
    }

    if (changeIdBtn) changeIdBtn.addEventListener('click', resetUI);
    if (resetUiBtn) resetUiBtn.addEventListener('click', resetUI);

    // Función global para copiar PIN
    window.copyPin = () => {
        const pinText = document.getElementById('assigned-pin').innerText;
        if (pinText) {
            navigator.clipboard.writeText(pinText).then(() => {
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: true,
                    background: '#1a1a1a',
                    color: '#fff'
                });
                Toast.fire({
                    icon: 'success',
                    title: 'PIN Copiado al portapapeles'
                });
            });
        }
    };

    window.copyPin = () => {
        const pinEl = document.getElementById('assigned-pin');
        if (!pinEl) return;
        const pin = pinEl.innerText;
        if (!pin) return;
        navigator.clipboard.writeText(pin).then(() => {
            const btn = document.querySelector('.btn-copy-pin');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
                btn.style.background = '#25D366';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                }, 2000);
            }
        });
    };

    // ===== SECCIÓN DE PUBLICIDADES / SLIDER BANNER =====
    let currentAdSlide = 0;
    let adSlideInterval = null;
    let _lastAdsJson = '';

    function renderAds(ads) {
        const container = document.getElementById('ads-slider-container');
        const wrapper = document.getElementById('ads-slider-wrapper');
        const dotsContainer = document.getElementById('ads-slider-dots');
        
        if (!container || !wrapper || !dotsContainer) return;
        
        // Filtrar anuncios que tengan imagen configurada
        const activeAds = (ads || []).filter(ad => ad.imagen && ad.imagen.trim() !== '');
        const newAdsJson = JSON.stringify(activeAds);
        
        // Si los anuncios no han cambiado, no re-crear el DOM para no resetear la marquesina ni relayouts
        if (newAdsJson === _lastAdsJson && wrapper.children.length > 0) {
            return;
        }
        _lastAdsJson = newAdsJson;
        
        if (activeAds.length === 0) {
            container.style.display = 'none';
            clearInterval(adSlideInterval);
            return;
        }
        
        container.style.display = 'block';
        wrapper.innerHTML = '';
        dotsContainer.innerHTML = '';
        
        activeAds.forEach((ad, index) => {
            const slide = document.createElement('div');
            slide.className = 'ad-slide';
            
            const img = document.createElement('img');
            img.src = ad.imagen.trim();
            img.alt = `Publicidad ${index + 1}`;
            img.loading = 'lazy';
            slide.appendChild(img);
            
            if (ad.link && ad.link.trim() !== '') {
                slide.onclick = () => {
                    window.open(ad.link.trim(), '_blank');
                };
            }
            
            wrapper.appendChild(slide);
            
            // Crear dot (indicador) si hay más de 1 anuncio
            if (activeAds.length > 1) {
                const dot = document.createElement('div');
                dot.className = 'ad-dot' + (index === 0 ? ' active' : '');
                dot.onclick = (e) => {
                    e.stopPropagation();
                    goToAdSlide(index);
                };
                dotsContainer.appendChild(dot);
            }
        });
        
        currentAdSlide = 0;
        goToAdSlide(0);
        
        // Auto-play cada 5 segundos
        clearInterval(adSlideInterval);
        if (activeAds.length > 1) {
            adSlideInterval = setInterval(() => {
                const next = (currentAdSlide + 1) % activeAds.length;
                goToAdSlide(next);
            }, 5000);
        }
    }

    function goToAdSlide(index) {
        const wrapper = document.getElementById('ads-slider-wrapper');
        const dots = document.querySelectorAll('.ad-dot');
        if (!wrapper) return;
        
        currentAdSlide = index;
        wrapper.style.transform = `translateX(-${index * 100}%)`;
        
        dots.forEach((dot, idx) => {
            if (idx === index) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    // Exponer renderAds a nivel global para que loadConfig pueda llamarla si lo requiere
    window.renderAds = renderAds;

    // ============================================================
    // 🔊 MOTOR DE SONIDO DE RULETA (Web Audio API para clicks mecánicos ultra-reales)
    // ============================================================
    let rouletteAudioCtx = null;
    function playRouletteClickSound() {
        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtxClass) return;
            if (!rouletteAudioCtx) {
                rouletteAudioCtx = new AudioCtxClass();
            }
            if (rouletteAudioCtx.state === 'suspended') {
                rouletteAudioCtx.resume().catch(() => {});
            }

            const osc = rouletteAudioCtx.createOscillator();
            const gain = rouletteAudioCtx.createGain();

            // Clic agudo que simula el choque de la aguja contra los remaches de la rueda
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(850, rouletteAudioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(120, rouletteAudioCtx.currentTime + 0.025);

            gain.gain.setValueAtTime(0.3, rouletteAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, rouletteAudioCtx.currentTime + 0.025);

            osc.connect(gain);
            gain.connect(rouletteAudioCtx.destination);

            osc.start(rouletteAudioCtx.currentTime);
            osc.stop(rouletteAudioCtx.currentTime + 0.025);
        } catch (e) {}
    }

    // ============================================================
    // 🎰 RULETA DE LA SUERTE - SE ACTIVA TRAS RECARGA APROBADA
    // ============================================================
    window.showRouletteAfterApproval = function(loginUid, orderRef, paidUsdt) {
        window.pendingRouletteData = { uid: loginUid, ref: orderRef, amount: paidUsdt };
        if (window.addNotification) {
            window.addNotification(
                '🎰 ¡Recarga aprobada! Gira la Ruleta',
                `Tu recarga (Ref: ${orderRef || 'Exitosa'}) ha sido entregada. ¡Gira la Ruleta de la Suerte para reclamar tu premio en saldo USDT!`,
                'roulette',
                'Girar Ruleta'
            );
        }

        // Premios: probabilidades desde 50% ($0.01) hasta 2% ($1.00)
        const PRIZES = [
            { label: '$0.01 USDT', emoji: '💎', amount: 0.01, color: '#4A00E0', prob: 0.50 },
            { label: '$0.05 USDT', emoji: '💎', amount: 0.05, color: '#7928CA', prob: 0.25 },
            { label: '$0.10 USDT', emoji: '🌟', amount: 0.10, color: '#9D00FF', prob: 0.13 },
            { label: '$0.25 USDT', emoji: '🔥', amount: 0.25, color: '#5500CC', prob: 0.07 },
            { label: '$0.50 USDT', emoji: '⚡', amount: 0.50, color: '#00B2FF', prob: 0.03 },
            { label: '$1.00 USDT', emoji: '👑', amount: 1.00, color: '#FFD700', prob: 0.02 }
        ];

        // --- Determinar premio ganado (cliente puede calcular resultado localmente, server lo valida) ---
        let rand = Math.random();
        let cumulative = 0;
        let winIdx = 0;
        for (let i = 0; i < PRIZES.length; i++) {
            cumulative += PRIZES[i].prob;
            if (rand <= cumulative) { winIdx = i; break; }
        }
        const winPrize = PRIZES[winIdx];

        // --- Construir modal ---
        const overlay = document.createElement('div');
        overlay.className = 'roulette-overlay';

        // Generar pills de premios
        const pillsHTML = PRIZES.map((p, i) =>
            `<span class="roulette-prize-pill ${i === PRIZES.length - 1 ? 'jackpot' : ''}">${p.emoji} ${p.label}</span>`
        ).join('');

        overlay.innerHTML = `
            <div class="roulette-modal">
                <div class="roulette-header-badge">🎰 Premio de Recarga</div>
                <h2 class="roulette-title">¡Gira la Ruleta!</h2>
                <p class="roulette-subtitle">Como gracias por tu recarga, ¡tienes un premio!</p>
                <div class="roulette-wheel-wrapper">
                    <div class="roulette-pointer"></div>
                    <canvas id="roulette-canvas" class="roulette-wheel-canvas" width="240" height="240"></canvas>
                </div>
                <div class="roulette-prizes-info">${pillsHTML}</div>
                <button id="roulette-spin-btn" class="roulette-spin-btn">
                    <i class="fa-solid fa-rotate-right"></i> &nbsp;¡GIRAR AHORA!
                </button>
                <button id="roulette-close-btn" class="roulette-close-btn">Cerrar</button>
            </div>
        `;

        document.body.appendChild(overlay);

        // --- Dibujar rueda en canvas ---
        const canvas = document.getElementById('roulette-canvas');
        const ctx = canvas.getContext('2d');
        const cx = 120, cy = 120, radius = 118;
        const segAngle = (Math.PI * 2) / PRIZES.length;
        let currentAngle = 0;

        function drawWheel(rotation) {
            ctx.clearRect(0, 0, 240, 240);
            PRIZES.forEach((p, i) => {
                const startAngle = rotation + i * segAngle;
                const endAngle = startAngle + segAngle;
                // Segmento
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                // Texto
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(startAngle + segAngle / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px Montserrat, sans-serif';
                ctx.shadowColor = 'rgba(0,0,0,0.6)';
                ctx.shadowBlur = 4;
                ctx.fillText(p.label, radius - 8, 4);
                ctx.font = '14px sans-serif';
                ctx.fillText(p.emoji, radius - 60, 5);
                ctx.restore();
            });
            // Centro
            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fillStyle = '#07030D';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💎', cx, cy);
        }

        drawWheel(0);

        // --- Lógica de giro ---
        const spinBtn = document.getElementById('roulette-spin-btn');
        const closeBtn = document.getElementById('roulette-close-btn');
        let hasSpun = false;

        closeBtn.addEventListener('click', () => {
            if (!hasSpun) { document.body.removeChild(overlay); }
        });

        spinBtn.addEventListener('click', () => {
            if (hasSpun) return;
            hasSpun = true;
            spinBtn.disabled = true;
            spinBtn.classList.add('spinning');
            spinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> &nbsp;Girando...';
            closeBtn.style.display = 'none';

            // Calcular rotación final para que caiga en el premio ganado
            const extraSpins = 5 + Math.floor(Math.random() * 3); // 5-7 vueltas completas
            const targetAngle = (-Math.PI / 2) - (winIdx * segAngle) - (segAngle / 2) - (Math.random() * segAngle * 0.6 - segAngle * 0.3);
            const totalRotation = (Math.PI * 2) * extraSpins + targetAngle;

            const duration = 5000; // ms
            const startTime = performance.now();
            let lastSegIdx = -1;

            function easeOut(t) {
                return 1 - Math.pow(1 - t, 4);
            }

            function animate(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                currentAngle = totalRotation * easeOut(progress);

                // 🔊 Reproducir clic mecánico por cada segmento superado
                const currentSeg = Math.floor(currentAngle / segAngle);
                if (currentSeg !== lastSegIdx) {
                    lastSegIdx = currentSeg;
                    playRouletteClickSound();
                }

                drawWheel(currentAngle);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Animación completada — mostrar premio
                    onSpinComplete();
                }
            }

            requestAnimationFrame(animate);
        });

        async function onSpinComplete() {
            // Acreditar puntos en el servidor
            let credited = false;
            if (loginUid) {
                try {
                    const res = await fetch(`${SERVER_URL}/api/add-roulette-bonus`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid: loginUid, prize_usdt: winPrize.amount, order_ref: orderRef })
                    });
                    const data = await res.json();
                    if (data.success) {
                        credited = true;
                        // Actualizar el header de puntos en tiempo real
                        const headerPts = document.getElementById('header-points-val');
                        if (headerPts) {
                            const newUsdt = data.new_total_usdt.toFixed(2);
                            headerPts.textContent = newUsdt;
                        }
                        // Actualizar el badge de puntos en la sección de bienvenida
                        const userPointsEl = document.getElementById('user-points');
                        if (userPointsEl) {
                            userPointsEl.textContent = `${data.new_total_usdt.toFixed(2)} USDT`;
                        }
                        window.pendingRouletteData = null;
                        console.log(`[RULETA] ✅ ${winPrize.amount} USDT acreditados a ${loginUid}`);
                    }
                } catch (e) {
                    console.error('[RULETA] Error acreditando premio:', e);
                }
            }

            // Mostrar resultado en el modal
            const modal = overlay.querySelector('.roulette-modal');
            const wheelWrapper = overlay.querySelector('.roulette-wheel-wrapper');
            const prizeInfo = overlay.querySelector('.roulette-prizes-info');
            const spinBtnEl = document.getElementById('roulette-spin-btn');
            const closeBtnEl = document.getElementById('roulette-close-btn');

            // Insertar display del premio antes del botón
            const prizeDisplay = document.createElement('div');
            prizeDisplay.className = 'roulette-prize-display';
            prizeDisplay.innerHTML = `
                <span class="prize-emoji">${winPrize.emoji}</span>
                <span class="prize-amount">+${winPrize.label}</span>
                <span class="prize-label">${credited ? '✅ Acreditado a tu cuenta' : '⚠️ Conectando con servidor...'}</span>
            `;

            if (prizeInfo) prizeInfo.after(prizeDisplay);

            // Actualizar botón spin
            spinBtnEl.classList.remove('spinning');
            spinBtnEl.innerHTML = `🎉 ¡Ganaste ${winPrize.label}!`;
            spinBtnEl.style.background = 'linear-gradient(135deg, #00c853, #00695c)';
            spinBtnEl.style.cursor = 'default';

            // Mostrar botón cerrar
            closeBtnEl.style.display = 'block';
            closeBtnEl.textContent = '¡Listo! Cerrar';
            closeBtnEl.style.color = '#fff';
            closeBtnEl.style.borderColor = 'rgba(255,255,255,0.25)';
            closeBtnEl.addEventListener('click', () => {
                overlay.style.animation = 'none';
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.3s';
                setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 300);
            });

            // Confetti para premios grandes
            if (winPrize.amount >= 0.50 && typeof confetti !== 'undefined') {
                const dur = 3000;
                const end = Date.now() + dur;
                const def = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };
                function rnd(min, max) { return Math.random() * (max - min) + min; }
                const iv = setInterval(() => {
                    const tl = end - Date.now();
                    if (tl <= 0) return clearInterval(iv);
                    const pc = 50 * (tl / dur);
                    confetti(Object.assign({}, def, { particleCount: pc, origin: { x: rnd(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#ffd700', '#9D00FF', '#00F0FF'] }));
                    confetti(Object.assign({}, def, { particleCount: pc, origin: { x: rnd(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#ffd700', '#9D00FF', '#00F0FF'] }));
                }, 250);
            }

            // Sonido de éxito
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3').play().catch(() => {}); } catch(e) {}
        }
    };

    // ============================================================
    // 🎟️ GRAN SORTEO SEMANAL DE REFERIDOS - RUEDA & COUNTDOWN
    // ============================================================
    let weeklyRaffleTimer = null;
    let weeklyRaffleAnim = null;
    let weeklyRaffleAngle = 0;
    let lastAnimatedWinnerTimestamp = null;
    window.isRaffleSpinningActive = false;

    async function initWeeklyRaffle(forceSpin = false) {
        if (window.isRaffleSpinningActive) return;

        try {
            const res = await fetch(`${SERVER_URL}/api/sorteo-semanal`);
            const data = await res.json();
            if (!data.success) return;

            // Actualizar texto del premio
            const prizeEl = document.getElementById('raffle-prize-text');
            if (prizeEl) prizeEl.textContent = data.premio || '341 Diamantes';

            // Actualizar tickets del usuario actual
            const currentUid = localStorage.getItem('ff_user_id') || localStorage.getItem('ff_login_uid');
            const userTicketsEl = document.getElementById('user-raffle-tickets');
            if (userTicketsEl) {
                if (currentUid) {
                    const userPart = (data.participants || []).find(p => p.uid === currentUid);
                    userTicketsEl.textContent = userPart ? userPart.tickets : 0;
                } else {
                    userTicketsEl.textContent = 0;
                }
            }

            // Iniciar Reloj Cuenta Regresiva
            startRaffleCountdown(data.endOfCycleTimestamp, data);

            // Si hay un nuevo ganador detectado en vivo que no hemos animado aún
            const winnerTs = data.lastWinner ? new Date(data.lastWinner.timestamp).getTime() : null;
            const isRecentDraw = winnerTs && (Date.now() - winnerTs < 300000); // Sorteo realizado en los últimos 5 minutos

            if (data.lastWinner && (forceSpin || (winnerTs && winnerTs !== lastAnimatedWinnerTimestamp && isRecentDraw))) {
                lastAnimatedWinnerTimestamp = winnerTs;
                if ((!data.ticketList || data.ticketList.length === 0) && data.lastWinner.ticketList) {
                    data.ticketList = data.lastWinner.ticketList;
                }
                // Girar la rueda en vivo con todos los participantes del sorteo
                triggerWeeklyRaffleDraw(data);
                return;
            }
            if (data.lastWinner && winnerTs) {
                lastAnimatedWinnerTimestamp = winnerTs;
            }

            // Mostrar último ganador en reposo solo cuando no hay giro pendiente
            const winnerEl = document.getElementById('raffle-last-winner');
            const winnerNameEl = document.getElementById('last-winner-name');
            if (winnerEl && winnerNameEl && data.lastWinner) {
                winnerEl.style.display = 'flex';
                const winnerUid = data.lastWinner.uid ? ` (ID: ${data.lastWinner.uid})` : '';
                winnerNameEl.innerHTML = `<span style="color: #FFD700; font-weight: 800; font-size: 1rem; text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);">${data.lastWinner.name}</span> <span style="color: #00f0ff; font-weight: 800; font-size: 0.9rem; font-family: monospace;">${winnerUid}</span> <span style="color: #00FF94; font-weight: 700;">— Ganó ${data.lastWinner.premio}</span>`;
            }

            // Renderizar Rueda de Participantes en reposo
            renderWeeklyRaffleWheel(data.ticketList || []);

        } catch (e) {
            console.error('[SORTEO-SEMANAL-UI] Error al cargar:', e.message);
        }
    }

    // Polling en vivo cada 5 segundos para detectar giros de sorteo en tiempo real
    setInterval(() => {
        if (!document.hidden && !window.isRaffleSpinningActive) {
            initWeeklyRaffle();
        }
    }, 5000);

    function startRaffleCountdown(targetTime, raffleData) {
        if (weeklyRaffleTimer) clearInterval(weeklyRaffleTimer);

        function updateClock() {
            const now = Date.now();
            const diff = Math.max(0, targetTime - now);

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const mins = Math.floor((diff / 1000 / 60) % 60);
            const secs = Math.floor((diff / 1000) % 60);

            const dEl = document.getElementById('raffle-days');
            const hEl = document.getElementById('raffle-hours');
            const mEl = document.getElementById('raffle-mins');
            const sEl = document.getElementById('raffle-secs');

            if (dEl) dEl.textContent = String(days).padStart(2, '0');
            if (hEl) hEl.textContent = String(hours).padStart(2, '0');
            if (mEl) mEl.textContent = String(mins).padStart(2, '0');
            if (sEl) sEl.textContent = String(secs).padStart(2, '0');

            if (diff <= 0) {
                clearInterval(weeklyRaffleTimer);
                fetch(`${SERVER_URL}/api/sorteo-semanal`)
                    .then(r => r.json())
                    .then(freshData => {
                        triggerWeeklyRaffleDraw(freshData);
                    })
                    .catch(() => {
                        triggerWeeklyRaffleDraw(raffleData);
                    });
            }
        }

        updateClock();
        weeklyRaffleTimer = setInterval(updateClock, 1000);
    }

    function renderWeeklyRaffleWheel(ticketList) {
        const canvas = document.getElementById('weekly-raffle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = 100, cy = 100, radius = 98;

        const colors = [
            '#9D00FF', '#00F0FF', '#FF00E5', '#7928CA',
            '#00FF94', '#FFD700', '#FF3D71', '#5500CC'
        ];

        const displayItems = ticketList.length > 0 ? ticketList : [
            { name: '¡Invita 2 Amigos!' },
            { name: 'Tu Nombre Aquí' },
            { name: 'Gana Diamantes' },
            { name: 'Sorteo Domingo' }
        ];

        const segAngle = (Math.PI * 2) / displayItems.length;

        function draw(rot) {
            ctx.clearRect(0, 0, 200, 200);
            displayItems.forEach((item, i) => {
                const startA = rot + i * segAngle;
                const endA = startA + segAngle;

                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, radius, startA, endA);
                ctx.closePath();
                ctx.fillStyle = colors[i % colors.length];
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(startA + segAngle / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 9px Montserrat, sans-serif';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 3;

                const nameText = item.name.length > 14 ? item.name.substring(0, 12) + '..' : item.name;
                ctx.fillText(nameText, radius - 6, 3);
                ctx.restore();
            });

            ctx.beginPath();
            ctx.arc(cx, cy, 18, 0, Math.PI * 2);
            ctx.fillStyle = '#07030D';
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎟️', cx, cy);
        }

        if (weeklyRaffleAnim) cancelAnimationFrame(weeklyRaffleAnim);

        function spinLoop() {
            weeklyRaffleAngle += 0.005;
            draw(weeklyRaffleAngle);
            weeklyRaffleAnim = requestAnimationFrame(spinLoop);
        }

        spinLoop();
    }

    function triggerWeeklyRaffleDraw(raffleData) {
        // SEGURIDAD GLOBAL: El ganador DEBE provenir 100% del servidor backend (lastWinner).
        // Ningún cliente debe adivinar o sortear de forma local con Math.random().
        if (!raffleData || !raffleData.lastWinner || !raffleData.lastWinner.name) {
            console.warn('[SORTEO-SEMANAL-UI] No hay un ganador oficial registrado por el servidor. Cancelando giro local.');
            window.isRaffleSpinningActive = false;
            return;
        }

        window.isRaffleSpinningActive = true;
        if (weeklyRaffleAnim) cancelAnimationFrame(weeklyRaffleAnim);

        // 1. Obtener el ganador oficial único dictado por el servidor
        const lastWin = raffleData.lastWinner;
        const winnerObj = { uid: String(lastWin.uid || 'N/A'), name: lastWin.name };

        // 2. Construir la lista exacta de ítems que se dibujará en la rueda
        let itemsToDraw = [];
        if (raffleData.ticketList && raffleData.ticketList.length > 0) {
            itemsToDraw = [...raffleData.ticketList];
        } else if (lastWin.ticketList && lastWin.ticketList.length > 0) {
            itemsToDraw = [...lastWin.ticketList];
        }

        // Buscar el índice del ganador en la lista a dibujar
        let winIdx = itemsToDraw.findIndex(item => String(item.uid) === String(winnerObj.uid));

        // Si el ganador no está presente en la lista, forzamos su inclusión en la primera posición
        if (winIdx === -1) {
            if (itemsToDraw.length > 0) {
                itemsToDraw[0] = winnerObj;
            } else {
                itemsToDraw = [winnerObj];
            }
            winIdx = 0;
        }

        const winner = itemsToDraw[winIdx]; // Objeto idéntico garantizado 100% por el servidor

        const canvas = document.getElementById('weekly-raffle-canvas');
        if (!canvas) {
            window.isRaffleSpinningActive = false;
            return;
        }
        const ctx = canvas.getContext('2d');
        const totalItems = itemsToDraw.length;
        const segAngle = (Math.PI * 2) / totalItems;

        const extraSpins = 6;
        const targetAngle = (-Math.PI / 2) - (winIdx * segAngle) - (segAngle / 2);
        
        // Normalizar la rotación inicial para calcular la distancia exacta al segmento objetivo
        const currentRotNormalized = weeklyRaffleAngle % (Math.PI * 2);
        let deltaAngle = (targetAngle - currentRotNormalized) % (Math.PI * 2);
        if (deltaAngle < 0) deltaAngle += Math.PI * 2;

        const totalRot = (Math.PI * 2) * extraSpins + deltaAngle;
        const startRot = weeklyRaffleAngle;
        const duration = 6000;
        const startTime = performance.now();
        let lastWeeklySegIdx = -1;

        function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

        function animate(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentRot = startRot + totalRot * easeOut(progress);

            // 🔊 Reproducir clic mecánico por cada segmento superado
            const currentSeg = Math.floor(currentRot / segAngle);
            if (currentSeg !== lastWeeklySegIdx) {
                lastWeeklySegIdx = currentSeg;
                playRouletteClickSound();
            }

            ctx.clearRect(0, 0, 200, 200);
            const colors = ['#9D00FF', '#00F0FF', '#FF00E5', '#7928CA', '#00FF94', '#FFD700', '#FF3D71', '#5500CC'];

            itemsToDraw.forEach((item, i) => {
                const startA = currentRot + i * segAngle;
                const endA = startA + segAngle;

                ctx.beginPath();
                ctx.moveTo(100, 100);
                ctx.arc(100, 100, 98, startA, endA);
                ctx.closePath();
                ctx.fillStyle = colors[i % colors.length];
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.save();
                ctx.translate(100, 100);
                ctx.rotate(startA + segAngle / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 9px Montserrat, sans-serif';
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 3;
                const nameText = item.name.length > 14 ? item.name.substring(0, 12) + '..' : item.name;
                ctx.fillText(nameText, 92, 3);
                ctx.restore();
            });

            // Centro de la rueda
            ctx.beginPath();
            ctx.arc(100, 100, 18, 0, Math.PI * 2);
            ctx.fillStyle = '#07030D';
            ctx.fill();
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🎟️', 100, 100);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                window.isRaffleSpinningActive = false;

                // 🔊 Sonido de victoria al detenerse la rueda
                try { new Audio('https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3').play().catch(() => {}); } catch(e) {}

                // Revelar e iluminar el banner del ganador justo al detenerse la aguja sobre su segmento
                const winnerEl = document.getElementById('raffle-last-winner');
                const winnerNameEl = document.getElementById('last-winner-name');
                if (winnerEl && winnerNameEl) {
                    winnerEl.style.display = 'flex';
                    const winnerUidStr = winner.uid ? ` (ID: ${winner.uid})` : '';
                    winnerNameEl.innerHTML = `<span style="color: #FFD700; font-weight: 800; font-size: 1rem; text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);">${winner.name}</span> <span style="color: #00f0ff; font-weight: 800; font-size: 0.9rem; font-family: monospace;">${winnerUidStr}</span> <span style="color: #00FF94; font-weight: 700;">— Ganó ${raffleData.premio || '341 Diamantes'}</span>`;
                }

                if (typeof confetti !== 'undefined') {
                    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
                }

                Swal.fire({
                    title: '🏆 ¡TENEMOS GANADOR!',
                    html: `¡Felicidades a <strong style="color:#FFD700; font-size:1.5rem; text-shadow: 0 0 10px rgba(255,215,0,0.8);">${winner.name}</strong>!<br><br>Ganador de <strong style="color:#00FF94;">${raffleData.premio || '341 Diamantes'}</strong> en el Sorteo Semanal 🎉<br><small style="color:#aaa;">El administrador se contactará por WhatsApp para la entrega del premio.</small>`,
                    icon: 'success',
                    background: 'rgba(20,10,35,0.98)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                }).then(() => {
                    // Al cerrar el modal, resetear la interfaz de la ruleta inmediatamente a limpia (0 boletos)
                    initWeeklyRaffle();
                });

                // Reseteo automático de respaldo después de 8 segundos si no cierra el modal
                setTimeout(initWeeklyRaffle, 8000);
            }
        }

        requestAnimationFrame(animate);
    }

    initWeeklyRaffle();

    // ============================================================
    // 🔗 MANEJADOR PARA COMPARTIR LINK DE REFERIDO
    // ============================================================
    function copyToClipboardFallback(refLink) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(refLink).then(() => {
                Swal.fire({
                    icon: 'success',
                    title: '¡Enlace Copiado!',
                    html: `Tu enlace de referido es:<br><code style="color:#00FF94; font-size:0.88rem;">${refLink}</code><br><br>Pásalo a tus amigos. ¡Cada 2 amigos que invites = 1 boleto en la ruleta! 🚀`,
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                });
            }).catch(() => {
                prompt('Copia tu enlace de referido:', refLink);
            });
        } else {
            prompt('Copia tu enlace de referido:', refLink);
        }
    }

    window.handleShareReferralLink = function() {
        const uid = localStorage.getItem('ff_user_id') || localStorage.getItem('ff_login_uid');
        if (!uid) {
            return Swal.fire({
                title: '🎮 Inicia Sesión primero',
                html: 'Para obtener tu link de referido y acumular boletos en la ruleta semanal, primero ingresa tu ID de jugador arriba.',
                icon: 'info',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#9D00FF',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });
        }

        const refLink = `${window.location.origin}${window.location.pathname}?ref=${uid}`;
        const shareText = `💎 ¡Recarga diamantes en RecargasNey con entregas al instante!\n🎁 Registrate con mi link y participa en el Sorteo Semanal de 341 Diamantes:\n${refLink}`;

        if (navigator.share) {
            navigator.share({
                title: 'RecargasNey - Sorteo Semanal',
                text: shareText,
                url: refLink
            }).catch(() => {
                copyToClipboardFallback(refLink);
            });
        } else {
            copyToClipboardFallback(refLink);
        }
    };

    const copyBtn1 = document.getElementById('copy-ref-link-btn');
    if (copyBtn1) copyBtn1.addEventListener('click', window.handleShareReferralLink);

    const copyBtn2 = document.getElementById('copy-raffle-ref-link-btn');
    if (copyBtn2) copyBtn2.addEventListener('click', window.handleShareReferralLink);

    // ============================================================
    // 🔔 CENTRO DE NOTIFICACIONES Y ALERTAS DE RECARGA/RULETA
    // ============================================================
    function getNotifications() {
        const stored = localStorage.getItem('ff_user_notifications');
        if (stored) {
            try { 
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) return parsed;
            } catch(e) {}
        }
        return [
            {
                id: 'notif_roulette_promo',
                title: '🎰 ¡Gira la Ruleta tras cada Recarga!',
                body: 'Por cada recarga aprobada obtienes 1 giro en la Ruleta de la Suerte (premios de 0.050 a 1.00 USDT acreditados a tu saldo).',
                action: 'roulette',
                actionText: 'Girar Ruleta',
                time: 'Hoy'
            },
            {
                id: 'notif_weekly_raffle',
                title: '🎟️ Gran Sorteo Semanal (341 Diamantes)',
                body: '¡Invita a tus amigos con tu link! Por cada 2 amigos que invites entras a la ruleta en vivo este Domingo a las 9:00 PM VET.',
                action: 'share',
                actionText: 'Compartir Link',
                time: 'Esta semana'
            }
        ];
    }

    function saveNotifications(notifs) {
        localStorage.setItem('ff_user_notifications', JSON.stringify(notifs));
        updateNotifBadge();
    }

    function updateNotifBadge() {
        const notifs = getNotifications();
        const badge = document.getElementById('notif-badge');
        if (badge) {
            if (notifs.length > 0) {
                badge.style.display = 'flex';
                badge.textContent = notifs.length;
            } else {
                badge.style.display = 'none';
            }
        }
    }

    window.removeNotification = function(idx) {
        const notifs = getNotifications();
        if (idx >= 0 && idx < notifs.length) {
            notifs.splice(idx, 1);
            saveNotifications(notifs);
        }
        if (Swal.isVisible()) {
            openNotificationCenter();
        }
    };

    window.handleNotifAction = function(idx) {
        const notifs = getNotifications();
        const item = notifs[idx];
        
        if (item) {
            notifs.splice(idx, 1);
            saveNotifications(notifs);
        }

        Swal.close();

        if (item && item.action === 'roulette') {
            if (window.pendingRouletteData) {
                window.showRouletteAfterApproval(window.pendingRouletteData.uid, window.pendingRouletteData.ref, window.pendingRouletteData.amount);
            } else {
                const raffleCard = document.getElementById('weekly-raffle-card');
                if (raffleCard) {
                    raffleCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        } else if (item && item.action === 'share') {
            window.handleShareReferralLink();
        }
    };

    window.addNotification = function(title, body, action, actionText) {
        const notifs = getNotifications();
        const newNotif = {
            id: 'notif_' + Date.now(),
            title: title,
            body: body,
            action: action || 'none',
            actionText: actionText || 'Ver',
            time: 'Ahora'
        };
        notifs.unshift(newNotif);
        saveNotifications(notifs);

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body: body,
                    icon: '/icon-192.png'
                });
            } catch(e) {}
        }
    };

    window.enablePushPermissionFromModal = async function() {
        try {
            if (!('Notification' in window)) {
                Swal.fire({ icon: 'error', title: 'No soportado', text: 'Tu navegador no soporta notificaciones push.', background: 'rgba(20, 10, 35, 0.98)', color: '#fff' });
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const uid = localStorage.getItem('ff_user_id') || 'anon_' + Date.now();
                if (window.subscribeUser) {
                    await window.subscribeUser(uid);
                }
                Swal.fire({
                    icon: 'success',
                    title: '¡Notificaciones Activadas! 🔔',
                    text: 'Este dispositivo ha sido registrado correctamente.',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                });
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'Permiso Denegado',
                    text: 'Debes permitir las notificaciones en los ajustes de tu navegador o aplicación.',
                    background: 'rgba(20, 10, 35, 0.98)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                });
            }
        } catch(e) {
            console.error('Error activando notificaciones:', e);
        }
    };

    function openNotificationCenter() {
        const notifs = getNotifications();
        
        let notifHtml = '';

        if (!('Notification' in window) || Notification.permission !== 'granted') {
            notifHtml += `
                <div style="background: linear-gradient(135deg, rgba(157,0,255,0.25), rgba(0,212,255,0.25)); border: 1px solid rgba(157,0,255,0.5); padding: 12px; border-radius: 12px; margin-bottom: 15px; text-align: center;">
                    <div style="font-weight: bold; margin-bottom: 4px; font-size: 0.95rem; color: #fff;">🔔 Notificaciones Push Desactivadas</div>
                    <div style="font-size: 0.8rem; color: #ccc; margin-bottom: 10px;">Haz clic en el botón de abajo para activar y recibir alertas de recargas y ofertas en tiempo real.</div>
                    <button onclick="window.enablePushPermissionFromModal()" style="background: linear-gradient(135deg, #9D00FF, #00D4FF); color: #fff; border: none; padding: 8px 18px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; cursor: pointer; box-shadow: 0 4px 12px rgba(157,0,255,0.4);">
                        <i class="fa-solid fa-bell"></i> Activar Notificaciones Ahora
                    </button>
                </div>
            `;
        }

        notifHtml += '<div style="max-height:360px; overflow-y:auto; padding-right:4px;">';
        if (notifs.length === 0) {
            notifHtml += '<p style="color:#aaa; text-align:center; padding:30px 10px; font-size:0.9rem;">✨ ¡Estás al día! No tienes notificaciones ni avisos pendientes.</p>';
        } else {
            notifs.forEach((n, idx) => {
                let btnHtml = '';
                if (n.action === 'roulette') {
                    btnHtml = `<button onclick="window.handleNotifAction(${idx});" class="notif-action-btn"><i class="fa-solid fa-dharmachakra"></i> ${n.actionText || 'Girar Ruleta'}</button>`;
                } else if (n.action === 'share') {
                    btnHtml = `<button onclick="window.handleNotifAction(${idx});" class="notif-action-btn"><i class="fa-solid fa-share-nodes"></i> ${n.actionText || 'Compartir Link'}</button>`;
                } else {
                    btnHtml = `<button onclick="window.handleNotifAction(${idx});" class="notif-action-btn">Entendido</button>`;
                }

                notifHtml += `
                    <div class="notif-item unread" style="position:relative;">
                        <button onclick="window.removeNotification(${idx});" title="Borrar notificación" style="position:absolute; top:8px; right:8px; background:transparent; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:0.85rem; padding:4px;">✕</button>
                        <div class="notif-title" style="padding-right:22px;">${n.title}</div>
                        <div class="notif-body">${n.body}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                            <span style="font-size:0.68rem; color:rgba(255,255,255,0.4);">${n.time}</span>
                            ${btnHtml}
                        </div>
                    </div>
                `;
            });
        }
        notifHtml += '</div>';

        Swal.fire({
            title: '🔔 Centro de Notificaciones',
            html: notifHtml,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            showConfirmButton: false,
            showCloseButton: true
        });
    }

    window.clearAllNotifs = function() {
        saveNotifications([]);
        Swal.close();
    };

    window.handleNotifRouletteClick = function(idx) {
        const notifs = getNotifications();
        if (notifs[idx]) {
            notifs[idx].unread = false;
            saveNotifications(notifs);
        }
        if (window.pendingRouletteData) {
            window.showRouletteAfterApproval(window.pendingRouletteData.uid, window.pendingRouletteData.ref, window.pendingRouletteData.amount);
        } else {
            const raffleCard = document.getElementById('weekly-raffle-card');
            if (raffleCard) {
                raffleCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    const bellBtn = document.getElementById('push-bell-btn');
    if (bellBtn) {
        bellBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNotificationCenter();
        });
    }

    updateNotifBadge();
});


// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// ============================================================
// SMART PWA INSTALL BANNER & iOS GUIDED MODAL
// ============================================================
let deferredInstallPrompt = null;
const pwaBanner = document.getElementById('pwa-install-banner');
const pwaActionBtn = document.getElementById('pwa-install-action-btn');
const pwaCloseBtn = document.getElementById('pwa-close-banner-btn');
const oldInstallBtn = document.getElementById('install-app-btn');

const iosModal = document.getElementById('ios-pwa-modal');
const iosCloseBtn = document.getElementById('ios-modal-close');
const iosUnderstoodBtn = document.getElementById('ios-understood-btn');

// Detectar si el usuario está en modo Standalone (App ya instalada)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// Detectar si es dispositivo iOS (iPhone/iPad)
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Verificar si el usuario descartó el banner recientemente (24 horas)
const isBannerDismissed = localStorage.getItem('pwa_banner_dismissed_until');
const now = Date.now();
const shouldShowBanner = !isStandalone && (!isBannerDismissed || parseInt(isBannerDismissed) < now);

function showPwaBanner() {
    if (!shouldShowBanner) return;
    if (pwaBanner) pwaBanner.style.display = 'flex';
    if (oldInstallBtn) oldInstallBtn.style.display = 'inline-flex';
}

// ============================================================
// MODAL AUTO-PROMPT DE COMUNIDAD: INSTALAR APP & CANAL WHATSAPP
// ============================================================
function triggerCommunityPopupModal() {
    if (isStandalone) return;
    const dismissedUntil = localStorage.getItem('pwa_community_popup_dismissed');
    if (dismissedUntil && parseInt(dismissedUntil) > Date.now()) return;

    const cfg = window.APP_CONFIG || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : null);
    const waCanalUrl = (cfg && cfg.whatsapp && cfg.whatsapp.canal && cfg.whatsapp.canal.trim() !== '')
        ? cfg.whatsapp.canal.trim()
        : '#';

    const popupHtml = `
        <div style="text-align: center; font-family: 'Inter', sans-serif;">
            <div style="width: 70px; height: 70px; margin: 0 auto 12px; position: relative;">
                <img src="/icon-192.png" alt="App Icon" style="width: 100%; height: 100%; border-radius: 18px; box-shadow: 0 6px 20px rgba(157,0,255,0.4); border: 2px solid rgba(0,240,255,0.4);">
                <div style="position: absolute; bottom: -4px; right: -4px; background: #25D366; color: #fff; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; border: 2px solid #0c0617; box-shadow: 0 2px 8px rgba(37,211,102,0.4);">
                    <i class="fa-brands fa-whatsapp"></i>
                </div>
            </div>

            <h2 style="color: #fff; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 1.15rem; margin: 0 0 6px 0;">
                🚀 ¡Mejora tu experiencia en RecargasNey!
            </h2>
            <p style="color: #bbb; font-size: 0.8rem; line-height: 1.4; margin: 0 0 16px 0;">
                Instala nuestra Aplicación Oficial y únete al Canal de WhatsApp para notificaciones de aprobación instantánea y ofertas exclusivas.
            </p>

            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
                <!-- Opción 1: Instalar App -->
                <div style="background: rgba(157,0,255,0.1); border: 1px solid rgba(157,0,255,0.3); border-radius: 12px; padding: 12px; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div>
                        <strong style="color: #00F0FF; font-size: 0.85rem; display: block;">📲 App Oficial RecargasNey</strong>
                        <span style="color: #aaa; font-size: 0.72rem;">Alertas en tu pantalla y recargas en 1-clic</span>
                    </div>
                    <button id="modal-btn-install-app" style="background: linear-gradient(135deg, #00F0FF, #9D00FF); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.78rem; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,240,255,0.3);">
                        <i class="fa-solid fa-download"></i> Instalar
                    </button>
                </div>

                <!-- Opción 2: Canal de WhatsApp -->
                <div style="background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: 12px; padding: 12px; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div>
                        <strong style="color: #25D366; font-size: 0.85rem; display: block;">📢 Canal Oficial WhatsApp</strong>
                        <span style="color: #aaa; font-size: 0.72rem;">Códigos de regalo, sorteos y novedades</span>
                    </div>
                    <a href="${waCanalUrl}" target="_blank" onclick="localStorage.setItem('pwa_community_popup_dismissed', (Date.now() + 12*3600*1000).toString())" style="background: #25D366; color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.78rem; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; box-shadow: 0 4px 12px rgba(37,211,102,0.3);">
                        <i class="fa-brands fa-whatsapp"></i> Unirme
                    </a>
                </div>
            </div>
            
            <button id="modal-btn-dismiss-community" style="background: transparent; border: none; color: #777; font-size: 0.75rem; cursor: pointer; text-decoration: underline; margin-top: 4px;">
                Recordar más tarde
            </button>
        </div>
    `;

    Swal.fire({
        html: popupHtml,
        showConfirmButton: false,
        background: 'rgba(15, 8, 30, 0.98)',
        width: '390px',
        allowOutsideClick: true,
        didOpen: () => {
            const installBtn = document.getElementById('modal-btn-install-app');
            const dismissBtn = document.getElementById('modal-btn-dismiss-community');

            if (installBtn) {
                installBtn.addEventListener('click', () => {
                    Swal.close();
                    if (pwaActionBtn) pwaActionBtn.click();
                });
            }

            if (dismissBtn) {
                dismissBtn.addEventListener('click', () => {
                    localStorage.setItem('pwa_community_popup_dismissed', (Date.now() + 12 * 3600 * 1000).toString());
                    Swal.close();
                });
            }
        }
    });
}

// Capturar el evento nativo de Android / Chrome
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    setTimeout(showPwaBanner, 2000);
    setTimeout(triggerCommunityPopupModal, 3500);
});

// En iOS o cuando el prompt no dispara automáticamente
if (shouldShowBanner) {
    setTimeout(showPwaBanner, 2500);
    setTimeout(triggerCommunityPopupModal, 4000);
}

// Manejar clic en "INSTALAR"
if (pwaActionBtn) {
    pwaActionBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                if (pwaBanner) pwaBanner.style.display = 'none';
                if (oldInstallBtn) oldInstallBtn.style.display = 'none';
            }
            deferredInstallPrompt = null;
        } else if (isIOS) {
            // Mostrar modal guía para iPhone
            if (iosModal) iosModal.style.display = 'flex';
        } else {
            alert('Para instalar la app en Android / PC, abre el menú de opciones de tu navegador (...) y selecciona "Agregar a la pantalla de inicio" o "Instalar aplicación".');
        }
    });
}

// Vincular el botón secundario del menú superior
if (oldInstallBtn) {
    oldInstallBtn.addEventListener('click', (e) => {
        if (pwaActionBtn) pwaActionBtn.click();
    });
}

// Cerrar banner y recordar preferencia por 24h
if (pwaCloseBtn) {
    pwaCloseBtn.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.style.display = 'none';
        localStorage.setItem('pwa_banner_dismissed_until', (Date.now() + (24 * 60 * 60 * 1000)).toString());
    });
}

// Cerrar modal iOS
function closeIosModal() {
    if (iosModal) iosModal.style.display = 'none';
}
if (iosCloseBtn) iosCloseBtn.addEventListener('click', closeIosModal);
if (iosUnderstoodBtn) iosUnderstoodBtn.addEventListener('click', closeIosModal);

// Ocultar al instalar
window.addEventListener('appinstalled', () => {
    if (pwaBanner) pwaBanner.style.display = 'none';
    if (oldInstallBtn) oldInstallBtn.style.display = 'none';
    deferredInstallPrompt = null;
    console.log('[PWA] ¡App instalada con éxito!');
});

// ============================================================
// MODAL DE SERVICIOS STREAMING (Netflix, Disney, ViX, Canva, etc.)
// ============================================================
const streamingBtn = document.getElementById('streaming-btn');
const streamingModal = document.getElementById('streaming-services-modal');
const streamingModalClose = document.getElementById('streaming-modal-close');

async function updateStreamingStockBadges(catalogOverride) {
    try {
        const grid = document.querySelector('.streaming-services-grid');
        if (!grid) return;

        let catalog = [];
        let stock = {};

        // Siempre obtener el catálogo actualizado del servidor (precios en tiempo real)
        const _surl = window.SERVER_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3500' : window.location.origin);
        const res = await fetch(`${_surl}/api/streaming-stock`);
        const data = await res.json();
        if (data.success) {
            catalog = data.catalog || [];
            stock = data.stock || {};
        }

        // Si el servidor no devolvió catálogo, usar el override como fallback
        if (catalog.length === 0 && catalogOverride && Array.isArray(catalogOverride) && catalogOverride.length > 0) {
            catalog = catalogOverride;
        }

        const rate = (window._tasaAdmin && window._tasaAdmin > 0) ? window._tasaAdmin : (DOLAR_RATE || 65);

        if (catalog && catalog.length > 0) {
            grid.innerHTML = '';
            catalog.forEach(item => {
                const count = stock[item.id] || 0;
                const priceUsdt = parseFloat(item.price) || 2.50;
                const priceBs = (priceUsdt * rate).toFixed(2);
                
                const badgeHtml = item.badge ? `<div class="streaming-card-badge">${item.badge}</div>` : '';
                const stockBadge = count > 0 
                    ? `<div class="streaming-stock-badge" style="font-size:0.7rem; font-weight:800; margin-bottom:8px; display:inline-block; padding:2px 8px; border-radius:10px; background:rgba(0,255,148,0.12); color:#00FF94; border:1px solid rgba(0,255,148,0.3);">🟢 ${count} Disponible${count > 1 ? 's' : ''}</div>`
                    : `<div class="streaming-stock-badge" style="font-size:0.7rem; font-weight:800; margin-bottom:8px; display:inline-block; padding:2px 8px; border-radius:10px; background:rgba(220,38,38,0.15); color:#f87171; border:1px solid rgba(220,38,38,0.4);">🚫 Agotada</div>`;

                const btnHtml = count > 0
                    ? `<button class="streaming-order-btn" data-service-id="${item.id}" data-service="${item.name}" data-price="${priceUsdt.toFixed(2)}" style="opacity:1; cursor:pointer; pointer-events:auto;"><i class="fa-solid fa-cart-shopping"></i> Comprar Ahora</button>`
                    : `<button class="streaming-order-btn" disabled style="opacity:0.5; cursor:not-allowed; pointer-events:none; background:rgba(220,38,38,0.2); border-color:rgba(220,38,38,0.4);"><i class="fa-solid fa-ban"></i> Agotada</button>`;

                const cardHtml = `
                    <div class="streaming-card brand-${item.id}">
                        ${badgeHtml}
                        <div class="streaming-icon"><i class="${item.icon || 'fa-solid fa-tv'}" style="color: ${item.color || '#9D00FF'};"></i></div>
                        <h3>${item.name}</h3>
                        <p class="streaming-desc">${item.desc || ''}</p>
                        ${stockBadge}
                        <div class="streaming-price">${priceUsdt.toFixed(2)} USDT <span style="font-size:0.78rem; color:rgba(255,255,255,0.6); font-weight:600; display:block; margin-top:2px;">/ ${priceBs} Bs</span></div>
                        ${btnHtml}
                    </div>
                `;
                grid.innerHTML += cardHtml;
            });
            initStreamingOrderButtons();
        }
    } catch (e) {
        console.error('[STREAMING-CATALOG-ERROR]', e);
    }
}

function openStreamingPaymentModal(serviceName, priceUsdt) {
    if (streamingModal) streamingModal.style.display = 'none';

    selectedGame = 'streaming';
    selectedPack = serviceName;
    selectedPriceUsdt = priceUsdt;

    const playerIdInput = document.getElementById('player-id');
    if (playerIdInput && (!playerIdInput.value || playerIdInput.value.trim() === '')) {
        playerIdInput.value = 'Cliente-Streaming';
    }

    const rate = (window._tasaAdmin && window._tasaAdmin > 0) ? window._tasaAdmin : 65;
    const priceBs = (priceUsdt * rate).toFixed(2);

    const summaryBox = document.getElementById('streaming-selected-summary');
    const summaryTitle = document.getElementById('streaming-summary-title');
    const summaryPrice = document.getElementById('streaming-summary-price');
    if (summaryTitle) summaryTitle.innerText = serviceName;
    if (summaryPrice) summaryPrice.innerText = `${priceUsdt.toFixed(2)} USDT / ${priceBs} Bs`;
    if (summaryBox) summaryBox.style.display = 'block';

    const amountPm = document.getElementById('amount-pagomovil');
    const amountBin = document.getElementById('amount-binance');
    if (amountPm) amountPm.value = `${priceBs} Bs`;
    if (amountBin) amountBin.value = `${priceUsdt} USDT`;

    const paymentSection = document.getElementById('payment-section');
    const packagesSection = document.getElementById('packages-section');
    if (packagesSection) packagesSection.style.display = 'none';
    if (paymentSection) {
        paymentSection.style.display = 'block';
    }

    const pmCard = document.querySelector('.payment-method-card[data-method="pagomovil"]');
    if (pmCard) pmCard.click();

    setTimeout(() => {
        if (paymentSection) {
            paymentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

function initStreamingOrderButtons() {
    document.querySelectorAll('.streaming-order-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            if (btn.classList.contains('coming-soon') || btn.classList.contains('out-of-stock')) {
                Swal.fire({
                    icon: 'info',
                    title: '⏳ Servicio Próximamente',
                    html: 'Este servicio de streaming estará disponible muy pronto en la plataforma.<br>¡Tan pronto como el administrador cargue licencias estará habilitado!',
                    background: 'rgba(20,10,35,0.98)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                });
                return;
            }
            const serviceName = btn.getAttribute('data-service') || 'Servicio Streaming';
            const priceUsdt = parseFloat(btn.getAttribute('data-price')) || 2.50;
            openStreamingPaymentModal(serviceName, priceUsdt);
        };
    });
}

document.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#streaming-btn, .btn-streaming-trigger')) {
        e.preventDefault();
        const modal = document.getElementById('streaming-services-modal');
        if (modal) modal.style.display = 'flex';
        if (typeof updateStreamingStockBadges === 'function') updateStreamingStockBadges();
    }
});

if (streamingModalClose && streamingModal) {
    streamingModalClose.addEventListener('click', () => {
        streamingModal.style.display = 'none';
    });
    
    streamingModal.addEventListener('click', (e) => {
        if (e.target === streamingModal) {
            streamingModal.style.display = 'none';
        }
    });
}

// Listener para botón "Cambiar Servicio" de streaming
document.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#btn-change-streaming-service')) {
        if (streamingModal) streamingModal.style.display = 'flex';
    }
});

