// Service Worker Lailyeeaah — Web Push Notification
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tangani event push dari server
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Lailyeeaah", body: event.data.text() };
    }
  }

  const title = data.title || "Lailyeeaah";
  const options = {
    body: data.body || "Ada pembaruan status sewa.",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag || "laily-notif",
    data: {
      url: data.url || "/chat.html",
    },
    vibrate: [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tangani klik pada notifikasi
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetPath = (event.notification.data && event.notification.data.url) || "/chat.html";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Cari tab yang sedang membuka chat
        for (const client of windowClients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname.includes("chat") && "focus" in client) {
            if ("navigate" in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        // Jika belum ada tab yang cocok, buka tab/window baru
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
