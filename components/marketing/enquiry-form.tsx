"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import {
  CONTACT_FORM,
  ENQUIRE_FORM,
  ORG_TYPES,
  PROGRAMS,
  SITE,
} from "@/lib/marketing/content";
import {
  buildEnquiryPayload,
  buildSourcePage,
  EMPTY_ENQUIRY_FORM,
  ENQUIRY_FIELD_ORDER,
  resolveProgramParam,
  validateEnquiryForm,
  type EnquiryErrors,
  type EnquiryFormState,
  type EnquiryMode,
} from "@/lib/marketing/enquiry";
import { stickerClasses } from "@/components/marketing/sticker-button";
import { cn } from "@/lib/utils";

/**
 * The B2B conversion form — every school and centre lead enters here.
 * POSTs to the hardened /api/crm/enquiry (same origin; the route's
 * allowlist already covers it). It does NOT own its copy: everything
 * user-visible comes from lib/marketing/content.ts.
 *
 * Two variants. "enquire" is the full quote form on /enquire. "contact"
 * is the slim message form on /contact — no suburb, no programs, org
 * type pinned to "other" (which the route stores as a null leads.type
 * plus a note, since the centre_type enum has no "other" member).
 *
 * The sticker treatment is hand-rolled rather than imported: the ui/
 * primitives are tuned for the dashboard's tokens (h-8, border-input),
 * and StickerButton is a next/link — neither fits a 44px-target native
 * form. Restyling them for one form would have leaked marketing
 * treatment into the app's shared primitives.
 */

// One input treatment, one focus treatment. Thick black border, hard
// shadow, 48px tall (clears the 44px target with room). Focus thickens
// the border into a ring and kicks the shadow orange — a colour change
// alone would not be enough on its own.
//
// No placeholder styling here on purpose: no field sets a placeholder
// (every one is labelled), and a grey-on-white placeholder is the
// classic way an AA failure sneaks into a form.
const FIELD_BASE =
  "h-12 w-full rounded-xl border-2 border-[#111] bg-white px-4 font-medium text-[#111] shadow-[3px_3px_0_#111] outline-none transition-all focus:shadow-[5px_5px_0_#E8712A] focus:ring-4 focus:ring-[#111] disabled:cursor-not-allowed disabled:bg-[#1A1A1A]/5 disabled:opacity-70";

// aria-invalid drives the red treatment, so the visual and the a11y
// tree can never disagree.
const FIELD_INVALID =
  "aria-[invalid=true]:border-[#D8342C] aria-[invalid=true]:shadow-[3px_3px_0_#D8342C]";

const FIELD = cn(FIELD_BASE, FIELD_INVALID);

const LABEL =
  "block font-heading text-sm font-bold uppercase tracking-wider text-[#1A1A1A]";

const HINT = "mt-1.5 text-sm leading-relaxed text-[#1A1A1A]/70";

/**
 * The sticker CTA treatment for the submit button. StickerButton is a
 * next/link and cannot submit a form, so this borrows its classes
 * rather than restating them — see stickerClasses().
 *
 * The only additions are states a link never has: the disabled one
 * freezes the press animation rather than just dimming, so a disabled
 * button never looks pressable.
 */
