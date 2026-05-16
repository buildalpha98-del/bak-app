import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleSchedulingInput } from "@/lib/utils/scheduling/data-assembly";
import { generateRoster } from "@/lib/utils/scheduling/solver";
import { bulkCheckCoachCertsForSessions } from "@/lib/utils/compliance/check-coach-certs";
import { setSessionCoaches } from "@/lib/sessions/session-coaches";
import type { SchedulingRunInputSummary, SchedulingRunOutputSummary, SchedulingAssignment } from "@/lib/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // Auth check: admin/ops only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "ops"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { weekStart, weekEnd, termId, keepExisting = false } = body;

  if (!weekStart || !weekEnd || !termId) {
    return NextResponse.json(
      { error: "weekStart, weekEnd, and termId are required" },
      { status: 400 }
    );
  }

  try {
    // Assemble input
    const input = await assembleSchedulingInput(weekStart, weekEnd);

    // Optionally filter out sessions that already have coaches
    if (keepExisting) {
      input.sessions = input.sessions.filter((s) => !s.coach_id);
    }

    if (input.sessions.length === 0) {
      return NextResponse.json({
        assignments: [],
        summary: { assigned_count: 0, unassigned_count: 0, confidence_breakdown: { green: 0, amber: 0, red: 0 } },
        message: "No sessions to assign",
      });
    }

    // Run solver
    const assignments = generateRoster(input);

    // Build summaries
    const inputSummary: SchedulingRunInputSummary = {
      coaches_count: input.coaches.length,
      sessions_count: input.sessions.length,
      constraints: [
        "availability_windows",
        "travel_buffer_30min",
        "no_overlaps",
        ...(input.preferences.length > 0 ? ["scheduling_preferences"] : []),
      ],
    };

    const outputSummary: SchedulingRunOutputSummary = {
      assigned_count: assignments.filter((a) => a.assignedCoachId).length,
      unassigned_count: assignments.filter((a) => !a.assignedCoachId).length,
      confidence_breakdown: {
        green: assignments.filter((a) => a.confidence === "green").length,
        amber: assignments.filter((a) => a.confidence === "amber").length,
        red: assignments.filter((a) => a.confidence === "red").length,
      },
    };

    // Map to DB format
    const assignmentsJson: SchedulingAssignment[] = assignments.map((a) => ({
      session_id: a.sessionId,
      assigned_coach_id: a.assignedCoachId,
      score: a.score,
      confidence: a.confidence,
      reasoning: a.reasoning,
      eligible_coaches: a.eligibleCoaches.map((e) => ({
        coach_id: e.coachId,
        score: e.score,
        name: e.name,
      })),
    }));

    // Save scheduling run
    const { data: run, error: runError } = await supabase
      .from("scheduling_runs")
      .insert({
        term_id: termId,
        week_start: weekStart,
        week_end: weekEnd,
        input_summary: inputSummary,
        output_summary: outputSummary,
        assignments_json: assignmentsJson,
        status: "generated",
        created_by: user.id,
      })
      .select()
      .single();

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    // Cert guard — refuse to write a coach with expired/rejected wwcc
    // or first_aid for the session date. Soft-penalised in the solver
    // already; this is the hard gate before we touch `sessions.coach_id`.
    const sessionDateMap = new Map(
      input.sessions.map((s) => [s.id, s.date as string]),
    );
    const pairs = assignments
      .filter((a) => a.assignedCoachId)
      .map((a) => ({
        sessionId: a.sessionId,
        coachId: a.assignedCoachId as string,
        sessionDate: sessionDateMap.get(a.sessionId) ?? "",
      }))
      .filter((p) => p.sessionDate);

    const certCheck = await bulkCheckCoachCertsForSessions(pairs);

    // Apply only the validly-priced assignments. Blocked ones surface in
    // the response so the UI can flag them for ops review. Funnel through
    // the single write path so session_coaches stays consistent.
    const errors: { sessionId: string; message: string }[] = [];
    for (const pair of certCheck.valid) {
      const { error: writeErr } = await setSessionCoaches({
        sessionId: pair.sessionId,
        coaches: [{ userId: pair.coachId, isPrimary: true }],
        assignedBy: user.id,
      });
      if (writeErr) {
        errors.push({ sessionId: pair.sessionId, message: writeErr });
      }
    }

    return NextResponse.json({
      runId: run.id,
      assignments: assignmentsJson,
      summary: outputSummary,
      certBlocked: certCheck.blocked.map((b) => ({
        sessionId: b.sessionId,
        coachId: b.coachId,
        reason: b.result.message,
      })),
      writeErrors: errors,
    });
  } catch (error) {
    console.error("Scheduling generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
