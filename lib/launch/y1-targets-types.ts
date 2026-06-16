// ============================================================
// Y1 target shared types & constants
// ============================================================
//
// Split out from `y1-targets-actions.ts` because Next's "use server"
// boundary only permits async function exports — `Y1Targets` (a type)
// and `DEFAULT_Y1_TARGETS` (a const) live here so they can be imported
// from both server actions and client components.

export const DEFAULT_Y1_TARGETS = {
  centres: 40,
  schools: 10,
  revenue: 400_000,
} as const;

export type Y1TargetField = "centres" | "schools" | "revenue";

export interface Y1Targets {
  centres: number;
  schools: number;
  revenue: number;
}
