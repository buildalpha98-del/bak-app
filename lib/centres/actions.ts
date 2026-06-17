"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import type {
  CentreType,
  PricingModel,
  ContractStatus,
  CentreNoteCategory,
} from "@/lib/types/enums";
import type {
  Centre,
  CentreNote,
  Session,
  EquipmentKit,
} from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface CentreFilters {
  search?: string;
  type?: CentreType | "all";
  contractStatus?: ContractStatus | "all";
  pricingModel?: PricingModel | "all";
  sortBy?: "name" | "contract_status" | "created_at" | "last_activity";
}

export interface CentreListItem extends Centre {
  note_count: number;
  session_count: number;
  /** Auto-assigned by suburb; null when no region matches. */
  region_id: string | null;
  /** Latest checklist row's completed step count (null when no row exists yet). */
  onboarding_steps_completed: number | null;
  /** Latest checklist row's total step count (always 10 per current schema). */
  onboarding_steps_total: number | null;
  /** ISO timestamp of the most recent session date OR centre_note created_at. */
  last_activity_at: string | null;
}

export interface CentreNoteWithAuthor extends CentreNote {
  author_name: string;
}

export interface OutboundInvoiceSummary {
  id: string;
  centre_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  status: string;
  created_at: string;
}

export interface CentreDetail {
  centre: Centre;
  notes: CentreNoteWithAuthor[];
  sessions: (Session & { coach_name: string | null })[];
  equipment_kits: EquipmentKit[];
  outbound_invoices: OutboundInvoiceSummary[];
  /** Total sessions (mirrors `sessions.length` but precomputed for tab badges). */
  sessions_count: number;
  /** Feedback rating rows for this centre. */
  feedback_count: number;
  /** Active centre_children rows for this centre (status='active'). */
  children_count: number;
  /** centre_reports rows for this centre. */
  reports_count: number;
}

// ============================================================
// Status pulse — counts for inline pulse strip on /admin/centres
// ============================================================

export interface CentresStatusPulse {
  /** Centres flagged as churn-risk by the daily cron. */
  atRiskCount: number;
  /** Outbound invoices stamped `overdue` (covers all centres). */
  overdueInvoiceCount: number;
  /**
   * Active centres whose onboarding checklist is older than 14 days
   * AND has fewer than 5 steps completed. The 14-day grace window lets
   * us not light up on legitimately fresh checklists.
   */
  behindOnboardingCount: number;
}

export interface CoachCentreDetail {
  centre: Pick<
    Centre,
    | "id"
    | "name"
    | "type"
    | "address"
    | "primary_contact_name"
    | "primary_contact_phone"
    | "primary_contact_email"
    | "age_groups"
  >;
  notes: Pick<CentreNote, "id" | "category" | "content" | "created_at">[];
}

export interface CreateCentreData {
  name: string;
  type: CentreType;
  address?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  primary_contact_role?: string;
  group_size?: number;
  age_groups?: string[];
  pricing_model?: PricingModel;
  agreed_rate?: number;
  session_preferences?: Record<string, unknown>;
  contract_status?: ContractStatus;
  initial_note?: {
    category: CentreNoteCategory;
    content: string;
  };
}

export interface UpdateCentreData {
  name?: string;
  type?: CentreType;
  address?: string | null;
  primary_contact_name?: string | null;
  primary_contact_phone?: string | null;
  primary_contact_email?: string | null;
  primary_contact_role?: string | null;
  group_size?: number | null;
  age_groups?: string[];
  pricing_model?: PricingModel;
  agreed_rate?: number | null;
  session_preferences?: Record<string, unknown>;
  contract_status?: ContractStatus;
}

export interface AddNoteData {
  centre_id: string;
  category: CentreNoteCategory;
  content: string;
}

// ============================================================
// getCentreList
// ============================================================

