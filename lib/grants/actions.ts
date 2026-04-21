"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotificationForOps } from "@/lib/notifications/send";
import type {
  Grant,
  GrantApplication,
  GrantApplicationStatus,
  GrantInvoiceAllocation,
} from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface GrantApplicationWithCentre extends GrantApplication {
  centre_name: string;
  centre_type: "school" | "childcare_centre" | null;
  amount_remaining: number;
  grant_name: string;
}

export interface GrantOverview {
  totalApproved: number;
  totalUsed: number;
  totalRemaining: number;
  activeApplications: number;
  statusCounts: Record<GrantApplicationStatus, number>;
  upcomingExpiries: GrantApplicationWithCentre[];
  staleApplications: GrantApplicationWithCentre[];
  applicationsByCentre: Array<{
    centreId: string;
    centreName: string;
    applications: GrantApplicationWithCentre[];
    totalApproved: number;
    totalUsed: number;
  }>;
}

async function requireAdminOrOps() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated.", user: null, supabase };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "ops") {
    return { error: "Admin or ops access required.", user: null, supabase };
  }
  return { error: null, user, supabase };
}

// ============================================================
// 1. List grants
// ============================================================

export async function listGrants(): Promise<{ data: Grant[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("grants")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("listGrants error:", err);
    return { data: [], error: "Failed to load grants." };
  }
}

// ============================================================
// 2. Create grant application
// ============================================================

export async function createGrantApplication(input: {
  grantId: string;
  centreId: string;
  applicationTerm: string;
  applicationYear: number;
  amountRequested?: number;
  bakIsProvider?: boolean;
  notes?: string;
}): Promise<{ data: GrantApplication | null; error: string | null }> {
  try {
    const { error: authError, user, supabase } = await requireAdminOrOps();
    if (authError || !user) return { data: null, error: authError };

    // Verify centre exists and is a school
    const { data: centre } = await supabase
      .from("centres")
      .select("id, name, type")
      .eq("id", input.centreId)
      .single();

    if (!centre) return { data: null, error: "Centre not found." };

    // Insert application
    const { data, error } = await supabase
      .from("grant_applications")
      .insert({
        grant_id: input.grantId,
        centre_id: input.centreId,
        application_term: input.applicationTerm,
        application_year: input.applicationYear,
        amount_requested: input.amountRequested ?? null,
        bak_is_provider: input.bakIsProvider ?? true,
        notes: input.notes ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "grant_application_created",
      entity_type: "centre",
      entity_id: input.centreId,
      metadata: {
        grant_application_id: data.id,
        term: input.applicationTerm,
        year: input.applicationYear,
      },
    });

    // Create follow-up task (use admin client to bypass RLS on tasks)
    const admin = createSupabaseAdmin();
    const { data: todoCol } = await admin
      .from("task_columns")
      .select("id")
      .eq("name", "To Do")
      .single();

    if (todoCol) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      await admin.from("tasks").insert({
        title: `Submit grant application for ${centre.name}`,
        description: `Grant application for ${input.applicationTerm} ${input.applicationYear} needs to be submitted.`,
        assignee_id: user.id,
        column_id: todoCol.id,
        priority: "medium",
        source: "grant_automation",
        linked_entity_type: "grant_application",
        linked_entity_id: data.id,
        due_date: dueDate.toISOString().split("T")[0],
      });
    }

    revalidatePath("/admin/grants");
    revalidatePath(`/admin/centres/${input.centreId}`);

    return { data, error: null };
  } catch (err) {
    console.error("createGrantApplication error:", err);
    return { data: null, error: "Failed to create grant application." };
  }
}

// ============================================================
// 3. Update application status
// ============================================================

