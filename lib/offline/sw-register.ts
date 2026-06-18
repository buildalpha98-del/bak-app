"use client";

/**
 * Register the service worker and handle updates.
 * Called once from the PWAProvider in the root layout.
 *
 * We also attempt to register a `queue-sync` Background Sync tag. This is a
 * best-effort affordance for the coach offline-queue: when the browser
 * supports SyncManager (Chromium-based) the SW will get a `sync` event on
 * reconnect and message every open client to drain the queue. On browsers
 * without SyncManager (Safari, Firefox) the foreground poll + `online`
 * listener in {@link OfflineSyncRunner} already covers the same ground.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      // Check for updates periodically (every 60 minutes)
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      // Handle controller change (new SW activated)
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      // Best-effort Background Sync registration — silently no-ops on
      // browsers without SyncManager.
      try {
        const swReg = registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        if (swReg.sync && typeof swReg.sync.register === "function") {
          await swReg.sync.register("queue-sync");
        }
      } catch {
        // SyncManager unsupported or permissions denied — fall through to
        // the foreground polling path in OfflineSyncRunner.
      }
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}
