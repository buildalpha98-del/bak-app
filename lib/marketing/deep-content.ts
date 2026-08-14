// ============================================================
// Deep-content pack — schools detail, /childcare, sport pages
// ============================================================
//
// Source: "Build Alpha Kids — Website Deep-Content & SEO Pack v2.0"
// (owner-supplied, 28 Jul 2026; implemented 14 Aug 2026). Copy here is
// the pack's copy, lightly fitted to components — do not "improve" the
// claims. The pack overrides the older no-framework-codes rule for the
// SCHOOLS assessment section specifically: NESA PDHPE outcome codes
// (PDe–PD3) and Victorian Curriculum HPE (VCHPEM) are owner-approved
// claims. EYLF on childcare stays at "skills your EYLF outcomes care
// about" — the pack itself notes formal EYLF programming documents
// don't exist yet, so do not upgrade that claim.
//
// Pricing rule (site-wide, from the pack): no dollar figures anywhere —
// every cost question routes to "Get a quote".

import { BALL_COLORS, type BallColor } from "./content";

// ------------------------------------------------------------
// Schools page — deep sections (§1 of the pack)
// ------------------------------------------------------------

export interface DeliveryModel {
  title: string;
  body: string;
  ball: BallColor;
}

export const SCHOOLS_DEEP = {
  deliveryEyebrow: "What delivery looks like",
  deliveryTitle: "Four ways schools use us",
  delivery: [
    {
      title: "Weekly PE / Multi-sport",
      body: "Our coaches deliver your PE or sport block every week — a multi-sport rotation matched to each stage, K–6. One sport block per term or rotations within the term, your call. Lessons run 45 minutes to 2 hours, and we can take multiple classes per visit.",
      ball: BALL_COLORS.orange,
    },
    {
      title: "RFF model",
      body: "We take each class while your teachers receive their protected planning time (RFF). Unlike a casual replacement, your students get a structured PDHPE program — and your school receives yearly PDHPE reports, a scope and sequence, and stage-specific assessments. No extra staff to employ, no planning load on anyone.",
      ball: BALL_COLORS.blue,
    },
    {
      title: "Sport blocks & co-curricular",
      body: "Flexible formats for schools that want sport concentrated — a gymnastics block, an athletics unit before carnival season, or specialist blocks like archery (foam-safe equipment) and Oztag.",
      ball: BALL_COLORS.green,
    },
    {
      title: "After-school clinics",
      body: "Parent-paid clinics on your grounds after the bell. Zero cost and zero admin for the school — we handle bookings, payments and parent communication.",
      ball: BALL_COLORS.yellow,
    },
  ] satisfies DeliveryModel[],

  termEyebrow: "What a term looks like",
  termTitle: "A 10-week athletics unit, week by week",
  termWeeks: [
    { weeks: "Weeks 1–2", body: "Baseline skill checks and running mechanics through games." },
    { weeks: "Weeks 3–4", body: "Jumps — landing safely, long jump phases." },
    { weeks: "Weeks 5–6", body: "Throws — technique before power." },
    { weeks: "Weeks 7–8", body: "Relays, pacing and teamwork." },
    { weeks: "Weeks 9–10", body: "Mini-carnival rotation and post-unit assessment." },
  ],
  termArc:
    "Every unit follows this arc: baseline → skill build → application in games → assessment → celebration.",

  stagesEyebrow: "Stage by stage",
  stagesTitle: "What each stage walks away with",
  stages: [
    {
      stage: "Early Stage 1 – Stage 1 (K–Yr 2)",
      body: "Fundamental movement skills — running, jumping, throwing, catching, striking — taught through discovery play. Interpersonal focus: taking turns, sharing, safe play.",
      ball: BALL_COLORS.green,
    },
    {
      stage: "Stage 2 (Yr 3–4)",
      body: "Combining locomotor and object-control skills in modified games; varying force, speed and accuracy; tactics and positional awareness; rotating roles and building fair-play rules together.",
      ball: BALL_COLORS.orange,
    },
    {
      stage: "Stage 3 (Yr 5–6)",
      body: "Adapting skills to the situation — deception, marking, specialised technique; leadership, strategy and creating their own games. Students ready to compete — and to include.",
      ball: BALL_COLORS.blue,
    },
  ],

  assessmentEyebrow: "Assessment & reporting",
  assessmentTitle: "Evidence your PE coordinator can actually use",
  assessmentPoints: [
    "Baseline and post-unit skill checks per stage",
    "A–E grading plus a 1–4 behaviour-and-effort scale",
    "Termly digital coach report to your PE coordinator",
    "Teacher comment banks ready for semester reports",
    "Results supplied in spreadsheet copy",
    "Completion certificates for every student, with an assembly presentation option",
  ],
  assessmentCurriculum:
    "Units map to NESA K–10 PDHPE outcomes (PDe–PD3) in NSW and Victorian Curriculum HPE (VCHPEM) in Victoria, with cross-curricular links (mathematics, English, science) documented in every unit.",

  complianceEyebrow: "Compliance pack",
  complianceTitle: "In your inbox before the first session",
  compliancePoints: [
    "Public liability insurance certificate",
    "Coach WWCC clearances and qualifications",
    "Risk management plan",
    "PDHPE curriculum reports",
    "Assessment results format",
  ],
  complianceNote:
    "Safety is also taught, not just managed — students learn risk assessment, correct equipment use and safe practices inside every unit.",
} as const;