export async function updateApplicationStatus(input: {
  applicationId: string;
  status: GrantApplicationStatus;
  amountApproved?: number;
  approvedDate?: string;
  fundingStartDate?: string;
  fundingEndDate?: string;
  submittedDate?: string;
  applicationReference?: string;
  notes?: string;
}): Promise<{ error: string | null }> {
  try {
    const { error: authError, user, supabase } = await requireAdminOrOps();
    if (authError || !user) return { error: authError };

    // Get current application
    const { data: current } = await supabase
      .from("grant_applications")
      .select("*, centres(name)")
      .eq("id", input.applicationId)
      .single();

    if (!current) return { error: "Application not found." };

    const centreName = (current.centres as { name: string } | null)?.name ?? "centre";

    const updates: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };
    if (input.amountApproved != null) updates.amount_approved = input.amountApproved;
    if (input.approvedDate) updates.approved_date = input.approvedDate;
    if (input.fundingStartDate) updates.funding_start_date = input.fundingStartDate;
    if (input.fundingEndDate) updates.funding_end_date = input.fundingEndDate;
    if (input.submittedDate) updates.submitted_date = input.submittedDate;
    if (input.applicationReference) updates.application_reference = input.applicationReference;
    if (input.notes !== undefined) updates.notes = input.notes;

    // Auto-set timestamps based on status transitions
    if (input.status === "submitted" && !current.submitted_date && !input.submittedDate) {
      updates.submitted_date = new Date().toISOString().split("T")[0];
    }
    if (input.status === "approved" && !current.approved_date && !input.approvedDate) {
      updates.approved_date = new Date().toISOString().split("T")[0];
    }

    const { error } = await supabase
      .from("grant_applications")
      .update(updates)
      .eq("id", input.applicationId);

    if (error) return { error: error.message };

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "grant_status_changed",
      entity_type: "grant_application",
      entity_id: input.applicationId,
      metadata: {
        from: current.status,
        to: input.status,
        amount_approved: input.amountApproved,
      },
    });

    // Notify ops on approval
    if (input.status === "approved" || input.status === "funded") {
      await triggerNotificationForOps({
        type: "grant_approved",
        title: `Grant ${input.status} for ${centreName}`,
        body: `${centreName} grant for ${current.application_term} ${current.application_year}${input.amountApproved ? ` — $${input.amountApproved.toLocaleString()}` : ""}`,
        entityType: "grant_application",
        entityId: input.applicationId,
      });
    }

    // Create delivery task when funded
    if (input.status === "funded" && (input.fundingStartDate || current.funding_start_date)) {
      const admin = createSupabaseAdmin();
      const { data: todoCol } = await admin
        .from("task_columns")
        .select("id")
        .eq("name", "To Do")
        .single();

      const startDate = input.fundingStartDate ?? current.funding_start_date;
      if (todoCol && startDate) {
        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() - 14);
        await admin.from("tasks").insert({
          title: `Schedule programme delivery for ${centreName}`,
          description: `Grant is funded. Set up sessions before ${startDate}.`,
          assignee_id: user.id,
          column_id: todoCol.id,
          priority: "high",
          source: "grant_automation",
          linked_entity_type: "grant_application",
          linked_entity_id: input.applicationId,
          due_date: dueDate.toISOString().split("T")[0],
        });
      }
    }

    revalidatePath("/admin/grants");
    revalidatePath(`/admin/centres/${current.centre_id}`);
    return { error: null };
  } catch (err) {
    console.error("updateApplicationStatus error:", err);
    return { error: "Failed to update application." };
  }
}

// ============================================================
// 4. Allocate invoice to grant
// ============================================================

