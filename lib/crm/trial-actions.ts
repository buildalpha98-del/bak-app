"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Trial Performance Data
// ============================================================

export interface TrialPerformance {
  sessions: {
    id: string;
    date: string;
    sport: string;
    coach_name: string | null;
    headcount: number | null;
    status: string;
    coach_notes: string | null;
  }[];
  totalSessions: number;
  completedSessions: number;
  totalAttendance: number;
  averageAttendance: number;
  sportsCovered: string[];
  averageRating: number | null;
  feedbackEntries: {
    rating: number;
    comment: string | null;
    session_date: string;
  }[];
}

export async function getTrialPerformance(
  leadId: string
): Promise<{ data: TrialPerformance | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get the lead to find centre link
    const { data: lead } = await supabase
      .from("leads")
      .select("centre_id, centre_name, trial_start_date, trial_end_date")
      .eq("id", leadId)
      .single();

    if (!lead) return { data: null, error: "Lead not found." };

    // Find trial sessions — either via centre_id or via is_trial + centre_name match
    let sessionsQuery = supabase
      .from("sessions")
      .select("id, date, sport, coach_id, headcount, status, coach_notes, profiles!sessions_coach_id_fkey(name)")
      .eq("is_trial", true)
      .order("date", { ascending: true });

    if (lead.centre_id) {
      sessionsQuery = sessionsQuery.eq("centre_id", lead.centre_id);
    }

    if (lead.trial_start_date) {
      sessionsQuery = sessionsQuery.gte("date", lead.trial_start_date);
    }
    if (lead.trial_end_date) {
      sessionsQuery = sessionsQuery.lte("date", lead.trial_end_date);
    }

    const { data: sessions } = await sessionsQuery;

    const sessionList = (sessions ?? []).map((s) => {
      const coach = s.profiles as unknown as { name: string } | null;
      return {
        id: s.id,
        date: s.date,
        sport: s.sport,
        coach_name: coach?.name ?? null,
        headcount: s.headcount,
        status: s.status,
        coach_notes: s.coach_notes,
      };
    });

    const completedSessions = sessionList.filter((s) => s.status === "completed");
    const totalAttendance = completedSessions.reduce((sum, s) => sum + (s.headcount ?? 0), 0);
    const sportsCovered = [...new Set(sessionList.map((s) => s.sport))];

    // Get feedback ratings for these sessions
    const sessionIds = sessionList.map((s) => s.id);
    let feedbackEntries: TrialPerformance["feedbackEntries"] = [];
    let averageRating: number | null = null;

    if (sessionIds.length > 0) {
      const { data: feedback } = await supabase
        .from("feedback_ratings")
        .select("rating, comment, session_id")
        .in("session_id", sessionIds);

      if (feedback && feedback.length > 0) {
        const sessionDateMap = new Map(sessionList.map((s) => [s.id, s.date]));
        feedbackEntries = feedback.map((f) => ({
          rating: f.rating,
          comment: f.comment,
          session_date: sessionDateMap.get(f.session_id) ?? "",
        }));
        averageRating = feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length;
      }
    }

    return {
      data: {
        sessions: sessionList,
        totalSessions: sessionList.length,
        completedSessions: completedSessions.length,
        totalAttendance,
        averageAttendance: completedSessions.length > 0
          ? Math.round(totalAttendance / completedSessions.length)
          : 0,
        sportsCovered,
        averageRating: averageRating ? Math.round(averageRating * 10) / 10 : null,
        feedbackEntries,
      },
      error: null,
    };
  } catch (err) {
    console.error("getTrialPerformance error:", err);
    return { data: null, error: "Failed to load trial performance." };
  }
}

// ============================================================
// Start Trial — create trial centre + update lead
// ============================================================

export async function startTrial(
  leadId: string,
  trialStart: string,
  trialEnd: string
): Promise<{ centreId: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lead } = await supabase
      .from("leads")
      .select("centre_name, type, address, contact_name, contact_email, contact_phone, centre_id")
      .eq("id", leadId)
      .single();

    if (!lead) return { centreId: null, error: "Lead not found." };

    let centreId = lead.centre_id;

    // Create trial centre if none linked
    if (!centreId) {
      const { data: centre, error: centreErr } = await supabase
        .from("centres")
        .insert({
          name: lead.centre_name,
          type: lead.type ?? "childcare_centre",
          address: lead.address,
          primary_contact_name: lead.contact_name,
          primary_contact_email: lead.contact_email,
          primary_contact_phone: lead.contact_phone,
          contract_status: "trial",
          converted_from_lead_id: leadId,
        })
        .select("id")
        .single();

      if (centreErr || !centre) return { centreId: null, error: centreErr?.message ?? "Failed to create trial centre." };
      centreId = centre.id;
    } else {
      // Update existing centre to trial status
      await supabase
        .from("centres")
        .update({ contract_status: "trial" })
        .eq("id", centreId);
    }

    // Update lead
    await supabase
      .from("leads")
      .update({
        trial_start_date: trialStart,
        trial_end_date: trialEnd,
        centre_id: centreId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Create activity
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      type: "system",
      content: `Trial started: ${trialStart} to ${trialEnd}`,
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");

    return { centreId, error: null };
  } catch (err) {
    console.error("startTrial error:", err);
    return { centreId: null, error: "Failed to start trial." };
  }
}

