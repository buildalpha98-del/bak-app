"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CentreReport, ReportContentJson } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export type { ReportContentJson };

export interface ReportListItem {
  id: string;
  centre_id: string;
  centre_name: string;
  term_id: string;
  term_name: string;
  title: string;
  status: "draft" | "sent";
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportDetail extends CentreReport {
  centre_name: string;
  centre_logo_url: string | null;
  centre_branding_mode: string;
  centre_contact_email: string | null;
  term_name: string;
}

export interface GenerateReportInput {
  centreId: string;
  termId: string;
}

// ============================================================
// Compile report data from sessions, attendance, assessments, feedback
// ============================================================

export async function compileReportData(
  centreId: string,
  termId: string
): Promise<{ data: ReportContentJson | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get sessions for this centre + term
    const { data: sessions } = await supabase
      .from("sessions")
      .select("id, date, sport, coach_id, headcount, status, coach_notes, duration_minutes")
      .eq("centre_id", centreId)
      .eq("term_id", termId)
      .in("status", ["completed", "in_progress"])
      .order("date", { ascending: true });

    if (!sessions || sessions.length === 0) {
      return {
        data: {
          summary: "No completed sessions found for this term.",
          sessions_delivered: 0,
          total_children: 0,
          sports_covered: [],
          highlights: [],
          coach_notes: [],
        },
        error: null,
      };
    }

    const sessionIds = sessions.map((s) => s.id);

    // Parallel queries for attendance, feedback, assessments
    const [attendanceResult, feedbackResult, assessmentResult] =
      await Promise.all([
        supabase
          .from("session_attendances")
          .select("session_id, child_id, present")
          .in("session_id", sessionIds),
        supabase
          .from("feedback_ratings")
          .select("rating, comment")
          .eq("centre_id", centreId)
          .not("rating", "is", null)
          .not("submitted_at", "is", null),
        supabase
          .from("skill_ratings")
          .select("child_id, ratings_json")
          .eq("term_id", termId),
      ]);

    const attendances = attendanceResult.data ?? [];
    const feedbackRatings = feedbackResult.data ?? [];
    const skillRatings = assessmentResult.data ?? [];

    // Calculate stats
    const sportsSet = new Set(sessions.map((s) => s.sport));
    const presentAttendances = attendances.filter((a) => a.present);
    const uniqueChildren = new Set(presentAttendances.map((a) => a.child_id));

    const totalHeadcount = sessions.reduce(
      (sum, s) => sum + (s.headcount ?? 0),
      0
    );

    const avgRating =
      feedbackRatings.length > 0
        ? feedbackRatings.reduce((sum, f) => sum + (f.rating ?? 0), 0) /
          feedbackRatings.length
        : undefined;

    // Coach notes (non-empty)
    const coachNotes = sessions
      .filter((s) => s.coach_notes && s.coach_notes.trim())
      .map((s) => s.coach_notes!.trim())
      .slice(0, 10);

    // Assessment summary
    const childrenAssessed = new Set(skillRatings.map((r) => r.child_id)).size;

    const content: ReportContentJson = {
      summary: `${sessions.length} sessions delivered across ${sportsSet.size} sport${sportsSet.size !== 1 ? "s" : ""} during this term.`,
      sessions_delivered: sessions.length,
      total_children: uniqueChildren.size || totalHeadcount,
      sports_covered: [...sportsSet],
      average_rating: avgRating ? Math.round(avgRating * 10) / 10 : undefined,
      highlights: [],
      coach_notes: coachNotes,
      attendance_summary: {
        total_attendances: presentAttendances.length,
        average_per_session:
          sessions.length > 0
            ? Math.round(presentAttendances.length / sessions.length)
            : 0,
      },
      assessment_summary:
        childrenAssessed > 0
          ? { children_assessed: childrenAssessed, average_improvement: 0 }
          : undefined,
      photos: [],
    };

    return { data: content, error: null };
  } catch (err) {
    console.error("compileReportData error:", err);
    return { data: null, error: "Failed to compile report data." };
  }
}

// ============================================================
// Generate (create) a new report
// ============================================================

