"use client";

import { useId, useRef, useState } from "react";
import { trackNewsletterSignup } from "@/lib/marketing/analytics";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { NEWSLETTER } from "@/lib/marketing/content";
import {
  subscribeToNewsletter,
  type NewsletterErrorCode,
} from "@/lib/marketing/newsletter";
import { cn } from "@/lib/utils";

/**
 * The newsletter capture — one field, one button, calls the
 * subscribeToNewsletter server action. Client-side because of the
 * in-flight guard and the success/failure swap; it is a leaf, so the
 * homepage around it stays static (the action reads headers() at
 * request time, not at render).
 *
 * It owns no copy — everything user-visible comes from NEWSLETTER in
 * lib/marketing/content.ts — and no validation rules: the action is
 * the only judge of what an email is, so there is exactly one pattern
 * in the codebase to keep correct. The only check here is "did they
 * type anything", which needs no rule and saves a round trip.
 *
 * Treatment is hand-rolled to match <EnquiryForm />, and for the same
 * reason: the ui/ primitives are tuned for the dashboard's tokens and
 * do not fit a 44px-target sticker form.
 */

const FIELD_BASE =
  "h-12 w-full rounded-xl border-2 border-[#111] bg-white px-4 font-medium text-[#111] shadow-[3px_3px_0_#111] outline-none transition-all placeholder:text-[#1A1A1A]/40 focus:shadow-[5px_5px_0_#E8712A] focus:ring-4 focus:ring-[#111] disabled:cursor-not-allowed disabled:bg-[#1A1A1A]/5 disabled:opacity-70";

const FIELD_INVALID =
  "aria-[invalid=true]:border-[#D8342C] aria-[invalid=true]:shadow-[3px_3px_0_#D8342C]";

const LABEL =
  "block font-heading text-sm font-bold uppercase tracking-wider text-[#1A1A1A]";

const SUBMIT =
  "inline-flex h-13 min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-[#111] bg-[#FFD23F] px-8 font-heading text-base font-bold text-[#111] shadow-[4px_4px_0_#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#111] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#111] sm:w-auto";

type Status = "idle" | "submitting" | "success" | "error";

/** The codes that keep the subscriber on the form, mapped to their copy. */
const INLINE_ERRORS: Record<
  "email_required" | "email_invalid" | "rate_limited",
  string
> = {
  email_required: NEWSLETTER.errors.emailRequired,
  email_invalid: NEWSLETTER.errors.emailInvalid,
  rate_limited: NEWSLETTER.errors.rateLimited,
};

function isInlineError(code: NewsletterErrorCode): code is keyof typeof INLINE_ERRORS {
  return code !== "failed";
}

export function NewsletterForm({
  /** Recorded on the row as source_page. Must be a path — the action drops anything else. */
  sourcePage,
}: {
  sourcePage: string;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  /** Synchronous double-submit guard — see handleSubmit. */
  const inFlight = useRef(false);

  const submitting = status === "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // The guard, and it has to be a ref. `disabled` and `status` only
    // exist after React re-renders, so a burst of clicks dispatched
    // within one task all read the stale "idle" and all fire (measured
    // on the enquiry form: five clicks, five POSTs). A ref flips
    // synchronously, before the second click can be handled.
    //
    // Cheaper here than on the enquiry form — the UNIQUE index on email
    // means a double-submit upserts the same row twice rather than
    // creating two subscribers — but it still spends two writes and two
    // rate-limit tokens on one click, so it stays.
    //
    // Keep both: the ref is the guard, `disabled` is the affordance.
    if (inFlight.current) return;

    // The only client-side rule: an empty box is not worth a round trip.
    // Everything else — shape, length, normalisation — is the action's
    // call, so there is one email pattern in the codebase, not two.
    if (!email.trim()) {
      setError(NEWSLETTER.errors.emailRequired);
      return;
    }

    inFlight.current = true;
    setError(null);
    setStatus("submitting");

    try {
      const formData = new FormData();
      formData.set("email", email);
      formData.set("source_page", sourcePage);
      // Sent verbatim, never trimmed away: the action only discards on
      // a non-empty value, and stripping it here defeats the honeypot.
      formData.set("website", website);

      const result = await subscribeToNewsletter(formData);

      if (result.ok) {
        // Covers a fresh subscriber, a resubscribe, and a bot tripping
        // the honeypot. All three are a success from here — a bot must
        // get no signal to retry against.
        setStatus("success");
        trackNewsletterSignup(sourcePage);
        return;
      }

      // Actionable codes keep them on the form with what they typed
      // intact. "failed" is not theirs to fix, so it gets the panel.
      if (isInlineError(result.code)) {
        setError(INLINE_ERRORS[result.code]);
        setStatus("idle");
        return;
      }

      setStatus("error");
    } catch {
      // The action does not throw by contract; a network drop still can.
      setStatus("error");
    } finally {
      // Released on every path, including success: the success panel
      // replaces the form so nothing can resubmit, and a ref stuck true
      // would make the failure panel's retry a no-op.
      inFlight.current = false;
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border-2 border-[#111] bg-[#FFD23F] p-6 shadow-[6px_6px_0_#111] sm:p-8"
      >
        <CheckCircle2 className="size-9 text-[#111]" strokeWidth={2.5} aria-hidden="true" />
        <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-[#111]">
          {NEWSLETTER.successTitle}
        </h3>
        <p className="mt-2 text-base font-medium leading-relaxed text-[#111]">
          {NEWSLETTER.successBody}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[6px_6px_0_#D8342C] sm:p-8"
      >
        <AlertTriangle className="size-9 text-[#D8342C]" strokeWidth={2.5} aria-hidden="true" />
        <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-[#1A1A1A]">
          {NEWSLETTER.failureTitle}
        </h3>
        <p className="mt-2 text-base leading-relaxed text-[#1A1A1A]/80">
          {NEWSLETTER.failureBody}
        </p>
        {/* Back to the form with the address still in the box — the
            state was never cleared, so "try again" costs them nothing. */}
        <button type="button" onClick={() => setStatus("idle")} className={cn(SUBMIT, "mt-6")}>
          {NEWSLETTER.failureRetry}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[6px_6px_0_#111] sm:p-8"
    >
      {/* Honeypot. Off-screen rather than display:none or hidden — the
          bots worth catching skip both. tabIndex/aria-hidden/autoComplete
          keep it away from keyboards, screen readers and password
          managers, so only a form-filling bot ever fills it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor={id("website")}>{NEWSLETTER.honeypotLabel}</label>
        <input
          id={id("website")}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <label htmlFor={id("email")} className={LABEL}>
        {NEWSLETTER.emailLabel}
      </label>
      <div className="mt-2">
        <input
          id={id("email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={NEWSLETTER.emailPlaceholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear the error the moment they start fixing it — leaving
            // it up while they type reads as the fix not working.
            if (error) setError(null);
          }}
          disabled={submitting}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? id("error") : undefined}
          className={cn(FIELD_BASE, FIELD_INVALID)}
        />
      </div>

      {error && (
        <p id={id("error")} role="alert" className="mt-2 text-sm font-medium text-[#D8342C]">
          {error}
        </p>
      )}

      {/* `disabled` is the visible half of the double-submit defence —
          it tells them the click landed so they stop clicking. The half
          that holds is the inFlight ref; read the note there first. */}
      <button type="submit" disabled={submitting} className={cn(SUBMIT, "mt-5")}>
        {submitting ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            {NEWSLETTER.submittingLabel}
          </>
        ) : (
          <>
            {NEWSLETTER.submitLabel}
            <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
