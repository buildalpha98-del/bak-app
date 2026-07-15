// ============================================================
// Marketing site content — shared/reused copy and constants
// ============================================================
//
// Shared/reused copy and constants live here (site identity,
// program copy, brand asset paths) so marketing surfaces import
// from one place. Section-specific copy may live with its
// component; anything used twice belongs here.
//
// Copy conventions: brand name is always "Build Alpha Kids"
// (never abbreviated in user-facing copy), Australian English,
// tone bold and energetic.

// ------------------------------------------------------------
// Site identity + contact
// ------------------------------------------------------------

export interface SiteInfo {
  /** Full brand name — never abbreviate in user-facing copy. */
  name: string;
  /** One-line positioning used in nav/footer/meta defaults. */
  tagline: string;
  /** Canonical production origin (no trailing slash). */
  url: string;
  /**
   * Public phone number.
   * TODO-CONFIRM: not present anywhere in the repo (invoices read
   * business_phone from DB settings). Replace before launch.
   */
  phone: string;
  /** Public contact email (matches email templates + invoicing fallback). */
  email: string;
  /**
   * ABN. TODO-CONFIRM: only available at runtime via the BAK_ABN
   * env var (lib/launch/invoice-actions.ts) — the value itself is
   * not in the repo. Replace before launch.
   */
  abn: string;
  /** Social profile URLs. TODO-CONFIRM handles before launch. */
  socials: {
    instagram: string;
    facebook: string;
  };
  /** Where "Book now" CTAs send parents (holiday clinic booking flow). */
  bookingUrl: string;
  /** Where general CTAs send prospective centres/schools/parents. */
  enquiryUrl: string;
  /** Service area blurb used in footer + LocalBusiness JSON-LD. */
  serviceArea: string;
}

export const SITE: SiteInfo = {
  name: "Build Alpha Kids",
  tagline: "Multi-sport coaching for kids across South-West Sydney",
  url: "https://buildalphakids.com.au",
  phone: "TODO-CONFIRM 0400 000 000",
  email: "info@buildalphakids.com.au",
  abn: "TODO-CONFIRM XX XXX XXX XXX",
  socials: {
    instagram: "TODO-CONFIRM https://instagram.com/buildalphakids",
    facebook: "TODO-CONFIRM https://facebook.com/buildalphakids",
  },
  bookingUrl: "/parent/book",
  enquiryUrl: "/enquire",
  serviceArea: "South-West Sydney",
};

/**
 * Shown as a badge on holiday clinic cards and the booking CTA, and
 * as a trust point on the after-school and holiday program pages.
 *
 * Source: vouchers apply to BOTH after-school clinics and holiday
 * clinics — owner-confirmed by Jayden 2026-07-15. (Only the holiday
 * connection appears in the older site copy, so this is recorded here
 * rather than re-litigated as an unsourced claim.)
 */
export const ACTIVE_KIDS_BLURB = "NSW Active Kids vouchers accepted";

/**
 * Trust claims made on more than one surface — the program pages'
 * trust strips (Program.trustPoints) and the /about coach-standards
 * cards (COACH_STANDARDS) make these promises in the same words, so
 * the words live once. Same reasoning as ACTIVE_KIDS_BLURB above: a
 * claim repeated across surfaces must move as one, not drift.
 *
 * SCOPE: `wwcc` and `firstAid` are the ONLY credential claims this
 * site is permitted to make. Do not add another accreditation,
 * qualification or award here — nothing else is sourceable. `gearAndPlan`
 * is operational, not a credential.
 */
export const TRUST_POINTS = {
  wwcc: "Working With Children Check on every coach",
  firstAid: "First-aid certified coaches at every session",
  gearAndPlan: "Coaches bring the gear and the session plan",
} as const;

// ------------------------------------------------------------
// Brand assets + palette
// ------------------------------------------------------------

/**
 * Real brand artwork (public/images/brand/). The crest logo is the
 * badge with fanned sports balls; the ball rows are the illustrated
 * t-shirt strips (alt = mirrored variant) used as section motifs.
 */
export const BRAND = {
  /** Crest logo, raster — use with next/image (1604×1060). */
  logo: "/images/brand/logo.png",
  /** Illustrated ball row strip (viewBox 298×96, ~3.1:1). */
  ballsRow: "/images/brand/balls-row.svg",
  /** Mirrored ball row variant. */
  ballsRowAlt: "/images/brand/balls-row-alt.svg",
} as const;