export async function generateReport(
  input: GenerateReportInput
): Promise<{ data: CentreReport | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Get centre and term names for the title
    const [centreResult, termResult] = await Promise.all([
      supabase.from("centres").select("name").eq("id", input.centreId).single(),
      supabase.from("terms").select("name").eq("id", input.termId).single(),
    ]);

    if (!centreResult.data || !termResult.data) {
      return { data: null, error: "Centre or term not found." };
    }

    // Compile the report content
    const { data: contentJson, error: compileError } = await compileReportData(
      input.centreId,
      input.termId
    );

    if (compileError || !contentJson) {
      return { data: null, error: compileError ?? "Failed to compile data." };
    }

    const title = `${centreResult.data.name} — ${termResult.data.name} Report`;

    const { data, error } = await supabase
      .from("centre_reports")
      .insert({
        centre_id: input.centreId,
        term_id: input.termId,
        title,
        content_json: contentJson,
        generated_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      console.error("generateReport insert error:", error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    console.error("generateReport error:", err);
    return { data: null, error: "Failed to generate report." };
  }
}

// ============================================================
// Get report detail
// ============================================================

export async function getReportDetail(
  reportId: string
): Promise<{ data: ReportDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("centre_reports")
      .select(
        `
        *,
        centres!inner(name, logo_url, branding_mode, primary_contact_email),
        terms!inner(name)
      `
      )
      .eq("id", reportId)
      .single();

    if (error || !data) {
      return { data: null, error: error?.message ?? "Report not found." };
    }

    const centre = data.centres as unknown as {
      name: string;
      logo_url: string | null;
      branding_mode: string;
      primary_contact_email: string | null;
    };
    const term = data.terms as unknown as { name: string };

    const report: ReportDetail = {
      id: data.id,
      centre_id: data.centre_id,
      term_id: data.term_id,
      title: data.title,
      content_json: data.content_json as ReportContentJson,
      cover_image_url: data.cover_image_url,
      status: data.status,
      generated_by: data.generated_by,
      pdf_url: data.pdf_url,
      sent_at: data.sent_at,
      sent_to: data.sent_to,
      created_at: data.created_at,
      updated_at: data.updated_at,
      centre_name: centre.name,
      centre_logo_url: centre.logo_url,
      centre_branding_mode: centre.branding_mode,
      centre_contact_email: centre.primary_contact_email,
      term_name: term.name,
    };

    return { data: report, error: null };
  } catch (err) {
    console.error("getReportDetail error:", err);
    return { data: null, error: "Failed to load report." };
  }
}

// ============================================================
// Update report content
// ============================================================

export async function updateReportContent(
  reportId: string,
  updates: {
    title?: string;
    content_json?: ReportContentJson;
    cover_image_url?: string | null;
  }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("centre_reports")
      .update(updates)
      .eq("id", reportId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateReportContent error:", err);
    return { error: "Failed to update report." };
  }
}

// ============================================================
// List reports (with filters)
// ============================================================

export async function listReports(filters?: {
  centreId?: string;
  termId?: string;
  status?: string;
}): Promise<{ data: ReportListItem[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("centre_reports")
      .select(
        `
        id, centre_id, term_id, title, status, sent_at, created_at, updated_at,
        centres!inner(name),
        terms!inner(name)
      `
      )
      .order("created_at", { ascending: false });

    if (filters?.centreId) query = query.eq("centre_id", filters.centreId);
    if (filters?.termId) query = query.eq("term_id", filters.termId);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    const items: ReportListItem[] = (data ?? []).map((r) => {
      const centre = r.centres as unknown as { name: string };
      const term = r.terms as unknown as { name: string };
      return {
        id: r.id,
        centre_id: r.centre_id,
        centre_name: centre.name,
        term_id: r.term_id,
        term_name: term.name,
        title: r.title,
        status: r.status,
        sent_at: r.sent_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return { data: items, error: null };
  } catch (err) {
    console.error("listReports error:", err);
    return { data: [], error: "Failed to list reports." };
  }
}

// ============================================================
// Get reports for a specific centre
// ============================================================

export async function getCentreReports(
  centreId: string
): Promise<{ data: ReportListItem[]; error: string | null }> {
  return listReports({ centreId });
}

// ============================================================
// Mark report as sent
// ============================================================

export async function markReportSent(
  reportId: string,
  sentTo: string[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("centre_reports")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to: sentTo,
      })
      .eq("id", reportId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("markReportSent error:", err);
    return { error: "Failed to update report status." };
  }
}

// ============================================================
// Delete a draft report
// ============================================================

export async function deleteReport(
  reportId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Only allow deleting drafts
    const { data: report } = await supabase
      .from("centre_reports")
      .select("status")
      .eq("id", reportId)
      .single();

    if (!report) return { error: "Report not found." };
    if (report.status === "sent") return { error: "Cannot delete a sent report." };

    const { error } = await supabase
      .from("centre_reports")
      .delete()
      .eq("id", reportId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("deleteReport error:", err);
    return { error: "Failed to delete report." };
  }
}

// ============================================================
// Get available centres and terms for report generation
// ============================================================

export async function getReportGenerationOptions(): Promise<{
  centres: { id: string; name: string }[];
  terms: { id: string; name: string; status: string }[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const [centresResult, termsResult] = await Promise.all([
      supabase
        .from("centres")
        .select("id, name")
        .in("contract_status", ["active", "trial"])
        .order("name"),
      supabase
        .from("terms")
        .select("id, name, status")
        .in("status", ["active", "completed"])
        .order("start_date", { ascending: false }),
    ]);

    return {
      centres: centresResult.data ?? [],
      terms: termsResult.data ?? [],
      error: null,
    };
  } catch (err) {
    console.error("getReportGenerationOptions error:", err);
    return { centres: [], terms: [], error: "Failed to load options." };
  }
}

// ============================================================
// Upload centre logo
// ============================================================

export async function uploadCentreLogo(
  centreId: string,
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const file = formData.get("logo") as File | null;
    if (!file) return { url: null, error: "No file provided." };

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return { url: null, error: "Invalid file type. Use PNG, JPG, SVG, or WebP." };
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return { url: null, error: "File too large. Maximum 2MB." };
    }

    const ext = file.name.split(".").pop() ?? "png";
    const filePath = `centre-logos/${centreId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("Logo upload error:", uploadError);
      return { url: null, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("assets").getPublicUrl(filePath);

    // Update centre record
    const { error: updateError } = await supabase
      .from("centres")
      .update({ logo_url: publicUrl })
      .eq("id", centreId);

    if (updateError) {
      console.error("Centre logo_url update error:", updateError);
      return { url: publicUrl, error: "Logo uploaded but failed to save URL." };
    }

    return { url: publicUrl, error: null };
  } catch (err) {
    console.error("uploadCentreLogo error:", err);
    return { url: null, error: "Failed to upload logo." };
  }
}