// ============================================================
// Convert Lead to Centre (Won stage handoff)
// ============================================================

export async function convertLeadToCentre(
  leadId: string
): Promise<{ centreId: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (!lead) return { centreId: null, error: "Lead not found." };

    let centreId = lead.centre_id;

    if (centreId) {
      // Upgrade existing trial centre to active
      await supabase
        .from("centres")
        .update({
          contract_status: "active",
          profile_checklist_complete: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", centreId);
    } else {
      // Create new active centre
      const { data: centre, error: centreErr } = await supabase
        .from("centres")
        .insert({
          name: lead.centre_name,
          type: lead.type ?? "childcare_centre",
          address: lead.address,
          primary_contact_name: lead.contact_name,
          primary_contact_email: lead.contact_email,
          primary_contact_phone: lead.contact_phone,
          contract_status: "active",
          profile_checklist_complete: false,
          converted_from_lead_id: leadId,
        })
        .select("id")
        .single();

      if (centreErr || !centre) return { centreId: null, error: centreErr?.message ?? "Failed to create centre." };
      centreId = centre.id;
    }

    // Link lead to centre
    await supabase
      .from("leads")
      .update({ centre_id: centreId, updated_at: new Date().toISOString() })
      .eq("id", leadId);

    // Copy lead notes to centre notes
    const { data: activities } = await supabase
      .from("lead_activities")
      .select("content, type")
      .eq("lead_id", leadId)
      .in("type", ["note", "call", "meeting"])
      .order("created_at", { ascending: true });

    if (activities && activities.length > 0) {
      const notesContent = activities
        .map((a) => `[${a.type.toUpperCase()}] ${a.content}`)
        .join("\n\n");

      await supabase.from("centre_notes").insert({
        centre_id: centreId,
        category: "client_relationship",
        content: `Notes from CRM pipeline:\n\n${notesContent}`,
        created_by: user?.id ?? "00000000-0000-0000-0000-000000000000",
      });
    }

    // Create activity
    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      type: "system",
      content: `Converted to active centre. Centre ID: ${centreId}`,
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");
    revalidatePath("/ops/crm");
    revalidatePath(`/admin/centres/${centreId}`);
    revalidatePath(`/ops/centres/${centreId}`);

    return { centreId, error: null };
  } catch (err) {
    console.error("convertLeadToCentre error:", err);
    return { centreId: null, error: "Failed to convert lead." };
  }
}

// ============================================================
// Get centre profile completion checklist
// ============================================================

export interface ProfileChecklist {
  pricingModelSet: boolean;
  agreedRateSet: boolean;
  sessionPreferencesSet: boolean;
  operationalNotesAdded: boolean;
  isComplete: boolean;
}

export async function getCentreProfileChecklist(
  centreId: string
): Promise<{ data: ProfileChecklist | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: centre } = await supabase
      .from("centres")
      .select("pricing_model, agreed_rate, session_preferences, profile_checklist_complete")
      .eq("id", centreId)
      .single();

    if (!centre) return { data: null, error: "Centre not found." };

    const { data: notes } = await supabase
      .from("centre_notes")
      .select("id")
      .eq("centre_id", centreId)
      .in("category", ["access_logistics", "general"])
      .limit(1);

    const prefs = centre.session_preferences as Record<string, unknown> | null;
    const hasPrefs = prefs && Object.keys(prefs).length > 0;

    const checklist: ProfileChecklist = {
      pricingModelSet: !!centre.pricing_model,
      agreedRateSet: centre.agreed_rate != null && centre.agreed_rate > 0,
      sessionPreferencesSet: !!hasPrefs,
      operationalNotesAdded: (notes ?? []).length > 0,
      isComplete: false,
    };

    checklist.isComplete =
      checklist.pricingModelSet &&
      checklist.agreedRateSet &&
      checklist.sessionPreferencesSet &&
      checklist.operationalNotesAdded;

    // Update completion status if changed
    if (checklist.isComplete !== centre.profile_checklist_complete) {
      await supabase
        .from("centres")
        .update({ profile_checklist_complete: checklist.isComplete })
        .eq("id", centreId);
    }

    return { data: checklist, error: null };
  } catch (err) {
    console.error("getCentreProfileChecklist error:", err);
    return { data: null, error: "Failed to load checklist." };
  }
}