export async function getCentreList(): Promise<{
  data: CentreListItem[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Pull centres + region_id (region_id was added in migration 039 but
    // isn't yet on the Centre TS interface — we select * and overlay it).
    const { data: centres, error: centresError } = await supabase
      .from("centres")
      .select("*, region_id")
      .order("name");

    if (centresError) throw centresError;
    if (!centres) return { data: [], error: null };

    // Notes — pull centre_id + created_at so we can both count rows AND
    // surface the most recent note timestamp for last-activity sort.
    const { data: noteRows, error: noteError } = await supabase
      .from("centre_notes")
      .select("centre_id, created_at");

    if (noteError) throw noteError;

    // Sessions — same shape, using `date` for the activity signal.
    const { data: sessionRows, error: sessionError } = await supabase
      .from("sessions")
      .select("centre_id, date");

    if (sessionError) throw sessionError;

    // Latest onboarding checklist per centre + step completion counts.
    // We accept any checklist row (even completed) and read the latest
    // by started_at so the badge shows "10/10" for already-finished
    // onboarding instead of disappearing into a null state.
    const { data: checklistRows, error: checklistError } = await supabase
      .from("centre_onboarding_checklists")
      .select("id, centre_id, started_at")
      .order("started_at", { ascending: false });

    if (checklistError) throw checklistError;

    const latestChecklistByCentre = new Map<string, { id: string }>();
    for (const row of checklistRows ?? []) {
      if (!latestChecklistByCentre.has(row.centre_id)) {
        latestChecklistByCentre.set(row.centre_id, { id: row.id });
      }
    }

    const checklistIds = Array.from(latestChecklistByCentre.values()).map(
      (c) => c.id
    );
    const stepsByChecklist = new Map<
      string,
      { completed: number; total: number }
    >();

    if (checklistIds.length > 0) {
      const { data: stepRows, error: stepError } = await supabase
        .from("centre_onboarding_steps")
        .select("checklist_id, status")
        .in("checklist_id", checklistIds);

      if (stepError) throw stepError;

      for (const s of stepRows ?? []) {
        const cur = stepsByChecklist.get(s.checklist_id) ?? {
          completed: 0,
          total: 0,
        };
        cur.total += 1;
        if (s.status === "completed") cur.completed += 1;
        stepsByChecklist.set(s.checklist_id, cur);
      }
    }

    const noteCountMap = new Map<string, number>();
    const lastNoteByCentre = new Map<string, string>();
    for (const n of noteRows ?? []) {
      noteCountMap.set(n.centre_id, (noteCountMap.get(n.centre_id) ?? 0) + 1);
      const prev = lastNoteByCentre.get(n.centre_id);
      if (!prev || n.created_at > prev) {
        lastNoteByCentre.set(n.centre_id, n.created_at);
      }
    }

    const sessionCountMap = new Map<string, number>();
    const lastSessionByCentre = new Map<string, string>();
    for (const s of sessionRows ?? []) {
      sessionCountMap.set(
        s.centre_id,
        (sessionCountMap.get(s.centre_id) ?? 0) + 1
      );
      const prev = lastSessionByCentre.get(s.centre_id);
      if (!prev || s.date > prev) {
        lastSessionByCentre.set(s.centre_id, s.date);
      }
    }

    const items: CentreListItem[] = centres.map((c) => {
      const checklist = latestChecklistByCentre.get(c.id);
      const stepCounts = checklist ? stepsByChecklist.get(checklist.id) : null;

      // Pick the more-recent of last_session.date vs last_note.created_at.
      // Note dates are timestamps; session dates are date-only strings.
      // ISO 8601 lexicographic compare works for both.
      const lastSession = lastSessionByCentre.get(c.id);
      const lastNote = lastNoteByCentre.get(c.id);
      const lastActivity =
        lastSession && lastNote
          ? lastSession > lastNote
            ? lastSession
            : lastNote
          : (lastSession ?? lastNote ?? null);

      return {
        ...c,
        region_id: (c.region_id as string | null) ?? null,
        note_count: noteCountMap.get(c.id) ?? 0,
        session_count: sessionCountMap.get(c.id) ?? 0,
        onboarding_steps_completed: stepCounts?.completed ?? null,
        onboarding_steps_total: stepCounts?.total ?? null,
        last_activity_at: lastActivity,
      };
    });

    return { data: items, error: null };
  } catch (err) {
    console.error("getCentreList error:", err);
    return { data: null, error: "Failed to load centres." };
  }
}

// ============================================================
// getCentreDetail
// ============================================================

export async function getCentreDetail(
  id: string
): Promise<{ data: CentreDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Centre
    const { data: centre, error: centreError } = await supabase
      .from("centres")
      .select("*")
      .eq("id", id)
      .single();

    if (centreError) throw centreError;
    if (!centre) return { data: null, error: "Centre not found." };

    // Notes with author name
    const { data: rawNotes, error: notesError } = await supabase
      .from("centre_notes")
      .select("*, profiles:created_by(name)")
      .eq("centre_id", id)
      .order("created_at", { ascending: false });

    if (notesError) throw notesError;

    const notes: CentreNoteWithAuthor[] = (rawNotes ?? []).map((n) => ({
      id: n.id,
      centre_id: n.centre_id,
      category: n.category,
      content: n.content,
      created_by: n.created_by,
      created_at: n.created_at,
      author_name: (n.profiles as unknown as { name: string } | null)?.name ?? "Unknown",
    }));

    // Sessions with coach name
    const { data: rawSessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("*, profiles:coach_id(name)")
      .eq("centre_id", id)
      .order("date", { ascending: false });

    if (sessionsError) throw sessionsError;

    const sessions = (rawSessions ?? []).map((s) => ({
      ...s,
      coach_name: (s.profiles as unknown as { name: string } | null)?.name ?? null,
    }));

    // Equipment kits at this centre
    const { data: equipmentKits, error: equipError } = await supabase
      .from("equipment_kits")
      .select("*")
      .eq("location_type", "centre")
      .eq("location_id", id);

    if (equipError) throw equipError;

    // Outbound invoices
    const { data: invoices, error: invoiceError } = await supabase
      .from("outbound_invoices")
      .select("id, centre_id, period_start, period_end, amount, status, created_at")
      .eq("centre_id", id)
      .order("period_start", { ascending: false });

    if (invoiceError) throw invoiceError;

    // Tab counts — three lightweight head-only count() queries in
    // parallel. Feedback/children/reports each power a small badge on
    // the corresponding tab trigger; doing them as `head: true` keeps
    // the round-trip cheap (no row data crosses the wire).
    const [feedbackRes, childrenRes, reportsRes] = await Promise.all([
      supabase
        .from("feedback_ratings")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", id),
      supabase
        .from("centre_children")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", id)
        .eq("status", "active"),
      supabase
        .from("centre_reports")
        .select("id", { count: "exact", head: true })
        .eq("centre_id", id),
    ]);

    return {
      data: {
        centre,
        notes,
        sessions,
        equipment_kits: equipmentKits ?? [],
        outbound_invoices: invoices ?? [],
        sessions_count: sessions.length,
        feedback_count: feedbackRes.count ?? 0,
        children_count: childrenRes.count ?? 0,
        reports_count: reportsRes.count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("getCentreDetail error:", err);
    return { data: null, error: "Failed to load centre details." };
  }
}

// ============================================================
// getCentreForCoach — limited view (no pricing/contract data)
// ============================================================

export async function getCentreForCoach(
  id: string
): Promise<{ data: CoachCentreDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: centre, error: centreError } = await supabase
      .from("centres")
      .select(
        "id, name, type, address, primary_contact_name, primary_contact_phone, primary_contact_email, age_groups"
      )
      .eq("id", id)
      .single();

    if (centreError) throw centreError;
    if (!centre) return { data: null, error: "Centre not found." };

    // Only general, access_logistics, safety notes — NO client_relationship
    const { data: notes, error: notesError } = await supabase
      .from("centre_notes")
      .select("id, category, content, created_at")
      .eq("centre_id", id)
      .in("category", ["general", "access_logistics", "safety"])
      .order("created_at", { ascending: false });

    if (notesError) throw notesError;

    return {
      data: {
        centre,
        notes: notes ?? [],
      },
      error: null,
    };
  } catch (err) {
    console.error("getCentreForCoach error:", err);
    return { data: null, error: "Failed to load centre." };
  }
}

// ============================================================
// createCentre
// ============================================================

export async function createCentre(
  data: CreateCentreData
): Promise<{ data: Centre | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { initial_note, ...centreFields } = data;

    const { data: centre, error: centreError } = await supabase
      .from("centres")
      .insert({
        name: centreFields.name,
        type: centreFields.type,
        address: centreFields.address ?? null,
        primary_contact_name: centreFields.primary_contact_name ?? null,
        primary_contact_phone: centreFields.primary_contact_phone ?? null,
        primary_contact_email: centreFields.primary_contact_email ?? null,
        primary_contact_role: centreFields.primary_contact_role ?? null,
        group_size: centreFields.group_size ?? null,
        age_groups: centreFields.age_groups ?? [],
        pricing_model: centreFields.pricing_model ?? "centre_funded",
        agreed_rate: centreFields.agreed_rate ?? null,
        session_preferences: centreFields.session_preferences ?? {},
        contract_status: centreFields.contract_status ?? "trial",
      })
      .select()
      .single();

    if (centreError) throw centreError;

    // Add initial note if provided
    if (initial_note && centre) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("centre_notes").insert({
          centre_id: centre.id,
          category: initial_note.category,
          content: initial_note.content,
          created_by: user.id,
        });
      }
    }

    return { data: centre, error: null };
  } catch (err) {
    console.error("createCentre error:", err);
    return { data: null, error: "Failed to create centre." };
  }
}

