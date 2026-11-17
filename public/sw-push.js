/* Background Web Push & Notification Click Handler for KGP PWA */

self.addEventListener('push', function (event) {
  let payload = {
    title: 'Kerala 22K Gold Update',
    body: 'Tap to view the latest Kerala gold price.',
    tag: 'kgp-push-alert',
    url: './',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = Object.assign(payload, parsed);
      }
    } catch (_err) {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  const scopeUrl = (self.registration && self.registration.scope) || '/';
  const iconUrl = new URL('pwa-192x192.png', scopeUrl).href;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: iconUrl,
      badge: iconUrl,
      tag: payload.tag || 'kgp-push-alert',
      renotify: true,
      data: {
        url: payload.url || scopeUrl,
      },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const scopeUrl = (self.registration && self.registration.scope) || '/';
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || scopeUrl;

  event.waitUntil(
    self.clients
      .matchAll({type: 'window', includeUncontrolled: true})
      .then(function (clientList) {
        for (let i = 0; i < clientList.length; i += 1) {
          const client = clientList[i];
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
