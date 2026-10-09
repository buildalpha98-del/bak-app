// ============================================================
// The coaching pool — who can be put on a shift
// ============================================================
//
// A profile has one role, but an ops member can also coach
// (`profiles.also_coaches`, migration 101). Every "who are the coaches"
// question goes through here, never by filtering profiles on role = coach alone —
// the CI guard lib/__tests__/no-role-coach-pool-queries.test.ts fails
// the build on that.
//
//   query:   supabase.from("profiles").select(...).or(COACH_POOL_FILTER)
//   in code: isInCoachPool(profile)
//
// Admins are not in the pool (they were never rostered); they can open
// the coach screens anyway via the middleware's role → routes table.

import type { UserRole } from "@/lib/types/enums";

/** PostgREST `or` filter: coaches, plus ops members who also coach. */
export const COACH_POOL_FILTER = "role.eq.coach,and(role.eq.ops,also_coaches.eq.true)";

interface PoolFields {
  role: UserRole | string;
  also_coaches?: boolean | null;
}

export function isInCoachPool(profile: PoolFields | null | undefined): boolean {
  if (!profile) return false;
  return profile.role === "coach" || (profile.role === "ops" && profile.also_coaches === true);
}

/** Ops member who also coaches — the one person who switches between two sets of screens. */
export function isOpsCoach(profile: PoolFields | null | undefined): boolean {
  return !!profile && profile.role === "ops" && profile.also_coaches === true;
}

/**
 * Which role's navigation to show. An ops member who coaches sees the
 * coach nav while on /coach pages and the ops nav everywhere else.
 */
export function navRoleFor(profile: PoolFields, pathname: string): UserRole {
  const role = profile.role as UserRole;
  if (isOpsCoach(profile) && (pathname === "/coach" || pathname.startsWith("/coach/"))) {
    return "coach";
  }
  return role;
}
