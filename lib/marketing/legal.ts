// ============================================================
// Legal copy — Privacy Policy + Terms of Use
// ============================================================
//
// Deliberately NOT in content.ts. That module is marketing copy:
// it is edited by whoever is tuning conversion, it carries the
// brand voice, and it changes often. This module is the opposite —
// it is edited by (or on the advice of) a lawyer, it changes rarely,
// and a careless edit here is a compliance problem rather than a
// worse headline. Different concern, different owners, different
// change cadence: different file.
//
// ------------------------------------------------------------
// THE ONE RULE FOR EDITING THIS FILE
// ------------------------------------------------------------
//
// Every factual claim about how the platform handles data must be
// TRUE and traceable to the code. Not to a template, not to what we
// intend to build. A policy that misdescribes data handling misleads
// parents about their children's information.
//
// Each factual claim below carries a `Source:` comment pointing at
// the file it was read from. If you change the claim, change the
// source first — or move the claim to TODO-CONFIRM.
//
// TODO-CONFIRM marks a statement that could NOT be established from
// the codebase. Same convention as SITE.phone / SITE.abn in
// content.ts. Do not replace one with a plausible guess: an invented
// retention period or complaints process is exactly the kind of
// claim that turns a draft into a liability.
//
// ------------------------------------------------------------
// STATUS: UNREVIEWED DRAFT
// ------------------------------------------------------------
//
// Written by engineers working from the codebase, NOT by a lawyer.
// It is a faithful description of what the software does, structured
// around the Australian Privacy Principles (Privacy Act 1988 (Cth)),
// so that a lawyer can review the substance instead of first having
// to reverse-engineer the system. It has not had that review yet.
//
// Australian English. Plain enough for a parent to read in one go —
// this is not the place for the marketing voice's swagger.

// ------------------------------------------------------------
// Shared shape
// ------------------------------------------------------------

/** A numbered section of a legal page. */
export interface LegalSection {
  /** Section heading — also the anchor label in the contents list. */
  heading: string;
  /** Body paragraphs, rendered in order. */
  body: string[];
  /** Optional bullets, rendered after the paragraphs. */
  bullets?: string[];
}

export interface LegalPage {
  /** Sticker eyebrow above the H1. */
  eyebrow: string;
  title: string;
  /** Lead paragraph in the hero. */
  intro: string;
  /** Meta description — ≤160 chars, guarded by content.test.ts. */
  description: string;
  sections: LegalSection[];
}

/**
 * Shown as "Last updated" on both pages.
 *
 * A static constant, never `new Date()`. A build-time date would move
 * on every deploy and advertise revisions that never happened — on a
 * legal page that is a false statement about the document itself.
 * Bump this by hand when the copy below actually changes.
 */
export const LEGAL_LAST_UPDATED = "15 July 2026";

/**
 * The banner both pages carry above the copy.
 *
 * Stays until a lawyer has signed the pages off, and removing it is a
 * decision for Jayden and that lawyer — not a tidy-up.
 */
export const LEGAL_DRAFT_NOTICE =
  "This is a draft prepared for legal review and is not yet a final policy. It describes how Build Alpha Kids actually handles information today. If anything here is unclear or looks wrong, please tell us — see the contact details at the end.";

// ------------------------------------------------------------
// Privacy Policy
// ------------------------------------------------------------

