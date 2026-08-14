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
  // ── Tranche 2 (added 2026-08-14): the pack's "unique" differentiators.
  // All three are delivered NON-CONTACT in schools — pad work, technique
  // and forms, never sparring between students. Keep that framing in
  // every sentence that could be read by a cautious principal.
  {
    slug: "boxing-for-schools",
    sport: "Boxing",
    h1: "Boxing Programs for Schools & Childcare Centres",
    metaTitle: "Boxing Programs for Schools | Build Alpha Kids",
    description:
      "Non-contact boxing programs for schools — pad work, footwork and fitness with zero sparring, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.red,
    unit: [
      "School boxing done right is fitness, footwork and focus — never fighting. Our program is strictly non-contact: students work gloves-on-pads with a partner holding, and no student ever strikes another student. A typical 6–10 week unit builds from stance and footwork, through straight punches on pads, into combination work, skipping and boxing-style conditioning circuits.",
      "The payoff schools notice isn't just fitness. Pad work demands concentration, controlled effort and trust between partners — which is why boxing units consistently engage the students who switch off in traditional sport, and why behaviour inside the sessions is a selling point, not a risk.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — movement control, fitness and self-management — with the same assessment and reporting pack as every Build Alpha Kids unit.",
    equipmentSafety:
      "We bring junior gloves, focus pads, skipping ropes and circuit equipment, all sized for school-aged hands. The non-contact rule is absolute: pads and bags only, no student-on-student contact of any kind, ever. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is there any sparring or student-on-student contact?",
        a: "No — none, at any age, ever. Students punch pads and bags only. The program teaches boxing fitness and technique, not fighting.",
      },
      {
        q: "What will parents think?",
        a: "We supply a parent information note with the unit explaining the non-contact format. In our experience the objections disappear once families see it's pad work, footwork and fitness — most feedback is about how engaged their kids are.",
      },
    ],
  },
  {
    slug: "self-defence-for-schools",
    sport: "Self-Defence",
    h1: "Self-Defence Programs for Schools & Childcare Centres",
    metaTitle: "Self-Defence Programs for Schools | Build Alpha Kids",
    description:
      "Age-appropriate self-defence programs for schools — awareness, confidence and safe responses taught without sparring by WWCC-cleared coaches. Get a quote.",
    accent: BALL_COLORS.blue,
    unit: [
      "Self-defence for school-aged kids is mostly not about physical technique — it's awareness, voice and confidence. A typical 6–10 week unit covers reading situations and trusting instincts, strong voice and body language, safe distance and escape movement, and simple age-appropriate physical responses practised on pads and shields — never on other students.",
      "Sessions are scenario-based and deliberately calm: the goal is students who stand taller, speak up earlier and know what to do, not students who think they've learned to fight. Teachers consistently report the quietest kids getting the most out of it.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — personal safety, decision-making and confident communication — with assessment and reporting supplied like every unit.",
    equipmentSafety:
      "We bring strike pads, shields and all session equipment. Physical skills are practised on equipment only — no student-on-student contact — and every scenario is scripted to the age group in front of us. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is this teaching kids to fight?",
        a: "No. The program is awareness, avoidance, voice and escape first; the physical component is simple, defensive and practised on pads only. Students never practise techniques on each other.",
      },
      {
        q: "What ages is it appropriate for?",
        a: "Years 3 and up works best for the full program. For younger students we run a simplified personal-safety format focused on awareness, voice and finding help.",
      },
    ],
  },
  {
    slug: "taekwondo-for-schools",
    sport: "Taekwondo",
    h1: "Taekwondo Programs for Schools & Childcare Centres",
    metaTitle: "Taekwondo Programs for Schools | Build Alpha Kids",
    description:
      "Non-contact taekwondo programs for schools — kicks, patterns, flexibility and discipline taught by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.yellow,
    unit: [
      "Taekwondo gives students something almost no school sport does: a discipline. A typical 6–10 week unit is strictly non-contact — stances and basic blocks, kicking technique on pads and shields, patterns (choreographed sequences that build memory and control), flexibility work, and a graded in-class demonstration to finish.",
      "The structure is the point. Sessions open and close with the same rituals every week — lining up, the count, respect to the coach and partners — and students who struggle with free-form sport often thrive inside that predictability. Kicking pads is also, reliably, the most-requested station we run.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — balance, coordination, movement sequencing and self-discipline — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring kick pads, shields and all session equipment. Kicks and strikes are practised on equipment only — no student-on-student contact and no sparring. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is there sparring?",
        a: "No — the school program is entirely non-contact. All kicks and strikes are practised on pads and shields, and patterns are performed solo.",
      },
      {
        q: "Do students earn belts?",
        a: "The school unit finishes with an in-class graded demonstration and completion certificates rather than formal belt gradings — and we can point keen students towards continuing the sport outside school.",
      },
    ],
  },
  // ── Tranche 3 (added 2026-08-14): the mainstream sports. The pack's
  // list names "football" alongside soccer — read as RUGBY LEAGUE (the
  // code this region calls footy; soccer already has its own page).
  {
    slug: "soccer-for-schools",
    sport: "Soccer",
    h1: "Soccer Programs for Schools & Childcare Centres",
    metaTitle: "Soccer Programs for Schools | Build Alpha Kids",
    description:
      "School soccer programs — first touch, passing and small-sided games where every kid plays, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.green,
    unit: [
      "Every playground already runs on soccer — our job is turning enthusiasm into skill. A typical 6–10 week unit builds from first touch and dribbling, through passing and receiving under pressure, into shooting technique and small-sided games that put every skill straight into play.",
      "The format rule that changes everything: one ball between two, and games no bigger than four-a-side. Small-sided means constant touches, constant decisions and nowhere to hide — the strongest players are stretched and the beginners are never spectators.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control with the feet, spatial awareness and team play — with the standard assessment and reporting pack supplied.",
    equipmentSafety:
      "We bring size-appropriate balls, pop-up goals, cones and bibs for every class. Games are non-contact by rule, scaled to the age group, and refereed to keep them that way. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "What facilities do we need?",
        a: "Any oval or hard court — pop-up goals and marked fields travel with us, and we run multiple small-sided fields side by side for full classes.",
      },
      {
        q: "Our students are soccer-mad already. What do they get out of it?",
        a: "Structure. Playground soccer is one big game dominated by three kids; our small-sided formats force touches, positions and decisions from everyone — which is where actual improvement lives.",
      },
    ],
  },
  {
    slug: "basketball-for-schools",
    sport: "Basketball",
    h1: "Basketball Programs for Schools & Childcare Centres",
    metaTitle: "Basketball Programs for Schools | Build Alpha Kids",
    description:
      "School basketball programs — dribbling, passing, shooting and modified games from WWCC-cleared coaches. Rings and equipment supplied. Get a quote.",
    accent: BALL_COLORS.orange,
    unit: [
      "Basketball rewards exactly what school sport should build: hand skills, footwork and quick decisions. A typical 6–10 week unit runs from ball-handling and dribbling, through passing and cutting, into shooting form and modified games — lower rings and smaller balls where the age group needs them.",
      "Sessions are station-based so a full class is always moving: a dribbling circuit, a passing grid, a shooting station and a half-court game rotating every few minutes. Modified rules — no contested steals for juniors, everyone-touches before a shot — keep the confident kids sharing the ball and the quiet kids in the game.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control, locomotor combinations and tactical awareness — with baseline and post-unit skill checks per stage.",
    equipmentSafety:
      "We bring size-graded balls, portable rings where courts need them, cones and bibs. Games are refereed non-contact with modified rules by stage. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "We only have one court. Does that work?",
        a: "Yes — the station format is designed for it. One court comfortably runs a full class across four rotating stations, and we bring portable rings to open up extra shooting space.",
      },
      {
        q: "What ages does the program suit?",
        a: "K–Year 6 and into high school. Juniors play on lowered targets with smaller balls; upper stages progress to full rules, set plays and tournament formats.",
      },
    ],
  },
  {
    slug: "netball-for-schools",
    sport: "Netball",
    h1: "Netball Programs for Schools & Childcare Centres",
    metaTitle: "Netball Programs for Schools | Build Alpha Kids",
    description:
      "School netball programs — passing, footwork and positional play for all students, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.red,
    unit: [
      "Netball is one of the most-played sports in the country, and it teaches what few others do: precise passing, legal footwork and genuinely positional team play. A typical 6–10 week unit builds from catching and pivoting, through the footwork rule and lead-and-pass patterns, into positional mini-games and a round-robin finish.",
      "Every student plays every position across the unit — attackers learn to defend, defenders learn to shoot — and the no-contact, no-travel rules mean success comes from movement and thinking, not size. It's a sport where a well-drilled quiet kid routinely beats a fast loud one, and they notice.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control, movement precision and cooperative play — with the standard assessment and reporting pack supplied.",
    equipmentSafety:
      "We bring size-appropriate netballs, bibs for every position and portable rings where courts need them. The sport is non-contact by rule and we referee it that way from week one. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is the program for girls only?",
        a: "No — we coach netball as a whole-class sport for everyone. Mixed netball is one of the fastest-growing formats in the country, and the footwork and passing transfer to every court sport.",
      },
      {
        q: "What facilities do we need?",
        a: "A netball or basketball court is ideal, but any flat hard area works — portable rings and marked thirds travel with us.",
      },
    ],
  },
  {
    slug: "cricket-for-schools",
    sport: "Cricket",
    h1: "Cricket Programs for Schools & Childcare Centres",
    metaTitle: "Cricket Programs for Schools | Build Alpha Kids",
    description:
      "School cricket programs — striking, bowling and fielding through fast modified formats where everyone bats. WWCC-cleared coaches, gear supplied. Get a quote.",
    accent: BALL_COLORS.yellow,
    unit: [
      "School cricket has a reputation problem: two kids batting, twenty kids waiting. Our unit kills the queue. A typical 6–10 weeks runs striking off tees and drop-feeds, straight-arm bowling basics, ground fielding and catching — then continuous-cricket formats where batters run on every hit, everyone bowls an over, and an innings takes minutes, not an afternoon.",
      "Modified equipment does the rest: soft balls, flat bats for juniors and short pitches keep the game fast and fear-free, so students spend the unit hitting, bowling and diving instead of standing at fine leg watching clouds.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — striking, throwing and catching combinations, and game-sense decisions — with results in the standard assessment pack.",
    equipmentSafety:
      "We bring soft safety balls, age-graded bats, tees, stumps and cones — no hard balls in primary sessions, ever. Bat safety zones are taught from the first week. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "How do you keep a whole class involved?",
        a: "Continuous formats — batters run on every hit, bowlers rotate every over, and fielding earns points. Nobody waits more than a couple of minutes for their next go.",
      },
      {
        q: "When in the year should we run it?",
        a: "Terms 1 and 4 suit cricket's season, but the modified indoor-friendly format runs year-round — a hall works fine in winter.",
      },
    ],
  },
  {
    slug: "afl-for-schools",
    sport: "AFL",
    h1: "AFL Programs for Schools & Childcare Centres",
    metaTitle: "AFL Programs for Schools | Build Alpha Kids",
    description:
      "School AFL programs — kicking, marking and handballing in non-contact modified formats, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.blue,
    unit: [
      "AFL's three core skills — the drop punt, the mark and the handball — are unlike anything else in school sport, which is exactly why kids love learning them. A typical 6–10 week unit builds each one through partner drills and target games, then combines them in modified, non-contact match formats built around space and possession.",
      "Our school format is strictly modified: no tackling, no bumping — possession changes on touch or intercept, and marking contests are one-on-one leads rather than packs. All the spectacular parts of the game, none of the collisions.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — kicking and striking with force and accuracy, aerial catching and spatial play — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring age-graded synthetic footballs, portable goals, cones and bibs. The format is non-contact by rule — touch-based possession, no tackling at any stage — and refereed that way. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is there tackling?",
        a: "No — the school format is entirely non-contact. Possession changes on touch, marking contests are leads not packs, and the rules are refereed tightly.",
      },
      {
        q: "We're in rugby league territory. Will students take to it?",
        a: "Reliably — the novelty is the point. Most students have never learned a drop punt or taken an overhead mark, so the skill ceiling feels fresh and the playing field starts level.",
      },
    ],
  },
  {
    slug: "tennis-for-schools",
    sport: "Tennis",
    h1: "Tennis Programs for Schools & Childcare Centres",
    metaTitle: "Tennis Programs for Schools | Build Alpha Kids",
    description:
      "School tennis programs — racquet skills, rallying and modified court games with low-compression balls. WWCC-cleared coaches, gear supplied. Get a quote.",
    accent: BALL_COLORS.green,
    unit: [
      "Tennis in schools used to mean one court, thirty kids and a queue. Modified equipment changed the sport: low-compression balls that bounce slow enough to hit, lighter racquets and pop-up mini-nets mean a full class can rally in week one. A typical 6–10 week unit runs from racquet familiarity and forehands, through backhands and serving, into mini-court rally games and a round-robin ladder.",
      "Everything is scored in rallies, not winners — the unit's goal is a class where every student can sustain a rally, because that's the skill that makes tennis playable for life.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — striking with an implement, hand-eye coordination and force control — with baseline and post-unit skill checks.",
    equipmentSafety:
      "We bring age-graded racquets, low-compression balls and pop-up nets — no full-speed balls in primary sessions. Racquet-space rules are taught from the first minute. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "We don't have tennis courts. Can we still run it?",
        a: "Yes — pop-up nets turn any hard court, hall or covered area into six mini-courts. Line markings are handy but not required.",
      },
      {
        q: "What ages does it suit?",
        a: "K–Year 6 on modified equipment, progressing ball speed and court size by stage; high school groups move towards full-court play.",
      },
    ],
  },
  {
    slug: "volleyball-for-schools",
    sport: "Volleyball",
    h1: "Volleyball Programs for Schools & Childcare Centres",
    metaTitle: "Volleyball Programs for Schools | Build Alpha Kids",
    description:
      "School volleyball programs — catch-and-throw lead-ins to digging, setting and spiking, run by WWCC-cleared coaches. Nets and balls supplied. Get a quote.",
    accent: BALL_COLORS.orange,
    unit: [
      "Volleyball is the rare sport that gets better as students get older — which makes primary the perfect place to plant it. A typical 6–10 week unit starts with catch-and-throw lead-in games that teach rotation and court coverage, then layers in the dig, the set and (for upper stages) the spike and serve, finishing in modified games with bounces allowed where the age group needs them.",
      "The lead-in format matters: starting with catching means week-one games actually work, and every skill swap afterwards — catch becomes dig, throw becomes set — upgrades a game students already love playing.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — striking and volleying, reaction and teamwork under a shared objective — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring soft-touch volleyballs, adjustable portable nets and boundary markers. Ball weight and net height scale by stage, and rotations are structured so every student serves and plays front court. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Isn't volleyball too hard for primary students?",
        a: "Full volleyball, yes — that's why we start from catch-and-throw formats that play like the real game and swap skills in one at a time. By the final weeks most classes are running genuine three-touch rallies.",
      },
      {
        q: "What facilities do we need?",
        a: "A hall or hard court. Our portable nets set up anywhere, and we run multiple short courts for full classes.",
      },
    ],
  },
  {
    slug: "hockey-for-schools",
    sport: "Hockey",
    h1: "Hockey Programs for Schools & Childcare Centres",
    metaTitle: "Hockey Programs for Schools | Build Alpha Kids",
    description:
      "School hockey programs — dribbling, passing and shooting with school-safe sticks and balls, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.red,
    unit: [
      "Hockey hands every student a stick and a reason to concentrate — few sports build coordination faster. A typical 6–10 week unit runs from grip and carrying the ball, through push passes and receiving, into dribbling under pressure, shooting and small-sided games with rolling substitutions.",
      "Stick discipline is coached as a skill in itself: flat-stick rules, no lifting near others and defined shooting zones — which is exactly what makes the game safe enough to run fast.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control with an implement, agility and channel-based team play — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring school-safe sticks sized by age, soft low-bounce balls, flat goals and cones — never hard field balls in school sessions. Flat-stick and height rules are taught from week one and refereed throughout. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is hockey safe for a full class of beginners?",
        a: "With the right equipment and rules, yes — soft balls, age-sized sticks, flat-stick rules and shooting zones are all non-negotiable in our format, and sessions are refereed to them.",
      },
      {
        q: "Grass, court or turf?",
        a: "Any of them — the soft ball runs true on hard court and short grass, and we adjust field sizes to whatever space you have.",
      },
    ],
  },
  {
    slug: "golf-for-schools",
    sport: "Golf",
    h1: "Golf Programs for Schools & Childcare Centres",
    metaTitle: "Golf Programs for Schools | Build Alpha Kids",
    description:
      "School golf programs — swing basics and target golf with school-safe clubs and soft balls, run by WWCC-cleared coaches. Equipment supplied. Get a quote.",
    accent: BALL_COLORS.yellow,
    unit: [
      "Golf on school grounds works because of one design decision: everything is a target game. A typical 6–10 week unit runs grip and setup, chipping to rings and mats, putting circuits, then full-swing striking into nets and scoring courses laid out across the playground — closest-to-the-pin, ladder golf, team ambrose.",
      "School-safe equipment makes it possible: plastic-headed clubs and soft low-flight balls that behave like the real thing without the danger, so a full class swings at once instead of waiting a turn.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — striking with an implement, force control and accuracy, and honest self-scoring — with the standard assessment pack supplied.",
    equipmentSafety:
      "We bring school-safe clubs sized by age, soft low-flight balls, hitting mats, nets and target rings. Swing-space safety zones are marked and taught before a single ball is hit. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Do we need to be near a golf course?",
        a: "Not at all — the whole program runs on your oval, courts or hall. Targets, mats and nets travel with us.",
      },
      {
        q: "Isn't golf slow for kids?",
        a: "Traditional golf is; target golf isn't. Every station is score-as-you-go, every student has a club, and rotations keep the pace closer to a carnival than a fairway.",
      },
    ],
  },
  {
    slug: "rugby-league-for-schools",
    sport: "Rugby League",
    h1: "Rugby League Programs for Schools & Childcare Centres",
    metaTitle: "Rugby League Programs for Schools | Build Alpha Kids",
    description:
      "School rugby league programs — passing, evasion and footy fundamentals in tag-based non-contact formats. WWCC-cleared coaches, gear supplied. Get a quote.",
    accent: BALL_COLORS.blue,
    unit: [
      "In South-West Sydney, footy is the language of the playground — our unit teaches students to speak it properly. A typical 6–10 weeks builds the catch-and-pass off both hands, running onto the ball, evasion and safe grounding, then layers league structure — the tackle count, the play-the-ball — into tag-based games.",
      "The school format is strictly non-contact: tags replace tackles at every stage, and contested work happens on pads and shields, never between students. All the shape and speed of league, none of the collisions — and a natural pathway into our Oztag program for schools that want the tag code year-round.",
    ],
    curriculumLine:
      "Units map to stage-relevant PDHPE outcomes — object control on the run, evasion and team structure — with the standard assessment and reporting pack supplied.",
    equipmentSafety:
      "We bring age-graded footballs, tags and belts, hit shields, cones and bibs. Tags replace tackles at every stage — no student-on-student contact — and any contact work is pads-only. Every coach holds a current Working With Children Check and first-aid certification.",
    faqs: [
      QUOTE_FAQ,
      {
        q: "Is there tackling?",
        a: "No — tags replace tackles at every stage, and contested work is done on pads and shields only. The format keeps league's structure and speed without the contact.",
      },
      {
        q: "How is this different from your Oztag program?",
        a: "Oztag is its own code with its own rules and competitions; this unit teaches rugby league's specific structure — the tackle count, the play-the-ball, positional shape — in a tag-based format. Plenty of schools run one as the pathway into the other.",
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
