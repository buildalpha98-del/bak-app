"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { staffOnboarding } from "@/lib/launch/email-templates";
import type { UserRole, UserStatus, ComplianceDocType, ComplianceStatus, RateUnit, SessionType } from "@/lib/types/enums";
import type { Profile, PayRate, ComplianceDoc, AvailabilitySlot, Session } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface StaffFilters {
  search?: string;
  role?: UserRole | "all";
  status?: UserStatus | "all";
}

export interface StaffListItem extends Profile {
  compliance_summary: {
    total: number;
    verified: number;
    expired: number;
    pending: number;
  };
}

export interface StaffDetail {
  profile: Profile;
  pay_rates: PayRate[];
  compliance_docs: ComplianceDoc[];
  availability_slots: AvailabilitySlot[];
}

export interface CreateStaffData {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  default_pay_rate?: number;
}

export interface UpdateStaffData {
  name?: string;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  abn?: string | null;
  default_pay_rate?: number | null;
  role?: UserRole;
}

export interface UpsertPayRateData {
  id?: string;
  user_id: string;
  session_type: SessionType;
  rate: number;
  rate_unit: RateUnit;
  effective_from: string;
}

export interface UpsertComplianceDocData {
  id?: string;
  user_id: string;
  doc_type: ComplianceDocType;
  doc_number?: string;
  expiry_date?: string;
  notes?: string;
}

export interface UpsertAvailabilityData {
  id?: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_preferences?: string[];
}

export interface RateCardEntry {
  coach_id: string;
  coach_name: string;
  rates: Record<string, { rate: number; rate_unit: RateUnit } | null>;
}

// ============================================================
// Staff list
// ============================================================

export async function getStaffList(
  filters?: StaffFilters
): Promise<{ data: StaffListItem[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("profiles").select("*").order("name");

  if (filters?.role && filters.role !== "all") {
    query = query.eq("role", filters.role);
  }
  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
    );
  }

  const { data: profiles, error } = await query;
  if (error) return { data: null, error: error.message };
  if (!profiles) return { data: [], error: null };

  // Fetch compliance summaries for all users in one query
  const userIds = profiles.map((p) => p.id);
  const { data: docs } = await supabase
    .from("compliance_docs")
    .select("user_id, status")
    .in("user_id", userIds);

  const complianceMap = new Map<
    string,
    { total: number; verified: number; expired: number; pending: number }
  >();

  for (const doc of docs ?? []) {
    const existing = complianceMap.get(doc.user_id) ?? {
      total: 0,
      verified: 0,
      expired: 0,
      pending: 0,
    };
    existing.total++;
    if (doc.status === "verified") existing.verified++;
    else if (doc.status === "expired") existing.expired++;
    else if (doc.status === "pending") existing.pending++;
    complianceMap.set(doc.user_id, existing);
  }

  const data: StaffListItem[] = profiles.map((p) => ({
    ...p,
    compliance_summary: complianceMap.get(p.id) ?? {
      total: 0,
      verified: 0,
      expired: 0,
      pending: 0,
    },
  }));

  return { data, error: null };
}

// ============================================================
// Staff detail
// ============================================================

export async function getStaffMember(
  id: string
): Promise<{ data: StaffDetail | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const [profileRes, ratesRes, docsRes, slotsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase
      .from("pay_rates")
      .select("*")
      .eq("user_id", id)
      .order("effective_from", { ascending: false }),
    supabase
      .from("compliance_docs")
      .select("*")
      .eq("user_id", id)
      .order("doc_type"),
    supabase
      .from("availability_slots")
      .select("*")
      .eq("user_id", id)
      .order("day_of_week"),
  ]);

  if (profileRes.error) return { data: null, error: profileRes.error.message };

  return {
    data: {
      profile: profileRes.data,
      pay_rates: ratesRes.data ?? [],
      compliance_docs: docsRes.data ?? [],
      availability_slots: slotsRes.data ?? [],
    },
    error: null,
  };
}

// ============================================================
// Create staff member (uses admin client for auth)
// ============================================================