const SUBMIT = cn(
  stickerClasses({ fill: "yellow", size: "lg", shadow: "black" }),
  "min-h-12 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-[4px_4px_0_#111]"
);

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Reads ?program= and hands the resolved slug to the form. Only this
 * component touches useSearchParams(), so only this component has to
 * sit behind a Suspense boundary (Next 16's CSR bailout rule) — the
 * /enquire shell around it stays static.
 */
export function EnquiryFormWithProgram() {
  const searchParams = useSearchParams();
  // Unknown slugs are ignored, not surfaced: the param is
  // attacker-controllable, and a stale campaign link should still land
  // on a working form rather than an error.
  const programSlug = resolveProgramParam(searchParams.get("program"));

  return (
    <EnquiryForm
      mode="enquire"
      programSlug={programSlug}
      sourcePage={buildSourcePage("/enquire", programSlug)}
    />
  );
}

export function EnquiryForm({
  mode = "enquire",
  /** Pre-ticked program, already validated against PROGRAMS. */
  programSlug = null,
  /** Recorded on the lead as source_detail. */
  sourcePage,
}: {
  mode?: EnquiryMode;
  programSlug?: string | null;
  sourcePage: string;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [form, setForm] = useState<EnquiryFormState>(() => ({
    ...EMPTY_ENQUIRY_FORM,
    programs: programSlug ? [programSlug] : [],
    // The contact form has no org-type control, so it speaks for the
    // enquirer: "other" keeps a parent's message out of the centre
    // pipeline instead of defaulting them into it.
    orgType: mode === "contact" ? "other" : "",
  }));
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  /** Synchronous double-submit guard — see handleSubmit. */
  const inFlight = useRef(false);
  /** Focus target when the form is replaced by a panel — see below. */
  const panelHeading = useRef<HTMLHeadingElement>(null);

  const isContact = mode === "contact";
  const submitting = status === "submitting";

  // The form unmounts when a panel takes over, so the submit button
  // that had focus disappears and focus falls back to <body> — a
  // keyboard or screen reader user gets silently dumped at the top of
  // the page with no idea whether anything happened. Moving focus to
  // the panel's heading fixes that, and doubles as the announcement:
  // a live region that is inserted together with its content often
  // isn't announced at all, since it generally has to pre-exist the
  // change to be watched.
  useEffect(() => {
    if (status === "success" || status === "error") panelHeading.current?.focus();
  }, [status]);

  function set<K extends keyof EnquiryFormState>(key: K, value: EnquiryFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear the field's error the moment they start fixing it — leaving
    // it up while they type reads as the fix not working.
    if (key in errors) setErrors(({ [key as never]: _, ...rest }) => rest);
    // Same for the server's complaint: it described the payload they
    // just changed, so it is now stale. Field errors already clear on
    // input; leaving this one pinned until the next submit was the odd
    // one out.
    if (serverError) setServerError(null);
  }

  /**
   * Send focus to the topmost field that failed. Without this, a failed
   * submit leaves focus on the button while the errors render above it,
   * where a keyboard or screen reader user has no reason to look.
   *
   * Call this only after the errors are committed to the DOM — focusing
   * a field whose error text and aria-invalid do not exist yet
   * announces it as valid. handleSubmit uses flushSync for exactly
   * that.
   */
  function focusFirstInvalid(found: EnquiryErrors) {
    const first = ENQUIRY_FIELD_ORDER.find((field) => found[field]);
    if (!first) return;
    document.getElementById(id(first))?.focus();
  }

  function toggleProgram(slug: string) {
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.includes(slug)
        ? prev.programs.filter((s) => s !== slug)
        : [...prev.programs, slug],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Double-submit guard. A ref rather than `status` because both
    // `status` and the disabled attribute only exist after React
    // re-renders: anything dispatching clicks inside a single task
    // reads a stale "idle" and fires again. Real user clicks are
    // separate tasks with a flush in between, so `disabled` already
    // holds for them — this covers the rest, costs nothing, and stops
    // the guard depending on render timing.
    //
    // Scope, honestly: this only covers one client. Two tabs, a retry,
    // or a non-browser POST still race the route's SELECT-then-INSERT
    // dedupe, which has no unique constraint behind it.
    // findTodaysWebEnquiry catches the sequential duplicates; the
    // durable fix for concurrent ones is a partial unique index on
    // leads(lower(contact_email)) where source = 'web_form', which is
    // not this component's to add.
    if (inFlight.current) return;

    const found = validateEnquiryForm(form, mode);

    // flushSync so the error text and aria-invalid are in the DOM before
    // focusFirstInvalid moves focus — focus a field whose error hasn't
    // rendered and a screen reader announces it as valid.
    //
    // This is the case flushSync exists for. The obvious alternative,
    // waiting a frame with requestAnimationFrame, silently does nothing
    // in a backgrounded tab: rAF is not throttled there, it simply
    // never fires (measured — a hidden tab reports rafFires: false).
    // Focus is not something to leave dependent on a paint happening.
    flushSync(() => {
      setErrors(found);
      setServerError(null);
    });

    if (Object.keys(found).length > 0) {
      focusFirstInvalid(found);
      return;
    }

    inFlight.current = true;
    setStatus("submitting");

    try {
      const res = await fetch("/api/crm/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEnquiryPayload(form, sourcePage, mode)),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.success) {
        // 200 covers both a fresh lead and a dedupe hit (same email, same
        // Sydney day) — and a bot tripping the honeypot. All three are a
        // success from here: the enquirer's message is recorded either
        // way, and a bot must get no signal to retry against.
        setStatus("success");
        return;
      }

      // A 4xx carries a message the enquirer can act on — a missing
      // field, or the rate limit. Surface it above the form and keep
      // everything they typed. Anything else (5xx, unparseable) is not
      // actionable, so it gets the failure panel and the phone number.
      if (res.status >= 400 && res.status < 500 && typeof json?.error === "string") {
        setServerError(json.error);
        setStatus("idle");
        return;
      }

      setStatus("error");
    } catch {
      // Network failure — same deal as a 5xx.
      setStatus("error");
    } finally {
      // Released on every path, including success: the success panel
      // replaces the form, so nothing can resubmit anyway, and leaving
      // the ref stuck true would make the failure panel's retry a
      // no-op.
      inFlight.current = false;
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border-2 border-[#111] bg-[#FFD23F] p-8 shadow-[6px_6px_0_#111] sm:p-10"
      >
        <CheckCircle2 className="size-10 text-[#111]" strokeWidth={2.5} aria-hidden="true" />
        {/* tabIndex -1: not a tab stop, but focusable programmatically
            by the effect above, which is what carries the keyboard user
            here and gets the panel read out. */}
        <h3
          ref={panelHeading}
          tabIndex={-1}
          className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-[#111] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#111] sm:text-3xl"
        >
          {ENQUIRE_FORM.successTitle}
        </h3>
        <p className="mt-3 text-lg font-medium leading-relaxed text-[#111]">
          {ENQUIRE_FORM.successBody}
        </p>
        <Link
          href="/programs"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#111] bg-white px-6 py-2.5 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[1px_1px_0_#111]"
        >
          {ENQUIRE_FORM.successCta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-[#111] bg-white p-8 shadow-[6px_6px_0_#D8342C] sm:p-10"
      >
        <AlertTriangle className="size-10 text-[#D8342C]" strokeWidth={2.5} aria-hidden="true" />
        <h3
          ref={panelHeading}
          tabIndex={-1}
          className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-[#1A1A1A] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A1A1A] sm:text-3xl"
        >
          {ENQUIRE_FORM.failureTitle}
        </h3>
        <p className="mt-3 text-base leading-relaxed text-[#1A1A1A]/80">
          {ENQUIRE_FORM.failureBody}
        </p>
        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Back to the form with every field still filled — the state
              was never cleared, so "try again" costs them nothing. */}
          <button type="button" onClick={() => setStatus("idle")} className={SUBMIT}>
            {ENQUIRE_FORM.failureRetry}
          </button>
          <p className="text-sm font-medium text-[#1A1A1A]/80">
            {ENQUIRE_FORM.failurePhonePrefix}{" "}
            {/* Hover is #993C1D, the AA-safe orange for small text on
                white (~6.9:1) — brand orange #E8712A would be ~2.7:1
                here. SITE.phone renders as its TODO-CONFIRM placeholder
                on purpose; that is what flags it for replacement. */}
            <a
              href={`tel:${SITE.phone}`}
              className="font-heading font-bold text-[#111] underline decoration-[#E8712A] decoration-2 underline-offset-4 transition-colors hover:text-[#993C1D]"
            >
              {SITE.phone}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border-2 border-[#111] bg-white p-6 shadow-[6px_6px_0_#111] sm:p-9"
    >
      {/* Honeypot. Off-screen rather than display:none or hidden — the
          bots worth catching skip both. tabIndex/aria-hidden/autoComplete
          keep it away from keyboards, screen readers and password
          managers, so only a form-filling bot ever puts anything in it. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor={id("website")}>{ENQUIRE_FORM.honeypotLabel}</label>
        <input
          id={id("website")}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </div>

      {serverError && (
        <div
          role="alert"
          className="mb-7 rounded-xl border-2 border-[#D8342C] bg-[#D8342C]/5 p-4 shadow-[3px_3px_0_#D8342C]"
        >
          <p className="font-heading text-sm font-bold text-[#1A1A1A]">
            {ENQUIRE_FORM.errors.serverTitle}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#1A1A1A]/80">{serverError}</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* /enquire asks about the organisation first; /contact has no
            org field at all and leads with the person. */}
        {!isContact && (
          <Field
            id={id("orgName")}
            label={ENQUIRE_FORM.orgNameLabel}
            required
            error={errors.orgName && ENQUIRE_FORM.errors.orgNameRequired}
            className="sm:col-span-2"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="organization"
                value={form.orgName}
                onChange={(e) => set("orgName", e.target.value)}
                disabled={submitting}
                className={FIELD}
              />
            )}
          </Field>
        )}

        <Field
          id={id("contactName")}
          label={ENQUIRE_FORM.contactNameLabel}
          // On /contact this name is the lead: it fills the route's
          // required centre_name as well as contact_name.
          required={isContact}
          error={errors.contactName && CONTACT_FORM.contactNameRequired}
          className={isContact ? "sm:col-span-2" : undefined}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="name"
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              disabled={submitting}
              className={FIELD}
            />
          )}
        </Field>

        <Field
          id={id("email")}
          label={ENQUIRE_FORM.emailLabel}
          required
          error={
            errors.email &&
            (errors.email === "invalid"
              ? ENQUIRE_FORM.errors.emailInvalid
              : ENQUIRE_FORM.errors.emailRequired)
          }
        >
          {(props) => (
            <input
              {...props}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              disabled={submitting}
              className={FIELD}
            />
          )}
        </Field>

        <Field id={id("phone")} label={ENQUIRE_FORM.phoneLabel}>
          {(props) => (
            <input
              {...props}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              disabled={submitting}
              className={FIELD}
            />
          )}
        </Field>

        {!isContact && (
          <Field id={id("suburb")} label={ENQUIRE_FORM.suburbLabel}>
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="address-level2"
                value={form.suburb}
                onChange={(e) => set("suburb", e.target.value)}
                disabled={submitting}
                className={FIELD}
              />
            )}
          </Field>
        )}
      </div>

      {!isContact && (
        <>
          {/* Radios, not a select: three options, and the chips read as
              part of the sticker system where a native select would not.

              role="radiogroup" is doing real work. A bare <fieldset>
              maps to role="group", which supports NEITHER aria-invalid
              nor the error wiring — both are simply dropped, and a
              screen reader user gets no signal the field failed at all.
              radiogroup supports them, so the group carries the error
              the way an <input> would. */}
          <fieldset
            role="radiogroup"
            className="mt-8"
            aria-invalid={errors.orgType ? true : undefined}
            aria-describedby={errors.orgType ? id("orgType-error") : undefined}
          >
            <legend className={LABEL}>
              {ENQUIRE_FORM.orgTypeLabel} <RequiredMark />
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {ORG_TYPES.map((option, i) => (
                <Chip
                  key={option.value}
                  // The first radio carries the group's id so the
                  // focus-first-invalid jump has something to land on.
                  id={i === 0 ? id("orgType") : undefined}
                  type="radio"
                  name={id("orgType-group")}
                  label={option.label}
                  checked={form.orgType === option.value}
                  disabled={submitting}
                  onChange={() => set("orgType", option.value)}
                />
              ))}
            </div>
            {errors.orgType && (
              <FieldError id={id("orgType-error")}>
                {ENQUIRE_FORM.errors.orgTypeRequired}
              </FieldError>
            )}
          </fieldset>

          <fieldset className="mt-8">
            <legend className={LABEL}>{ENQUIRE_FORM.programsLabel}</legend>
            <p className={HINT}>{ENQUIRE_FORM.programsHint}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {PROGRAMS.map((program) => (
                <Chip
                  key={program.slug}
                  type="checkbox"
                  name={id("programs")}
                  label={program.title}
                  checked={form.programs.includes(program.slug)}
                  disabled={submitting}
                  onChange={() => toggleProgram(program.slug)}
                />
              ))}
            </div>
          </fieldset>
        </>
      )}

      <Field id={id("message")} label={ENQUIRE_FORM.messageLabel} hint={ENQUIRE_FORM.messageHint} className="mt-8">
        {(props) => (
          <textarea
            {...props}
            rows={5}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            disabled={submitting}
            className={cn(FIELD, "h-auto resize-y py-3 leading-relaxed")}
          />
        )}
      </Field>

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* `disabled` is the visible half of the double-submit defence —
            it tells the enquirer the click landed so they stop clicking.
            The half that actually holds is the inFlight ref in
            handleSubmit; read the note there before touching either. */}
        <button type="submit" disabled={submitting} className={SUBMIT}>
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              {ENQUIRE_FORM.submittingLabel}
            </>
          ) : (
            <>
              {isContact ? CONTACT_FORM.submitLabel : ENQUIRE_FORM.submitLabel}
              <ArrowRight className="size-5" aria-hidden="true" />
            </>
          )}
        </button>
        <p className="text-sm text-[#1A1A1A]/70">
          <RequiredMark /> {ENQUIRE_FORM.requiredNote}
        </p>
      </div>
    </form>
  );
}