export const PRIVACY_PAGE: LegalPage = {
  eyebrow: "Privacy",
  title: "Privacy Policy",
  intro:
    "We collect information about children in order to coach them well. This page sets out exactly what we collect, why, who else can see it, and what you can do about it.",
  description:
    "How Build Alpha Kids collects, uses, stores and discloses personal information about parents and children, and how to access, correct or complain about it.",
  sections: [
    {
      heading: "About this policy",
      body: [
        "Build Alpha Kids runs multi-sport coaching programs for children across South-West Sydney. To do that we hold personal information about children and about the parents and guardians who enrol them.",
        "We are bound by the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs). This policy is written around those principles and explains how we handle personal information in our booking system and parent portal.",
        // TODO-CONFIRM: the operating entity's legal name and ABN. SITE.abn
        // is still a TODO-CONFIRM placeholder and BAK_ABN is a runtime env
        // var whose value is not in the repo (lib/launch/invoice-actions.ts).
        "TODO-CONFIRM: the legal entity name and ABN of the business that operates Build Alpha Kids, to be stated here.",
      ],
    },
    {
      heading: "What we collect",
      body: [
        "About the parent or guardian, when you create an account or make a booking: your first and last name, email address, phone number and suburb, along with whether you have opted in to marketing emails and to SMS notifications.",
        // Source: supabase/migrations/017_children_and_attendance.sql —
        // the `children` table. medical_notes and photo_url are real
        // columns, so they are disclosed rather than glossed.
        "About your child, when you enrol them: their first and last name, date of birth, age group, gender, and any medical notes you or your centre give us — for example allergies, asthma, or a condition our coaches need to know about. We may also hold a photo of your child.",
        "About your child's participation, as the program runs: attendance at each session, skill ratings recorded by coaches, written observations by coaches, photos taken during sessions, and development insights generated from that data (see 'AI-assisted insights' below).",
        "About payments: the amount, what it was for, and the reference numbers Square gives us for the transaction. We never receive or store your card number — see 'Payments' below.",
        "If you enquire or subscribe: the name, email, phone, suburb and message you send us through an enquiry form, or just your email address if you subscribe to our newsletter.",
      ],
    },
    {
      heading: "Sensitive information",
      body: [
        "Health information — the medical notes above — is 'sensitive information' under the Privacy Act and gets extra protection. We collect it only so our coaches can keep your child safe during a session, and we only collect it because you or your child's centre have given it to us for that purpose.",
        "You do not have to give us medical information. If you do not, we may not be able to safely include your child in some activities.",
      ],
    },
    {
      heading: "Why we collect it and how we use it",
      body: [
        "We use the information above to run our programs and nothing more surprising than that:",
      ],
      bullets: [
        "To enrol your child, manage bookings and take payment.",
        "To run sessions safely — including knowing about a medical condition before a child starts.",
        "To record attendance and track skill development over a term.",
        "To send you booking confirmations, receipts, reminders and cancellation notices.",
        "To send you marketing emails or SMS, but only if you have opted in. You can opt out at any time.",
        "To respond to your enquiry.",
        "To improve our programs and understand how our business is going.",
      ],
    },
    {
      heading: "Photos of children",
      body: [
        // Source: supabase/migrations/042_launch_foundation.sql —
        // `session_photos` exists (session_id, uploaded_by, storage_path).
        "Our coaches can upload photos taken during a session. Those photos are stored against the session and are visible to the coach who took them, to our administrators, and to the director of the centre where the session ran.",
        // Honest gap. There is NO consent column anywhere in the schema, so
        // we must not describe a consent process the software does not have.
        "TODO-CONFIRM: Build Alpha Kids does not currently record a photo or media consent flag against a child in this system. Before launch, confirm how photo consent is obtained and recorded (for example, through the centre's own enrolment forms), how a parent asks for a photo to be removed, and whether photos are ever used for marketing. This section must then describe that actual process — and if photos may be used publicly, that requires its own clear consent and must be stated here.",
      ],
    },
    {
      heading: "AI-assisted insights",
      body: [
        // The material disclosure. Source: app/api/insights/generate/route.ts
        // and app/api/cron/child-insights/route.ts — both build a prompt
        // containing the child's full name.
        "We use an artificial intelligence service provided by Anthropic (the Claude API) to help write development insight reports about your child — a summary of their strengths, areas for growth, and suggestions for parents and coaches.",
        "We think you should know exactly what is sent. When an insight is generated, we send Anthropic: your child's first and last name, their age group and approximate age in years, the name and dates of the school term, their attendance record for each sport, and the skill ratings their coaches recorded. This information identifies your child by name — it is not anonymised or aggregated with other children.",
        "We do not send your child's medical notes, date of birth, gender, photos, your contact details, or any payment information to Anthropic.",
        "Insights are generated when a coach or administrator asks for one, and automatically at the end of a term for children who have skill ratings for that term. The report that comes back is stored in our system and shown to you in your parent account.",
        "Anthropic processes this information on our behalf as a service provider. TODO-CONFIRM: the applicable Anthropic terms and data-processing commitments (including their retention of API inputs and whether the data may be used for training) should be confirmed and summarised here by the reviewing lawyer, and Jayden should decide whether parents are offered a way to opt out of AI-generated insights — the system does not currently have an opt-out.",
      ],
    },
    {
      heading: "Who we share it with",
      body: [
        "We do not sell your information, and we do not share it for anyone else's advertising.",
        "We do share it with the centre or school your child attends, where they run the program with us, and with the coaches assigned to your child's sessions.",
        "We also use the following service providers to run the platform. They handle information on our behalf, only to provide their service to us:",
      ],
      bullets: [
        // Every entry below is verified wired. Sentry is deliberately absent:
        // lib/utils/errorTracking.ts is a console-logging stub with a
        // "swap to Sentry when ready" TODO and @sentry/nextjs is not a
        // dependency. Naming it would be a false disclosure.
        "Supabase — our database, sign-in and file storage. This is where the information above is held.",
        "Vercel — hosting. Our application runs on Vercel's servers.",
        "Anthropic — the AI service described above.",
        "Resend — sending our emails, such as booking confirmations and receipts.",
        "Square — processing card payments.",
        "Twilio — sending SMS notifications, if you have opted in to them.",
      ],
    },
    {
      heading: "Information sent overseas",
      body: [
        "Some of your information is held or processed outside Australia. Under APP 8 we have to tell you that plainly, so:",
        // Source: vercel.json — `"regions": ["bom1"]`. bom1 is Vercel's
        // Mumbai region. This is the compute region, which is NOT the same
        // thing as where the database sits — hence the separate line below.
        "Our application runs on servers in Mumbai, India. This means information you enter — including information about your child — is processed in India.",
        // Deliberately unresolved. The repo only pins the LOCAL Supabase
        // (supabase/config.toml, NEXT_PUBLIC_SUPABASE_URL=127.0.0.1 in
        // .env.local.example). The hosted project's region is a dashboard
        // setting and cannot be read from the code. Guessing it would be
        // guessing the single most important sentence on this page.
        "TODO-CONFIRM: the country in which our Supabase database physically stores data. This could not be determined from our code — it is set on the hosted Supabase project. This is the sentence that tells a parent where their child's records actually live, so it must be confirmed in the Supabase dashboard and stated here exactly, before this page goes live.",
        "TODO-CONFIRM: the countries in which Anthropic, Resend, Square and Twilio store and process the information we send them. Each provider is based outside Australia, but the specific countries must be confirmed from each provider's own terms rather than assumed.",
      ],
    },
    {
      heading: "Payments",
      body: [
        // Source: app/api/payments/create/route.ts — the route receives a
        // `sourceId` (a token from Square's Web Payments SDK) and forwards
        // it to Square. Card numbers never reach our server or our DB.
        // Source: supabase/migrations/035_bookings_payments.sql — the
        // `payments` table stores square_payment_id / square_order_id only.
        "Card payments are handled by Square. When you pay, your card details go directly from your browser to Square — they do not pass through our servers, and we do not store your card number.",
        "What we keep is the amount, what it was for, and the reference numbers Square returns so we can match the payment to your booking and issue a refund if one is due.",
      ],
    },
    {
      heading: "How we store and protect it",
      body: [
        // Only claims that can be pointed at. No "bank-level encryption",
        // no certifications, no ISO/SOC. Source: 006_rls_policies.sql and
        // the per-table `ENABLE ROW LEVEL SECURITY` statements; magic-link
        // auth per docs/auth-magic-link-setup.md.
        "Your information is held in our Supabase database. Access is restricted by database-level security rules, so a parent account can only reach that parent's own information, and staff accounts are limited by their role and the centres they work with.",
        "You sign in with a single-use link sent to your email address — there is no password to be guessed or reused.",
        "We do not claim any security certification, and no system is perfectly secure. If you believe your account or your child's information has been compromised, please contact us straight away.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        // The honest answer. Verified: no retention, purge, anonymisation
        // or scheduled-deletion logic exists anywhere in the codebase, and
        // no cron in vercel.json does this.
        "TODO-CONFIRM: our system does not currently delete or anonymise records automatically. In practice this means information about a child is kept until it is removed by hand.",
        "TODO-CONFIRM: how long Build Alpha Kids intends to keep child records, parent records, booking and payment records (noting the separate record-keeping obligations that apply to financial records), enquiry and newsletter records — and what happens to a child's information after they leave a program. These periods must be decided and stated here. We have deliberately not written a retention period we do not actually honour.",
      ],
    },
    {
      heading: "Accessing and correcting your information",
      body: [
        "You can ask us for a copy of the personal information we hold about you or your child, and you can ask us to correct it if it is wrong. These are your rights under APPs 12 and 13.",
        "Some details you can change yourself at any time in your parent account, including your contact details and your marketing and SMS preferences.",
        // Honest: no export or account-deletion feature exists in this repo.
        // (The "Account Deletion / Data Export in PortalSettings" note in the
        // global CLAUDE.md belongs to a DIFFERENT project — SOLVR — and was
        // verified as absent here.)
        "For anything else — a full copy of your child's records, a correction you cannot make yourself, or a request to delete information — please contact us and we will handle it manually. We do not yet have a self-service export or account-deletion button.",
        "TODO-CONFIRM: the timeframe within which Build Alpha Kids will respond to an access or correction request, and whether any fee applies. (The Privacy Act sets expectations here — this should be confirmed with the reviewing lawyer.)",
      ],
    },
    {
      heading: "Cookies",
      body: [
        // Source: verified absent — no gtag/GTM/pixel/PostHog/Hotjar/
        // Mixpanel and no @vercel/analytics in package.json. Cookies are
        // Supabase SSR auth cookies only (@supabase/ssr in middleware.ts).
        "This website does not use advertising or analytics trackers. The cookies we set are the ones needed to sign you in and keep you signed in to your parent account.",
      ],
    },
    {
      heading: "Making a complaint",
      body: [
        "If you think we have mishandled your or your child's personal information, please tell us first — contact details are below — and we will look into it and respond to you.",
        "TODO-CONFIRM: a named privacy contact (a person or role, with an email address) to receive privacy complaints, and the process and timeframe for responding to one. Do not publish this page without it: a complaints process with nobody at the end of it is worse than none.",
        "If you are not satisfied with our response, you can take your complaint to the Office of the Australian Information Commissioner (OAIC), which oversees the Privacy Act. You can reach the OAIC at oaic.gov.au or on 1300 363 992.",
      ],
    },
    {
      heading: "Changes to this policy",
      body: [
        "If we change this policy, we will update the 'Last updated' date at the top of this page and publish the new version here.",
        "If we make a change that materially affects how we handle your or your child's information — for example, sharing it with a new service provider, or sending it somewhere new overseas — we will tell account holders by email rather than relying on you to re-read this page.",
      ],
    },
    {
      heading: "Contact us",
      body: [
        "If you have a question about this policy, or you want to access, correct or complain about the information we hold, please get in touch. Our contact details are in the footer of every page of this site.",
      ],
    },
  ],
};