export async function createStaffMember(
  data: CreateStaffData
): Promise<{
  data: { id: string; tempPassword: string; emailSent: boolean } | null;
  error: string | null;
}> {
  const admin = createSupabaseAdmin();

  // Create auth user with a temporary password
  const tempPassword = `BAK-${crypto.randomUUID().slice(0, 8)}`;

  const { data: authUser, error: authError } = await admin.auth.admin.createUser(
    {
      email: data.email,
      password: tempPassword,
      email_confirm: true,
    }
  );

  if (authError) return { data: null, error: authError.message };

  // Insert profile row
  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    email: data.email,
    name: data.name,
    phone: data.phone ?? null,
    role: data.role,
    default_pay_rate: data.default_pay_rate ?? null,
    status: "onboarding" as UserStatus,
  });

  if (profileError) {
    // Attempt to clean up the auth user if profile insert fails
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { data: null, error: profileError.message };
  }

  // Send welcome email with login credentials. We don't fail the
  // whole onboarding if email delivery hiccups — the admin still has
  // the temp password returned to them as a fallback.
  let emailSent = false;
  try {
    const tpl = staffOnboarding({
      name: data.name,
      email: data.email,
      tempPassword,
      // Narrow: createStaffMember UI only ever creates staff roles,
      // never `parent`. The wider UserRole type is accepted to keep
      // CreateStaffData backwards-compatible with other callers.
      role: data.role as "admin" | "ops" | "coach",
    });
    const result = await sendEmail({
      to: data.email,
      subject: tpl.subject,
      html: tpl.html,
      recipientId: authUser.user.id,
      emailType: "staff_onboarding",
      metadata: { user_id: authUser.user.id, role: data.role },
    });
    emailSent = result.success;
  } catch (err) {
    console.error("staff onboarding email failed:", err);
  }

  return {
    data: { id: authUser.user.id, tempPassword, emailSent },
    error: null,
  };
}

// ============================================================
// Archive (soft-delete) staff member
// ============================================================

/**
 * Archive a staff member: sets profile.status = 'inactive' and revokes
 * their auth session so they can no longer log in. Historical records
 * (sessions worked, swap requests, etc.) are preserved.
 *
 * For a hard delete (permanent removal), use Supabase's auth.admin
 * deleteUser directly — that cascades through profiles and most FKs,
 * but loses history. Soft-delete is the default path and what the
 * "Remove from team" button on the staff detail page calls.
 */
export async function archiveStaffMember(
  id: string
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdmin();
  const supabase = await createSupabaseServerClient();

  // Verify caller is admin/ops
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile ||
    (callerProfile.role !== "admin" && callerProfile.role !== "ops")
  ) {
    return { error: "Only admin or ops can archive staff." };
  }

  if (id === user.id) {
    return { error: "You cannot archive your own account." };
  }

  // Look up profile for the activity log
  const { data: target } = await supabase
    .from("profiles")
    .select("name, role, email")
    .eq("id", id)
    .single();

  if (!target) return { error: "Staff member not found." };

  // Mark profile inactive
  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (profileError) return { error: profileError.message };

  // Ban the auth user so they can't log in again. We use Supabase's
  // `banDuration` (100 years effectively forever); reactivation later
  // calls updateUserById with `ban_duration: 'none'` to lift the ban.
  // We do NOT delete the auth user — that would cascade and remove the
  // profile row, breaking historical references on sessions.coach_id,
  // swap_requests, activity_log, etc.
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "876000h",
  } as Parameters<typeof admin.auth.admin.updateUserById>[1]);
  if (banError) {
    console.error("archiveStaffMember ban failed:", banError);
  }

  // Revoke any active auth sessions (forces logout if currently signed in).
  await admin.auth.admin.signOut(id).catch((err) => {
    console.error("archiveStaffMember signOut failed:", err);
  });

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "staff_archived",
    entity_type: "profile",
    entity_id: id,
    metadata: {
      archived_name: target.name,
      archived_role: target.role,
      archived_email: target.email,
    },
  });

  return { error: null };
}

/**
 * Reactivate a previously archived staff member: clears the auth ban
 * and flips status back to active. Counterpart to `archiveStaffMember`.
 */
export async function reactivateStaffMember(
  id: string
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdmin();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile ||
    (callerProfile.role !== "admin" && callerProfile.role !== "ops")
  ) {
    return { error: "Only admin or ops can reactivate staff." };
  }

  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: "none",
  } as Parameters<typeof admin.auth.admin.updateUserById>[1]);
  if (banError) return { error: banError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (profileError) return { error: profileError.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "staff_reactivated",
    entity_type: "profile",
    entity_id: id,
  });

  return { error: null };
}

// ============================================================
// Admin: reset staff password
// ============================================================

export async function adminResetStaffPassword(
  userId: string,
  newPassword?: string
): Promise<{ data: { tempPassword: string } | null; error: string | null }> {
  const admin = createSupabaseAdmin();

  const tempPassword = newPassword || `BAK-${crypto.randomUUID().slice(0, 8)}`;

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });

  if (error) return { data: null, error: error.message };

  return { data: { tempPassword }, error: null };
}

// ============================================================
// Admin: send password reset email to staff
// ============================================================

export async function sendStaffPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdmin();

  const { error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://bak-app.vercel.app"}/update-password`,
    },
  });

  if (error) return { error: error.message };

  return { error: null };
}

// ============================================================
// Update staff member
// ============================================================

export async function updateStaffMember(
  id: string,
  data: UpdateStaffData
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  return { error: error?.message ?? null };
}

