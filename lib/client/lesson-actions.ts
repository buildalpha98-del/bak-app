"use server";

// A school's own lesson library (migration 091). Teachers generate
// English / Mathematics lessons from the portal; the rows live in
// `programs` with centre_id set, so the same editor, PDF and Scope &
// Sequence renderers apply. Reads go through the cookie client (RLS:
// own school); the insert goes through the admin client after the
// portal auth check, as every portal write does.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentClientUser } from "@/lib/client/actions";
import type { ProgramContentJson } from "@/lib/ai/types";
import { LESSON_SUBJECT_KEYS } from "@/lib/client/lesson-input";

export interface SchoolLesson {
  id: string;
  subject: string;
  focus: string;
  age_group: string | null;
  duration_minutes: number;
  learning_focus: string | null;
  title: string;
  class_name: string | null;
  author_name: string | null;
  created_at: string;
  content_json: Record<string, unknown>;
  /** Term week start the lesson is placed on (migration 093), or null. */
  planned_for: string | null;
}

export async function getSchoolLessons(
  centreId: string
): Promise<{ data: SchoolLesson[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("programs")
      .select(
        "id, subject, sport, age_group, duration_minutes, skill_focus, content_json, created_at, school_class_id, created_by_client_user_id, planned_for"
      )
      .eq("centre_id", centreId)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error: error.message };
    if (!data || data.length === 0) return { data: [], error: null };

    // Class and author names: classes are readable by the client; the
    // author is another client_users row, which clients can't read.
    const classIds = Array.from(new Set(data.map((p) => p.school_class_id).filter(Boolean))) as string[];
    const authorIds = Array.from(new Set(data.map((p) => p.created_by_client_user_id).filter(Boolean))) as string[];
    const admin = createSupabaseAdmin();
    const [{ data: classes }, { data: authors }] = await Promise.all([
      classIds.length
        ? supabase.from("school_classes").select("id, name").in("id", classIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      authorIds.length
        ? admin.from("client_users").select("id, name").in("id", authorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);
    const className = new Map((classes ?? []).map((c) => [c.id, c.name]));
    const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));

    return {
      data: data.map((p) => ({
        id: p.id,
        subject: p.subject ?? "pdhpe",
        focus: p.sport,
        age_group: p.age_group,
        duration_minutes: p.duration_minutes,
        learning_focus: p.skill_focus,
        title: ((p.content_json as Record<string, unknown>)?.title as string) ?? p.sport,
        class_name: p.school_class_id ? className.get(p.school_class_id) ?? null : null,
        author_name: p.created_by_client_user_id ? authorName.get(p.created_by_client_user_id) ?? null : null,
        created_at: p.created_at,
        content_json: p.content_json as Record<string, unknown>,
        planned_for: p.planned_for ?? null,
      })),
      error: null,
    };
  } catch (err) {
    console.error("getSchoolLessons error:", err);
    return { data: [], error: "Failed to load lessons." };
  }
}

export async function getSchoolLesson(
  centreId: string,
  programId: string
): Promise<{ data: SchoolLesson | null; error: string | null }> {
  const { data, error } = await getSchoolLessons(centreId);
  if (error) return { data: null, error };
  return { data: data.find((l) => l.id === programId) ?? null, error: null };
}

export async function saveSchoolLesson(
  centreId: string,
  input: {
    subject: string;
    focus: string;
    ageBand: string;
    durationMinutes: number;
    learningFocus?: string | null;
    resources: string[];
    classId: string | null;
    content: ProgramContentJson;
    /** Term week start to place it on the Scope & Sequence (093). */
    plannedFor?: string | null;
  }
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { data: null, error: "Not authorised." };
    }
    if (clientUser.centre_type !== "school") {
      return { data: null, error: "Lessons are for schools." };
    }
    if (!(LESSON_SUBJECT_KEYS as readonly string[]).includes(input.subject)) {
      return { data: null, error: "Pick English or Mathematics." };
    }
    if (input.classId) {
      // The class must be this school's (and the teacher's, when scoped).
      const supabase = await createSupabaseServerClient();
      const { data: cls } = await supabase
        .from("school_classes")
        .select("id")
        .eq("id", input.classId)
        .eq("centre_id", centreId)
        .maybeSingle();
      if (!cls) return { data: null, error: "Class not found." };
      if (clientUser.class_ids.length > 0 && !clientUser.class_ids.includes(input.classId)) {
        return { data: null, error: "That class is not one of yours." };
      }
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("programs")
      .insert({
        subject: input.subject,
        sport: input.focus,
        age_groups: [input.ageBand],
        age_group: input.ageBand,
        duration_minutes: input.durationMinutes,
        skill_focus: input.learningFocus ?? null,
        content_json: { ...input.content, subject: input.subject } as unknown as Record<string, unknown>,
        equipment_used: input.resources,
        created_by: null,
        created_by_client_user_id: clientUser.id,
        centre_id: centreId,
        school_class_id: input.classId,
        planned_for: input.plannedFor && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedFor) ? input.plannedFor : null,
        version_number: 1,
        parent_version_id: null,
      })
      .select("id")
      .single();
    if (error) throw error;

    await admin.from("activity_log").insert({
      user_id: null,
      action: "school_lesson_created",
      entity_type: "program",
      entity_id: data.id,
      metadata: { centre_id: centreId, client_user_id: clientUser.id, subject: input.subject, focus: input.focus },
    });

    return { data: { id: data.id }, error: null };
  } catch (err) {
    console.error("saveSchoolLesson error:", err);
    return { data: null, error: "Failed to save the lesson." };
  }
}

/** Place a school lesson on a term week of the Scope & Sequence, or take it off. */
export async function setLessonWeek(
  centreId: string,
  programId: string,
  plannedFor: string | null
): Promise<{ error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { error: "Not authorised." };
    }
    if (plannedFor && !/^\d{4}-\d{2}-\d{2}$/.test(plannedFor)) return { error: "Pick a week." };
    const supabase = await createSupabaseServerClient();
    const { data: lesson } = await supabase
      .from("programs")
      .select("id")
      .eq("id", programId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!lesson) return { error: "Lesson not found." };
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("programs").update({ planned_for: plannedFor }).eq("id", programId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("setLessonWeek error:", err);
    return { error: "Failed to update the lesson's week." };
  }
}
