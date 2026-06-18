/// <reference lib="webworker" />

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _self = self as any as ServiceWorkerGlobalScope;

// ============================================================
// Offline navigation fallback
// ============================================================

const OFFLINE_URL = "/offline";

// Pre-cache the offline page on install
_self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open("offline-fallback-v1").then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
});

// Clean up old caches on activate
_self.addEventListener("activate", (event: ExtendableEvent) => {
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
_self.addEventListener("fetch", (event: FetchEvent) => {
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

_self.addEventListener("push", (event: PushEvent) => {
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

    event.waitUntil(_self.registration.showNotification(title, options));
  } catch {
    // Fallback for non-JSON payloads
    const text = event.data.text();
    event.waitUntil(
      _self.registration.showNotification("Build Alpha Kids", {
        body: text,
        icon: "/icons/icon-192x192.png",
      })
    );
  }
});

_self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    _self.clients
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
        return _self.clients.openWindow(url);
      })
  );
});

// ============================================================
// Background Sync — `queue-sync` tag
// ============================================================

// When the browser fires a 'sync' event for our tag, fan a message out to
// every open client; the OfflineSyncRunner picks it up and triggers
// syncQueue(). Best-effort: Background Sync is Chromium-only, but the
// 60s foreground poll + 'online' event handler cover non-supporting
// browsers (Safari, Firefox).
_self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as Event & { tag?: string };
  if (syncEvent.tag !== "queue-sync") return;

  const ext = event as ExtendableEvent;
  ext.waitUntil(
    _self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            client.postMessage({ type: "BAK_SYNC_REQUEST" });
          } catch {
            // Best-effort — a single bad client shouldn't block the fan-out.
          }
        }
      })
  );
});