// (Removed `toggleStaffStatus` — superseded by `archiveStaffMember`
// (sets status=inactive AND bans the auth user + signs them out) and
// `reactivateStaffMember` (lifts the ban + flips status). The bare
// status-flip leaked the "they could still log in" bug — those
// upgraded actions are now the only path.)

// ============================================================
// Pay rates
// ============================================================

export async function upsertPayRate(
  data: UpsertPayRateData
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (data.id) {
    const { error } = await supabase
      .from("pay_rates")
      .update({
        session_type: data.session_type,
        rate: data.rate,
        rate_unit: data.rate_unit,
        effective_from: data.effective_from,
      })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("pay_rates").insert({
    user_id: data.user_id,
    session_type: data.session_type,
    rate: data.rate,
    rate_unit: data.rate_unit,
    effective_from: data.effective_from,
  });

  return { error: error?.message ?? null };
}

// ============================================================
// Compliance docs
// ============================================================

export async function upsertComplianceDoc(
  data: UpsertComplianceDocData
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (data.id) {
    const { error } = await supabase
      .from("compliance_docs")
      .update({
        doc_type: data.doc_type,
        doc_number: data.doc_number ?? null,
        expiry_date: data.expiry_date ?? null,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("compliance_docs").insert({
    user_id: data.user_id,
    doc_type: data.doc_type,
    doc_number: data.doc_number ?? null,
    expiry_date: data.expiry_date ?? null,
    notes: data.notes ?? null,
    status: "pending" as ComplianceStatus,
  });

  return { error: error?.message ?? null };
}

export async function verifyComplianceDoc(
  docId: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("compliance_docs")
    .update({
      status: "verified" as ComplianceStatus,
      verified_by: user?.id ?? null,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);

  return { error: error?.message ?? null };
}

// ============================================================
// Availability
// ============================================================

export async function upsertAvailabilitySlot(
  data: UpsertAvailabilityData
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  if (data.id) {
    const { error } = await supabase
      .from("availability_slots")
      .update({
        day_of_week: data.day_of_week,
        start_time: data.start_time,
        end_time: data.end_time,
        location_preferences: data.location_preferences ?? [],
      })
      .eq("id", data.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("availability_slots").insert({
    user_id: data.user_id,
    day_of_week: data.day_of_week,
    start_time: data.start_time,
    end_time: data.end_time,
    location_preferences: data.location_preferences ?? [],
  });

  return { error: error?.message ?? null };
}

export async function deleteAvailabilitySlot(
  id: string
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("availability_slots")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ============================================================
// Sessions (read-only for staff detail)
// ============================================================

export async function getStaffSessions(
  userId: string
): Promise<{ data: (Session & { centre_name: string })[] | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*, centres(name)")
    .eq("coach_id", userId)
    .order("date", { ascending: false })
    .limit(20);

  if (error) return { data: null, error: error.message };

  const mapped = (data ?? []).map((s: Record<string, unknown>) => ({
    ...(s as unknown as Session),
    centre_name: (s.centres as { name: string } | null)?.name ?? "Unknown",
  }));

  return { data: mapped, error: null };
}

// ============================================================
// Rate card
// ============================================================

export async function getRateCard(): Promise<{
  data: RateCardEntry[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  // Get all coaches
  const { data: coaches, error: coachError } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .order("name");

  if (coachError) return { data: null, error: coachError.message };

  const coachIds = (coaches ?? []).map((c) => c.id);
  const { data: rates, error: rateError } = await supabase
    .from("pay_rates")
    .select("*")
    .in("user_id", coachIds);

  if (rateError) return { data: null, error: rateError.message };

  // Build map: userId -> { sessionType -> rate }
  const rateMap = new Map<string, Record<string, { rate: number; rate_unit: RateUnit }>>();
  for (const r of rates ?? []) {
    const existing = rateMap.get(r.user_id) ?? {};
    existing[r.session_type] = { rate: r.rate, rate_unit: r.rate_unit };
    rateMap.set(r.user_id, existing);
  }

  const sessionTypes: SessionType[] = [
    "childcare",
    "school_local",
    "school_travel",
    "holiday_clinic",
  ];

  const entries: RateCardEntry[] = (coaches ?? []).map((c) => {
    const coachRates = rateMap.get(c.id) ?? {};
    const ratesObj: Record<string, { rate: number; rate_unit: RateUnit } | null> = {};
    for (const st of sessionTypes) {
      ratesObj[st] = coachRates[st] ?? null;
    }
    return { coach_id: c.id, coach_name: c.name, rates: ratesObj };
  });

  return { data: entries, error: null };
}

// ============================================================
// Coach self-update (phone & ABN only)
// ============================================================

export async function updateCoachProfile(data: {
  phone?: string | null;
  abn?: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Only allow updating phone and abn
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.phone !== undefined) updatePayload.phone = data.phone || null;
  if (data.abn !== undefined) updatePayload.abn = data.abn || null;

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

  return { error: error?.message ?? null };
}
