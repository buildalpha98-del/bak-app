"use client";

/**
 * Register the service worker and handle updates.
 * Called once from the PWAProvider in the root layout.
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
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  });
}