// ============================================================
// updateCentre
// ============================================================

export async function updateCentre(
  id: string,
  data: UpdateCentreData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const updatePayload: Record<string, unknown> = { ...data };

    // Track contract status changes
    if (data.contract_status) {
      updatePayload.status_changed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("centres")
      .update(updatePayload)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("updateCentre error:", err);
    return { error: "Failed to update centre." };
  }
}

// ============================================================
// archiveCentre — soft delete by setting contract_status to 'churned'
// ============================================================

export async function archiveCentre(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Check for active sessions
    const { count: activeSessions } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("centre_id", id)
      .in("status", ["confirmed", "in_progress"]);

    if (activeSessions && activeSessions > 0) {
      return {
        error: `This centre has ${activeSessions} active session${activeSessions !== 1 ? "s" : ""}. Please cancel or complete them before archiving.`,
      };
    }

    const { error } = await supabase
      .from("centres")
      .update({
        contract_status: "churned",
        status_changed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    // Activity log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "centre_archived",
      entity_type: "centre",
      entity_id: id,
    });

    return { error: null };
  } catch (err) {
    console.error("archiveCentre error:", err);
    return { error: "Failed to archive centre." };
  }
}

// ============================================================
// addCentreNote
// ============================================================

export async function addCentreNote(
  data: AddNoteData
): Promise<{ data: CentreNoteWithAuthor | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data: note, error: noteError } = await supabase
      .from("centre_notes")
      .insert({
        centre_id: data.centre_id,
        category: data.category,
        content: data.content,
        created_by: user.id,
      })
      .select()
      .single();

    if (noteError) throw noteError;

    // Get author name
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    return {
      data: {
        ...note,
        author_name: profile?.name ?? "Unknown",
      },
      error: null,
    };
  } catch (err) {
    console.error("addCentreNote error:", err);
    return { data: null, error: "Failed to add note." };
  }
}