// ============================================================
// Create churned centre as lead
// ============================================================

export async function createChurnedLead(
  centreId: string,
  churnReason: string
): Promise<{ leadId: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: centre } = await supabase
      .from("centres")
      .select("name, type, address, primary_contact_name, primary_contact_email, primary_contact_phone")
      .eq("id", centreId)
      .single();

    if (!centre) return { leadId: null, error: "Centre not found." };

    // Check for existing churned lead for this centre
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("centre_id", centreId)
      .eq("stage", "churned")
      .limit(1);

    if (existing && existing.length > 0) {
      return { leadId: existing[0].id, error: null };
    }

    const { data: lead, error: insertErr } = await supabase
      .from("leads")
      .insert({
        centre_name: centre.name,
        type: centre.type,
        contact_name: centre.primary_contact_name,
        contact_email: centre.primary_contact_email,
        contact_phone: centre.primary_contact_phone,
        address: centre.address,
        source: "manual",
        stage: "churned",
        churn_reason: churnReason,
        centre_id: centreId,
        owner_id: user?.id ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !lead) return { leadId: null, error: insertErr?.message ?? "Failed to create lead." };

    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      type: "system",
      content: `Centre churned. Reason: ${churnReason}. Entered re-engagement pipeline.`,
      created_by: user?.id ?? null,
    });

    revalidatePath("/admin/crm");

    return { leadId: lead.id, error: null };
  } catch (err) {
    console.error("createChurnedLead error:", err);
    return { leadId: null, error: "Failed to create churned lead." };
  }
}

// ============================================================
// Get lead stage duration analytics
// ============================================================

export interface LeadAnalytics {
  daysInCurrentStage: number;
  totalDaysSinceCreated: number;
  stageHistory: { stage: string; enteredAt: string; durationDays: number }[];
  trialConversionRate: number | null;
}

export async function getLeadAnalytics(
  leadId: string
): Promise<{ data: LeadAnalytics | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: lead } = await supabase
      .from("leads")
      .select("stage, stage_changed_at, created_at")
      .eq("id", leadId)
      .single();

    if (!lead) return { data: null, error: "Lead not found." };

    // Get stage change activities for history
    const { data: stageChanges } = await supabase
      .from("lead_activities")
      .select("metadata, created_at")
      .eq("lead_id", leadId)
      .eq("type", "stage_change")
      .order("created_at", { ascending: true });

    const now = new Date();
    const stageHistory: LeadAnalytics["stageHistory"] = [];

    if (stageChanges && stageChanges.length > 0) {
      for (let i = 0; i < stageChanges.length; i++) {
        const meta = stageChanges[i].metadata as Record<string, string> | null;
        const enteredAt = stageChanges[i].created_at;
        const nextChange = stageChanges[i + 1]?.created_at ?? now.toISOString();
        const duration = Math.floor(
          (new Date(nextChange).getTime() - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        stageHistory.push({
          stage: meta?.to ?? "unknown",
          enteredAt,
          durationDays: duration,
        });
      }
    }

    const daysInCurrentStage = Math.floor(
      (now.getTime() - new Date(lead.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const totalDaysSinceCreated = Math.floor(
      (now.getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Trial conversion rate (global)
    const { data: trialLeads } = await supabase
      .from("lead_activities")
      .select("lead_id, metadata")
      .eq("type", "stage_change")
      .filter("metadata->>to", "eq", "free_trial");

    let trialConversionRate: number | null = null;
    if (trialLeads && trialLeads.length > 0) {
      const trialLeadIds = [...new Set(trialLeads.map((t) => t.lead_id))];

      const { data: wonLeads } = await supabase
        .from("leads")
        .select("id")
        .in("id", trialLeadIds)
        .eq("stage", "won");

      trialConversionRate = trialLeadIds.length > 0
        ? Math.round(((wonLeads?.length ?? 0) / trialLeadIds.length) * 100)
        : null;
    }

    return {
      data: {
        daysInCurrentStage,
        totalDaysSinceCreated,
        stageHistory,
        trialConversionRate,
      },
      error: null,
    };
  } catch (err) {
    console.error("getLeadAnalytics error:", err);
    return { data: null, error: "Failed to load analytics." };
  }
}
