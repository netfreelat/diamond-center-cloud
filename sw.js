const CACHE_NAME = 'diamond-center-v8';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/badge-diamond.png',
    '/manifest.json',
    '/politica-privacidad.html',
    '/terminos-condiciones.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('Error caching assets on install:', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Solo manejamos peticiones GET
    if (event.request.method !== 'GET') return;
    
    // Ignorar las peticiones a la API o rutas de backend
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Si la red funciona, actualizamos el caché
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si la red falla, intentamos devolver desde el caché
                return caches.match(event.request);
            })
    );
});

// --- LÓGICA DE NOTIFICACIONES PUSH PWA ---
self.addEventListener('push', event => {
    let data = { title: 'RECARGASNEY.COM', body: 'Nueva notificación.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'RECARGASNEY.COM', body: event.data.text() };
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        vibrate: [100, 50, 100],
        data: data.data || { url: '/' }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    const targetUrl = event.notification.data && event.notification.data.url 
        ? event.notification.data.url 
        : '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Si ya hay una pestaña abierta de nuestra app, la enfocamos
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    if (targetUrl !== '/' && !client.url.endsWith(targetUrl)) {
                        client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }
            // Si no hay pestañas abiertas, abrimos una nueva
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});