export async function allocateInvoiceToGrant(input: {
  grantApplicationId: string;
  invoiceId: string;
  amount: number;
}): Promise<{ data: GrantInvoiceAllocation | null; error: string | null }> {
  try {
    const { error: authError, user, supabase } = await requireAdminOrOps();
    if (authError || !user) return { data: null, error: authError };

    if (input.amount <= 0) return { data: null, error: "Amount must be positive." };

    // Get application
    const { data: app } = await supabase
      .from("grant_applications")
      .select("*")
      .eq("id", input.grantApplicationId)
      .single();

    if (!app) return { data: null, error: "Grant application not found." };
    if (app.status !== "funded" && app.status !== "approved") {
      return { data: null, error: "Grant must be approved or funded to allocate invoices." };
    }

    const approved = Number(app.amount_approved ?? 0);
    const used = Number(app.amount_used ?? 0);
    const remaining = approved - used;

    if (input.amount > remaining) {
      return {
        data: null,
        error: `Insufficient grant balance. Remaining: $${remaining.toFixed(2)}, requested: $${input.amount.toFixed(2)}.`,
      };
    }

    // Check invoice isn't already fully allocated to this grant
    const { data: existing } = await supabase
      .from("grant_invoice_allocations")
      .select("id")
      .eq("grant_application_id", input.grantApplicationId)
      .eq("invoice_id", input.invoiceId)
      .maybeSingle();

    if (existing) {
      return { data: null, error: "Invoice is already allocated to this grant." };
    }

    // Insert allocation
    const { data, error } = await supabase
      .from("grant_invoice_allocations")
      .insert({
        grant_application_id: input.grantApplicationId,
        invoice_id: input.invoiceId,
        amount_allocated: input.amount,
        allocated_by: user.id,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };

    // Update amount_used
    await supabase
      .from("grant_applications")
      .update({
        amount_used: used + input.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.grantApplicationId);

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "grant_invoice_allocated",
      entity_type: "grant_application",
      entity_id: input.grantApplicationId,
      metadata: {
        invoice_id: input.invoiceId,
        amount: input.amount,
      },
    });

    revalidatePath("/admin/grants");
    revalidatePath(`/admin/invoicing`);

    return { data, error: null };
  } catch (err) {
    console.error("allocateInvoiceToGrant error:", err);
    return { data: null, error: "Failed to allocate invoice." };
  }
}

// ============================================================
// 5. Remove allocation
// ============================================================

export async function removeAllocation(allocationId: string): Promise<{ error: string | null }> {
  try {
    const { error: authError, user, supabase } = await requireAdminOrOps();
    if (authError || !user) return { error: authError };

    // Get allocation
    const { data: allocation } = await supabase
      .from("grant_invoice_allocations")
      .select("*")
      .eq("id", allocationId)
      .single();

    if (!allocation) return { error: "Allocation not found." };

    // Get current app amount_used
    const { data: app } = await supabase
      .from("grant_applications")
      .select("amount_used")
      .eq("id", allocation.grant_application_id)
      .single();

    // Delete
    const { error } = await supabase
      .from("grant_invoice_allocations")
      .delete()
      .eq("id", allocationId);

    if (error) return { error: error.message };

    // Decrement amount_used
    if (app) {
      const newUsed = Math.max(0, Number(app.amount_used) - Number(allocation.amount_allocated));
      await supabase
        .from("grant_applications")
        .update({ amount_used: newUsed, updated_at: new Date().toISOString() })
        .eq("id", allocation.grant_application_id);
    }

    revalidatePath("/admin/grants");
    return { error: null };
  } catch (err) {
    console.error("removeAllocation error:", err);
    return { error: "Failed to remove allocation." };
  }
}

// ============================================================
// 6. List applications (with filters, enriched)
// ============================================================

export async function listApplications(filters?: {
  centreId?: string;
  status?: GrantApplicationStatus;
  year?: number;
}): Promise<{ data: GrantApplicationWithCentre[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from("grant_applications")
      .select("*, centres(name, type), grants(name)")
      .order("application_year", { ascending: false })
      .order("application_term", { ascending: false });

    if (filters?.centreId) query = query.eq("centre_id", filters.centreId);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.year) query = query.eq("application_year", filters.year);

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };
    if (!data) return { data: [], error: null };

    const enriched: GrantApplicationWithCentre[] = data.map((app) => {
      const centre = app.centres as { name: string; type: "school" | "childcare_centre" } | null;
      const grant = app.grants as { name: string } | null;
      const approved = Number(app.amount_approved ?? 0);
      const used = Number(app.amount_used ?? 0);
      return {
        ...app,
        centre_name: centre?.name ?? "Unknown",
        centre_type: centre?.type ?? null,
        grant_name: grant?.name ?? "Unknown grant",
        amount_remaining: approved - used,
      };
    });

    return { data: enriched, error: null };
  } catch (err) {
    console.error("listApplications error:", err);
    return { data: [], error: "Failed to load applications." };
  }
}

// ============================================================
// 7. Overview metrics for admin grants page
// ============================================================

