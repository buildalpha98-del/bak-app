// ============================================================
// Enquiry form logic — pure, shared by <EnquiryForm />
// ============================================================
//
// Everything here is deliberately free of React and of copy: the form
// component owns the state and the prose, this module owns the rules.
// That keeps the parts worth testing testable (the repo only unit-tests
// pure modules) and keeps the wire contract in one readable place.
//
// The wire contract is app/api/crm/enquiry/route.ts — READ IT before
// changing a field name here. The route is hardened and shared with the
// legacy WordPress form; renaming a key on this side silently drops the
// value into a lead nobody looks at.

import { PROGRAMS, type OrgTypeOption } from "./content";

/** Which surface the form is rendered on — drives fields and copy. */
export type EnquiryMode = "enquire" | "contact";

export type OrgType = OrgTypeOption["value"];

/** The form's controlled state. Strings all the way — trimming happens at build time. */
export interface EnquiryFormState {
  orgName: string;
  contactName: string;
  email: string;
  phone: string;
  suburb: string;
  /** "" until the enquirer picks. The contact variant pins this to "other". */
  orgType: OrgType | "";
  /** Program slugs, not titles — slugs are the stable key. */
  programs: string[];
  message: string;
  /** Honeypot. Non-empty means a bot; the route silently discards it. */
  website: string;
}

export const EMPTY_ENQUIRY_FORM: EnquiryFormState = {
  orgName: "",
  contactName: "",
  email: "",
  phone: "",
  suburb: "",
  orgType: "",
  programs: [],
  message: "",
  website: "",
};

/** The payload POSTed to /api/crm/enquiry. Optional keys are omitted, not nulled. */
export interface EnquiryPayload {
  centre_name: string;
  contact_email: string;
  contact_name?: string;
  contact_phone?: string;
  suburb?: string;
  type?: OrgType;
  programs_of_interest?: string[];
  message?: string;
  source_page?: string;
  website: string;
}

export type EnquiryField = "orgName" | "email" | "orgType";
export type EnquiryErrorCode = "required" | "invalid";
export type EnquiryErrors = Partial<Record<EnquiryField, EnquiryErrorCode>>;

/**
 * Deliberately loose: something@something.something. The point is to
 * catch the typo the enquirer can fix before we lose the lead, not to
 * out-lawyer RFC 5322 — an over-strict pattern rejecting a valid
 * address is the worse failure on a conversion form.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client-side gate before the fetch. The route validates independently
 * (and its 400s are surfaced too) — this only exists to spare the
 * enquirer a round trip.
 *
 * Org type is required on /enquire because the route's fallback for an
 * unrecognised `type` is "childcare_centre": leaving it blank would
 * quietly file every school as a centre.
 */
export function validateEnquiryForm(
  form: EnquiryFormState,
  mode: EnquiryMode = "enquire"
): EnquiryErrors {
  const errors: EnquiryErrors = {};

  if (!form.orgName.trim()) errors.orgName = "required";

  const email = form.email.trim();
  if (!email) errors.email = "required";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "invalid";

  if (mode === "enquire" && !form.orgType) errors.orgType = "required";

  return errors;
}

/**
 * The `?program=` slug, or null if absent/unknown. Unknown values are
 * ignored rather than surfaced: the param is attacker-controllable and
 * a stale link from an old campaign should still land on a usable form.
 */
export function resolveProgramParam(param: string | null | undefined): string | null {
  if (!param) return null;
  return PROGRAMS.some((p) => p.slug === param) ? param : null;
}

/**
 * `source_page` → `leads.source_detail`, so it has to read as something
 * a human scanning the CRM understands: the path, plus the program the
 * enquirer arrived from when there is one.
 */
export function buildSourcePage(
  pathname: string,
  programSlug: string | null
): string {
  return programSlug ? `${pathname}?program=${programSlug}` : pathname;
}

/** Program titles, in PROGRAMS display order — the route joins these into the lead notes. */
export function programTitlesFor(slugs: string[]): string[] {
  return PROGRAMS.filter((p) => slugs.includes(p.slug)).map((p) => p.title);
}

/**
 * Empty after trimming → the key is left off the payload entirely
 * rather than sent as "" or null, so the route stores its own null.
 * Spread of `{}` is how the key disappears; `key: undefined` would
 * still be a key, and `JSON.stringify` dropping it later is luck, not
 * intent.
 */
function optional<K extends string>(
  key: K,
  value: string
): Record<K, string> | Record<string, never> {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed } as Record<K, string>) : {};
}

export function buildEnquiryPayload(
  form: EnquiryFormState,
  sourcePage: string
): EnquiryPayload {
  const programs = programTitlesFor(form.programs);

  return {
    centre_name: form.orgName.trim(),
    contact_email: form.email.trim(),
    ...optional("contact_name", form.contactName),
    ...optional("contact_phone", form.phone),
    ...optional("suburb", form.suburb),
    ...(form.orgType ? { type: form.orgType } : {}),
    ...(programs.length ? { programs_of_interest: programs } : {}),
    ...optional("message", form.message),
    ...optional("source_page", sourcePage),
    // Sent verbatim, never trimmed away: the route only discards on a
    // non-empty value, and stripping it here would defeat the honeypot.
    website: form.website,
  };
}
