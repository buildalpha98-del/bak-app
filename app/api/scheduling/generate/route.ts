import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleSchedulingInput } from "@/lib/utils/scheduling/data-assembly";
import { generateRoster } from "@/lib/utils/scheduling/solver";
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

    // Apply assignments to sessions (set coach_id, keep status as draft)
    for (const assignment of assignments) {
      if (assignment.assignedCoachId) {
        await supabase
          .from("sessions")
          .update({ coach_id: assignment.assignedCoachId })
          .eq("id", assignment.sessionId);
      }
    }

    return NextResponse.json({
      runId: run.id,
      assignments: assignmentsJson,
      summary: outputSummary,
    });
  } catch (error) {
    console.error("Scheduling generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
