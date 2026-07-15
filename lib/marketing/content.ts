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

/** Shown as a badge on holiday clinic cards and the booking CTA. */
export const ACTIVE_KIDS_BLURB = "NSW Active Kids vouchers accepted";

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

export interface Program {
  /** URL segment under /programs/[slug] (holiday-programs also links to /holiday-clinics). */
  slug: string;
  /** Page + card title. */
  title: string;
  /** One-line hook under the title. */
  tagline: string;
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
      "Working With Children Check on every coach",
      "First-aid certified coaches at every session",
      "Curriculum-friendly session plans that fit your centre's day",
      "All equipment supplied — no extra admin for your educators",
    ],
    heroImage: "/images/marketing/childcare-hero.jpg",
  },
  {
    slug: "primary-school",
    title: "Primary School Programs",
    tagline: "Where lifelong athletes get their start.",
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
      "Working With Children Check on every coach",
      "First-aid certified coaches at every session",
      "Curriculum-friendly structure your teachers can plan around",
      "Coaches bring the gear and the session plan",
    ],
    heroImage: "/images/marketing/primary-school-hero.jpg",
  },
  {
    slug: "high-school",
    title: "High School Programs",
    tagline: "Train harder. Play smarter. Level up.",
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
      "Working With Children Check on every coach",
      "First-aid certified coaches at every session",
      "Curriculum-friendly structure your sport coordinator can plan around",
      "Coaches bring the gear and the session plan",
    ],
    heroImage: "/images/marketing/high-school-hero.jpg",
  },
  {
    slug: "after-school",
    title: "After School Clinics",
    tagline: "The best hour of their school day — after it ends.",
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
      "Working With Children Check on every coach",
      "First-aid certified coaches at every session",
      "Capped numbers — every kid gets coached, not supervised",
      ACTIVE_KIDS_BLURB,
    ],
    heroImage: "/images/marketing/after-school-hero.jpg",
  },
  {
    slug: "holiday-programs",
    title: "Holiday Programs",
    tagline: "School's out. Game on.",
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
      "Working With Children Check on every coach",
      "First-aid certified coaches at every session",
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
  /** Parent-facing CTA — holiday programs only. */
  clinicsCta: "See clinic dates",
  sessionShapeTitle: "What a session actually looks like",
  outcomesTitle: "What kids walk away with",
  overviewTitle: "Inside the program",
  trustEyebrow: "Every coach, every session",
  trustTitle: "The bits parents and coordinators ask about first",
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

/** Copy for the /programs index page (also its meta description). */
export const PROGRAMS_INDEX = {
  eyebrow: "Programs",
  title: "A program for every age and stage",
  intro:
    "From first steps on the grass to game-day tactics — five programs that grow with your kids, run by the same coaches across South-West Sydney childcare centres, schools and holiday clinics.",
  description:
    "Multi-sport programs from Build Alpha Kids — childcare, primary school, high school, after school clinics and school holiday programs across South-West Sydney.",
} as const;
