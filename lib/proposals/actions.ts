"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import type { SalesProposal } from "@/lib/types/database";
import type { ProposalStatus } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface ProposalContext {
  lead: {
    id: string;
    centre_name: string;
    contact_name: string | null;
    contact_email: string | null;
    type: string | null;
    address: string | null;
    stage: string;
    estimated_value: number | null;
    notes: string | null;
    trial_sessions_count: number;
    trial_start_date: string | null;
    trial_end_date: string | null;
  };
  nearbyCentres: {
    name: string;
    suburb: string | null;
    status: string;
    sessionCount: number;
    avgRating: number | null;
  }[];
  businessStats: {
    totalCentres: number;
    totalSessions: number;
    averageRating: number;
    sportsOffered: string[];
  };
  trialData: {
    sessions: { date: string; sport: string }[];
    feedbackAvg: number | null;
    feedbackCount: number;
  } | null;
}

export interface ProposalContentJson {
  executive_summary: string;
  about_bak: string;
  service_offering: string;
  local_impact: string;
  trial_results: string | null;
  pricing: {
    model: string;
    rate: string;
    details: string;
  };
  next_steps: string;
  testimonial_quotes: string[];
  is_template?: boolean;
}

// ============================================================
// getProposalContext — assembles context for AI generation
// ============================================================

