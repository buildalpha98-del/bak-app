import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  AUTOCOMPLETE_FROM_STATUSES,
  sessionsToAutocomplete,
} from "@/lib/sessions/autocomplete";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

// Nightly (23:30 Sydney): close every published session whose day has
// passed and nobody checked out of. Flagged needs_ops_review so the
// roster's review queue shows them; headcount stays null because nobody
// counted. Without this, a coach forgetting to check out removes that
// week from the school's term report and attendance figures.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const now = new Date();

  const { data: candidates, error } = await supabase
    .from("sessions")
    .select("id, date, status")
    .in("status", [...AUTOCOMPLETE_FROM_STATUSES])
    .lte("date", sydneyTodayIso(now));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stale = sessionsToAutocomplete(candidates ?? [], now);
  if (stale.length === 0) {
    return NextResponse.json({ completed: 0 });
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      status: "completed",
      completed_at: now.toISOString(),
      needs_ops_review: true,
    })
    .in(
      "id",
      stale.map((s) => s.id)
    );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert(
    stale.map((s) => ({
      user_id: null,
      action: "session_autocompleted",
      entity_type: "session",
      entity_id: s.id,
      metadata: { previous_status: s.status, date: s.date },
    }))
  );

  return NextResponse.json({
    completed: stale.length,
    sessionIds: stale.map((s) => s.id),
  });
}
