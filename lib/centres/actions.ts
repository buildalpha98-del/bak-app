"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  sortBy?: "name" | "contract_status" | "created_at";
}

export interface CentreListItem extends Centre {
  note_count: number;
  session_count: number;
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

    const { data: centres, error: centresError } = await supabase
      .from("centres")
      .select("*")
      .order("name");

    if (centresError) throw centresError;
    if (!centres) return { data: [], error: null };

    // Get note counts
    const { data: noteCounts, error: noteError } = await supabase
      .from("centre_notes")
      .select("centre_id");

    if (noteError) throw noteError;

    // Get session counts
    const { data: sessionCounts, error: sessionError } = await supabase
      .from("sessions")
      .select("centre_id");

    if (sessionError) throw sessionError;

    const noteCountMap = new Map<string, number>();
    for (const n of noteCounts ?? []) {
      noteCountMap.set(n.centre_id, (noteCountMap.get(n.centre_id) ?? 0) + 1);
    }

    const sessionCountMap = new Map<string, number>();
    for (const s of sessionCounts ?? []) {
      sessionCountMap.set(
        s.centre_id,
        (sessionCountMap.get(s.centre_id) ?? 0) + 1
      );
    }

    const items: CentreListItem[] = centres.map((c) => ({
      ...c,
      note_count: noteCountMap.get(c.id) ?? 0,
      session_count: sessionCountMap.get(c.id) ?? 0,
    }));

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

    return {
      data: {
        centre,
        notes,
        sessions,
        equipment_kits: equipmentKits ?? [],
        outbound_invoices: invoices ?? [],
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