/**
 * Canonical ball palette from the brand artwork — the ONLY place
 * these hexes are declared. `fg` is the AA-verified text colour
 * when the ball colour is used as a chip/badge FILL: black passes
 * on green 8.5:1 / yellow 13.1:1 / orange 6.1:1; red and blue need
 * white (4.7:1 / 5.2:1). As small dots the colours are decorative
 * and always carry a black outline.
 */
export interface BallColor {
  /** Fill colour. */
  color: string;
  /** AA-verified foreground for text set ON the colour. */
  fg: "#111111" | "#FFFFFF";
}

export const BALL_COLORS = {
  green: { color: "#7BC043", fg: "#111111" },
  orange: { color: "#E8712A", fg: "#111111" },
  red: { color: "#D8342C", fg: "#FFFFFF" },
  yellow: { color: "#FFD23F", fg: "#111111" },
  blue: { color: "#2D6FB5", fg: "#FFFFFF" },
  black: { color: "#111111", fg: "#FFFFFF" },
} as const satisfies Record<string, BallColor>;

/** The six sports we coach, in display order, keyed to their ball colour. */
export interface Sport {
  name: string;
  ball: BallColor;
}

export const SPORTS: Sport[] = [
  { name: "Soccer", ball: BALL_COLORS.green },
  { name: "Basketball", ball: BALL_COLORS.orange },
  { name: "Cricket", ball: BALL_COLORS.red },
  { name: "Tennis", ball: BALL_COLORS.yellow },
  { name: "Volleyball", ball: BALL_COLORS.blue },
  { name: "Rugby", ball: BALL_COLORS.black },
];

/** Homepage-specific copy shared between components and metadata. */
export const HOMEPAGE = {
  /** Hero sub copy — also the homepage meta description. */
  heroSub:
    "Multi-sport coaching across South-West Sydney childcare centres, schools and holiday clinics. Book online in 60 seconds — then watch them grow all term.",
} as const;

// ------------------------------------------------------------
// Programs
// ------------------------------------------------------------
//
// Framework language — get this right, the two are not interchangeable:
//
//  - Childcare copy says EYLF (the Early Years Learning Framework,
//    which is what Australian early-childhood settings actually run).
//    NEVER "curriculum" on a childcare surface — that is school
//    language. Build Alpha Kids' childcare session plans are
//    EYLF-aligned: owner-confirmed by Jayden 2026-07-15.
//  - School copy (primary and high) says "curriculum-aligned" /
//    "curriculum-friendly". NEVER EYLF.
//
// Naming a specific framework version, syllabus code or outcome ID is
// still off-limits in both cases.

export interface Program {
  /** URL segment under /programs/[slug] (holiday-programs also links to /holiday-clinics). */
  slug: string;
  /** Page + card title. */
  title: string;
  /** One-line hook under the title. */
  tagline: string;
  /**
   * Purpose-written meta description, ≤160 chars — search engines cut
   * around 155, so this is NOT assembled from tagline + description
   * (which overruns badly). Same no-invented-facts rules as body copy.
   */
  metaDescription: string;
  /** Small uppercase sticker label on the program page hero. */
  eyebrow: string;
  /** Body copy, one string per paragraph. */
  description: string[];
  /** Human-readable age range shown on cards and hero. */
  ages: string;
  /** 3–5 punchy bullets — skills and benefits. */
  highlights: string[];
  /**
   * What a session actually looks like on the ground — one sentence
   * per string, 2–3 of them. Concrete only: who turns up, what they
   * bring, how the hour runs.
   */
  sessionShape: string[];
  /** What kids walk away with — short outcome phrases. */
  outcomes: string[];
  /**
   * Trust strip items. Working With Children Check + first aid on
   * every program (both are tracked per coach in the app and shown
   * to centres); the remaining points are program-specific.
   */
  trustPoints: string[];
  /**
   * Card/page accent from the canonical ball palette — the ages chip
   * fill (with its AA-verified `fg`), hover shadow and page rules.
   */
  accent: BallColor;
  /** Placeholder path — real photography swapped in later, here only. */
  heroImage: string;
}