/**
 * The 2027 carnival offer banner (schools page + carnival blog post).
 * Enquiries arrive with the offer pre-selected via /enquire?offer=carnival-2027.
 */
export const CARNIVAL_OFFER = {
  eyebrow: "2027 offer",
  title: "Free Athletics Carnival",
  body: "Book two terms in advance for 2027 and we run your school athletics carnival free: staff, equipment, tabloid events and 3–6 event support included.",
  cta: "Claim the 2027 offer",
  href: "/enquire?offer=carnival-2027",
  /** The programs_of_interest string recorded on the lead. */
  interestValue: "2027 carnival offer",
  /** The label shown on the enquiry form checkbox. */
  interestLabel: "2027 Free Athletics Carnival",
} as const;

// ------------------------------------------------------------
// /childcare — the deep ELC page (§2 of the pack)
// ------------------------------------------------------------

export const CHILDCARE_PAGE = {
  eyebrow: "For childcare & ELCs",
  title: "Sports Programs for Childcare Centres & ELCs",
  intro:
    "Fundamental movement skills for ages 2–5 — play-based sessions that fit your daily routine, delivered in 50+ centres every week by WWCC-cleared coaches.",
  cta: "Get a quote for your centre",
  /** Meta description (≤160 chars). */
  description:
    "Sports programs for childcare centres & ELCs — play-based movement sessions for ages 2–5, delivered in 50+ centres by WWCC-cleared coaches. Get a quote.",

  sections: [
    {
      title: "The golden window",
      body: "Ages 2–5 are when children build the movement foundations everything else stands on — running, jumping, balancing, throwing, catching. Our early-years sessions develop these fundamental movement skills through structured play: no lines, no waiting, no benches. Every child moving, every session.",
      ball: BALL_COLORS.green,
    },
    {
      title: "Built for how centres actually run",
      body: "Sessions are 30–45 minutes and slot into your program without disrupting routines. We bring every piece of equipment, set up indoors or outdoors depending on weather, and your educators stay in ratio while our coach leads. One visit can cover multiple rooms.",
      ball: BALL_COLORS.orange,
    },
    {
      title: "More than movement",
      body: "Sessions build the skills your EYLF outcomes care about — confidence and identity, connecting with others, taking turns, following instructions and persisting with challenges. Coaches model warmth and patience, and celebrate effort over ability.",
      ball: BALL_COLORS.blue,
    },
  ],

  receivesTitle: "What your centre receives",
  receives: [
    "A weekly session plan aligned to your program",
    "Progress notes you can share with families",
    "Photos for your documentation (with consent)",
    "A coach your children know by name, week after week",
  ],

  safetyTitle: "Safety first",
  safety:
    "Every coach WWCC-cleared and first-aid capable, public liability insurance certificate supplied, and age-appropriate soft equipment throughout.",

  faqsEyebrow: "Questions centres ask",
  faqsTitle: "The fine print, upfront",
  faqs: [
    {
      q: "What ages do you cater for?",
      a: "Sessions are designed for ages 2–5, grouped by room. We adjust length and complexity by age — toddler sessions are shorter and simpler than preschool sessions.",
    },
    {
      q: "Do our educators need to do anything?",
      a: "Just stay in ratio and enjoy it. Our coach plans, brings equipment, leads the session and packs up.",
    },
    {
      q: "How much does it cost?",
      a: "Pricing depends on rooms, frequency and location — request a quote and we'll respond within one business day.",
    },
    {
      q: "Can you help our preschoolers get ready for school?",
      a: "Yes — our preschool sessions deliberately build the movement, listening and turn-taking skills that make the transition to school PE easier.",
    },
  ],
} as const;