export async function getProposalContext(
  leadId: string
): Promise<{ data: ProposalContext | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return { data: null, error: leadError?.message ?? "Lead not found" };
    }

    // Fetch nearby centres (all active centres for context)
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name, address, contract_status")
      .eq("contract_status", "active")
      .limit(20);

    // Get session counts and ratings for nearby centres
    const nearbyCentres: ProposalContext["nearbyCentres"] = [];
    if (centres && centres.length > 0) {
      for (const centre of centres.slice(0, 10)) {
        const { count: sessionCount } = await supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("centre_id", centre.id);

        const { data: ratings } = await supabase
          .from("feedback_ratings")
          .select("rating")
          .eq("centre_id", centre.id);

        const avgRating =
          ratings && ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
            : null;

        nearbyCentres.push({
          name: centre.name,
          suburb: centre.address ?? null,
          status: centre.contract_status,
          sessionCount: sessionCount ?? 0,
          avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        });
      }
    }

    // Business stats
    const { count: totalCentres } = await supabase
      .from("centres")
      .select("*", { count: "exact", head: true })
      .eq("contract_status", "active");

    const { count: totalSessions } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    const { data: allRatings } = await supabase
      .from("feedback_ratings")
      .select("rating");

    const averageRating =
      allRatings && allRatings.length > 0
        ? Math.round(
            (allRatings.reduce((sum, r) => sum + r.rating, 0) /
              allRatings.length) *
              10
          ) / 10
        : 0;

    // Get distinct sports
    const { data: sportSessions } = await supabase
      .from("sessions")
      .select("sport")
      .not("sport", "is", null);

    const sportsOffered = [
      ...new Set(
        (sportSessions ?? []).map((s) => s.sport).filter(Boolean) as string[]
      ),
    ];

    // Trial data if lead has trial dates
    let trialData: ProposalContext["trialData"] = null;
    if (lead.centre_id && lead.trial_start_date) {
      const { data: trialSessions } = await supabase
        .from("sessions")
        .select("date, sport")
        .eq("centre_id", lead.centre_id)
        .gte("date", lead.trial_start_date)
        .lte("date", lead.trial_end_date ?? new Date().toISOString())
        .order("date");

      const { data: trialFeedback } = await supabase
        .from("feedback_ratings")
        .select("rating")
        .eq("centre_id", lead.centre_id);

      const feedbackAvg =
        trialFeedback && trialFeedback.length > 0
          ? Math.round(
              (trialFeedback.reduce((sum, r) => sum + r.rating, 0) /
                trialFeedback.length) *
                10
            ) / 10
          : null;

      trialData = {
        sessions: (trialSessions ?? []).map((s) => ({
          date: s.date,
          sport: s.sport,
        })),
        feedbackAvg,
        feedbackCount: trialFeedback?.length ?? 0,
      };
    }

    return {
      data: {
        lead: {
          id: lead.id,
          centre_name: lead.centre_name,
          contact_name: lead.contact_name,
          contact_email: lead.contact_email,
          type: lead.type,
          address: lead.address,
          stage: lead.stage,
          estimated_value: lead.estimated_value,
          notes: lead.notes,
          trial_sessions_count: lead.trial_sessions_count,
          trial_start_date: lead.trial_start_date,
          trial_end_date: lead.trial_end_date,
        },
        nearbyCentres,
        businessStats: {
          totalCentres: totalCentres ?? 0,
          totalSessions: totalSessions ?? 0,
          averageRating,
          sportsOffered,
        },
        trialData,
      },
      error: null,
    };
  } catch (err) {
    console.error("getProposalContext error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// saveProposal — creates a new sales_proposals record
// ============================================================

export async function saveProposal(
  leadId: string,
  title: string,
  contentJson: ProposalContentJson,
  createdBy: string
): Promise<{ data: SalesProposal | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sales_proposals")
      .insert({
        lead_id: leadId,
        title,
        content_json: contentJson,
        status: "draft" as ProposalStatus,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    revalidatePath(`/admin/crm/${leadId}/proposal`);
    return { data: data as SalesProposal, error: null };
  } catch (err) {
    console.error("saveProposal error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// updateProposal — updates content_json, status, pdf_url
// ============================================================

export async function updateProposal(
  proposalId: string,
  updates: {
    content_json?: ProposalContentJson;
    status?: ProposalStatus;
    pdf_url?: string;
  }
): Promise<{ data: SalesProposal | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sales_proposals")
      .update(updates)
      .eq("id", proposalId)
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    revalidatePath(`/admin/crm/${data.lead_id}/proposal`);
    return { data: data as SalesProposal, error: null };
  } catch (err) {
    console.error("updateProposal error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// getProposals — list proposals for a lead
// ============================================================

export async function getProposals(
  leadId: string
): Promise<{ data: SalesProposal[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sales_proposals")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    return { data: (data ?? []) as SalesProposal[], error: null };
  } catch (err) {
    console.error("getProposals error:", err);
    return {
      data: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// getProposal — single proposal with lead data
// ============================================================

export async function getProposal(
  proposalId: string
): Promise<{
  data: (SalesProposal & { lead_name: string; lead_email: string | null }) | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("sales_proposals")
      .select("*, leads(centre_name, contact_email)")
      .eq("id", proposalId)
      .single();

    if (error || !data) {
      return { data: null, error: error?.message ?? "Proposal not found" };
    }

    const lead = data.leads as unknown as {
      centre_name: string;
      contact_email: string | null;
    } | null;

    return {
      data: {
        ...data,
        lead_name: lead?.centre_name ?? "Unknown",
        lead_email: lead?.contact_email ?? null,
        leads: undefined,
      } as SalesProposal & { lead_name: string; lead_email: string | null },
      error: null,
    };
  } catch (err) {
    console.error("getProposal error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// sendProposal — sends email, updates status to 'sent', logs activity
// ============================================================

export async function sendProposal(
  proposalId: string
): Promise<{ data: SalesProposal | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch proposal with lead
    const { data: proposal, error: fetchError } = await supabase
      .from("sales_proposals")
      .select("*, leads(centre_name, contact_name, contact_email)")
      .eq("id", proposalId)
      .single();

    if (fetchError || !proposal) {
      return {
        data: null,
        error: fetchError?.message ?? "Proposal not found",
      };
    }

    const lead = proposal.leads as unknown as {
      centre_name: string;
      contact_name: string | null;
      contact_email: string | null;
    } | null;

    if (!lead?.contact_email) {
      return { data: null, error: "Lead has no contact email address" };
    }

    const content = proposal.content_json as ProposalContentJson;

    // Build email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #E8712A; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Build Alpha Kids</h1>
        </div>
        <div style="padding: 24px; background: #ffffff;">
          <p>Hi ${lead.contact_name ?? "there"},</p>
          <p>Thank you for your interest in Build Alpha Kids. Please find our tailored proposal for ${lead.centre_name} below.</p>
          <h2 style="color: #E8712A; font-size: 18px;">Executive Summary</h2>
          <p>${content.executive_summary}</p>
          <h2 style="color: #E8712A; font-size: 18px;">About Build Alpha Kids</h2>
          <p>${content.about_bak}</p>
          <h2 style="color: #E8712A; font-size: 18px;">Service Offering</h2>
          <p>${content.service_offering}</p>
          <h2 style="color: #E8712A; font-size: 18px;">Local Impact</h2>
          <p>${content.local_impact}</p>
          ${
            content.trial_results
              ? `<h2 style="color: #E8712A; font-size: 18px;">Trial Results</h2><p>${content.trial_results}</p>`
              : ""
          }
          <h2 style="color: #E8712A; font-size: 18px;">Pricing</h2>
          <p><strong>${content.pricing.model}</strong> — ${content.pricing.rate}</p>
          <p>${content.pricing.details}</p>
          <h2 style="color: #E8712A; font-size: 18px;">Next Steps</h2>
          <p>${content.next_steps}</p>
          ${
            content.testimonial_quotes.length > 0
              ? `<h2 style="color: #E8712A; font-size: 18px;">What Centres Say</h2>
                 ${content.testimonial_quotes.map((q) => `<blockquote style="border-left: 3px solid #E8712A; padding-left: 12px; color: #666666; font-style: italic;">"${q}"</blockquote>`).join("")}`
              : ""
          }
        </div>
        <div style="padding: 16px; background: #f5f5f5; text-align: center; color: #666666; font-size: 12px;">
          <p>Build Alpha Kids | Multi-Sport Programs for Children</p>
        </div>
      </div>
    `;

    // Send email
    const emailResult = await sendEmail(
      lead.contact_email,
      `Proposal for ${lead.centre_name} — Build Alpha Kids`,
      emailHtml
    );

    if (!emailResult.success) {
      return { data: null, error: `Failed to send email: ${emailResult.error}` };
    }

    // Update proposal status
    const { data: updated, error: updateError } = await supabase
      .from("sales_proposals")
      .update({
        status: "sent" as ProposalStatus,
        sent_at: new Date().toISOString(),
      })
      .eq("id", proposalId)
      .select()
      .single();

    if (updateError) {
      return { data: null, error: updateError.message };
    }

    // Log lead activity
    const { data: authData } = await supabase.auth.getUser();
    await supabase.from("lead_activities").insert({
      lead_id: proposal.lead_id,
      type: "email_sent",
      content: `Sales proposal sent: ${proposal.title}`,
      metadata: { proposal_id: proposalId },
      created_by: authData?.user?.id ?? null,
    });

    revalidatePath(`/admin/crm/${proposal.lead_id}/proposal`);
    revalidatePath(`/admin/crm/${proposal.lead_id}`);
    return { data: updated as SalesProposal, error: null };
  } catch (err) {
    console.error("sendProposal error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// getProposalTemplates — list proposals marked as templates
// ============================================================

export async function getProposalTemplates(): Promise<{
  data: SalesProposal[];
  error: string | null;
}> {
  try {
    const admin = createSupabaseAdmin();

    const { data, error } = await admin
      .from("sales_proposals")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };

    // Filter templates by is_template flag in content_json
    const templates = (data ?? []).filter(
      (p) =>
        p.content_json &&
        typeof p.content_json === "object" &&
        (p.content_json as Record<string, unknown>).is_template === true
    );

    return { data: templates as SalesProposal[], error: null };
  } catch (err) {
    console.error("getProposalTemplates error:", err);
    return {
      data: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// saveAsTemplate — mark a proposal as template
// ============================================================

export async function saveAsTemplate(
  proposalId: string
): Promise<{ data: SalesProposal | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get current proposal
    const { data: proposal, error: fetchError } = await supabase
      .from("sales_proposals")
      .select("*")
      .eq("id", proposalId)
      .single();

    if (fetchError || !proposal) {
      return {
        data: null,
        error: fetchError?.message ?? "Proposal not found",
      };
    }

    const contentJson = {
      ...(proposal.content_json as Record<string, unknown>),
      is_template: true,
    };

    const { data: updated, error: updateError } = await supabase
      .from("sales_proposals")
      .update({ content_json: contentJson })
      .eq("id", proposalId)
      .select()
      .single();

    if (updateError) return { data: null, error: updateError.message };

    revalidatePath("/admin/crm/proposal-templates");
    return { data: updated as SalesProposal, error: null };
  } catch (err) {
    console.error("saveAsTemplate error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ============================================================
// removeTemplate — unmark a proposal as template
// ============================================================

export async function removeTemplate(
  proposalId: string
): Promise<{ data: SalesProposal | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: proposal, error: fetchError } = await supabase
      .from("sales_proposals")
      .select("*")
      .eq("id", proposalId)
      .single();

    if (fetchError || !proposal) {
      return {
        data: null,
        error: fetchError?.message ?? "Proposal not found",
      };
    }

    const contentJson = {
      ...(proposal.content_json as Record<string, unknown>),
    };
    delete contentJson.is_template;

    const { data: updated, error: updateError } = await supabase
      .from("sales_proposals")
      .update({ content_json: contentJson })
      .eq("id", proposalId)
      .select()
      .single();

    if (updateError) return { data: null, error: updateError.message };

    revalidatePath("/admin/crm/proposal-templates");
    return { data: updated as SalesProposal, error: null };
  } catch (err) {
    console.error("removeTemplate error:", err);
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
