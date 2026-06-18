// ============================================================
// App Badging API wrapper
// ============================================================
//
// The Badging API (`navigator.setAppBadge` / `clearAppBadge`) lets a
// PWA display an unread count on the home-screen icon, just like a
// native app. Supported in Safari 16.4+ (iOS PWA), Chrome 81+ on
// Windows / ChromeOS, and Edge. Always a no-op on unsupported
// browsers so callers can fire it unconditionally.
//
// Counts above 0 set the badge to that exact number. Zero clears it.
// Errors (permission denied, OS quirks) are swallowed — there is
// nothing useful for the caller to do about them, and a thrown error
// would block whatever real work triggered the update.

// We narrow rather than extend Navigator: lib.dom.d.ts (as of TS 5.x)
// declares `setAppBadge` / `clearAppBadge` as required methods, so
// extending with optional versions widens incompatibly. Treating the
// global as a record of optional functions plays nicely with feature
// detection on Safari < 16.4 and older Chromium.
type BadgingNavigator = {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Set or clear the home-screen / dock badge count.
 *
 * Pass the unread count you'd like displayed. Pass 0 to clear the
 * badge entirely (some platforms render "0" as a visible badge — the
 * standard says "clear", and we honour that).
 *
 * Safe to call on the server (no-op), in unsupported browsers (no-op),
 * and when permission has been denied (no-op via try/catch).
 */
export async function updateAppBadge(count: number): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator as unknown as BadgingNavigator;
  // Feature detect — both methods land together so checking either
  // is enough.
  if (typeof nav.setAppBadge !== "function") return;

  try {
    if (count > 0) {
      await nav.setAppBadge(count);
    } else {
      // Some old Chromium builds error if clearAppBadge is missing
      // but setAppBadge exists — fall back to setAppBadge(0).
      if (typeof nav.clearAppBadge === "function") {
        await nav.clearAppBadge();
      } else {
        await nav.setAppBadge(0);
      }
    }
  } catch {
    // Permission denied / OS quirk / browser shipping the API gated
    // behind an experimental flag — fall silent. Caller has no
    // remediation path.
  }
}

/**
 * Convenience: returns true if the running browser exposes the Badging
 * API. Useful for surfaces that want to render a "you'll see a badge on
 * your home screen" hint without blindly enabling it.
 */
export function isBadgingSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as unknown as BadgingNavigator;
  return typeof nav.setAppBadge === "function";
}
