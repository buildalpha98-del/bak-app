import "server-only";
import { NextResponse } from "next/server";
import { requireRole, AuthorisationError } from "./require-role";
import { isInCoachPool } from "@/lib/staff/coach-pool";

export async function requireApiRole(coachPool = false): Promise<NextResponse | null> {
  try {
    const { profile } = await requireRole(coachPool ? ["coach", "ops"] : ["admin", "ops", "coach"]);
    if (coachPool && !isInCoachPool(profile)) throw new AuthorisationError(403);
    return null;
  } catch (error) {
    if (!(error instanceof AuthorisationError)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
}
