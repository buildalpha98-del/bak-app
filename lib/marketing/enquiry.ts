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

export type EnquiryField = "orgName" | "contactName" | "email" | "orgType";
export type EnquiryErrorCode = "required" | "invalid";
export type EnquiryErrors = Partial<Record<EnquiryField, EnquiryErrorCode>>;

/**
 * Focus order for the first-invalid-field jump after a failed submit —
 * source order, so the enquirer lands on the topmost problem rather
 * than whichever key the object happened to iterate first.
 */
export const ENQUIRY_FIELD_ORDER: EnquiryField[] = [
  "orgName",
  "contactName",
  "email",
  "orgType",
];

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
 * The required set differs by mode because the two forms ask different
 * questions: /enquire asks about an organisation, /contact asks about a
 * person (see buildEnquiryPayload for why that still satisfies the
 * route's required centre_name).
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

  if (mode === "contact") {
    if (!form.contactName.trim()) errors.contactName = "required";
  } else {
    if (!form.orgName.trim()) errors.orgName = "required";
    if (!form.orgType) errors.orgType = "required";
  }

  const email = form.email.trim();
  if (!email) errors.email = "required";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "invalid";

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
  sourcePage: string,
  mode: EnquiryMode = "enquire"
): EnquiryPayload {
  const programs = programTitlesFor(form.programs);

  // The route requires centre_name, but /contact never asks for an
  // organisation — it is the third door, for the people the two route
  // cards don't fit, and a parent has no org to name. So their own name
  // fills both: the CRM row reads as a person rather than a phantom
  // organisation, and nobody gets asked an org-shaped question they
  // can't answer. Directors wanting a quote go to /enquire, which does
  // ask. This is the whole reason buildEnquiryPayload takes `mode`.
  const centreName =
    mode === "contact" ? form.contactName.trim() : form.orgName.trim();

  return {
    centre_name: centreName,
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