export const PROGRAMS: Program[] = [
  {
    slug: "childcare",
    title: "Childcare Programs",
    tagline: "Big energy for little athletes.",
    metaDescription:
      "Multi-sport coaching delivered in your childcare centre across South-West Sydney. Qualified coaches, all equipment supplied, no extra admin for educators.",
    eyebrow: "In your centre",
    accent: BALL_COLORS.green,
    description: [
      "Little kids are wired to move — we turn that energy into skills. Build Alpha Kids brings fun, fast-paced multi-sport sessions straight into your childcare centre, building coordination, confidence and a genuine love of active play from the very first session.",
      "Every session is run by qualified coaches in a safe, nurturing environment, with games designed for growing bodies and short attention spans. Kids learn to run, jump, throw, kick and catch — and they're laughing the whole way through. Centres across South-West Sydney trust Build Alpha Kids every week — and we'd love yours to be next.",
    ],
    ages: "Ages 2–5 (preschool and kindy-ready)",
    highlights: [
      "Fundamental movement skills — running, jumping, throwing, catching",
      "Social skills and confidence through team games",
      "Sessions built for short attention spans and big imaginations",
      "Safe, nurturing coaching from qualified, kid-first coaches",
      "Delivered in-centre — zero extra admin for your team",
    ],
    sessionShape: [
      "Coaches arrive at your centre with every bit of equipment and set up before the kids come out — your educators don't lift a thing.",
      "The session runs as games: a warm-up chase, skill stations for kicking, throwing, catching and balancing, then a whole-group game to finish.",
      "Rotations are short and everything is scaled for two- to five-year-olds, so every child is in the game the whole way through.",
    ],
    outcomes: [
      "Coordination, balance and body control",
      "Confidence to join in a group game",
      "Turn-taking and playing alongside other kids",
      "A genuine love of active play",
    ],
    trustPoints: [
      TRUST_POINTS.wwcc,
      TRUST_POINTS.firstAid,
      "EYLF-aligned session plans that fit your centre's day",
      "All equipment supplied — no extra admin for your educators",
    ],
    heroImage: "/images/marketing/childcare-hero.jpg",
  },
  {
    slug: "primary-school",
    title: "Primary School Programs",
    tagline: "Where lifelong athletes get their start.",
    metaDescription:
      "Multi-sport primary school programs across South-West Sydney. Curriculum-friendly sessions run on your grounds, scaled so every student gets involved.",
    eyebrow: "On your grounds",
    accent: BALL_COLORS.blue,
    description: [
      "Primary school is where kids decide whether sport is for them. Build Alpha Kids makes the answer a loud yes — dynamic multi-sport programs that sharpen physical skills, build real teamwork and get every kid in the class moving, not just the sporty ones.",
      "Our coaches deliver structured, curriculum-friendly sessions across footy, soccer, basketball, athletics and more, laying the foundation for lifelong fitness and personal growth. Schools across South-West Sydney trust us to run sport their teachers rave about and their students count down to.",
    ],
    ages: "Kindergarten to Year 6 (ages 5–12)",
    highlights: [
      "Multi-sport skill development — not just one code",
      "Teamwork, sportsmanship and leadership baked into every game",
      "Every kid involved — sessions scaled to all abilities",
      "Curriculum-friendly structure that schools love",
      "Foundations for lifelong fitness and personal growth",
    ],
    sessionShape: [
      "Coaches turn up to your grounds with the gear and the session plan, and run sessions during sport time or straight after the bell.",
      "Each session moves from skill drills into fast games across footy, soccer, basketball, athletics and more, progressing week on week.",
      "Games are scaled to all abilities, so every student is involved — not just the sporty ones.",
    ],
    outcomes: [
      "Skills that transfer across codes",
      "Teamwork and sportsmanship",
      "The confidence to have a go",
      "Habits for lifelong fitness",
    ],
    trustPoints: [
      TRUST_POINTS.wwcc,
      TRUST_POINTS.firstAid,
      "Curriculum-friendly structure your teachers can plan around",
      TRUST_POINTS.gearAndPlan,
    ],
    heroImage: "/images/marketing/primary-school-hero.jpg",
  },
  {
    slug: "high-school",
    title: "High School Programs",
    tagline: "Train harder. Play smarter. Level up.",
    metaDescription:
      "High school sport programs across South-West Sydney. Conditioning, tactics and game sense run on your grounds by qualified coaches, for Years 7 to 12.",
    eyebrow: "On your grounds",
    accent: BALL_COLORS.red,
    description: [
      "High schoolers don't want babysitting — they want to be challenged. Build Alpha Kids runs advanced sports programs that push students harder, sharpen athletic skills and get them match-ready for competitive sport.",
      "From strength and conditioning fundamentals to game-day tactics and team culture, our coaches treat students like athletes. The result: fitter, more confident young people with habits that outlast the school bell — and school sport programs that actually go somewhere.",
    ],
    ages: "Years 7–12 (ages 12–18)",
    highlights: [
      "Advanced skill and athletic development",
      "Competition preparation — tactics, pressure, game sense",
      "Strength, conditioning and injury-smart training habits",
      "Teamwork and leadership under real pressure",
      "Pathways towards competitive sport and lifelong fitness",
    ],
    sessionShape: [
      "Coaches treat students like athletes: a proper warm-up, conditioning work, then skill and tactical blocks that build into game play.",
      "Sessions cover strength and conditioning fundamentals, game-day tactics and team culture, with the intensity lifted to match the age group.",
      "Delivered on your grounds during sport time or after the bell, with all equipment brought in.",
    ],
    outcomes: [
      "Game sense under real pressure",
      "Injury-smart training habits",
      "Fitness that outlasts the school bell",
      "A pathway towards competitive sport",
    ],
    trustPoints: [
      TRUST_POINTS.wwcc,
      TRUST_POINTS.firstAid,
      "Curriculum-friendly structure your sport coordinator can plan around",
      TRUST_POINTS.gearAndPlan,
    ],
    heroImage: "/images/marketing/high-school-hero.jpg",
  },
  {
    slug: "after-school",
    title: "After School Clinics",
    tagline: "The best hour of their school day — after it ends.",
    metaDescription:
      "After school multi-sport clinics across South-West Sydney. Capped numbers, qualified coaches and real skill progression. NSW Active Kids vouchers accepted.",
    eyebrow: "After the bell",
    accent: BALL_COLORS.yellow,
    description: [
      "The bell rings and the fun starts. Build Alpha Kids after school clinics are exciting, structured sessions that turn the after-school slump into the highlight of the week — kids build physical skills, sharpen teamwork and burn energy in a fun, supportive environment.",
      "Each clinic mixes skill drills with fast-paced games, so kids improve every week without ever feeling like they're training. Parents get a kid who's active, confident and happily worn out; schools and centres get a program that runs itself.",
    ],
    ages: "Primary-aged kids (ages 5–12)",
    highlights: [
      "Structured weekly sessions with real skill progression",
      "Fast, fun games — kids improve without noticing the work",
      "Teamwork and confidence in a supportive environment",
      "Runs on-site straight after the bell — easy for parents",
      "Qualified coaches, every session",
    ],
    sessionShape: [
      "Coaches are set up on site before the bell goes, so kids walk straight from the classroom into the session.",
      "Each clinic mixes skill drills with fast-paced games — kids improve every week without ever feeling like they're training.",
      "Numbers are capped, so every kid gets coached rather than supervised, and parents collect a kid who's active, confident and happily worn out.",
    ],
    outcomes: [
      "Skills that visibly sharpen each week",
      "Energy burnt off before dinner",
      "A kid who's active, confident and happily worn out",
      "A weekly session kids count down to",
    ],
    trustPoints: [
      TRUST_POINTS.wwcc,
      TRUST_POINTS.firstAid,
      "Capped numbers — every kid gets coached, not supervised",
      ACTIVE_KIDS_BLURB,
    ],
    heroImage: "/images/marketing/after-school-hero.jpg",
  },
  {
    slug: "holiday-programs",
    title: "Holiday Programs",
    tagline: "School's out. Game on.",
    metaDescription:
      "School holiday multi-sport clinics across South-West Sydney. Book and pay online in about 60 seconds. Capped numbers, NSW Active Kids vouchers accepted.",
    eyebrow: "School holidays",
    accent: BALL_COLORS.orange,
    description: [
      "Forget screen-time marathons — our holiday clinics are full-throttle multi-sport days packed with games, challenges and new mates. Kids rotate through footy, soccer, basketball, athletics and more, coached by the same crew they love during term.",
      "Booking is easy: pick a day, book and pay online in about 60 seconds, and you're done. NSW Active Kids vouchers accepted. Spots are capped so every kid gets coached, not just supervised — and the best days sell out fast.",
    ],
    ages: "Primary-aged kids (ages 5–12)",
    highlights: [
      "Multi-sport days — footy, soccer, basketball, athletics and more",
      "Book and pay online in about 60 seconds",
      ACTIVE_KIDS_BLURB,
      "Capped numbers — every kid gets coached, not supervised",
      "Run by the qualified coaches kids already know",
    ],
    sessionShape: [
      "Full-throttle multi-sport days in the school holidays — kids rotate through footy, soccer, basketball, athletics and more, with games and challenges between.",
      "The crew running the day is the same crew kids know from term-time sessions.",
      "Pick a day, book and pay online in about 60 seconds; numbers are capped, so every kid gets coached rather than supervised.",
    ],
    outcomes: [
      "A full day of sport instead of a screen-time marathon",
      "A rotation through footy, soccer, basketball and more",
      "New mates, not just new skills",
      "Coaching from people they already know",
    ],
    trustPoints: [
      TRUST_POINTS.wwcc,
      TRUST_POINTS.firstAid,
      "Capped numbers — every kid gets coached, not supervised",
      ACTIVE_KIDS_BLURB,
    ],
    heroImage: "/images/marketing/holiday-programs-hero.jpg",
  },
];

