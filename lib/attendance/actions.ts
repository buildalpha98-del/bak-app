"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { AgeGroup } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface SessionAttendanceRecord {
  child_id: string;
  first_name: string;
  last_name: string;
  age_group: AgeGroup;
  present: boolean;
}

export interface AttendanceEntry {
  child_id: string;
  present: boolean;
}

// ============================================================
// saveSessionAttendance — bulk upsert attendance records
// ============================================================

export async function saveSessionAttendance(
  sessionId: string,
  entries: AttendanceEntry[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    if (entries.length === 0) return { error: null };

    // Upsert all attendance records
    const records = entries.map((e) => ({
      session_id: sessionId,
      child_id: e.child_id,
      present: e.present,
    }));

    const { error } = await supabase
      .from("session_attendances")
      .upsert(records, { onConflict: "session_id,child_id" });

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error("saveSessionAttendance error:", err);
    return { error: "Failed to save attendance." };
  }
}

// ============================================================
// getSessionAttendance — view attendance for a completed session
// ============================================================

export async function getSessionAttendance(
  sessionId: string
): Promise<{
  data: SessionAttendanceRecord[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: records, error: recordsError } = await supabase
      .from("session_attendances")
      .select("child_id, present")
      .eq("session_id", sessionId);

    if (recordsError) throw recordsError;
    if (!records || records.length === 0) return { data: [], error: null };

    const childIds = records.map((r) => r.child_id);
    const { data: children } = await supabase
      .from("children")
      .select("id, first_name, last_name, age_group")
      .in("id", childIds);

    const childMap = new Map(
      (children ?? []).map((c) => [c.id, c])
    );

    const result: SessionAttendanceRecord[] = records.map((r) => {
      const child = childMap.get(r.child_id);
      return {
        child_id: r.child_id,
        first_name: child?.first_name ?? "Unknown",
        last_name: child?.last_name ?? "",
        age_group: child?.age_group ?? "5-8",
        present: r.present,
      };
    });

    // Sort: present first, then alphabetical
    result.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return `${a.first_name} ${a.last_name}`.localeCompare(
        `${b.first_name} ${b.last_name}`
      );
    });

    return { data: result, error: null };
  } catch (err) {
    console.error("getSessionAttendance error:", err);
    return { data: null, error: "Failed to load attendance." };
  }
}

// ============================================================
// opsUpdateAttendance — ops/admin override with audit log
// Attendance is immutable for coaches after submission.
// Only ops/admin can retroactively change it, with an audit trail.
// ============================================================

export async function opsUpdateAttendance(
  sessionId: string,
  childId: string,
  present: boolean,
  reason: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Check role is admin or ops
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Only ops or admin can modify submitted attendance." };
    }

    // Use admin client to bypass RLS for the update
    const admin = createSupabaseAdmin();

    // Get old value for audit
    const { data: existing } = await admin
      .from("session_attendances")
      .select("present")
      .eq("session_id", sessionId)
      .eq("child_id", childId)
      .single();

    const oldValue = existing?.present ?? null;

    // Upsert the attendance record
    const { error: upsertError } = await admin
      .from("session_attendances")
      .upsert(
        { session_id: sessionId, child_id: childId, present },
        { onConflict: "session_id,child_id" }
      );

    if (upsertError) throw upsertError;

    // Log to activity_log
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "attendance_override",
      entity_type: "session_attendance",
      entity_id: sessionId,
      metadata: {
        child_id: childId,
        old_present: oldValue,
        new_present: present,
        reason,
      },
    });

    return { error: null };
  } catch (err) {
    console.error("opsUpdateAttendance error:", err);
    return { error: "Failed to update attendance." };
  }
}