// ------------------------------------------------------------
// Sport-specific pages (§4 Cluster D) — /programs/[sport]-for-schools
// ------------------------------------------------------------
//
// Templated 300–500-word pages, built in the pack's priority order
// (lowest competition + highest differentiation first). This is
// tranche 1 of the rollout — archery, oztag, gymnastics, tee ball,
// athletics; later tranches append here and nothing else changes.
// Every cost FAQ answers with the quote route, never a figure.

export interface SportPageFaq {
  q: string;
  a: string;
}

export interface SportPage {
  /** URL segment under /programs/ — always "<sport>-for-schools". */
  slug: string;
  sport: string;
  /** H1 per the pack pattern. */
  h1: string;
  /** Title tag (≤60 chars). */
  metaTitle: string;
  /** Meta description (≤160 chars). */
  description: string;
  accent: BallColor;
  /** "What a unit looks like" paragraphs. */
  unit: string[];
  /** One line, stage-relevant curriculum mapping. */
  curriculumLine: string;
  /** Equipment & safety paragraph. */
  equipmentSafety: string;
  faqs: SportPageFaq[];
}

const QUOTE_FAQ: SportPageFaq = {
  q: "How much does it cost?",
  a: "Pricing depends on class sizes, frequency and location — request a quote and we'll respond within one business day.",
};

