"use server";

// Report-card comments (migration 097): the class teacher's general
// comment and next steps for a student this term. Reads through the
// cookie client (RLS: own school); writes through the admin client after
// the portal auth and class-scope checks, as every portal write does.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentClientUser } from "@/lib/client/actions";
import { isClassScoped } from "@/lib/client/assessment-scope";

export interface ReportCardComment {
  term_id: string;
  term_name: string;
  general_comment: string;
  next_steps: string;
  author_name: string | null;
  updated_at: string | null;
}

const MAX = 1200;

async function requirePortalUser(centreId: string) {
  const { data: clientUser, error } = await getCurrentClientUser(centreId);
  if (error || !clientUser || clientUser.is_authorised_for_current === false) return null;
  if (clientUser.centre_type !== "school") return null;
  return clientUser;
}

/** May this portal user write this student's comment? Teachers: own classes only. */
async function canComment(centreId: string, childId: string, classIds: string[]): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: enrolled } = await supabase
    .from("centre_children")
    .select("child_id")
    .eq("centre_id", centreId)
    .eq("child_id", childId)
    .eq("status", "active")
    .maybeSingle();
  if (!enrolled) return false;
  if (!isClassScoped(classIds)) return true;
  const { data: membership } = await supabase
    .from("school_class_children")
    .select("class_id")
    .eq("child_id", childId)
    .is("ended_at", null)
    .in("class_id", classIds)
    .limit(1);
  return (membership ?? []).length > 0;
}

/** The active term's comment for a student (empty fields when none yet). */
export async function getReportCardComment(
  centreId: string,
  childId: string
): Promise<{ data: ReportCardComment | null; canEdit: boolean; error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { data: null, canEdit: false, error: "Not authorised." };
    const supabase = await createSupabaseServerClient();
    const { data: term } = await supabase.from("terms").select("id, name").eq("status", "active").limit(1).maybeSingle();
    if (!term) return { data: null, canEdit: false, error: null };
    const [{ data: row }, canEdit] = await Promise.all([
      supabase
        .from("report_card_comments")
        .select("general_comment, next_steps, updated_at, author_client_user_id")
        .eq("centre_id", centreId)
        .eq("child_id", childId)
        .eq("term_id", term.id)
        .maybeSingle(),
      canComment(centreId, childId, clientUser.class_ids),
    ]);
    // A portal user can read only their own client_users row under RLS,
    // so the author's name is looked up with the admin client (name only,
    // after the auth check above).
    let authorName: string | null = null;
    if (row?.author_client_user_id) {
      const { data: author } = await createSupabaseAdmin().from("client_users").select("name").eq("id", row.author_client_user_id).maybeSingle();
      authorName = author?.name ?? null;
    }
    return {
      data: {
        term_id: term.id,
        term_name: term.name,
        general_comment: row?.general_comment ?? "",
        next_steps: row?.next_steps ?? "",
        author_name: authorName,
        updated_at: row?.updated_at ?? null,
      },
      canEdit,
      error: null,
    };
  } catch (err) {
    console.error("getReportCardComment error:", err);
    return { data: null, canEdit: false, error: "Failed to load the comment." };
  }
}

export async function saveReportCardComment(
  centreId: string,
  input: { childId: string; termId: string; generalComment: string; nextSteps: string }
): Promise<{ error: string | null }> {
  try {
    const clientUser = await requirePortalUser(centreId);
    if (!clientUser) return { error: "Not authorised." };
    if (!(await canComment(centreId, input.childId, clientUser.class_ids))) {
      return { error: "That student is not in one of your classes." };
    }
    const general = input.generalComment.trim().slice(0, MAX);
    const next = input.nextSteps.trim().slice(0, MAX);
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("report_card_comments").upsert(
      {
        centre_id: centreId,
        child_id: input.childId,
        term_id: input.termId,
        general_comment: general,
        next_steps: next,
        author_client_user_id: clientUser.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "centre_id,child_id,term_id" }
    );
    if (error) throw error;
    revalidatePath(`/client/${centreId}/children/${input.childId}`);
    return { error: null };
  } catch (err) {
    console.error("saveReportCardComment error:", err);
    return { error: "Failed to save the comment." };
  }
}