// ------------------------------------------------------------
// Terms of Use
// ------------------------------------------------------------

export const TERMS_PAGE: LegalPage = {
  eyebrow: "Terms",
  title: "Terms of Use",
  intro:
    "These terms cover using this website, booking a session, and what you and we each agree to. Plain English, no traps.",
  description:
    "The terms that apply when you use the Build Alpha Kids website, book a session, or pay for a program — including cancellations, refunds and liability.",
  sections: [
    {
      heading: "About these terms",
      body: [
        "These terms apply when you use the Build Alpha Kids website, create a parent account, or book and pay for a session. By doing any of those things, you agree to them.",
        "If you do not agree with them, please do not use the site or book with us.",
        "TODO-CONFIRM: the legal entity name and ABN of the business that operates Build Alpha Kids, to be stated here.",
      ],
    },
    {
      heading: "Who this service is for",
      body: [
        "Our programs are for children. The account, the booking and the payment are for the parent or guardian — you book on your child's behalf, and you confirm you are their parent or guardian and are allowed to enrol them.",
        "We also work with childcare centres, schools and other organisations. If you are booking on behalf of an organisation, you confirm you are authorised to do so.",
        // Honest: no age gate is implemented anywhere. Don't claim one.
        "TODO-CONFIRM: whether Build Alpha Kids requires account holders to be 18 or over. The site does not currently verify a user's age, so no age requirement is stated here. If one is intended, it needs to be stated and enforced rather than only written down.",
      ],
    },
    {
      heading: "Your account",
      body: [
        // Source: docs/auth-magic-link-setup.md — magic-link auth, no passwords.
        "You sign in with a single-use link sent to your email address, so there is no password to manage. Please keep access to your email secure — anyone who can read your email can sign in to your account.",
        "Please give us accurate information, and keep your details and your child's details up to date. We rely on what you tell us about your child's health to keep them safe.",
      ],
    },
    {
      heading: "Bookings and payment",
      body: [
        "A booking is confirmed once payment has been made or a session credit has been redeemed. Until then the spot is not held. Places are capped, and popular sessions fill.",
        "Prices are shown in Australian dollars on the session you are booking.",
        // Source: lib/payments/square-config.ts + app/api/payments/create/route.ts
        "Card payments are processed by Square. Your card details go directly to Square and we never see or store your card number.",
        // Owner-confirmed per the brief; consistent with content.ts:72-77.
        "NSW Active Kids vouchers are accepted for both our after-school clinics and our school holiday clinics.",
        "TODO-CONFIRM: how an Active Kids voucher is applied in practice — at the time of booking or as a reimbursement — and what happens to the voucher if a booking is later cancelled. The booking system does not currently record a voucher against a booking, so this process happens outside the software and needs to be described accurately.",
        "TODO-CONFIRM: whether Build Alpha Kids is registered for GST and whether displayed prices include GST. (The application reads this from a BAK_GST_REGISTERED environment variable, so the value is not in our code.)",
      ],
    },
    {
      heading: "Cancellations and refunds",
      body: [
        // This IS sourced, and is the one policy we can state with confidence:
        // lib/bookings/booking-actions.ts:375 — `hoursUntilSession > 24`.
        // It is already stated to parents in lib/bookings/booking-emails.ts:115.
        "If you cancel more than 24 hours before the session starts, you are eligible for a full refund. If you cancel within 24 hours of the session, the booking is not eligible for a refund.",
        // Source: booking-actions.ts:378-398 — package credit restoration is
        // automatic and conditional on the same 24-hour rule.
        "If you booked using a session package, cancelling more than 24 hours before the session returns the session credit to your package balance automatically.",
        // Honest nuance: NO Square refund API call exists in the codebase.
        // docs/square-cutover.md confirms refunds are issued by hand from the
        // Square seller dashboard. So we must not imply an automatic refund.
        "Card refunds are processed by us through Square and are returned to the card you paid with. Refunds are not automatic — cancelling releases your spot and records your refund eligibility, and we then action the refund.",
        "TODO-CONFIRM: how long a refund takes to reach a parent. Our cancellation email currently tells parents to allow 5–10 business days. Because refunds are actioned by hand rather than by the system, confirm that this is a timeframe the business can actually meet, and correct either this page or that email so the two agree.",
        "If we have to cancel a session — for weather, a coach being unavailable, or anything else — we will let you know and you will be offered a refund.",
        "TODO-CONFIRM: what happens when a session is cancelled by Build Alpha Kids rather than by the parent — refund, credit, or transfer to another session — and whether wet-weather cancellations are treated differently. The system records a cancellation but does not encode this policy.",
      ],
    },
    {
      heading: "Your child at our sessions",
      body: [
        "Please tell us about any medical condition, allergy or requirement that affects your child's participation, and keep it current. We share it with the coaches running your child's session so they can look after them.",
        "We ask that children and parents treat coaches, other children and the venue with respect. We may ask a child to sit out, or remove them from a program, if their behaviour puts themselves or others at risk.",
        "TODO-CONFIRM: Build Alpha Kids' policy on drop-off and pick-up, supervision before and after a session, what happens if a child is not collected, and the behaviour and exclusion policy — including whether a refund applies if a child is removed from a program.",
      ],
    },
    {
      heading: "Photos and media",
      body: [
        "Our coaches may take photos during sessions. How we store them and who can see them is set out in our Privacy Policy.",
        "TODO-CONFIRM: whether Build Alpha Kids uses photos of children in marketing, and if so how consent is obtained and withdrawn. No photo or media consent is recorded in the booking system today, so this page does not claim any consent has been given.",
      ],
    },
    {
      heading: "Using this website",
      body: [
        "Please use the site for its intended purpose: finding out about our programs, enquiring, and booking sessions.",
        "Please do not try to access accounts or information that are not yours, interfere with the site or its security, scrape it automatically, or use it to send anything unlawful, misleading or abusive.",
        "We may suspend or close an account that is being used this way.",
      ],
    },
    {
      heading: "Our content",
      body: [
        "The content on this site — our text, images, logo and branding — belongs to us or our licensors. You are welcome to read and share it, but please do not copy it for your own commercial use without asking us first.",
      ],
    },
    {
      heading: "Liability",
      body: [
        // Deliberately does not attempt to exclude what cannot be excluded.
        // No insurance claim is made — nothing in the repo evidences cover.
        "Nothing in these terms excludes, restricts or modifies your rights under the Australian Consumer Law. Our services come with guarantees that cannot be excluded, and if we fail to meet them you have remedies under that law.",
        "Beyond those rights, we provide this website as it is. We work to keep the information on it accurate and the site available, but we do not guarantee it will be uninterrupted or error-free.",
        "Sport involves physical activity and a risk of injury. We take safety seriously and our coaches are trained for it, but we cannot guarantee that no one will ever be hurt.",
        "TODO-CONFIRM: Build Alpha Kids' insurance position (public liability and any personal accident cover), and what limitation of liability — if any — should apply here. This section makes no claim about insurance because none could be established from our records. This is a section for the reviewing lawyer to write.",
      ],
    },
    {
      heading: "Changes to these terms",
      body: [
        "We may update these terms. The current version is always on this page, with the 'Last updated' date at the top. The terms that apply to a booking are the ones published when you made it.",
      ],
    },
    {
      heading: "Governing law",
      body: [
        "These terms are governed by the laws of New South Wales, Australia. Any dispute will be dealt with by the courts of New South Wales.",
      ],
    },
    {
      heading: "Contact us",
      body: [
        "If you have a question about these terms, or about a booking, please get in touch. Our contact details are in the footer of every page of this site.",
      ],
    },
  ],
};

/**
 * Both legal pages, for tests and any surface that needs to iterate
 * them (the meta-description guard in content.test.ts uses this).
 */
export const LEGAL_PAGES: [name: string, page: LegalPage][] = [
  ["privacy", PRIVACY_PAGE],
  ["terms", TERMS_PAGE],
];
