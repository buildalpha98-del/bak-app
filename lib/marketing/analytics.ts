// ============================================================
// GA4 — marketing-surface analytics only
// ============================================================
//
// The tag loads ONLY in app/(marketing)/layout.tsx and ONLY when
// VERCEL_ENV === "production" — the dashboard, parent portal and
// client portal are deliberately unmeasured (staff clicks would
// drown prospect data, and the portals sit closer to children's
// records than analytics should ever be), and preview deploys /
// localhost never pollute the property.
//
// The measurement ID is public by nature (it ships in page source on
// every GA site); it is NOT a secret.

export const GA_MEASUREMENT_ID = "G-MHMX2CXTYG";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Null-safe event helper: gtag is absent on portal pages (tag not
 * loaded), in non-production environments, and for any visitor with
 * an ad-blocker — analytics must never be able to break a form.
 */
function track(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  window.gtag("event", event, params);
}

/**
 * A successful enquiry submission — the site's primary conversion.
 * `generate_lead` is GA4's recommended-event name for exactly this,
 * so it slots into the standard lead reports without configuration.
 */
export function trackLead(sourcePage: string, mode: "enquire" | "contact"): void {
  track("generate_lead", { source_page: sourcePage, form: mode });
}

/** A successful newsletter signup — the secondary conversion. */
export function trackNewsletterSignup(sourcePage: string): void {
  track("newsletter_signup", { source_page: sourcePage });
}
