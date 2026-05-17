document.addEventListener('DOMContentLoaded', () => {
    let DOLAR_RATE = 635.00;
    let APP_CONFIG = {};
    
    // Detectar si estamos en local, en el túnel o en la nube
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // URL del servidor en Render (TU URL REAL)
    const SERVER_URL = isLocal ? 'http://localhost:3500' : window.location.origin;

    async function loadConfig() {
        try {
            const res = await fetch(`${SERVER_URL}/api/config`);
            const data = await res.json();
            
            // Si la tasa o los precios cambiaron, o es la primera carga, re-renderizar
            const shouldRender = !APP_CONFIG.precios || 
                               JSON.stringify(APP_CONFIG.precios) !== JSON.stringify(data.precios) ||
                               APP_CONFIG.tasa_del_dia !== data.tasa_del_dia ||
                               JSON.stringify(APP_CONFIG.stock) !== JSON.stringify(data.stock);

            APP_CONFIG = data;
            DOLAR_RATE = data.tasa_del_dia;
            
            // Actualizar marquesina
            const marquee = document.getElementById('marquee-content');
            if (marquee) marquee.innerText = data.barra_informativa;

            if (shouldRender) {
                console.log('[CONFIG] 🔄 Actualizando tienda (Precios o Stock cambiaron)');
                renderPackages(data.precios, data.tasa_del_dia);
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

    function renderPackages(precios, tasa) {
        const grid = document.querySelector('.packages-grid');
        if (!grid) return;
        grid.innerHTML = '';
        Object.entries(precios).forEach(([amount, data]) => {
            const priceBs = (data.usdt * tasa).toFixed(2).replace('.', ',');
            const stockCount = APP_CONFIG.stock ? (APP_CONFIG.stock[amount] || 0) : 0;
            const isAvailable = stockCount > 0;
            const stockLabel = isAvailable ? `<span class="stock-badge available">Disponible (${stockCount})</span>` : '<span class="stock-badge out">Agotado</span>';
            const disabledClass = isAvailable ? '' : 'out-of-stock';
            
            grid.innerHTML += `
                <div class="package-card ${disabledClass}" data-amount="${amount}" data-bonus="${parseInt(amount)*0.1}" data-price="${data.usdt}" ${!isAvailable ? 'style="pointer-events:none; opacity:0.6;"' : ''}>
                    ${stockLabel}
                    <div class="diamond-icon"><i class="fa-solid fa-gem"></i></div>
                    <div class="pack-info">
                        <span class="amount">${data.label}</span>
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
                    ? `<div style="margin-top:8px; background:rgba(0,240,255,0.07); border:1px dashed rgba(0,240,255,0.4); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                           <span style="font-family:monospace; color:#00f0ff; font-size:0.9rem; font-weight:700;">🔑 ${order.pin}</span>
                           <button onclick="navigator.clipboard.writeText('${order.pin}').then(()=>{ this.innerText='✓ Copiado!'; setTimeout(()=>this.innerText='Copiar',1500); })" style="background:rgba(0,240,255,0.15); border:1px solid rgba(0,240,255,0.3); color:#00f0ff; border-radius:6px; padding:3px 10px; font-size:0.72rem; cursor:pointer;">Copiar</button>
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
                ? `<div style="margin-top:8px; background:rgba(0,240,255,0.07); border:1px dashed rgba(0,240,255,0.4); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                       <span style="font-family:monospace; color:#00f0ff; font-size:0.9rem; font-weight:700;">🔑 ${order.pin}</span>
                       <button onclick="navigator.clipboard.writeText('${order.pin}').then(()=>{ this.innerText='✓ Copiado!'; setTimeout(()=>this.innerText='Copiar',1500); })" style="background:rgba(0,240,255,0.15); border:1px solid rgba(0,240,255,0.3); color:#00f0ff; border-radius:6px; padding:3px 10px; font-size:0.72rem; cursor:pointer;">Copiar</button>
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

    // --- LÓGICA DE CUENTA ---
    const loginTriggerBtn = document.getElementById('login-trigger-btn');
    const userDisplay = document.getElementById('user-display');
    const headerPointsVal = document.getElementById('header-points-val');
    const logoutBtn = document.getElementById('logout-btn');

    const updateAccountUI = (id) => {
        if (id) {
            loginTriggerBtn.style.display = 'none';
            userDisplay.style.display = 'flex';
            loadUserPoints(id).then(points => {
                headerPointsVal.innerText = points || 0;
            });
        } else {
            loginTriggerBtn.style.display = 'flex';
            userDisplay.style.display = 'none';
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
        // Paso 1: pedir el ID
        const { value: id } = await Swal.fire({
            title: '👤 Mi Cuenta',
            html: `
                <p style="font-size:0.85rem;color:#aaa;margin-bottom:10px;">Ingresa tu ID de Free Fire para acumular puntos.</p>
                <input id="swal-login-id" type="text" class="swal2-input" placeholder="Ej: 12345678" autocomplete="off">
            `,
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar',
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                const inp = document.getElementById('swal-login-id');
                if (inp) {
                    inp.focus();
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') Swal.clickConfirm();
                    });
                }
            },
            preConfirm: () => document.getElementById('swal-login-id').value.trim()
        });

        if (!id) return;

        // Verificar si el usuario tiene contraseña configurada
        Swal.fire({ title: 'Verificando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        let passCheck = null;
        try {
            const chkRes = await fetch(`${SERVER_URL}/api/check_password?uid=${id}`);
            passCheck = await chkRes.json();
        } catch (e) { passCheck = { success: false }; }

        // Si ya existe y tiene contraseña, pedirla
        if (passCheck && passCheck.hasPassword) {
            const { value: pass } = await Swal.fire({
                title: '🔒 Contraseña',
                html: `
                    <p style="font-size:0.85rem;color:#aaa;margin-bottom:10px;">ID: <strong>${id}</strong></p>
                    <input id="swal-login-pass" type="password" class="swal2-input" placeholder="Tu contraseña">
                `,
                showCancelButton: true,
                confirmButtonText: 'Ingresar',
                cancelButtonText: 'Atrás',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                didOpen: () => {
                    const inp = document.getElementById('swal-login-pass');
                    if (inp) {
                        inp.focus();
                        inp.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') Swal.clickConfirm();
                        });
                    }
                },
                preConfirm: () => document.getElementById('swal-login-pass').value
            });

            if (!pass) return;

            Swal.fire({ title: 'Verificando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let authRes = null;
            try {
                const authCheck = await fetch(`${SERVER_URL}/api/check_password?uid=${id}&pass=${encodeURIComponent(pass)}`);
                authRes = await authCheck.json();
            } catch (e) { authRes = { success: false }; }

            if (!authRes || !authRes.success) {
                return Swal.fire({ icon: 'error', title: 'Contraseña incorrecta', text: 'Verifica tu contraseña e intenta de nuevo.' });
            }

            // Login exitoso con contraseña
            localStorage.setItem('ff_user_id', id);
            updateAccountUI(id);
            if (newUserBanner) newUserBanner.style.display = 'none';
            playerInput.value = id;
            return Swal.fire({ icon: 'success', title: `¡Bienvenido, ${authRes.name || id}!`, timer: 1800, showConfirmButton: false });
        }

        // Sin contraseña: verificar contra Garena
        const name = await checkPlayerId(id);
        if (name) {
            localStorage.setItem('ff_user_id', id);
            updateAccountUI(id);
            if (newUserBanner) newUserBanner.style.display = 'none';
            playerInput.value = id;

            // Ofrecer crear contraseña si no tiene una
            const { isConfirmed } = await Swal.fire({
                icon: 'success',
                title: `¡Bienvenido, ${name}!`,
                html: `<p style="font-size:0.9rem;color:#aaa;">¿Quieres proteger tu cuenta con una <strong>contraseña</strong>?<br><small style="font-size:0.75rem;">Así nadie más podrá usar tus puntos.</small></p>`,
                showCancelButton: true,
                confirmButtonText: '🔐 Crear Contraseña',
                cancelButtonText: 'Ahora no',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });

            if (isConfirmed) {
                await promptSetPassword(id);
            }
        } else {
            Swal.fire({ icon: 'error', title: 'ID no encontrado', text: 'Asegúrate de que el ID sea correcto.' });
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

        await Swal.fire({
            title: '👤 Mi Cuenta',
            html: `
                <p style="font-size:0.8rem;color:#aaa;margin-bottom:15px;">ID: <code>${uid}</code></p>
                <div style="display:grid;gap:10px;">
                    <button class="swal2-confirm swal2-styled" id="btn-share-ref" style="background:linear-gradient(135deg,#25D366,#128C7E);">
                        🔗 Compartir mi Link de Referido
                    </button>
                    <button class="swal2-confirm swal2-styled" id="btn-change-pass" style="background:var(--primary);">
                        🔐 Cambiar Contraseña
                    </button>
                </div>
                <p style="font-size:0.7rem;color:#666;margin-top:12px;">Ganas <strong>+10 puntos</strong> por cada amigo nuevo que entre con tu link.</p>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff',
            didOpen: () => {
                document.getElementById('btn-share-ref').addEventListener('click', async () => {
                    Swal.close();
                    await navigator.clipboard.writeText(refLink);
                    Swal.fire({
                        html: `<p style="font-size:0.8rem;color:#aaa;word-break:break-all;">${refLink}</p>
                               <p style="font-size:0.85rem;margin-top:10px;">Compártelo con tus amigos. Ganas <strong>+15 puntos</strong> por cada nuevo usuario que haga su primera compra.</p>`,
                        timer: 4000,
                        showConfirmButton: false,
                        background: 'rgba(20, 10, 35, 0.98)',
                        color: '#fff'
                    });
                });
                document.getElementById('btn-change-pass').addEventListener('click', async () => {
                    Swal.close();
                    await promptSetPassword(uid);
                });
            }
        });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('ff_user_id');
        updateAccountUI(null);
        location.reload();
    });
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
            const marquee = document.getElementById('marquee-content');
            
            if (data && data.length > 0) {
                const text = data.map(r => {
                    if (r.type === 'canje') {
                        return `🎁 ${r.name} CANJEÓ ${r.pack} diamantes con sus puntos!`;
                    }
                    return `✅ ${r.name} compró PIN de ${r.pack} diamantes`;
                }).join(' | ');
                marquee.innerText = ` ÚLTIMAS COMPRAS: ${text} | ¡Únete a los miles de jugadores que confían en nosotros! `;
            } else {
                marquee.innerText = " ¡BIENVENIDOS A LA TIENDA DE PINES! – Selecciona tu paquete y recibe tu código al instante. ";
            }
        } catch (e) {
            console.error('Error cargando recientes:', e);
        }
    };
    loadRecentReloads();
    setInterval(loadRecentReloads, 30000); // Actualizar cada 30 segundos

    // Permitir verificar presionando Enter
    playerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyBtn.click();
    });

    verifyBtn.addEventListener('click', async () => {
        const uid = playerInput.value.trim();

        if (!uid) {
            Swal.fire({ icon: 'warning', title: 'Campo Vacío', text: 'Ingresa un ID.', confirmButtonText: 'OK' });
            return;
        }

        Swal.fire({ title: 'Validando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        // 1. Verificar si el usuario tiene contraseña en nuestra DB
        let passCheck = null;
        try {
            const chkRes = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}`);
            passCheck = await chkRes.json();
        } catch (e) { passCheck = { success: false }; }

        // 2. Si tiene contraseña, pedirla antes de seguir
        if (passCheck && passCheck.hasPassword) {
            const { value: pass } = await Swal.fire({
                title: '🔒 Cuenta Protegida',
                html: `<p style="font-size:0.85rem;color:#aaa;margin-bottom:10px;">ID: <strong>${uid}</strong> tiene contraseña.</p>
                       <input id="swal-verify-pass" type="password" class="swal2-input" placeholder="Ingresa tu contraseña">`,
                showCancelButton: true,
                confirmButtonText: 'Ingresar',
                cancelButtonText: 'Cancelar',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                didOpen: () => {
                    const inp = document.getElementById('swal-verify-pass');
                    if (inp) {
                        inp.focus();
                        inp.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') Swal.clickConfirm();
                        });
                    }
                },
                preConfirm: () => document.getElementById('swal-verify-pass').value
            });

            if (!pass) return;

            Swal.fire({ title: 'Autenticando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            let authRes = null;
            try {
                const authCheck = await fetch(`${SERVER_URL}/api/check_password?uid=${uid}&pass=${encodeURIComponent(pass)}`);
                authRes = await authCheck.json();
            } catch (e) { authRes = { success: false }; }

            if (!authRes || !authRes.success) {
                return Swal.fire({ icon: 'error', title: 'Contraseña incorrecta', text: 'No puedes acceder a este ID.' });
            }
        }

        // 3. Verificación normal con Garena (si pasó el password o no tiene)
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
            const playerName = await checkPlayerId(uid);

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

                // Si no tenía contraseña, ofrecer crear una
                if (passCheck && !passCheck.hasPassword) {
                    setTimeout(async () => {
                        const { isConfirmed } = await Swal.fire({
                            icon: 'info',
                            title: '¡Protege tu ID!',
                            html: `<p style="font-size:0.9rem;color:#aaa;">¿Quieres crear una <strong>contraseña</strong>?<br><small>Evita que otros usen tus puntos.</small></p>`,
                            showCancelButton: true,
                            confirmButtonText: '🔐 Crear Contraseña',
                            cancelButtonText: 'Luego',
                            background: 'rgba(20, 10, 35, 0.98)',
                            color: '#fff'
                        });
                        if (isConfirmed) await promptSetPassword(uid);
                    }, 2000);
                }
                
            } else {
                throw new Error('Jugador no encontrado');
            }
        } catch (error) {
            console.error('Error:', error);
            Swal.fire({ 
                icon: 'error', 
                title: 'ERROR', 
                text: 'ID NO ENCONTRADO EN GARENA. FAVOR CHEQUEAR SU ID, GRACIAS.', 
                confirmButtonText: 'Reintentar',
                background: 'rgba(20, 10, 35, 0.95)',
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
        const stockCount = APP_CONFIG.stock ? (APP_CONFIG.stock[selectedPackage.amount] || 0) : 0;
        if (selectedQty < stockCount) {
            selectedQty++;
            updateTotalsPreview();
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Límite de Stock',
                text: `Solo hay ${stockCount} paquetes disponibles de esta denominación.`,
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
                if (quantitySection) quantitySection.style.display = 'block';
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
        const name = document.getElementById('player-name-display').innerText.trim();
        const packText = selectedQty > 1 ? `${selectedPackage.amount} + ${selectedPackage.bonus} (x${selectedQty})` : `${selectedPackage.amount} + ${selectedPackage.bonus}`;
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
            const loginUid = localStorage.getItem('ff_user_id') || playerInput.value;
            const messageParams = `uid=${playerInput.value}&login_uid=${loginUid}&name=${encodeURIComponent(name)}&pack=${encodeURIComponent(packText)}&method=${selectedMethod}&ref=${encodeURIComponent(ref)}&price=${priceUSDT.toFixed(2)}USDT/${priceBS}Bs&wa=${waFull}`;
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
                            <div style="font-size: 0.6rem; color: var(--secondary); margin-top: -10px; margin-bottom: 15px; letter-spacing: 2px; font-weight: 700;">DIAMOND CENTER CLOUD</div>
                            
                            <div class="receipt-info" style="font-size: 0.8rem; line-height: 1.2;">
                                <p><strong>PLAN:</strong> <span class="val">${selectedPackage.amount} + ${selectedPackage.bonus} Bonus</span></p>
                                <p><strong>ID / JUGADOR:</strong> <span class="val">${playerInput.value} (${name})</span></p>
                                <p><strong>CONTROL / REF:</strong> <span class="val">${controlNum} / ${ref}</span></p>
                                <p><strong>FECHA:</strong> <span class="val">${fullDateTime}</span></p>
                                <p><strong>ESTADO:</strong> <span class="val status-pending" id="order-status">VERIFICANDO...</span></p>
                            </div>

                            <div id="pin-display-container" style="display: none;">
                                <p id="assigned-pin"></p>
                                <button class="btn-copy-pin" onclick="copyPin()"><i class="fa-solid fa-copy"></i> Copiar PIN</button>
                                <div style="font-size: 0.7rem; color: #fff; margin-top: 10px; background: rgba(0,191,255,0.1); padding: 8px; border-radius: 8px; border: 1px solid rgba(0,191,255,0.3); display: flex; flex-direction: column; gap: 5px;">
                                    <a id="chile-redeem-link" href="https://redeempins.com/" target="_blank" style="color: #00bfff; text-decoration: none; font-weight: 800; text-align: center;"><i class="fa-solid fa-bolt"></i> CANJE SU PIN AQUÍ</a>
                                </div>
                            </div>
                            
                            <div class="receipt-ticket" style="margin-top: 10px; font-size: 0.7rem; opacity: 0.5;">
                                <i class="fa-solid fa-shield-halved"></i> Diamond Center Cloud - Transacción Segura
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
                                    
                                    // Lanzar confeti de celebración
                                    confetti({
                                        particleCount: 150,
                                        spread: 70,
                                        origin: { y: 0.6 },
                                        colors: ['#ffd700', '#00c853', '#ffffff']
                                    });

                                    // Mostrar PIN si existe
                                    if (data.pin) {
                                        const pinContainer = document.getElementById('pin-display-container');
                                        const pinEl = document.getElementById('assigned-pin');
                                        
                                        if (pinEl) pinEl.innerText = data.pin;
                                        
                                        if (pinContainer) pinContainer.style.display = 'block';
                                    }

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
                                         `📦 *Plan:* ${selectedPackage.amount} diamantes\n` +
                                         `✨ *Bonus:* ${selectedPackage.bonus} diamantes\n` +
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
                return data.nombre;
            }

            return null;
        } catch (e) {
            console.error('Error al consultar servidor local:', e);
            return null;
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
            
            if (pointsEl) pointsEl.innerText = points;
            if (headerPointsEl) headerPointsEl.innerText = points;
            
            return points;
        } catch (e) {
            console.error('Error cargando puntos:', e);
            return 0;
        }
    }

    document.getElementById('redeem-btn').addEventListener('click', () => {
        const uid = playerInput.value;
        const currentPoints = parseInt(document.getElementById('user-points').innerText);

        Swal.fire({
            title: 'Canjear Puntos',
            html: `
                <p style="font-size: 0.9rem; color: #aaa; margin-bottom: 20px;">Tienes <strong>${currentPoints}</strong> puntos.</p>
                <div class="redeem-options" style="display: grid; gap: 10px;">
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('100')">100 Diamantes (500 pts)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('310')">310 Diamantes (1500 pts)</button>
                    <button class="swal2-confirm swal2-styled" onclick="window.redeem('520')">520 Diamantes (2500 pts)</button>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true,
            background: 'rgba(20, 10, 35, 0.98)',
            color: '#fff'
        });
    });

    window.redeem = async (pack) => {
        const uid = playerInput.value;
        const newUserBanner = document.getElementById('new-user-banner');
        Swal.fire({ title: 'Procesando canje...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const res = await fetch(`${SERVER_URL}/canjear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, pack })
            });
            const data = await res.json();

            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: '¡Canje Exitoso!',
                    html: `Tu PIN es: <code style="font-size: 1.2rem; color: var(--secondary);">${data.pin}</code>`,
                    confirmButtonText: 'Copiar PIN y Cerrar'
                }).then(() => {
                    navigator.clipboard.writeText(data.pin);
                    loadUserPoints(uid);
                });
            } else {
                Swal.fire({ icon: 'error', title: 'Fallo en Canje', text: data.message });
            }
        } catch (e) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar el canje.' });
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
