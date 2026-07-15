// ============================================================
// Marketing site content — single source of static copy
// ============================================================
//
// Every piece of static marketing content (site identity, program
// copy, image paths) lives here so later tasks (homepage, nav,
// footer, /programs/[slug], enquiry form) import from one place.
// Swapping a hero photo or fixing a phone number is a one-line
// change in this file — never edit copy inside page components.
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
  /** Body copy, one string per paragraph. */
  description: string[];
  /** Human-readable age range shown on cards and hero. */
  ages: string;
  /** 3–5 punchy bullets — skills and benefits. */
  highlights: string[];
  /** Placeholder path — real photography swapped in later, here only. */
  heroImage: string;
}

export const PROGRAMS: Program[] = [
  {
    slug: "childcare",
    title: "Childcare Programs",
    tagline: "Big energy for little athletes.",
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
    heroImage: "/images/marketing/childcare-hero.jpg",
  },
  {
    slug: "primary-school",
    title: "Primary School Programs",
    tagline: "Where lifelong athletes get their start.",
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
    heroImage: "/images/marketing/primary-school-hero.jpg",
  },
  {
    slug: "high-school",
    title: "High School Programs",
    tagline: "Train harder. Play smarter. Level up.",
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
    heroImage: "/images/marketing/high-school-hero.jpg",
  },
  {
    slug: "after-school",
    title: "After School Clinics",
    tagline: "The best hour of their school day — after it ends.",
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
    heroImage: "/images/marketing/after-school-hero.jpg",
  },
  {
    slug: "holiday-programs",
    title: "Holiday Programs",
    tagline: "School's out. Game on.",
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
    heroImage: "/images/marketing/holiday-programs-hero.jpg",
  },
];