// ============================================================
// getCentresStatusPulse — counts powering the inline pulse strip
// ============================================================
//
// Cheap counts, computed in parallel. Mirrors the home dashboard's
// `getAdminStatusPulse` shape (three head:true counts), scoped to
// centre signals: churn risk, overdue invoices, behind-onboarding.

export async function getCentresStatusPulse(): Promise<CentresStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // 14-day cutoff for "behind on onboarding" — checklists that have
    // been sitting open longer than two weeks with low progress are the
    // real risk, not fresh ones that just got created.
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoffIso = fourteenDaysAgo.toISOString();

    const [atRiskRes, overdueRes, oldChecklistsRes] = await Promise.all([
      supabase
        .from("centres")
        .select("id", { count: "exact", head: true })
        .eq("churn_risk", true)
        .neq("contract_status", "churned"),
      supabase
        .from("outbound_invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue"),
      // Pull the checklist ids older than 14 days; we'll then check
      // their step-completion count and only flag ones with <5 done.
      supabase
        .from("centre_onboarding_checklists")
        .select("id, status")
        .neq("status", "completed")
        .lt("started_at", cutoffIso),
    ]);

    let behindOnboardingCount = 0;
    const candidateIds = (oldChecklistsRes.data ?? []).map(
      (c: { id: string }) => c.id
    );

    if (candidateIds.length > 0) {
      const { data: stepRows } = await supabase
        .from("centre_onboarding_steps")
        .select("checklist_id, status")
        .in("checklist_id", candidateIds);

      const completedByChecklist = new Map<string, number>();
      for (const row of stepRows ?? []) {
        if (row.status === "completed") {
          completedByChecklist.set(
            row.checklist_id,
            (completedByChecklist.get(row.checklist_id) ?? 0) + 1
          );
        }
      }
      // A checklist counts as "behind" if it's older than the cutoff
      // AND has fewer than 5 completed steps (half the 10-step plan).
      for (const id of candidateIds) {
        if ((completedByChecklist.get(id) ?? 0) < 5) behindOnboardingCount++;
      }
    }

    return {
      atRiskCount: atRiskRes.count ?? 0,
      overdueInvoiceCount: overdueRes.count ?? 0,
      behindOnboardingCount,
    };
  } catch (err) {
    console.error("getCentresStatusPulse error:", err);
    return {
      atRiskCount: 0,
      overdueInvoiceCount: 0,
      behindOnboardingCount: 0,
    };
  }
}

