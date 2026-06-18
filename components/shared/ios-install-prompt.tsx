"use client";

// ============================================================
// iOS "Add to Home Screen" prompt
// ============================================================
//
// iOS Safari does NOT fire `beforeinstallprompt`, so the standard
// install prompt (handled by `install-prompt.tsx`) silently does
// nothing on iPhones / iPads. This component closes that gap by
// detecting iOS Safari outside standalone mode and showing a
// dismissible bottom-sheet that walks the user through the manual
// Share → Add to Home Screen flow.
//
// Behaviour:
//  - Only fires when the UA is iOS AND standalone mode is false
//  - Auto-shows after 30s on first visit
//  - Dismiss persists for 7 days via localStorage
//  - Brand-orange theme, X to dismiss, 44px tap targets
//  - Mounted from `dashboard-shell.tsx`; safe to render anywhere
//    else (the gate is internal — non-iOS users will see nothing).

import { useEffect, useState } from "react";
import { Share, X, Plus } from "lucide-react";

const STORAGE_KEY = "bak-ios-install-dismissed-at";
const SHOW_AFTER_MS = 30_000;
const DISMISS_DAYS = 7;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on iPadOS 13+ reports as Mac — disambiguate via touch.
  const iPadOnMac = ua.includes("Mac") && "ontouchend" in document;
  return /iPad|iPhone|iPod/.test(ua) || iPadOnMac;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari surfaces standalone via the non-standard navigator.standalone.
  // Other browsers report it via the media query.
  const nav = window.navigator as NavigatorWithStandalone;
  if (nav.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function dismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

export function IosInstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Bail in three cases:
    //   1. Not iOS Safari (the standard prompt covers Android / desktop)
    //   2. Already running in standalone mode (user already installed)
    //   3. User dismissed in the last 7 days
    if (!isIos()) return;
    if (isStandalone()) return;
    if (dismissedRecently()) return;

    const id = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  function handleDismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage blocked (private mode etc.) — just hide for the session.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="ios-install-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-orange-100 bg-white p-4 shadow-2xl ring-1 ring-black/5 animate-fade-up"
      style={{
        // Keep the banner above the home indicator on devices with a
        // bottom safe-area inset (iPhone X+).
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF3EB]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192x192.png"
            alt=""
            aria-hidden="true"
            className="h-7 w-7 rounded-md"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            id="ios-install-title"
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            Install Build Alpha Kids
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#666666]">
            Add it to your home screen for the full app experience — push
            notifications, offline forms, faster load.
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-[#1A1A1A]">
            <span>Tap</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF3EB] px-1.5 py-0.5 font-medium text-[#E8712A]">
              <Share className="h-3.5 w-3.5" />
              Share
            </span>
            <span>then</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF3EB] px-1.5 py-0.5 font-medium text-[#E8712A]">
              <Plus className="h-3.5 w-3.5" />
              Add to Home Screen
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8712A] focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