/** Lookup by URL segment — `undefined` drives the [slug] page's notFound(). */
export function getProgram(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

/**
 * Cross-link targets for a program page: the programs either side of
 * it in PROGRAMS (which is ordered youngest → oldest, then the two
 * clinic formats). Holiday programs are excluded because every
 * program page links to /holiday-clinics separately. An unknown slug
 * yields no neighbours.
 */
export function adjacentPrograms(slug: string): Program[] {
  const i = PROGRAMS.findIndex((p) => p.slug === slug);
  if (i === -1) return [];
  return [PROGRAMS[i - 1], PROGRAMS[i + 1]].filter(
    (p): p is Program => Boolean(p) && p.slug !== "holiday-programs"
  );
}

/**
 * Copy shared by /programs and every /programs/[slug] page. Section
 * headings and CTA labels live here rather than in the components so
 * a copy change is a one-file change.
 */
export const PROGRAM_PAGE = {
  /** The repeated primary CTA — top, middle and bottom of each page. */
  quoteCta: "Request a quote",
  /**
   * The one parent-facing clinics CTA string. Used by the holiday
   * program hero AND by the shared clinics section on both the
   * homepage and the holiday program page — all three point at
   * /holiday-clinics, so they say the same thing.
   */
  clinicsCta: "See all clinic dates",
  /** Cross-link label for /holiday-clinics on every program page. */
  clinicsLinkLabel: "School holiday clinics",
  sessionShapeEyebrow: "On the ground",
  sessionShapeTitle: "What a session actually looks like",
  outcomesEyebrow: "The payoff",
  outcomesTitle: "What kids walk away with",
  overviewTitle: "Inside the program",
  trustEyebrow: "Every coach, every session",
  trustTitle: "The bits parents and coordinators ask about first",
  crossLinkEyebrow: "More",
  crossLinkTitle: "Keep exploring",
  quoteEyebrow: "Schools & centres",
  quoteTitle: "Want this running at your place?",
  quoteBody:
    "Tell us your site, your ages and the timeslot you have in mind — we'll come back with a quote.",
  clinicsSectionEyebrow: "Book direct",
  clinicsSectionTitle: "The next clinic dates",
  clinicsSectionIntro:
    "Book and pay online in about 60 seconds. Spots are capped and the best days sell out fast.",
} as const;

/**
 * Copy for the homepage's live clinics section. Lives here beside the
 * program page's equivalents because both feed the same shared
 * <HolidayClinicsSection /> component.
 */
export const HOMEPAGE_CLINICS = {
  eyebrow: "Book direct",
  title: "School holiday clinics",
  intro:
    "The next dates on the calendar — book and pay online in about 60 seconds. Spots are capped and the best days sell out fast.",
} as const;

/** Copy for the /programs index page (also its meta description). */
export const PROGRAMS_INDEX = {
  eyebrow: "Programs",
  title: "A program for every age and stage",
  intro:
    "From first steps on the grass to game-day tactics — five programs that grow with your kids, run by the same coaches across South-West Sydney childcare centres, schools and holiday clinics.",
  description:
    "Multi-sport programs from Build Alpha Kids — childcare, primary school, high school, after school clinics and school holiday programs across South-West Sydney.",
} as const;

// ------------------------------------------------------------
// About
// ------------------------------------------------------------
//
// Sourcing note (read before editing): every claim below is a
// restatement of copy that already exists in this module or in
// components/marketing/what-we-do.tsx — the sports roster, the three
// delivery settings, the age span, capped numbers, coaches bringing
// the gear, and the two credentials. Nothing here asserts a founding
// year, a founder, a headcount, a client name, an award, or any
// accreditation beyond the Working With Children Check and first
// aid, because none of those are sourceable from the repo. Do not
// add one without an owner-confirmed source recorded in this file.

/** One coach-standards card on /about. */
export interface CoachStandard {
  title: string;
  body: string;
  /** Card accent from the canonical ball palette. */
  ball: BallColor;
}

export const ABOUT_PAGE = {
  eyebrow: "About us",
  /** The brand's existing line, carried over from the old site. */
  title: "Growing stronger, together",
  intro:
    "Build Alpha Kids is a multi-sport coaching crew for kids across South-West Sydney — in childcare centres, on school grounds and at holiday clinics. Same coaches, same energy, wherever kids already are.",
  /** Meta description (≤160 chars). */
  description:
    "Build Alpha Kids brings multi-sport coaching to childcare centres, schools and holiday clinics across South-West Sydney. Meet the crew and our standards.",

  storyEyebrow: "Our story",
  storyTitle: "We go to where the kids are",
  story: [
    "Kids are wired to move. Build Alpha Kids exists to turn that energy into skills — and to make sure the kid who would never put their hand up for a rep team gets coached just as hard as the one who would.",
    "So we go to where kids already are. Our coaches turn up at childcare centres with every bit of equipment and build sessions into the day. They run curriculum-friendly sessions on school grounds during sport time or straight after the bell. And in the school holidays they run full-throttle multi-sport days that parents book online in about 60 seconds.",
    "Nothing we run is a one-code academy — kids rotate through the lot. From two-year-olds learning to kick and catch through to Year 12 students working on conditioning and game sense, the thread never changes: real coaching, scaled so every kid is in the game.",
  ],

  beliefsTitle: "What we back",
  beliefs: [
    "Every kid gets coached, not supervised",
    "Play first — kids learn most when they're laughing",
    "Sport should meet kids where they already are",
    "Six sports beats specialising early",
    "Habits that outlast the school bell",
  ],

  /**
   * The eyebrow is PROGRAM_PAGE.trustEyebrow — the standards section
   * makes the same promise the program pages' trust strip does, so it
   * carries the same label rather than a second copy of the string.
   */
  standardsTitle: "The standards behind every session",
  standardsIntro:
    "The bits parents, educators and sport coordinators ask about first — and the answers we hold every coach to.",
} as const;

export const COACH_STANDARDS: CoachStandard[] = [
  {
    title: TRUST_POINTS.wwcc,
    body: "Every coach who runs a Build Alpha Kids session holds a current Working With Children Check. We track it per coach, and centres and schools can see it.",
    ball: BALL_COLORS.green,
  },
  {
    title: TRUST_POINTS.firstAid,
    body: "First aid is a condition of coaching with us, not a nice-to-have. It is tracked the same way the Working With Children Check is, for every coach on every session.",
    ball: BALL_COLORS.blue,
  },
  {
    title: TRUST_POINTS.gearAndPlan,
    body: "Our coaches arrive set up, with every bit of equipment and a plan for the hour. Childcare session plans are EYLF-aligned; school sessions are curriculum-friendly. Either way, your team lifts nothing.",
    ball: BALL_COLORS.yellow,
  },
  {
    title: "The same crew, term and holidays",
    body: "The coaches running our holiday clinics are the same crew kids know from term-time sessions — so kids walk in already knowing who is coaching them.",
    ball: BALL_COLORS.red,
  },
];

// ------------------------------------------------------------
// Contact
// ------------------------------------------------------------

/** One "which door do you need?" route card on /contact. */
export interface ContactRoute {
  title: string;
  body: string;
  href: string;
  cta: string;
  ball: BallColor;
}

export const CONTACT_PAGE = {
  eyebrow: "Contact",
  title: "Get in touch",
  intro:
    "Booking a clinic, chasing a quote for your centre or school, or just after a chat about what we run — here's how to reach us.",
  /** Meta description (≤160 chars). */
  description:
    "Get in touch with Build Alpha Kids — phone, email and where we coach across South-West Sydney. Book a clinic or request a quote for your centre.",

  detailsEyebrow: "The details",
  detailsTitle: "How to reach us",
  phoneLabel: "Call us",
  emailLabel: "Email us",
  areaLabel: "Where we coach",
  /** Renders under SITE.serviceArea on the service-area card. */
  areaNote:
    "Childcare centres, schools and holiday clinic venues right across the region.",

  routesEyebrow: "Fastest route",
  routesTitle: "Which door do you need?",
  routesIntro:
    "Two paths, depending on why you're here — both land straight with the people who can help.",
} as const;

export const CONTACT_ROUTES: ContactRoute[] = [
  {
    title: "I'm a parent",
    body: "Holiday clinic dates go up as soon as they're locked in. Pick a day, book and pay online in about 60 seconds — NSW Active Kids vouchers accepted, and numbers are capped.",
    href: "/holiday-clinics",
    cta: PROGRAM_PAGE.clinicsCta,
    ball: BALL_COLORS.yellow,
  },
  {
    title: "I'm a school or centre",
    body: "Tell us your site, your ages and the timeslot you have in mind. We'll come back with a quote for multi-sport coaching run on your grounds by our coaches, with all equipment supplied.",
    href: SITE.enquiryUrl,
    cta: PROGRAM_PAGE.quoteCta,
    ball: BALL_COLORS.blue,
  },
];

// ------------------------------------------------------------
// Enquiry funnel (/enquire + the /contact form)
// ------------------------------------------------------------
//
// Sourcing note (read before editing): the only response-time promise
// anywhere on this site is "within one business day" — it is the
// spec'd wording and the ONLY one allowed. Do not add an hours figure,
// a "we usually reply in X" line, or a same-day claim. The trust
// points below are the Working With Children Check and first aid (both
// tracked per coach in the app), the coaches-bring-the-gear point and
// the framework line — every one of them a restatement of copy already
// in this module. No counts, no years, no named schools or centres.

/** One "what happens next" step on /enquire. */
export interface EnquireStep {
  title: string;
  body: string;
  /** Card accent from the canonical ball palette. */
  ball: BallColor;
}

export const ENQUIRE_PAGE = {
  eyebrow: "Schools & centres",
  title: "Request a quote",
  intro:
    "Tell us your site, your ages and the timeslot you have in mind — we'll come back with a quote for multi-sport coaching run on your grounds by our coaches, with all equipment supplied.",
  /** Meta description (≤160 chars). */
  description:
    "Request a quote for Build Alpha Kids multi-sport coaching at your childcare centre or school across South-West Sydney. All equipment supplied.",

  formEyebrow: "Your details",
  formTitle: "Tell us about your place",
  formIntro:
    "The more you can tell us, the sharper the quote. Only the name of your school or centre and an email address are required.",

  nextEyebrow: "What happens next",
  nextTitle: "How this goes from here",
  nextIntro:
    "No call centre and no drip campaign — a real reply from the people who run the coaching.",

  trustEyebrow: "Every coach, every session",
  trustTitle: "What you're getting either way",
} as const;

export const ENQUIRE_STEPS: EnquireStep[] = [
  {
    title: "It lands with our team",
    body: "Your enquiry goes straight to the crew who run the coaching — nobody in between, no queue.",
    ball: BALL_COLORS.green,
  },
  {
    title: "We get back to you",
    body: "We'll be in touch within one business day to talk through your site, your ages and the timeslot you have in mind.",
    ball: BALL_COLORS.blue,
  },
  {
    title: "You get a quote",
    body: "A quote for multi-sport coaching run on your grounds by our coaches, with every bit of equipment supplied.",
    ball: BALL_COLORS.yellow,
  },
];

/** Trust strip on /enquire — all four already asserted elsewhere in this module. */
export const ENQUIRE_TRUST_POINTS: string[] = [
  TRUST_POINTS.wwcc,
  TRUST_POINTS.firstAid,
  TRUST_POINTS.gearAndPlan,
  "EYLF-aligned in centres, curriculum-aligned in schools",
];

/**
 * The org-type choices. `value` is the wire value the enquiry route
 * expects (`school` | `childcare_centre` | anything else → "other",
 * which the route stores as a null `leads.type` plus a note).
 */
export interface OrgTypeOption {
  value: "school" | "childcare_centre" | "other";
  label: string;
}

export const ORG_TYPES: OrgTypeOption[] = [
  { value: "school", label: "School" },
  { value: "childcare_centre", label: "Childcare centre" },
  { value: "other", label: "Something else" },
];

/**
 * Every user-visible string in <EnquiryForm />. `errors` is keyed by
 * the field/code pairs returned by validateEnquiryForm() in
 * lib/marketing/enquiry.ts — that module returns codes, not prose, so
 * the copy stays here and stays testable there.
 */
export const ENQUIRE_FORM = {
  requiredNote: "Required",
  orgNameLabel: "School or centre name",
  contactNameLabel: "Your name",
  emailLabel: "Email address",
  phoneLabel: "Phone",
  suburbLabel: "Suburb",
  orgTypeLabel: "What kind of place is this?",
  programsLabel: "Which programs are you interested in?",
  programsHint: "Pick as many as you like.",
  messageLabel: "Anything else we should know?",
  messageHint:
    "Your ages, the timeslot you have in mind, how many kids — whatever you've got.",
  /** Honeypot field label — off-screen, only bots and nobody else read it. */
  honeypotLabel: "Website",
  submitLabel: "Request a quote",
  submittingLabel: "Sending…",

  errors: {
    orgNameRequired: "Please tell us the name of your school or centre.",
    emailRequired: "Please add an email address so we can reply.",
    emailInvalid: "That email address doesn't look right — please check it.",
    orgTypeRequired: "Please pick the option that fits best.",
    /** Heading above the server's own 4xx message. */
    serverTitle: "We couldn't send that",
  },

  successTitle: "Got it — thanks!",
  successBody: "We'll be in touch within one business day.",
  successCta: "Have a look at what we run",

  failureTitle: "That didn't send",
  failureBody:
    "Something went wrong at our end and your details didn't reach us. Give it another go — or call us and we'll take it down over the phone.",
  failureRetry: "Try again",
  failurePhonePrefix: "Call us on",
} as const;

/**
 * Every user-visible string in <NewsletterForm /> and the homepage
 * section around it. `errors` is keyed by the codes returned by
 * subscribeToNewsletter() in lib/marketing/newsletter.ts — that action
 * returns codes, not prose, for the same reason the enquiry form does.
 *
 * Copy discipline: this list makes no promise we cannot keep. No
 * frequency ("weekly"), no subscriber count, no unsubscribe claim —
 * there is no unsubscribe flow yet (the status column exists; the
 * front end for it does not), so saying "unsubscribe any time" would
 * be writing a cheque Task 4.4 has not cashed.
 */
export const NEWSLETTER = {
  eyebrow: "Stay in the loop",
  title: "Clinic dates, straight to your inbox",
  intro:
    "Holiday clinic dates and Build Alpha Kids news, sent to your inbox when there's something worth telling you. No spam.",
  emailLabel: "Email address",
  emailPlaceholder: "you@example.com",
  /** Honeypot field label — off-screen, only bots ever read it. */
  honeypotLabel: "Website",
  submitLabel: "Sign me up",
  submittingLabel: "Signing up…",

  errors: {
    emailRequired: "Please add an email address.",
    emailInvalid: "That email address doesn't look right — please check it.",
    rateLimited: "That's a few too many tries. Give it a minute and go again.",
  },

  successTitle: "You're on the list",
  successBody: "Thanks — we'll be in touch.",

  failureTitle: "That didn't send",
  failureBody:
    "Something went wrong at our end and we couldn't add you to the list. Give it another go.",
  failureRetry: "Try again",
} as const;

/**
 * The /contact variant's overrides. Same form, fewer fields: the org
 * type is fixed to "other" there, so the name field has to work for a
 * parent as well as a centre director.
 */
export const CONTACT_FORM = {
  eyebrow: "Send a message",
  title: "Or just send us a message",
  intro:
    "Not sure which door you need? Send it through here and we'll point you the right way.",
  orgNameLabel: "Who are you with?",
  orgNameHint:
    "Your school, centre or club — or just your family name if you're a parent.",
  orgNameRequired: "Please pop a name in so we know who we're replying to.",
  submitLabel: "Send message",
} as const;