// ============================================================
// bulkUpdateCentreStatus — admin/ops only; writes activity log
// ============================================================
//
// Used by the table-view bulk-action bar. Each affected centre gets
// its own activity_log row so the audit trail is granular (mirrors
// what the per-centre Edit dialog would produce). Continues on
// per-row failures so a single bad row doesn't sink the whole batch.

export async function bulkUpdateCentreStatus(
  centreIds: string[],
  status: ContractStatus
): Promise<{ updated: number; error: string | null }> {
  try {
    if (centreIds.length === 0) {
      return { updated: 0, error: "No centres selected." };
    }

    const supabase = await createSupabaseServerClient();

    // Auth: only admin/ops may bulk-update.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { updated: 0, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { updated: 0, error: "Not authorised." };
    }

    let updated = 0;
    let lastError: string | null = null;
    const nowIso = new Date().toISOString();

    for (const centreId of centreIds) {
      const { error: upErr } = await supabase
        .from("centres")
        .update({ contract_status: status, status_changed_at: nowIso })
        .eq("id", centreId);

      if (upErr) {
        console.error(
          "bulkUpdateCentreStatus per-row error:",
          centreId,
          upErr
        );
        lastError = upErr.message;
        continue;
      }

      // Activity log per centre — best-effort, don't fail the
      // whole call if logging hiccups.
      const { error: logErr } = await supabase.from("activity_log").insert({
        user_id: user.id,
        action: "centre_status_bulk_updated",
        entity_type: "centre",
        entity_id: centreId,
        metadata: { new_status: status },
      });
      if (logErr) {
        console.error("bulkUpdateCentreStatus log error:", centreId, logErr);
      }

      updated += 1;
    }

    if (updated === 0) {
      return {
        updated: 0,
        error: lastError ?? "Failed to update any centres.",
      };
    }

    return {
      updated,
      error:
        updated < centreIds.length
          ? `Updated ${updated} of ${centreIds.length}. Last error: ${lastError}`
          : null,
    };
  } catch (err) {
    console.error("bulkUpdateCentreStatus error:", err);
    return { updated: 0, error: "Failed to update centres." };
  }
}