export async function getGrantOverview(): Promise<{
  data: GrantOverview | null;
  error: string | null;
}> {
  try {
    const { data: applications, error } = await listApplications();
    if (error) return { data: null, error };

    const currentYear = new Date().getFullYear();
    const yearApps = applications.filter((a) => a.application_year === currentYear);

    let totalApproved = 0;
    let totalUsed = 0;
    const statusCounts: Record<GrantApplicationStatus, number> = {
      planning: 0, submitted: 0, approved: 0, rejected: 0, funded: 0, expired: 0,
    };
    let activeApplications = 0;

    for (const app of yearApps) {
      totalApproved += Number(app.amount_approved ?? 0);
      totalUsed += Number(app.amount_used ?? 0);
      statusCounts[app.status]++;
      if (["planning", "submitted", "approved", "funded"].includes(app.status)) {
        activeApplications++;
      }
    }

    // Upcoming expiries: funded grants with funding_end_date in next 30 days with unused funds
    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(today.getDate() + 30);

    const upcomingExpiries = applications.filter((a) => {
      if (a.status !== "funded") return false;
      if (!a.funding_end_date) return false;
      const end = new Date(a.funding_end_date);
      return end >= today && end <= thirtyDaysOut && a.amount_remaining > 0;
    });

    // Stale: planning status for 14+ days
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    const staleApplications = applications.filter((a) => {
      if (a.status !== "planning") return false;
      const created = new Date(a.created_at);
      return created < fourteenDaysAgo;
    });

    // Group by centre
    const byCentre: Record<string, {
      centreId: string;
      centreName: string;
      applications: GrantApplicationWithCentre[];
      totalApproved: number;
      totalUsed: number;
    }> = {};
    for (const app of applications) {
      if (!byCentre[app.centre_id]) {
        byCentre[app.centre_id] = {
          centreId: app.centre_id,
          centreName: app.centre_name,
          applications: [],
          totalApproved: 0,
          totalUsed: 0,
        };
      }
      byCentre[app.centre_id].applications.push(app);
      byCentre[app.centre_id].totalApproved += Number(app.amount_approved ?? 0);
      byCentre[app.centre_id].totalUsed += Number(app.amount_used ?? 0);
    }

    return {
      data: {
        totalApproved,
        totalUsed,
        totalRemaining: totalApproved - totalUsed,
        activeApplications,
        statusCounts,
        upcomingExpiries,
        staleApplications,
        applicationsByCentre: Object.values(byCentre).sort((a, b) =>
          b.totalApproved - a.totalApproved
        ),
      },
      error: null,
    };
  } catch (err) {
    console.error("getGrantOverview error:", err);
    return { data: null, error: "Failed to load grant overview." };
  }
}

// ============================================================
// 8. Get grants for a specific centre
// ============================================================

export async function getGrantsForCentre(centreId: string): Promise<{
  data: GrantApplicationWithCentre[];
  error: string | null;
}> {
  return listApplications({ centreId });
}

// ============================================================
// 9. Get active (approved/funded) grants for a centre — for invoice allocation
// ============================================================

export async function getActiveGrantsForCentre(centreId: string): Promise<{
  data: GrantApplicationWithCentre[];
  error: string | null;
}> {
  try {
    const { data: apps, error } = await listApplications({ centreId });
    if (error) return { data: [], error };

    const active = apps.filter(
      (a) => (a.status === "approved" || a.status === "funded") && a.amount_remaining > 0
    );

    return { data: active, error: null };
  } catch (err) {
    console.error("getActiveGrantsForCentre error:", err);
    return { data: [], error: "Failed to load active grants." };
  }
}

// ============================================================
// 10. Get allocations for an invoice
// ============================================================

export async function getAllocationsForInvoice(invoiceId: string): Promise<{
  data: Array<GrantInvoiceAllocation & { grant_application_term: string; grant_application_year: number }>;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("grant_invoice_allocations")
      .select("*, grant_applications(application_term, application_year)")
      .eq("invoice_id", invoiceId);

    if (error) return { data: [], error: error.message };
    if (!data) return { data: [], error: null };

    const enriched = data.map((a) => {
      const app = a.grant_applications as { application_term: string; application_year: number } | null;
      return {
        ...a,
        grant_application_term: app?.application_term ?? "Unknown",
        grant_application_year: app?.application_year ?? 0,
      };
    });

    return { data: enriched, error: null };
  } catch (err) {
    console.error("getAllocationsForInvoice error:", err);
    return { data: [], error: "Failed to load allocations." };
  }
}
