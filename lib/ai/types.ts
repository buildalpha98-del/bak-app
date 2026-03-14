import type { Sport } from "@/lib/types/enums";

// ============================================================
// AI Programme Generation — Request & Response types
// ============================================================

/** Age brackets supported by the programme generator */
export type AgeGroup = "3-5" | "5-8" | "8-12";

/** Session duration options (minutes) */
export type SessionDuration = 30 | 45 | 60;

/** Request payload sent to the generation API route */
export interface GenerateProgramRequest {
  sport: Sport;
  ageGroup: AgeGroup;
  durationMinutes: SessionDuration;
  skillFocus?: string;
  availableEquipment: string[];
  centreType?: "childcare_centre" | "school";
  centreContext?: {
    centreName: string;
    recentPrograms: {
      title: string;
      sport: string;
      skillFocus: string | null;
    }[];
  };
}

// ============================================================
// Programme content_json shape (stored in programs.content_json)
// ============================================================

export interface WarmUpSection {
  name: string;
  duration: number;
  description: string;
  coachingTips: string;
}

export interface SkillDrill {
  name: string;
  duration: number;
  description: string;
  progressions: string[];
  coachingTips: string;
}

export interface ModifiedGameSection {
  name: string;
  duration: number;
  description: string;
  rules: string[];
  variations: string[];
  coachingTips: string;
}

export interface CoolDownSection {
  name: string;
  duration: number;
  description: string;
}

/** A single curriculum outcome aligned to the session */
export interface CurriculumOutcome {
  framework: "eylf" | "pdhpe";
  code: string;
  title: string;
  description: string;
}

/** Full structured programme content as returned by Claude */
export interface ProgramContentJson {
  title: string;
  sport: string;
  ageGroup: string;
  duration: number;
  objectives: string[];
  equipmentNeeded: string[];
  warmUp: WarmUpSection;
  skillDevelopment: SkillDrill[];
  modifiedGame: ModifiedGameSection;
  coolDown: CoolDownSection;
  curriculumOutcomes?: CurriculumOutcome[];
  reflectionPrompt?: string;
}

// ============================================================
// Standard equipment list (used when no centre is selected)
// ============================================================

export const STANDARD_EQUIPMENT = [
  "Cones",
  "Balls",
  "Bibs",
  "Hoops",
  "Ladders",
  "Mats",
  "Ropes",
  "Markers",
  "Nets",
  "Goals",
  "Rackets",
  "Bats",
  "Stumps",
  "Tees",
  "Beanbags",
  "Skipping ropes",
  "Parachute",
  "Balance beams",
] as const;