/** #D8342C on white is ~4.9:1 — passes AA at this size. */
function RequiredMark() {
  return (
    <span aria-hidden="true" className="font-bold text-[#D8342C]">
      *
    </span>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-2 text-sm font-medium text-[#D8342C]">
      {children}
    </p>
  );
}

/**
 * Label + control + hint + error, wired together. The control comes in
 * as a render prop so each field keeps its own type/autocomplete while
 * the id, aria-invalid and aria-describedby links are built in one
 * place and cannot drift.
 *
 * The error is announced via aria-describedby, NOT aria-errormessage.
 * errormessage is the semantically nicer ARIA 1.2 answer, but VoiceOver
 * support is incomplete: on Safari and iOS the user hears "invalid
 * data" from aria-invalid and never hears WHAT is wrong. This is the
 * B2B lead form and mobile Safari is a real share of it, so the error
 * text rides along with the hint on describedby, which everything
 * supports.
 */
function Field({
  id,
  label,
  hint,
  required,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Resolved copy, or a falsy value when the field is fine. */
  error?: string | false;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }) => React.ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // Error last: describedby is read in order, and the fix matters more
  // than the hint once the field is wrong.
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label} {required && <RequiredMark />}
      </label>
      {hint && (
        <p id={hintId} className={HINT}>
          {hint}
        </p>
      )}
      <div className="mt-2">
        {children({
          id,
          required,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedBy,
        })}
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

/**
 * A sticker chip wrapping a real <input type="radio"|"checkbox">. The
 * native control stays in the DOM and does the work — keyboard, arrow
 * keys within the radio group, screen reader state — while the label
 * carries the fill. has-[:focus-visible] lifts the focus ring onto the
 * chip so the indicator is the whole target, not a 20px box.
 */
function Chip({
  id,
  type,
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  id?: string;
  type: "radio" | "checkbox";
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-full border-2 border-[#111] px-4 py-2 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111] transition-all",
        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#111]",
        // Black on yellow is 13.1:1 checked; black on white 18.9:1 unchecked.
        checked ? "bg-[#FFD23F]" : "bg-white hover:bg-[#FFF7F2]",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        id={id}
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 accent-[#E8712A] outline-none"
      />
      {label}
    </label>
  );
}