// ============================================================
// exportCentresCsv — financial fields gated by financial_access
// ============================================================
//
// Returns the CSV string for the client to wrap in a Blob and
// download. We keep the field set small and consistent; the financial
// column (`agreed_rate`) is omitted entirely — not just blanked — when
// the viewer doesn't have financial_access, so the resulting file
// can't be re-shared with the data still embedded.

const CSV_FIELDS_BASE = [
  "id",
  "name",
  "type",
  "address",
  "primary_contact_name",
  "primary_contact_email",
  "contract_status",
  "pricing_model",
  "health_score",
  "health_status",
  "churn_risk",
] as const;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote any cell containing comma, quote, or newline — and double up
  // embedded quotes per RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportCentresCsv(
  centreIds: string[]
): Promise<{ csv: string | null; error: string | null }> {
  try {
    if (centreIds.length === 0) {
      return { csv: null, error: "No centres selected." };
    }

    const supabase = await createSupabaseServerClient();
    const hasFinancial = await getFinancialAccess();

    const fields = hasFinancial
      ? [...CSV_FIELDS_BASE, "agreed_rate"]
      : [...CSV_FIELDS_BASE];

    // Select only what we need. agreed_rate is selected only when the
    // viewer is allowed to see it.
    const selectCols = [
      "id",
      "name",
      "type",
      "address",
      "primary_contact_name",
      "primary_contact_email",
      "contract_status",
      "pricing_model",
      "health_score",
      "health_status",
      "churn_risk",
      ...(hasFinancial ? ["agreed_rate"] : []),
    ].join(", ");

    const { data: rows, error } = await supabase
      .from("centres")
      .select(selectCols)
      .in("id", centreIds)
      .order("name");

    if (error) throw error;

    const header = fields.join(",");
    const lines = (rows ?? []).map((r) =>
      fields
        .map((f) =>
          escapeCsvCell((r as unknown as Record<string, unknown>)[f])
        )
        .join(",")
    );

    return { csv: [header, ...lines].join("\n"), error: null };
  } catch (err) {
    console.error("exportCentresCsv error:", err);
    return { csv: null, error: "Failed to export centres." };
  }
}

// ============================================================
// bulkAddCentreNote — used by the "Send announcement" bulk action
// ============================================================
//
// The `announcements` table is staff-targeted (audience enum), not
// centre-targeted, so the bulk-action bar's "Send announcement" maps
// onto centre_notes instead: one row per selected centre, category
// `client_relationship`. Same UX outcome — operators record an
// outreach against each centre — but uses the schema we have.

export async function bulkAddCentreNote(
  centreIds: string[],
  content: string
): Promise<{ added: number; error: string | null }> {
  try {
    if (centreIds.length === 0) {
      return { added: 0, error: "No centres selected." };
    }
    if (!content.trim()) {
      return { added: 0, error: "Note content is required." };
    }

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { added: 0, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { added: 0, error: "Not authorised." };
    }

    const trimmed = content.trim();
    const rows = centreIds.map((cid) => ({
      centre_id: cid,
      category: "client_relationship" as const,
      content: trimmed,
      created_by: user.id,
    }));

    const { error: insErr } = await supabase
      .from("centre_notes")
      .insert(rows);

    if (insErr) throw insErr;

    return { added: centreIds.length, error: null };
  } catch (err) {
    console.error("bulkAddCentreNote error:", err);
    return { added: 0, error: "Failed to add notes." };
  }
}