export const SPORT_PAGES: SportPage[] = [
  {
    slug: "archery-for-schools",
    sport: "Archery",
    h1: "Archery Programs for Schools & Childcare Centres",
    metaTitle: "Archery Programs for Schools | Build Alpha Kids",
    description:
      "Foam-safe archery programs for primary schools — focus, technique and safe practice taught by WWCC-cleared coaches. All equipment supplied. Get a quote.",
    accent: BALL_COLORS.green,
    unit: [
      "Almost no student has drawn a bow before — which is exactly why archery lands so well. A typical unit runs 6–10 weeks: stance and safe handling first, then draw and release technique, aiming games and scoring formats, building to a class target tournament in the final weeks.",
      "Sessions run as stations and rotations so every student shoots every week — no long queues, no watching from the side. Because nobody arrives with years of club experience, the playing field is level: archery is where the least sporty kids routinely surprise everyone, including themselves.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — movement skill refinement, safe participation and self-management — with the same assessment and reporting pack as every Build Alpha Kids unit.",
    equipmentSafety:
      "We bring everything: foam-safe bows and arrows, targets, and marked shooting lines. Range rules are taught as content, not just enforced — students learn whistle commands, safe retrieval and equipment care inside the unit. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "What ages is archery suitable for?",
        a: "Years 2 and up works best. Younger students use lighter draw weights and shorter ranges; upper primary and high school students progress to scoring rounds and tournament formats.",
      },
      {
        q: "What facilities do we need?",
        a: "A hall, covered area or oval section we can rope off — about half a netball court. We set up and pack down the full range each visit.",
      },
    ],
  },
  {
    slug: "oztag-for-schools",
    sport: "Oztag",
    h1: "Oztag Programs for Schools & Childcare Centres",
    metaTitle: "Oztag Programs for Schools | Build Alpha Kids",
    description:
      "Oztag programs for primary schools — non-contact footy skills, tag technique and game sense from WWCC-cleared coaches. All equipment supplied. Get a quote.",
    accent: BALL_COLORS.orange,
    unit: [
      "Oztag gives students the running, passing and evasion of rugby league with zero tackling — which means every parent says yes and every student can play. A typical 6–10 week unit builds from tag technique and safe evasion, through passing and support play, into modified games and a round-robin finish.",
      "Games are small-sided so every student touches the ball constantly, and rules are layered in week by week — offside, tag counts, play-the-ball — so by the final weeks classes are running real matches with student referees.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — locomotor and object-control skill combinations, tactics and fair play — with full assessment and reporting supplied.",
    equipmentSafety:
      "We bring tags, belts, balls, cones and bibs for every class. Non-contact rules are coached explicitly, and games are scaled by age and space. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is Oztag safe for younger students?",
        a: "Yes — it's non-contact by design. For K–2 we simplify to tag-and-evade games that build the same footwork without the full rule set.",
      },
      {
        q: "What facilities do we need?",
        a: "Any oval or hard court. We adjust field sizes to your space and can run multiple small-sided games side by side.",
      },
    ],
  },
  {
    slug: "gymnastics-for-schools",
    sport: "Gymnastics",
    h1: "Gymnastics Programs for Schools & Childcare Centres",
    metaTitle: "Gymnastics Programs for Schools | Build Alpha Kids",
    description:
      "School gymnastics programs — rolls, balances, springs and body control taught safely by WWCC-cleared coaches. Equipment and mats supplied. Get a quote.",
    accent: BALL_COLORS.yellow,
    unit: [
      "Gymnastics is the foundation sport — the balance, body control and landing mechanics students build here show up in every other sport they play. A typical unit runs 6–10 weeks: floor shapes and rolls first, then balances and partner work, springs and safe landings, building to a class routine or circuit showcase.",
      "Sessions run as circuit stations — mats, low apparatus, balance lines — so the whole class is moving the whole time, with coaches spotting and progressing each station by ability.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — stability, locomotor control and movement composition — with baseline and post-unit skill checks per stage.",
    equipmentSafety:
      "We bring mats, low apparatus and station equipment; nothing for the school to own or store. Landings and progressions follow strict safety scaffolds — students only attempt skills they've earned the prerequisite for. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Do you need a gym hall?",
        a: "A hall is ideal but not essential — we run floor-based programs in covered areas and adapt apparatus to your space.",
      },
      {
        q: "Is it suitable for students with no gymnastics background?",
        a: "That's exactly who it's designed for. Every skill starts from a zero-experience baseline and progresses individually.",
      },
    ],
  },
  {
    slug: "tee-ball-for-schools",
    sport: "Tee Ball",
    h1: "Tee Ball Programs for Schools & Childcare Centres",
    metaTitle: "Tee Ball Programs for Schools | Build Alpha Kids",
    description:
      "Tee ball programs for primary schools — striking, catching, fielding and game sense from WWCC-cleared coaches. All equipment supplied. Get a quote.",
    accent: BALL_COLORS.red,
    unit: [
      "Tee ball takes the hardest thing in bat-and-ball sport — hitting a moving ball — off the table, so every student strikes successfully from week one. A typical unit runs 6–10 weeks: striking off the tee and safe bat habits, then catching and ground fielding, throwing to bases, and finally modified diamond games with rotating positions.",
      "Games are structured so everyone bats, fields and runs every session — no all-day outfield exile — and rules build gradually towards full tee ball by the final weeks.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control, striking and fielding skill combinations, and positional play — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring tees, safety balls, bats, bases and gloves sized for primary hands. Bat safety zones and waiting protocols are taught explicitly from the first session. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "What ages does tee ball suit?",
        a: "K–Year 6. Younger stages focus on striking and chasing games; upper primary adds base running tactics and umpired matches.",
      },
      {
        q: "What facilities do we need?",
        a: "An oval or large court area. We bring portable bases and set the diamond to fit your space.",
      },
    ],
  },
  {
    slug: "athletics-for-schools",
    sport: "Athletics",
    h1: "Athletics Programs for Schools & Childcare Centres",
    metaTitle: "Athletics & Carnival Programs for Schools | Build Alpha Kids",
    description:
      "School athletics units and carnival support — sprints, jumps, throws and relays coached before carnival season. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.blue,
    unit: [
      "The best carnival prep isn't a poster — it's a term of athletics. Our 10-week unit runs baseline skill checks and running mechanics (weeks 1–2), jumps and safe landings (3–4), throws with technique before power (5–6), relays and pacing (7–8), then a mini-carnival rotation and post-unit assessment (9–10).",
      "By carnival day every student has practised every event — which means more entries, better technique, fewer injuries and personal bests instead of embarrassment. We can also staff and equip the carnival itself: tabloid rotations, technical events and 3–6 event support.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — locomotor skill refinement, force and accuracy, and personal-best goal setting — with results recorded as assessment evidence.",
    equipmentSafety:
      "We bring everything from relay batons to foam javelins and measuring gear. Throwing areas and jump pits are risk-assessed each visit, with safety protocols taught as part of the unit. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Can you run our athletics carnival?",
        a: "Yes — staff, equipment and tabloid events. Book two terms in advance for 2027 and the carnival itself is free under our 2027 offer.",
      },
      {
        q: "When should we schedule the unit?",
        a: "The term before your carnival. Ten weeks of preparation transforms the day — more entries, better technique and far fewer sideline sitters.",
      },
    ],
  },
];

/** Lookup for /programs/[slug] — undefined drives notFound(). */
export function getSportPage(slug: string): SportPage | undefined {
  return SPORT_PAGES.find((p) => p.slug === slug);
}

/** Footer "top sports" links — first five in pack priority order. */
export const FOOTER_SPORT_LINKS = SPORT_PAGES.slice(0, 5).map((p) => ({
  label: p.sport,
  href: `/programs/${p.slug}`,
}));
