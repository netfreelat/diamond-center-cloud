
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const RENDER_URL = 'https://diamond-center-cloud.onrender.com';
        const SERVER_URL = isLocal ? 'http://localhost:3500' : RENDER_URL;

        // Helper para inyectar token de sesión en las peticiones
        async function adminFetch(url, options = {}) {
            const token = localStorage.getItem('admin_token');
            options.headers = options.headers || {};
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            if (!options.headers['Content-Type'] && !(options.body instanceof FormData) && options.method && options.method !== 'GET') {
                options.headers['Content-Type'] = 'application/json';
            }
            const res = await fetch(url, options);
            if (res.status === 401) {
                localStorage.removeItem('admin_token');
                showLoginOverlay();
                throw new Error('Unauthorized');
            }
            return res;
        }

        function showLoginOverlay() {
            document.getElementById('login-overlay').style.display = 'flex';
            document.querySelector('.admin-container').style.display = 'none';
        }

        function hideLoginOverlay() {
            document.getElementById('login-overlay').style.display = 'none';
            document.querySelector('.admin-container').style.display = 'block';
        }

        async function handleLogin(e) {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            
            Swal.fire({ title: 'Verificando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                const res = await fetch(`${SERVER_URL}/api/admin/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('admin_token', data.token);
                    Swal.close();
                    hideLoginOverlay();
                    loadDashboardStats();
                } else {
                    Swal.fire('Error', data.message || 'Credenciales incorrectas', 'error');
                }
            } catch (err) {
                Swal.fire('Error de Conexión', 'No se pudo comunicar con el servidor.', 'error');
            }
        }

        async function logoutAll() {
            const { isConfirmed } = await Swal.fire({
                title: '¿Cerrar todas las sesiones?',
                text: "Se cerrarán todas las secciones abiertas de administración en cualquier dispositivo (incluyendo este).",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff4b2b',
                confirmButtonText: 'Sí, cerrar todas',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });
            
            if (!isConfirmed) return;
            
            Swal.fire({ title: 'Cerrando sesiones...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            try {
                await adminFetch(`${SERVER_URL}/api/admin/logout_all`, { method: 'POST' });
                localStorage.removeItem('admin_token');
                Swal.fire('¡Completado!', 'Todas las sesiones activas han sido cerradas.', 'success').then(() => {
                    showLoginOverlay();
                });
            } catch (e) {
                localStorage.removeItem('admin_token');
                showLoginOverlay();
                Swal.close();
            }
        }

        // Ejecutar al cargar la página
        document.addEventListener('DOMContentLoaded', () => {
            const token = localStorage.getItem('admin_token');
            if (!token) {
                showLoginOverlay();
            } else {
                hideLoginOverlay();
                loadDashboardStats(); // Carga inicial
            }
        });

        function showTab(tabId, btn) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');
            if (btn) btn.classList.add('active');

            if (tabId === 'dashboard') loadDashboardStats();
            if (tabId === 'pedidos') loadOrders();
            if (tabId === 'pines') loadPinStats();
            if (tabId === 'usuarios') loadUsers();
            if (tabId === 'wa-bot-tab') checkWaStatus();
            if (tabId === 'settings') loadSettings();
        }

        async function loadDashboardStats() {
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/stats`);
                const stats = await res.json();
                
                updatePendingBadge(stats.pending);
                
                document.getElementById('dashboard-stats').innerHTML = `
                    <div class="stat-card ${stats.pending > 0 ? 'alert' : ''}">
                        <span class="label"><i class="fa-solid fa-clock"></i> P. PENDIENTES</span>
                        <span class="value" style="color:#FFC107">${stats.pending}</span>
                    </div>
                    <div class="stat-card success">
                        <span class="label"><i class="fa-solid fa-check-double"></i> P. APROBADOS</span>
                        <span class="value">${stats.approved}</span>
                    </div>
                    <div class="stat-card">
                        <span class="label"><i class="fa-solid fa-user-friends"></i> USUARIOS</span>
                        <span class="value" style="color:var(--primary)">${stats.total_users}</span>
                    </div>
                    <div class="stat-card">
                        <span class="label"><i class="fa-solid fa-box"></i> STOCK TOTAL</span>
                        <span class="value" style="color:var(--secondary)">${stats.total_pines}</span>
                    </div>
                `;
            } catch (e) { console.error(e); }
        }

        let allOrders = [];
        async function loadOrders() {
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/pedidos`);
                allOrders = await res.json();
                allOrders.sort((a, b) => new Date(b.time) - new Date(a.time));
                renderOrders(allOrders);
            } catch (e) { console.error(e); }
        }

        function renderOrders(ordersList) {
            const tbody = document.getElementById('orders-table-body');
            tbody.innerHTML = '';
            ordersList.forEach(order => {
                const tr = document.createElement('tr');
                const dateObj = new Date(order.time);
                const dateStr = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'America/Caracas' });
                const timeStr = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Caracas' });
                
                tr.innerHTML = `
                    <td><small>${dateStr}</small><br><strong>${timeStr}</strong></td>
                    <td><span style="color:var(--secondary); font-weight:700;">${order.control_num || '-'}</span></td>
                    <td><code>${order.ref}</code><br><small style="color:var(--text-gray)">${order.method === 'pagomovil' ? 'Pago Móvil' : 'Binance'}</small></td>
                    <td>
                        ${order.name}<br>
                        <small>ID: ${order.uid}</small>
                        ${order.wa ? `<br><a href="https://wa.me/${order.wa}" target="_blank" class="btn-wa"><i class="fa-brands fa-whatsapp"></i> Chat</a>` : ''}
                    </td>
                    <td>${order.pack}</td>
                    <td><span style="color:#25D366; font-weight:700;">${order.price || 'N/A'}</span></td>
                    <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                    <td>
                        ${order.status === 'pending' ? `
                            <button onclick="approveOrder('${order.ref}')" class="btn-action btn-approve" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                            <button onclick="rejectOrder('${order.ref}')" class="btn-action btn-reject" title="Rechazar"><i class="fa-solid fa-times"></i></button>
                        ` : '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function filterOrders() {
            const query = document.getElementById('order-search').value.toLowerCase();
            const filtered = allOrders.filter(o => 
                o.ref.toLowerCase().includes(query) || 
                (o.control_num && o.control_num.toLowerCase().includes(query)) ||
                o.uid.toLowerCase().includes(query) || 
                (o.name && o.name.toLowerCase().includes(query))
            );
            renderOrders(filtered);
        }

        async function approveOrder(ref) {
            Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/aprobar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref })
                });
                const result = await res.json();
                if (result.success) {
                    Swal.fire('¡Éxito!', result.message || 'Pedido aprobado.', 'success');
                    loadOrders();
                } else {
                    Swal.fire('Error', result.message, 'error');
                }
            } catch (e) { Swal.fire('Error', 'Conexión fallida', 'error'); }
        }

        async function rejectOrder(ref) {
            const { isConfirmed } = await Swal.fire({ title: '¿Rechazar?', text: "El usuario recibirá notificación.", icon: 'warning', showCancelButton: true });
            if (!isConfirmed) return;
            try {
                await adminFetch(`${SERVER_URL}/admin/rechazar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ref })
                });
                loadOrders();
            } catch (e) { console.error(e); }
        }

        async function loadPinStats() {
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/pines`);
                const pines = await res.json();
                const container = document.getElementById('pines-stats');
                container.innerHTML = '';
                Object.keys(pines).forEach(amount => {
                    const count = pines[amount].length;
                    const isLow = count < 5;
                    const isEmpty = count === 0;
                    
                    container.innerHTML += `
                        <div class="stat-card ${isEmpty ? 'alert' : (isLow ? 'warning' : 'success')}" style="padding: 10px; min-height: 80px;">
                            <span class="label" style="font-size: 0.6rem;">${amount} DIAMS</span>
                            <span class="value" style="font-size: 1.5rem;">${count}</span>
                            <div style="font-size: 0.6rem; margin-top: 2px; font-weight: 800; color: ${isEmpty ? '#FF3D71' : (isLow ? '#FFD93D' : '#00FF94')}">
                                ${isEmpty ? 'SIN STOCK' : (isLow ? 'BAJO' : 'OK')}
                            </div>
                        </div>
                    `;
                });

                // Cargar pines usados
                const usedRes = await adminFetch(`${SERVER_URL}/admin/pines/used`);
                if (usedRes.ok) {
                    const usedPines = await usedRes.json();
                    allUsedPines = usedPines;
                    renderUsedPines(allUsedPines);
                }
            } catch (e) { console.error('Error cargando estadísticas de pines:', e); }
        }

        let allUsedPines = [];
        function renderUsedPines(list) {
            const usedTbody = document.getElementById('used-pines-table-body');
            usedTbody.innerHTML = '';
            if (!Array.isArray(list) || list.length === 0) {
                usedTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; opacity:0.5;">No hay pines entregados aún.</td></tr>';
                return;
            }
            list.forEach(p => {
                let dateStr = 'N/A';
                try {
                    const d = new Date(p.time || p.created_at);
                    if (!isNaN(d)) dateStr = d.toLocaleString('es-ES', { timeZone: 'America/Caracas' });
                } catch (e) { /* keep N/A */ }
                usedTbody.innerHTML += `
                    <tr>
                        <td><small>${dateStr}</small></td>
                        <td><span style="color:var(--secondary); font-weight:700;">${p.control_num || '-'}</span></td>
                        <td>${p.name || '-'}<br><small>ID: ${p.uid || '-'}</small></td>
                        <td>${p.pack || p.amount || '-'}</td>
                        <td><code>${p.ref || '-'}</code></td>
                        <td><code style="color:var(--secondary)">${p.pin || p.code || '-'}</code></td>
                    </tr>
                `;
            });
        }

        function filterUsedPines() {
            const q = document.getElementById('pin-history-search').value.toLowerCase();
            const filtered = allUsedPines.filter(p =>
                (p.name        && p.name.toLowerCase().includes(q)) ||
                (p.uid         && p.uid.toLowerCase().includes(q)) ||
                (p.ref         && p.ref.toLowerCase().includes(q)) ||
                (p.control_num && p.control_num.toLowerCase().includes(q)) ||
                (p.pin         && p.pin.toLowerCase().includes(q)) ||
                (p.code        && p.code.toLowerCase().includes(q)) ||
                (p.pack        && p.pack.toLowerCase().includes(q))
            );
            renderUsedPines(filtered);
        }

        async function loadAvailablePines() {
            const amount = document.getElementById('manage-pin-amount').value;
            const tbody = document.getElementById('available-pines-table-body');
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Cargando...</td></tr>';
            
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/pines/available?amount=${amount}`);
                const data = await res.json();
                tbody.innerHTML = '';
                
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; opacity:0.5;">No hay pines disponibles para este paquete.</td></tr>';
                    return;
                }

                data.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${p.id}</td>
                        <td><code style="color:var(--secondary); font-weight:700;">${p.code}</code></td>
                        <td>
                            <button onclick="editPin(${p.id}, '${p.code}')" class="btn-action" style="background:#333;" title="Editar PIN"><i class="fa-solid fa-edit"></i></button>
                            <button onclick="deletePin(${p.id})" class="btn-action" style="background:rgba(255,75,43,0.1); color:#ff4b2b; border:1px solid #ff4b2b;" title="Eliminar PIN"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            } catch (e) { 
                console.error(e);
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--danger);">Error al cargar.</td></tr>';
            }
        }

        async function editPin(id, oldCode) {
            const { value: newCode } = await Swal.fire({
                title: 'Editar PIN',
                input: 'text',
                inputValue: oldCode,
                showCancelButton: true,
                confirmButtonText: 'Actualizar',
                cancelButtonText: 'Cancelar',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });

            if (newCode && newCode !== oldCode) {
                try {
                    const res = await adminFetch(`${SERVER_URL}/admin/pines/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, code: newCode.trim() })
                    });
                    const data = await res.json();
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'PIN actualizado', timer: 1500, showConfirmButton: false });
                        loadAvailablePines();
                        loadPinStats();
                    } else {
                        Swal.fire('Error', data.message || 'No se pudo actualizar', 'error');
                    }
                } catch (e) { Swal.fire('Error', 'Conexión fallida', 'error'); }
            }
        }

        async function deletePin(id) {
            const { isConfirmed } = await Swal.fire({
                title: '¿Eliminar PIN?',
                text: 'Esta acción eliminará el PIN del inventario permanentemente.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff4b2b',
                confirmButtonText: 'Sí, eliminar',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });

            if (isConfirmed) {
                try {
                    const res = await adminFetch(`${SERVER_URL}/admin/pines/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id })
                    });
                    const data = await res.json();
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'PIN eliminado', timer: 1500, showConfirmButton: false });
                        loadAvailablePines();
                        loadPinStats();
                    }
                } catch (e) { Swal.fire('Error', 'Conexión fallida', 'error'); }
            }
        }

        async function addPines() {
            const amount = document.getElementById('pin-amount').value;
            const codesVal = document.getElementById('pin-codes').value.trim();
            const codes = codesVal.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            
            if (codes.length === 0) {
                return Swal.fire('Atención', 'Por favor, ingresa al menos un código.', 'warning');
            }

            const btn = document.querySelector('#pines .btn-main');
            const originalHTML = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Cargando...';

            try {
                const res = await adminFetch(`${SERVER_URL}/admin/pines/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, codes })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    await Swal.fire('¡Listo!', `${codes.length} pines cargados correctamente.`, 'success');
                    document.getElementById('pin-codes').value = '';
                    loadPinStats();
                } else {
                    Swal.fire('Error', data.message || 'Error al cargar pines (V2)', 'error');
                }
            } catch (e) { 
                console.error(e);
                Swal.fire('Error de Conexión', 'No se pudo comunicar con el servidor en la nube. Revisa tu conexión o refresca la página.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }

        let allUsers = {};
        async function loadUsers() {
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/usuarios`);
                allUsers = await res.json();
                renderUsers(allUsers);
            } catch (e) { console.error(e); }
        }

        function renderUsers(usersMap) {
            const tbody = document.getElementById('users-table-body');
            tbody.innerHTML = '';
            Object.entries(usersMap).forEach(([uid, data]) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><code>${uid}</code></td>
                    <td>${data.name}</td>
                    <td style="color:var(--secondary); font-weight:800">${data.points}</td>
                    <td style="color:${data.password ? '#25D366' : '#FF3D71'}; font-size:0.8rem; font-weight:600;">
                        ${data.password ? '<i class="fa-solid fa-lock"></i> Protegido' : '<i class="fa-solid fa-lock-open"></i> SIN CLAVE'}
                    </td>
                    <td>
                        <button onclick="editPoints('${uid}', ${data.points})" class="btn-action" style="background:#333;" title="Editar Puntos"><i class="fa-solid fa-edit"></i></button>
                        <button onclick="editPassword('${uid}')" class="btn-action" style="background:#1a0a2e;" title="Cambiar Contraseña"><i class="fa-solid fa-key"></i></button>
                        <button onclick="deleteUser('${uid}')" class="btn-action" style="background:rgba(255, 75, 43, 0.2); color:#ff4b2b; border:1px solid #ff4b2b;" title="Eliminar Usuario"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function filterUsers() {
            const query = document.getElementById('user-search').value.toLowerCase();
            const filtered = {};
            Object.entries(allUsers).forEach(([uid, data]) => {
                if (uid.includes(query) || data.name.toLowerCase().includes(query)) filtered[uid] = data;
            });
            renderUsers(filtered);
        }

        async function editPoints(uid, current) {
            const { value: newPoints } = await Swal.fire({ title: 'Editar Puntos', input: 'number', inputValue: current, showCancelButton: true });
            if (newPoints !== null) {
                try {
                    await adminFetch(`${SERVER_URL}/admin/usuarios/update_points`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid, points: newPoints })
                    });
                    loadUsers();
                } catch (e) { console.error(e); }
            }
        }

        async function editPassword(uid) {
            const { value: newPass } = await Swal.fire({
                title: '🔑 Cambiar Contraseña',
                html: `
                    <p style="font-size:0.85rem;color:#aaa;margin-bottom:15px;">ID: <code>${uid}</code><br>Deja vacío para <strong>eliminar</strong> la contraseña.</p>
                    <input id="swal-new-pass" type="text" class="swal2-input" placeholder="Nueva contraseña (o vacío para quitar)">
                `,
                showCancelButton: true,
                confirmButtonText: 'Guardar',
                cancelButtonText: 'Cancelar',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff',
                preConfirm: () => document.getElementById('swal-new-pass').value.trim()
            });

            if (newPass !== undefined) { // undefined = cancelado
                try {
                    const res = await adminFetch(`${SERVER_URL}/admin/usuarios/set_password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid, password: newPass || null })
                    });
                    const data = await res.json();
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: newPass ? 'Contraseña establecida' : 'Contraseña eliminada', timer: 1500, showConfirmButton: false });
                        loadUsers();
                    }
                } catch (e) { Swal.fire('Error', 'No se pudo actualizar.', 'error'); }
            }
        }

        async function deleteUser(uid) {
            const { isConfirmed } = await Swal.fire({
                title: '¿Eliminar usuario?',
                text: `Vas a borrar al usuario con ID: ${uid}. Esta acción no se puede deshacer y perderá sus puntos.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff4b2b',
                cancelButtonColor: '#333',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                background: 'rgba(20, 10, 35, 0.98)',
                color: '#fff'
            });

            if (isConfirmed) {
                try {
                    const res = await adminFetch(`${SERVER_URL}/admin/usuarios/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid })
                    });
                    const data = await res.json();
                    if (data.success) {
                        Swal.fire({ icon: 'success', title: 'Usuario eliminado', timer: 1500, showConfirmButton: false });
                        loadUsers();
                    } else {
                        Swal.fire('Error', data.message || 'No se pudo eliminar', 'error');
                    }
                } catch (e) { Swal.fire('Error', 'Conexión fallida', 'error'); }
            }
        }

        let allSettings = {};
        async function loadSettings() {
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/settings`);
                allSettings = await res.json();
                document.getElementById('setting-tasa').value = allSettings.tasa_del_dia;
                document.getElementById('setting-marquee').value = allSettings.barra_informativa;
                document.getElementById('admin-user').value = allSettings.admin.username;

                // Cargar métodos de pago
                if (allSettings.metodos_pago) {
                    document.getElementById('pm-banco').value = allSettings.metodos_pago.pagomovil.banco;
                    document.getElementById('pm-telefono').value = allSettings.metodos_pago.pagomovil.telefono;
                    document.getElementById('pm-cedula').value = allSettings.metodos_pago.pagomovil.cedula;
                    document.getElementById('bin-id').value = allSettings.metodos_pago.binance.id;
                    document.getElementById('bin-nombre').value = allSettings.metodos_pago.binance.nombre;
                }

                // Cargar WhatsApp
                if (allSettings.whatsapp) {
                    document.getElementById('wa-soporte').value = allSettings.whatsapp.soporte;
                    document.getElementById('wa-canal').value = allSettings.whatsapp.canal;
                }

                const pricesEditor = document.getElementById('prices-editor');
                pricesEditor.innerHTML = '';
                
                Object.entries(allSettings.precios).forEach(([amount, data]) => {
                    pricesEditor.innerHTML += `
                        <div class="form-group" style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                            <label style="color: var(--text-gray); font-weight: 700; margin-bottom: 10px; display: block;">${data.label}</label>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <input type="number" step="0.01" class="price-input" data-amount="${amount}" value="${data.usdt}" style="font-size: 1.1rem; color: white;">
                                <span style="font-weight: 800; color: var(--secondary);">USDT</span>
                            </div>
                        </div>
                    `;
                });
            } catch (e) { console.error(e); }
        }

        async function saveSettings() {
            const { isConfirmed } = await Swal.fire({ title: '¿Guardar cambios?', text: "Se actualizará la tasa y los precios para todos los usuarios.", icon: 'question', showCancelButton: true });
            if (!isConfirmed) return;

            Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            const precios = {};
            document.querySelectorAll('.price-input').forEach(input => {
                const amount = input.dataset.amount;
                precios[amount] = { 
                    usdt: parseFloat(input.value),
                    label: allSettings.precios[amount].label
                };
            });

            const newSettings = {
                ...allSettings,
                tasa_del_dia: parseFloat(document.getElementById('setting-tasa').value),
                barra_informativa: document.getElementById('setting-marquee').value,
                admin: {
                    ...allSettings.admin,
                    username: document.getElementById('admin-user').value
                },
                metodos_pago: {
                    pagomovil: {
                        banco: document.getElementById('pm-banco').value,
                        telefono: document.getElementById('pm-telefono').value,
                        cedula: document.getElementById('pm-cedula').value
                    },
                    binance: {
                        id: document.getElementById('bin-id').value,
                        nombre: document.getElementById('bin-nombre').value
                    }
                },
                whatsapp: {
                    soporte: document.getElementById('wa-soporte').value,
                    canal: document.getElementById('wa-canal').value
                },
                precios
            };

            const newPass = document.getElementById('admin-pass').value;
            if (newPass) newSettings.admin.password = newPass;

            try {
                const res = await adminFetch(`${SERVER_URL}/admin/settings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSettings)
                });
                if ((await res.json()).success) {
                    Swal.fire('¡Éxito!', 'Configuración actualizada.', 'success');
                    document.getElementById('admin-pass').value = '';
                    loadSettings();
                }
            } catch (e) { Swal.fire('Error', 'No se pudo guardar.', 'error'); }
        }

        async function checkWaStatus() {
            try {
                const res = await adminFetch(`${SERVER_URL}/api/wa_status`);
                const data = await res.json();
                const statusEl = document.getElementById('wa-status-text');
                const qrContainer = document.getElementById('wa-qr-container');
                statusEl.innerText = data.status;
                if (data.status === 'Conectado') { statusEl.style.color = '#25D366'; qrContainer.style.display = 'none'; }
                else if (data.status === 'Esperando QR') {
                    statusEl.style.color = '#FFC107'; qrContainer.style.display = 'block';
                    if (data.qr) { qrContainer.innerHTML = ''; new QRCode(qrContainer, { text: data.qr, width: 200, height: 200 }); }
                } else { statusEl.style.color = '#ff4b2b'; qrContainer.style.display = 'none'; }
            } catch (e) { console.error(e); }
        }

        async function clearWaQueue() {
            const { isConfirmed } = await Swal.fire({
                title: '¿Vaciar cola?',
                text: "Esto borrará todos los mensajes pendientes de envío.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ff4b2b',
                confirmButtonText: 'Sí, vaciar'
            });
            if (!isConfirmed) return;
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/clear-wa-queue`, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    Swal.fire('¡Vaciada!', 'La cola de WhatsApp ha sido borrada.', 'success');
                }
            } catch (e) { Swal.fire('Error', 'No se pudo vaciar la cola.', 'error'); }
        }

        async function restartWa() {
            const { isConfirmed } = await Swal.fire({
                title: '¿Reiniciar Bot?',
                text: "Se enviará una señal al bot para que intente reconectarse.",
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Sí, reiniciar'
            });
            if (!isConfirmed) return;
            try {
                const res = await adminFetch(`${SERVER_URL}/admin/restart-wa`, { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    Swal.fire('Solicitado', 'El bot recibirá la orden de reinicio en unos segundos.', 'success');
                }
            } catch (e) { Swal.fire('Error', 'No se pudo enviar la orden.', 'error'); }
        }

        // --- NOTIFICACIONES ---
        let lastPendingCount = -1;
        let titleFlashInterval = null;

        function updatePendingBadge(count) {
            const badge = document.getElementById('pending-badge');
            if (count > 0) {
                badge.innerText = count;
                badge.style.display = 'block';
                
                // Si el número aumentó, notificar
                if (lastPendingCount !== -1 && count > lastPendingCount) {
                    notifyNewOrder();
                }
            } else {
                badge.style.display = 'none';
                stopTitleFlash();
            }
            lastPendingCount = count;
        }

        function notifyNewOrder() {
            // Sonido de notificación
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1361/1361-preview.mp3');
            audio.play().catch(e => console.log('Audio blocked'));
            
            // Flash en el título de la pestaña
            startTitleFlash();
            
            // Alerta visual
            Swal.fire({
                title: '¡NUEVO PEDIDO!',
                text: 'Hay un nuevo pedido pendiente por aprobar.',
                icon: 'warning',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 5000,
                background: 'rgba(20, 10, 35, 0.95)',
                color: '#fff'
            });
        }

        function startTitleFlash() {
            if (titleFlashInterval) return;
            const originalTitle = document.title;
            let isFlash = false;
            titleFlashInterval = setInterval(() => {
                document.title = isFlash ? '🚨 NUEVO PEDIDO 🚨' : originalTitle;
                isFlash = !isFlash;
            }, 1000);
            
            // Detener el flash al hacer clic en cualquier parte de la página
            window.addEventListener('click', stopTitleFlash, { once: true });
        }

        function stopTitleFlash() {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = 'Panel Administrativo | Diamond Center';
            }
        }

        // Init se maneja a través del event listener DOMContentLoaded arriba
        
        // Refresco automático de datos (cada 5 segundos)
        setInterval(() => {
            if (!localStorage.getItem('admin_token')) return; // No refrescar si no hay sesión
            
            const activeTabBtn = document.querySelector('.tab-btn.active');
            const activeTabText = activeTabBtn ? activeTabBtn.innerText.trim() : '';
            
            if (activeTabText.includes('Dashboard')) loadDashboardStats();
            if (activeTabText.includes('Pedidos')) loadOrders();
            if (activeTabText.includes('Almacén') || activeTabText.includes('Pines')) loadPinStats();
            if (activeTabText.includes('Usuarios')) loadUsers();
            
            // Siempre actualizar el badge de pendientes, sin importar el tab
            if (!activeTabText.includes('Dashboard')) {
                adminFetch(`${SERVER_URL}/admin/stats`)
                    .then(r => r.json())
                    .then(stats => updatePendingBadge(stats.pending))
                    .catch(e => {});
            }

            checkWaStatus();
        }, 5000);
    