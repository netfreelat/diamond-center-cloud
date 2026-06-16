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

        Object.keys(juegos).forEach(key => {
            const juego = juegos[key];
            const btn = document.createElement('button');
            btn.className = 'btn-secondary-outline game-btn' + (key === currentJuego ? ' active' : '');
            btn.style.borderColor = key === currentJuego ? 'var(--secondary)' : 'rgba(255,255,255,0.2)';
            btn.style.color = key === currentJuego ? 'var(--secondary)' : '#fff';
            
            if (key === 'bloodstrike') {
                btn.style.position = 'relative';
                btn.innerHTML = `<span style="position: absolute; top: -6px; left: 50%; transform: translateX(-50%); font-size: 0.52rem; background: rgba(255, 0, 229, 0.15); color: #ff00e5; border: 1px solid rgba(255, 0, 229, 0.35); padding: 1px 5px; border-radius: 3px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; z-index: 5; pointer-events: none; backdrop-filter: blur(2px);">Próximamente</span><i class="fa-solid ${juego.icono || 'fa-gamepad'}"></i> ${juego.nombre}`;
                btn.style.opacity = '0.65';
                btn.style.cursor = 'not-allowed';
                btn.onclick = (e) => {
                    e.preventDefault();
                    Swal.fire({
                        icon: 'info',
                        title: '¡Próximamente!',
                        text: `Las recargas para ${juego.nombre} estarán disponibles muy pronto.`,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF',
                        confirmButtonText: 'Entendido'
                    });
                };
            } else {
                btn.innerHTML = `<i class="fa-solid ${juego.icono || 'fa-gamepad'}"></i> ${juego.nombre}`;
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
                    if (input) input.placeholder = juego.inputPlaceholder || 'Ingresa ID / Usuario';
                    
                    renderPackages(getPackagesForCurrentGame(), APP_CONFIG.tasa_del_dia);

                    // ── Roblox: saltar directamente a paquetes sin pedir ID ──
                    if (key === 'roblox') {
                        document.querySelector('.input-group').style.display = 'none';
                        document.getElementById('verify-btn').style.display = 'none';
                        document.getElementById('welcome-section').style.display = 'none';
                        document.getElementById('packages-section').style.display = 'block';
                        document.querySelector('.main-container').classList.add('expanded');
                        const titleEl = document.getElementById('packages-section-title');
                        if (titleEl) titleEl.textContent = 'Selecciona tu Paquete de Robux';
                    } else {
                        // Restaurar vista normal al cambiar a otro juego
                        document.querySelector('.input-group').style.display = 'flex';
                        document.getElementById('verify-btn').style.display = 'flex';
                        document.getElementById('packages-section').style.display = 'none';
                        document.getElementById('welcome-section').style.display = 'none';
                        document.querySelector('.main-container').classList.remove('expanded');
                        const titleEl = document.getElementById('packages-section-title');
                        if (titleEl) titleEl.textContent = 'Selecciona tu Paquete de Diamantes';
                    }
                };
            }
            list.appendChild(btn);
        });
    }

    // Detectar si estamos en local, en el túnel o en la nube
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // URL del servidor en Render (TU URL REAL)
    const SERVER_URL = isLocal ? 'http://localhost:3500' : window.location.origin;

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
        
        if (marquee.innerText !== combinedText) {
            marquee.innerText = combinedText;
            
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
            
            // Si la tasa o los precios cambiaron, o es la primera carga, re-renderizar
            const shouldRender = !APP_CONFIG.precios || 
                               JSON.stringify(APP_CONFIG.precios) !== JSON.stringify(data.precios) ||
                               JSON.stringify(APP_CONFIG.juegos) !== JSON.stringify(data.juegos) ||
                               APP_CONFIG.tasa_del_dia !== data.tasa_del_dia ||
                               JSON.stringify(APP_CONFIG.stock) !== JSON.stringify(data.stock);

            APP_CONFIG = data;
            DOLAR_RATE = data.tasa_del_dia;
            
            // Actualizar marquesina
            adminMarqueeText = data.barra_informativa || "";
            updateMarqueeDisplay();

            if (shouldRender) {
                console.log('[CONFIG] 🔄 Actualizando tienda (Precios o Stock cambiaron)');
                if (data.juegos) renderGames(data.juegos);
                renderPackages(getPackagesForCurrentGame(), data.tasa_del_dia);
            }

            // Actualizar métodos de pago (solo si cambiaron)
            if (data.metodos_pago) {
                const pm = data.metodos_pago.pagomovil;
                const bin = data.metodos_pago.binance;
                if (document.getElementById('display-pm-banco')) document.getElementById('display-pm-banco').innerText = pm.banco;
                if (document.getElementById('display-pm-telefono')) document.getElementById('display-pm-telefono').innerText = pm.telefono;
                if (document.getElementById('display-pm-cedula')) document.getElementById('display-pm-cedula').innerText = pm.cedula;
                if (document.getElementById('display-bin-id')) document.getElementById('display-bin-id').innerText = bin.id;
                if (document.getElementById('display-bin-nombre')) document.getElementById('display-bin-nombre').innerText = bin.nombre;
            }

            // Actualizar Enlaces de WhatsApp
            if (data.whatsapp) {
                const waSoporte = document.getElementById('wa-soporte-link');
                const waCanal = document.getElementById('wa-canal-link');
                if (waSoporte) waSoporte.href = `https://wa.me/${data.whatsapp.soporte}`;
                if (waCanal) waCanal.href = data.whatsapp.canal;
            }
        } catch (e) { console.error('Error cargando config:', e); }
    }
    
    // Carga inicial y sondeo automático cada 5 segundos
    loadConfig();
    setInterval(loadConfig, 5000);

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

            // Etiqueta promocional
            const promo = PROMO_TAGS[amount];
            const promoTag = promo ? `<span class="promo-tag ${promo.className}">${promo.icon} ${promo.text}</span>` : '';

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
            } else {
                iconHtml = `<div class="diamond-icon special-card-img" style="background:none; padding:0; overflow:hidden; border-radius:10px; width:70px; height:70px;"><img src="/img/diamante.png" alt="Diamantes" style="width:100%; height:100%; object-fit:contain; border-radius:10px; display:block;"></div>`;
            }

            // Bonus: solo aplica a paquetes de diamantes numéricos
            const bonusNum = (currentJuego === 'freefire' && !esEspecial) ? Math.round(parseInt(amount) * 0.1) : 0;
            const displayLabel = esEspecial ? data.label : data.label.replace(/ diamantes/gi, '');
            
            grid.innerHTML += `
                <div class="package-card ${disabledClass}" data-amount="${amount}" data-bonus="${bonusNum}" data-price="${data.usdt}" ${!isAvailable ? 'style="pointer-events:none; opacity:0.6;"' : ''}>
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

    // Manejar Botón de Historial — carga tiempo real desde servidor si hay ID verificado
    historyBtn.addEventListener('click', async () => {
        const activeUid = historyLoadedForUid || playerInput.value.trim();

        // ── Caso 1: Hay UID verificado → mostrar historial del servidor ──
        if (activeUid && currentPlayerHistory.length >= 0 && historyLoadedForUid === activeUid) {
            // Recargar en tiempo real antes de mostrar
            Swal.fire({
                title: '<i class="fa-solid fa-rotate" style="animation: spin 1s linear infinite;"></i> Cargando...',
                html: '<p style="color:#aaa;font-size:0.85rem;">Consultando historial en tiempo real...</p>',
                allowOutsideClick: false,
                showConfirmButton: false,
                background: 'rgba(20, 10, 35, 0.97)',
                color: '#fff',
                didOpen: () => Swal.showLoading()
            });
            await fetchPlayerHistory(activeUid);
            Swal.close();

            if (currentPlayerHistory.length === 0) {
                return Swal.fire({
                    icon: 'info',
                    title: '📭 Sin Compras',
                    text: 'Este jugador aún no tiene compras registradas.',
                    background: 'rgba(20, 10, 35, 0.97)',
                    color: '#fff',
                    confirmButtonColor: '#9D00FF'
                });
            }

            let historyHtml = `
                <div style="margin-bottom:12px; padding:8px 12px; background:rgba(157,0,255,0.08); border-radius:8px; border:1px solid rgba(157,0,255,0.2); font-size:0.75rem; color:#aaa; text-align:left;">
                    <i class="fa-solid fa-id-badge" style="color:#9D00FF;"></i> ID: <strong style="color:#fff;">${activeUid}</strong>
                    &nbsp;·&nbsp; <i class="fa-solid fa-circle-check" style="color:#25D366;"></i> Datos en tiempo real
                </div>
                <div class="history-list" style="max-height: 380px; overflow-y: auto; padding-right: 8px;">`;

            currentPlayerHistory.forEach(order => {
                const statusClass = order.status === 'approved' ? 'status-approved' : (order.status === 'rejected' ? 'status-rejected' : 'status-pending');
                const statusText  = order.status === 'approved' ? '✅ APROBADO' : (order.status === 'rejected' ? '❌ RECHAZADO' : '⏳ PENDIENTE');
                const statusBg    = order.status === 'approved' ? 'rgba(37,211,102,0.1)' : (order.status === 'rejected' ? 'rgba(255,75,43,0.1)' : 'rgba(255,200,0,0.08)');
                const methodIcon  = order.method === 'binance' ? '₿' : '📱';
                const dateStr     = order.time ? new Date(order.time).toLocaleString('es-VE', { timeZone: 'America/Caracas', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/D';

                const pinBox = order.pin
                    ? `<div style="margin-top:8px; background:rgba(0,240,255,0.07); border:1px dashed rgba(0,240,255,0.4); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                           <span style="font-family:monospace; color:#00f0ff; font-size:0.85rem; font-weight:700;">⚡ ID Recarga: ${order.pin}</span>
                           <button onclick="const btn=this; navigator.clipboard.writeText('${order.pin}').then(()=>{ btn.innerText='✓ Copiado!'; setTimeout(()=>btn.innerText='Copiar ID',1500); })" style="background:rgba(0,240,255,0.15) !important; border:1px solid rgba(0,240,255,0.3) !important; color:#00f0ff !important; border-radius:6px !important; padding:4px 10px !important; font-size:0.72rem !important; cursor:pointer !important; height:auto !important; min-height:auto !important; line-height:1.2 !important; display:inline-block !important; width:auto !important; margin:0 !important; box-sizing:border-box !important; flex-shrink:0 !important; align-self:center !important;">Copiar ID</button>
                       </div>`
                    : '';

                historyHtml += `
                    <div style="border-bottom:1px solid rgba(255,255,255,0.07); padding:14px 0; text-align:left;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div style="flex:1;">
                                <p style="margin:0; font-size:0.68rem; color:#666;">${dateStr} · ${methodIcon} ${order.method === 'binance' ? 'Binance' : 'Pago Móvil'}</p>
                                <p style="margin:4px 0 0; font-weight:800; font-size:0.95rem; color:#fff;">💎 ${order.pack} diamantes</p>
                                ${order.price ? `<p style="margin:2px 0 0; font-size:0.72rem; color:#888;">Precio: ${order.price}</p>` : ''}
                            </div>
                            <div style="background:${statusBg}; border-radius:6px; padding:4px 8px; white-space:nowrap;">
                                <span class="${statusClass}" style="font-size:0.68rem; font-weight:900;">${statusText}</span>
                            </div>
                        </div>
                        <div style="margin-top:6px; font-size:0.72rem; color:#666;">
                            Ref: <code style="color:var(--secondary);">${order.ref}</code>
                            ${order.control_num ? `&nbsp;·&nbsp; N°: <code style="color:#aaa;">${order.control_num}</code>` : ''}
                        </div>
                        ${pinBox}
                    </div>`;
            });

            historyHtml += '</div>';

            return Swal.fire({
                title: '<i class="fa-solid fa-receipt"></i> Historial de Compras',
                html: historyHtml,
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                confirmButtonText: '🔄 Actualizar',
                confirmButtonColor: '#9D00FF',
                showCloseButton: true,
                width: '420px'
            }).then(result => {
                if (result.isConfirmed) historyBtn.click(); // Recargar al presionar Actualizar
            });
        }

        // ── Caso 2: Sin ID verificado → pedir ID al usuario para consultar ──
        const savedUid = localStorage.getItem('ff_user_id') || localStorage.getItem('ff_last_id') || '';
        const { value: inputUid } = await Swal.fire({
            title: '<i class="fa-solid fa-receipt"></i> Consultar Compras',
            html: `
                <p style="font-size:0.85rem; color:#aaa; margin-bottom:12px;">
                    Ingresa tu ID de Free Fire para ver tu historial de compras.
                </p>
                <input id="swal-history-uid" type="text" inputmode="numeric"
                    class="swal2-input"
                    placeholder="Ej: 123456789"
                    value="${savedUid}"
                    autocomplete="off"
                    style="font-size:1.1rem; letter-spacing:2px; text-align:center;">
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-magnifying-glass"></i> Buscar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#9D00FF',
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                const inp = document.getElementById('swal-history-uid');
                if (inp) {
                    inp.focus();
                    inp.select();
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') Swal.clickConfirm();
                    });
                }
            },
            preConfirm: () => {
                const v = document.getElementById('swal-history-uid').value.trim();
                if (!v) { Swal.showValidationMessage('Ingresa tu ID de Free Fire'); return false; }
                return v;
            }
        });

        if (!inputUid) return;

        // Consultar historial del ID ingresado
        Swal.fire({
            title: 'Consultando...',
            html: '<p style="color:#aaa;font-size:0.85rem;">Buscando tus compras en tiempo real...</p>',
            allowOutsideClick: false,
            showConfirmButton: false,
            background: 'rgba(20, 10, 35, 0.97)',
            color: '#fff',
            didOpen: () => Swal.showLoading()
        });

        await fetchPlayerHistory(inputUid);
        Swal.close();

        if (currentPlayerHistory.length === 0) {
            return Swal.fire({
                icon: 'info',
                title: '📭 Sin Compras',
                html: `<p style="color:#aaa;">El ID <strong>${inputUid}</strong><br>no tiene compras registradas.</p>`,
                background: 'rgba(20, 10, 35, 0.97)',
                color: '#fff',
                confirmButtonColor: '#9D00FF'
            });
        }

        // Mostrar historial encontrado
        let historyHtml = `
            <div style="margin-bottom:12px; padding:8px 12px; background:rgba(157,0,255,0.08); border-radius:8px; border:1px solid rgba(157,0,255,0.2); font-size:0.75rem; color:#aaa; text-align:left;">
                <i class="fa-solid fa-id-badge" style="color:#9D00FF;"></i> ID: <strong style="color:#fff;">${inputUid}</strong>
                &nbsp;·&nbsp; <i class="fa-solid fa-circle-check" style="color:#25D366;"></i> Datos en tiempo real
            </div>
            <div class="history-list" style="max-height: 380px; overflow-y: auto; padding-right: 8px;">`;

        currentPlayerHistory.forEach(order => {
            const statusClass = order.status === 'approved' ? 'status-approved' : (order.status === 'rejected' ? 'status-rejected' : 'status-pending');
            const statusText  = order.status === 'approved' ? '✅ APROBADO' : (order.status === 'rejected' ? '❌ RECHAZADO' : '⏳ PENDIENTE');
            const statusBg    = order.status === 'approved' ? 'rgba(37,211,102,0.1)' : (order.status === 'rejected' ? 'rgba(255,75,43,0.1)' : 'rgba(255,200,0,0.08)');
            const methodIcon  = order.method === 'binance' ? '₿' : '📱';
            const dateStr     = order.time ? new Date(order.time).toLocaleString('es-VE', { timeZone: 'America/Caracas', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'N/D';
            const pinBox = order.pin
                ? `<div style="margin-top:8px; background:rgba(0,240,255,0.07); border:1px dashed rgba(0,240,255,0.4); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                       <span style="font-family:monospace; color:#00f0ff; font-size:0.85rem; font-weight:700;">⚡ ID Recarga: ${order.pin}</span>
                       <button onclick="const btn=this; navigator.clipboard.writeText('${order.pin}').then(()=>{ btn.innerText='✓ Copiado!'; setTimeout(()=>btn.innerText='Copiar ID',1500); })" style="background:rgba(0,240,255,0.15) !important; border:1px solid rgba(0,240,255,0.3) !important; color:#00f0ff !important; border-radius:6px !important; padding:4px 10px !important; font-size:0.72rem !important; cursor:pointer !important; height:auto !important; min-height:auto !important; line-height:1.2 !important; display:inline-block !important; width:auto !important; margin:0 !important; box-sizing:border-box !important; flex-shrink:0 !important; align-self:center !important;">Copiar ID</button>
                   </div>`
                : '';
            historyHtml += `
                <div style="border-bottom:1px solid rgba(255,255,255,0.07); padding:14px 0; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="flex:1;">
                            <p style="margin:0; font-size:0.68rem; color:#666;">${dateStr} · ${methodIcon} ${order.method === 'binance' ? 'Binance' : 'Pago Móvil'}</p>
                            <p style="margin:4px 0 0; font-weight:800; font-size:0.95rem; color:#fff;">💎 ${order.pack} diamantes</p>
                            ${order.price ? `<p style="margin:2px 0 0; font-size:0.72rem; color:#888;">Precio: ${order.price}</p>` : ''}
                        </div>
                        <div style="background:${statusBg}; border-radius:6px; padding:4px 8px; white-space:nowrap;">
                            <span class="${statusClass}" style="font-size:0.68rem; font-weight:900;">${statusText}</span>
                        </div>
                    </div>
                    <div style="margin-top:6px; font-size:0.72rem; color:#666;">
                        Ref: <code style="color:var(--secondary);">${order.ref}</code>
                        ${order.control_num ? `&nbsp;·&nbsp; N°: <code style="color:#aaa;">${order.control_num}</code>` : ''}
                    </div>
                    ${pinBox}
                </div>`;
        });

        historyHtml += '</div>';

        Swal.fire({
            title: '<i class="fa-solid fa-receipt"></i> Historial de Compras',
            html: historyHtml,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            confirmButtonText: '🔄 Buscar otro ID',
            confirmButtonColor: '#9D00FF',
            showCloseButton: true,
            width: '420px'
        }).then(result => {
            if (result.isConfirmed) historyBtn.click();
        });
    });

    // Manejar Botón de Precios
    if (pricesBtn) {
        pricesBtn.addEventListener('click', () => {
            if (!APP_CONFIG.precios) {
                Swal.fire({ icon: 'warning', title: 'Cargando...', text: 'Los precios aún se están cargando. Intenta de nuevo en unos segundos.', background: 'rgba(20, 10, 35, 0.95)', color: '#fff' });
                return;
            }

            let htmlContent = '<div style="text-align: left; font-size: 0.9rem; margin-top: 10px;">';
            
            Object.entries(APP_CONFIG.precios).forEach(([amount, data]) => {
                const priceBs = (data.usdt * DOLAR_RATE).toFixed(2).replace('.', ',');
                htmlContent += `
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);">
                        <div style="font-weight: bold; color: #fff;">💎 ${amount} <span style="color:var(--secondary); font-size:0.8em;">+ ${(parseInt(amount)*0.1).toFixed(0)}</span></div>
                        <div style="text-align: right;">
                            <div style="color: #25D366; font-weight: bold;">${priceBs} Bs</div>
                            <div style="color: #aaa; font-size: 0.8em;">${data.usdt.toFixed(2)} USDT</div>
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
            if (pushBellBtn) pushBellBtn.style.display = 'none';
            return;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            
            isPushEnabled = !!sub;
            updateBellUI(isPushEnabled);
        } catch (e) {
            console.error('Error verificando suscripción push:', e);
        }
    }

    function updateBellUI(enabled) {
        if (!pushBellBtn) return;
        const icon = pushBellBtn.querySelector('i');
        if (enabled) {
            pushBellBtn.classList.add('active');
            pushBellBtn.title = "Notificaciones activas de la App";
            if (icon) {
                icon.className = 'fa-solid fa-bell';
            }
        } else {
            pushBellBtn.classList.remove('active');
            pushBellBtn.title = "Activar notificaciones de la App";
            if (icon) {
                icon.className = 'fa-regular fa-bell-slash';
            }
        }
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

    if (pushBellBtn) {
        pushBellBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uid = localStorage.getItem('ff_user_id');
            if (!uid) return;

            if (isPushEnabled) {
                await unsubscribeUser();
            } else {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    await subscribeUser(uid);
                } else {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Permiso Denegado',
                        text: 'Debes habilitar los permisos de notificación en tu navegador para usar esta función.',
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff',
                        confirmButtonColor: '#9D00FF'
                    });
                }
            }
        });
    }

    const updateAccountUI = (id) => {
        if (id) {
            loginTriggerBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            loadUserPoints(id).then(points => {
                headerPointsVal.innerText = points || 0;
            });
            if (pushBellBtn) {
                pushBellBtn.style.display = 'flex';
                checkSubscriptionState().then(() => {
                    if (Notification.permission === 'granted' && !isPushEnabled) {
                        subscribeUser(id);
                    }
                });
            }
        } else {
            loginTriggerBtn.style.display = 'flex';
            userDisplay.style.display = 'none';
            if (pushBellBtn) pushBellBtn.style.display = 'none';
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
        copyRefBtn.addEventListener('click', async () => {
            const uid = localStorage.getItem('ff_user_id');
            if (!uid) return;
            const refLink = `${window.location.origin}${window.location.pathname}?ref=${uid}`;
            await navigator.clipboard.writeText(refLink);
            copyRefBtn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';
            setTimeout(() => { copyRefBtn.innerHTML = '<i class="fa-solid fa-link"></i> Copiar mi Link'; }, 2500);
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
                        text: 'No pudimos verificar tu ID en los servidores de Free Fire. Asegúrate de ingresar un ID real y activo.',
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
                document.getElementById('btn-share-ref').addEventListener('click', async () => {
                    Swal.close();
                    await navigator.clipboard.writeText(refLink);

                    // Confetti sutil
                    confetti({ particleCount: 30, spread: 40, origin: { y: 0.8 } });

                    Swal.fire({
                        icon: 'success',
                        title: '¡Link Copiado! 🔗',
                        html: `<p style="font-size:0.85rem;color:#aaa;word-break:break-all;margin-bottom:10px;">${refLink}</p>
                               <p style="font-size:0.85rem;">Compártelo y gana <strong>+$0.05 USDT</strong> de cashback cuando hagan su primera compra.</p>`,
                        timer: 4000,
                        showConfirmButton: false,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
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

    verifyBtn.addEventListener('click', async () => {
        // ── Roblox no requiere ID: mostrar paquetes directamente ──
        if (currentJuego === 'roblox') {
            document.querySelector('.input-group').style.display = 'none';
            document.getElementById('verify-btn').style.display = 'none';
            document.getElementById('welcome-section').style.display = 'none';
            document.getElementById('packages-section').style.display = 'block';
            document.querySelector('.main-container').classList.add('expanded');
            return;
        }

        const uid = playerInput.value.trim();

        if (!uid) {
            Swal.fire({ icon: 'warning', title: 'Campo Vacío', text: 'Ingresa un ID.', confirmButtonText: 'OK' });
            return;
        }

        Swal.fire({ title: 'Validando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // Verificación normal con Garena (sin pedir contraseña para compras)
        Swal.fire({
            title: 'Validando ID...',
            html: `
                <div class="ff-loader-container">
                    <div class="ff-loader-text">Conectando con servidores de Garena...</div>
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
                            No se pudo conectar con los servidores de Garena.<br>
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
                            El ID <strong style="color:#ff4b2b;">${uid}</strong> no existe en los servidores de Garena.
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

    const qtyValueDisplay = document.getElementById('qty-value');
    const totalPreviewUsdt = document.getElementById('total-preview-usdt');
    const totalPreviewBs = document.getElementById('total-preview-bs');
    const quantitySection = document.getElementById('quantity-section');
    
    function updateTotalsPreview() {
        if (!selectedPackage) return;
        const selectedCard = document.querySelector('.package-card.selected');
        if (!selectedCard) return;
        
        const priceUSDT = parseFloat(selectedCard.dataset.price);
        const totalUSDT = (priceUSDT * selectedQty).toFixed(2);
        const totalBs = (priceUSDT * selectedQty * DOLAR_RATE).toFixed(2).replace('.', ',');
        
        totalPreviewUsdt.innerText = `${totalUSDT} USDT`;
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
        packageCards.forEach(card => {
            card.addEventListener('click', () => {
                // Quitar selección previa
                packageCards.forEach(c => c.classList.remove('selected'));
                
                // Seleccionar actual
                card.classList.add('selected');
                selectedPackage = {
                    amount: card.dataset.amount,
                    bonus: card.dataset.bonus
                };
                
                // Resetear cantidad
                selectedQty = 1;
                if (quantitySection) quantitySection.style.display = 'none';
                updateTotalsPreview();
                
                // Habilitar botón de compra
                buyBtn.disabled = false;

                // Actualizar automáticamente el campo de monto en Pago Móvil
                const priceUSDT = parseFloat(card.dataset.price);
                const priceBS = (priceUSDT * DOLAR_RATE).toFixed(2).replace('.', ',');
                const amountInput = document.getElementById('amount-pagomovil');
                if (amountInput) amountInput.value = `${priceBS} Bs`;
            });
        });
    }

    buyBtn.addEventListener('click', () => {
        if (selectedPackage) {
            // Ocultar paquetes y mostrar pagos
            document.getElementById('packages-section').style.display = 'none';
            document.getElementById('payment-section').style.display = 'block';
        }
    });

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
            
            // Llenar montos automáticamente
            const priceUSDT = parseFloat(document.querySelector('.package-card.selected').dataset.price) * selectedQty;
            const priceBS = (priceUSDT * DOLAR_RATE).toFixed(2);
            
            if(selectedMethod === 'pagomovil') {
                document.getElementById('amount-pagomovil').value = `${priceBS.replace('.', ',')} Bs`;
            } else {
                document.getElementById('amount-binance').value = `${priceUSDT.toFixed(2)} USDT`;
            }

            checkFinishButton();
        });
    });

    const refPagoMovil = document.getElementById('ref-pagomovil');
    const refBinance = document.getElementById('ref-binance');
    const whatsappNumber = document.getElementById('whatsapp-number');
    const countryCode = document.getElementById('country-code');

    refPagoMovil.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, ''); // Solo números
        e.target.value = val;
        checkFinishButton();
    });

    refBinance.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, ''); // Solo números
        checkFinishButton();
    });

    whatsappNumber.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, ''); // Solo números
        checkFinishButton();
    });

    function checkFinishButton() {
        // El botón ya no se desactiva para poder mostrar los mensajes de error al hacer clic
        finishBtn.disabled = false;
    }

    backBtn.addEventListener('click', () => {
        document.getElementById('payment-section').style.display = 'none';
        document.getElementById('packages-section').style.display = 'block';
    });

    finishBtn.addEventListener('click', async () => {
        // Validación detallada
        if (!selectedMethod) {
            return Swal.fire({ icon: 'warning', title: 'Método de pago', text: 'Por favor, selecciona un método de pago (Pago Móvil o Binance) antes de continuar.', confirmButtonColor: '#9D00FF' });
        }

        const waNum = whatsappNumber.value.trim();
        const refPM = refPagoMovil.value.trim();
        const refB = refBinance.value.trim();

        if (selectedMethod === 'pagomovil' && refPM.length < 1) {
            return Swal.fire({ icon: 'warning', title: 'Falta Referencia', text: 'Por favor, ingresa el número de referencia de tu Pago Móvil.', confirmButtonColor: '#9D00FF' });
        }
        if (selectedMethod === 'binance' && refB.length < 1) {
            return Swal.fire({ icon: 'warning', title: 'Falta ID Binance', text: 'Por favor, ingresa tu ID de transacción de Binance Pay.', confirmButtonColor: '#9D00FF' });
        }
        if (waNum.length < 7) {
            return Swal.fire({ icon: 'warning', title: 'WhatsApp incompleto', text: 'Por favor, ingresa un número de WhatsApp válido (mínimo 7 dígitos) para recibir tu comprobante.', confirmButtonColor: '#9D00FF' });
        }

        const ref = selectedMethod === 'pagomovil' ? refPM : refB;
        // Para Roblox no hay ID de jugador Garena; usamos WA como identificador
        const isRobloxOrder = currentJuego === 'roblox';
        const rawName = document.getElementById('player-name-display').innerText.trim();
        const name = isRobloxOrder ? (rawName || `WA:${waNum}`) : rawName;
        const PAQUETES_ESPECIALES_KEYS = ['basica', 'semanal', 'mensual', 'booyah'];
        const esEspecialOrder = PAQUETES_ESPECIALES_KEYS.includes(selectedPackage.amount.toString().toLowerCase());
        // Para paquetes especiales: usar solo el amountKey (sin bonus ni qty) ya que son suscripciones
        const packText = esEspecialOrder
            ? selectedPackage.amount
            : (selectedQty > 1 ? `${selectedPackage.amount} + ${selectedPackage.bonus} (x${selectedQty})` : `${selectedPackage.amount} + ${selectedPackage.bonus}`);

        const priceUSDT = parseFloat(document.querySelector('.package-card.selected').dataset.price) * selectedQty;
        const priceBS = (priceUSDT * DOLAR_RATE).toFixed(2);
        let waClean = waNum.replace(/^0+/, ''); // Quitar ceros a la izquierda (ej: 0424 -> 424)
        const waFull = countryCode.value + waClean;

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
            // Para Roblox: uid = número WA (no hay ID Garena)
            const effectiveUid = isRobloxOrder ? waFull : playerInput.value;
            const loginUid = localStorage.getItem('ff_user_id') || effectiveUid;
            const messageParams = `uid=${effectiveUid}&login_uid=${loginUid}&name=${encodeURIComponent(name)}&pack=${encodeURIComponent(packText)}&method=${selectedMethod}&ref=${encodeURIComponent(ref)}&price=${priceUSDT.toFixed(2)}USDT/${priceBS}Bs&wa=${waFull}&juego=${currentJuego}`;
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
                pack: selectedQty > 1 ? `${selectedPackage.amount} (x${selectedQty})` : selectedPackage.amount,
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

            Swal.fire({
                html: `
                    <div class="receipt-container">
                        <div class="receipt-success-icon"><i class="fa-solid fa-check"></i></div>
                        <h2 class="receipt-title" id="receipt-title">Procesando Pago...</h2>
                        
                        <div class="receipt-card">
                            <div class="receipt-logo" style="letter-spacing: 5px; font-weight: 900; background: linear-gradient(to bottom, #fff 0%, #aaa 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">FREE F<span>I</span>RE</div>
                            <div style="font-size: 0.6rem; color: var(--secondary); margin-top: -10px; margin-bottom: 15px; letter-spacing: 2px; font-weight: 700;">RECARGASNEY.COM</div>
                            
                            <div class="receipt-info" style="font-size: 0.8rem; line-height: 1.2;">
                                <p><strong>PLAN:</strong> <span class="val">${esEspecialOrder ? packText : `${selectedPackage.amount} + ${selectedPackage.bonus} Bonus`}</span></p>
                                <p><strong>ID / JUGADOR:</strong> <span class="val">${playerInput.value} (${name})</span></p>
                                <p><strong>CONTROL / REF:</strong> <span class="val">${controlNum} / ${ref}</span></p>
                                <p><strong>FECHA:</strong> <span class="val">${fullDateTime}</span></p>
                                <p><strong>ESTADO:</strong> <span class="val status-pending" id="order-status">VERIFICANDO...</span></p>
                            </div>

                             <!-- Contenedor de PIN ocultado ya que no se trabaja con pines -->
                            
                            <div class="receipt-ticket" style="margin-top: 10px; font-size: 0.7rem; opacity: 0.5;">
                                <i class="fa-solid fa-shield-halved"></i> RECARGASNEY.COM - Transacción Segura
                            </div>
                        </div>
                        
                        <div class="receipt-actions">
                            <button class="btn-action btn-share" title="Compartir"><i class="fa-solid fa-share-nodes"></i></button>
                            <button class="btn-action btn-fav" title="Favorito"><i class="fa-solid fa-star"></i></button>
                            <button class="btn-action btn-continue-receipt" onclick="location.reload()">Continuar</button>
                        </div>
                    </div>
                `,
                showConfirmButton: false,
                background: 'transparent',
                width: window.innerWidth < 600 ? '95%' : '450px',
                allowOutsideClick: false,
                didOpen: () => {
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

                                    // No mostrar PIN ya que no se trabaja con pines

                                    const titleEl = document.getElementById('receipt-title');
                                    if (titleEl) {
                                        titleEl.innerHTML = '<span style="color:var(--success); font-weight:800; letter-spacing:2px; text-shadow: 0 0 15px rgba(0,255,148,0.5);">🔥 ¡BOOYAH! 🔥</span>';
                                        titleEl.style.animation = 'pulse 1s infinite alternate';
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
                        const shareText = `💎 *COMPROBANTE DE RECARGA - FREE FIRE* 💎\n` +
                                         `------------------------------------------\n` +
                                         `👤 *Jugador:* ${name}\n` +
                                         `🆔 *ID:* ${playerInput.value}\n` +
                                         `📦 *Plan:* ${esEspecialOrder ? packText : `${selectedPackage.amount} diamantes`}\n` +
                                         `✨ *Bonus:* ${esEspecialOrder ? 'N/A' : `${selectedPackage.bonus} diamantes`}\n` +
                                         `🔢 *N° Control:* ${controlNum}\n` +
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
    });

    async function checkPlayerId(uid) {
        const localServerUrl = `${SERVER_URL}/verificar?uid=${uid}`;

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
            
            const pointsEl = document.getElementById('user-points');
            const headerPointsEl = document.getElementById('header-points-val');
            
            if (pointsEl) {
                pointsEl.textContent = `$${usdtDisplay} USDT`;
                pointsEl.dataset.rawPoints = points; // Guardar valor real para el canje
            }
            if (headerPointsEl) {
                headerPointsEl.textContent = `$${usdtDisplay}`;
                headerPointsEl.dataset.rawPoints = points;
            }
            
            return points;
        } catch (e) {
            console.error('Error cargando puntos:', e);
            return 0;
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
// BOTÓN "DESCARGAR APLICACIÓN" - PWA Install Prompt
// ============================================================
let deferredInstallPrompt = null;
const installBtn = document.getElementById('install-app-btn');

// Capturar el evento antes de que el navegador muestre su propio banner
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Evitar el banner automático del navegador
    deferredInstallPrompt = e;

    // Mostrar nuestro botón personalizado
    if (installBtn) {
        installBtn.style.display = 'flex';
    }
});

// Al hacer clic en el botón, disparar el diálogo de instalación nativo
if (installBtn) {
    installBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (deferredInstallPrompt) {
            // Mostrar el diálogo de instalación del navegador
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;

            if (outcome === 'accepted') {
                console.log('[PWA] Usuario aceptó instalar la app.');
                installBtn.style.display = 'none'; // Ocultar botón al instalar
            } else {
                console.log('[PWA] Usuario rechazó la instalación.');
            }

            deferredInstallPrompt = null;
        }
    });
}

// Ocultar el botón si la app ya fue instalada
window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.style.display = 'none';
    deferredInstallPrompt = null;
    console.log('[PWA] ¡App instalada con éxito!');
});

