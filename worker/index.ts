/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// ============================================================
// Offline navigation fallback
// ============================================================

const OFFLINE_URL = "/offline";

// Pre-cache the offline page on install
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open("offline-fallback-v1").then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
});

// Clean up old caches on activate
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("offline-fallback-") &&
              key !== "offline-fallback-v1"
          )
          .map((key) => caches.delete(key))
      );
    })
  );
});

// Intercept navigation requests — serve offline page if network fails
self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL).then((response) => {
          return response || new Response("Offline", { status: 503 });
        });
      })
    );
  }
});

// ============================================================
// Push notification handlers for next-pwa custom worker
// ============================================================

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  try {
    const payload = event.data.json() as {
      title?: string;
      body?: string;
      url?: string;
      tag?: string;
    };

    const title = payload.title ?? "Build Alpha Kids";
    const options: NotificationOptions = {
      body: payload.body ?? "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      tag: payload.tag ?? "bak-notification",
      data: { url: payload.url ?? "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for non-JSON payloads
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Build Alpha Kids", {
        body: text,
        icon: "/icons/icon-192x192.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If an existing window is open, focus it
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      })
  );
});
