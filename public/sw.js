self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }
  const payload = event.data.json();
  const title = payload.title || 'PushFlow';
  const body = payload.body || 'New notification';
  const options = {
    body,
    data: payload.data || {},
    tag: payload.tag || 'pushflow',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const target = clientList.find((client) => client.url.includes(self.location.origin));
      if (target) {
        return target.focus();
      }
      return clients.openWindow('/');
    })
  );
});
