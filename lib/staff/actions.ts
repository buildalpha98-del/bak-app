"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { staffOnboarding } from "@/lib/launch/email-templates";
import { generateDefaultAvailabilitySlots } from "@/lib/utils/staff/default-availability";
import { getMonday, getFriday } from "@/lib/utils/roster";
import { getFinancialAccess } from "@/lib/auth/financial-access";
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
  /** First region id resolved for the coach (null if none). */
  region_id: string | null;
  /** Aggregated hours rostered in the current Mon–Fri week. */
  hours_this_week: number;
  /** Length-4 array of hours rostered in each of the past 4 weeks (oldest → newest). */
  hours_last_4_weeks: number[];
  /** ISO timestamp of the closest upcoming non-cancelled session, or null. */
  next_session_at: string | null;
  /** ISO timestamp of the most recent past non-cancelled session, or null. */
  last_session_at: string | null;
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
  /**
   * Grant the new profile financial-data visibility at create time.
   * Only meaningful for `admin`/`ops` roles — coaches never see
   * financial data, parents are out of scope. Defaults to false so
   * a forgetful operator doesn't accidentally expose payroll.
   */
  financial_access?: boolean;
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

  // Fetch compliance summaries for all users in one query.
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

  // ============================================================
  // Session-derived facts: utilisation + next/last shift.
  // We compute a 4-week window (3 prior weeks + current) so the
  // tooltip's "Past 4 weeks: 28h / 32h / 25h / 30h" history reads
  // straight off the same single query, then a forward window of
  // 28 days for the "Next: …" column.
  //
  // For inactive coaches we still resolve `last_session_at` so the
  // 30+-day amber callout works.
  // ============================================================
  const today = new Date();
  const thisMonday = getMonday(today);
  const fourWeeksAgo = new Date(thisMonday);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
  const thisFriday = getFriday(thisMonday);
  const horizonForward = new Date(today);
  horizonForward.setDate(horizonForward.getDate() + 28);

  const histStart = fourWeeksAgo.toISOString().split("T")[0];
  const histEnd = thisFriday.toISOString().split("T")[0];
  const fwdStart = today.toISOString().split("T")[0];
  const fwdEnd = horizonForward.toISOString().split("T")[0];

  const [histRes, fwdRes, lastEverRes] = await Promise.all([
    // Historical: any session in the past-4-weeks window.
    supabase
      .from("sessions")
      .select("coach_id, date, time, duration_minutes")
      .in("coach_id", userIds)
      .gte("date", histStart)
      .lte("date", histEnd)
      .neq("status", "cancelled"),
    // Forward-looking: next 28 days for the "Next: …" cell.
    supabase
      .from("sessions")
      .select("coach_id, date, time")
      .in("coach_id", userIds)
      .gt("date", fwdStart)
      .lte("date", fwdEnd)
      .neq("status", "cancelled"),
    // Last-ever session per coach for the "Last: …" / "30+ days" fallback
    // — we cap to 200 rows and bucket by coach because the typical
    // operator browses <50 coaches; this stays cheap.
    supabase
      .from("sessions")
      .select("coach_id, date, time")
      .in("coach_id", userIds)
      .lt("date", fwdStart)
      .neq("status", "cancelled")
      .order("date", { ascending: false })
      .limit(200),
  ]);

  // Bucket past-4-weeks sessions into week buckets.
  // weekIndex = 0 → oldest, 3 → current week.
  function weekIndexFor(dateStr: string): number {
    const d = new Date(dateStr + "T00:00:00");
    const diffDays = Math.floor(
      (d.getTime() - fourWeeksAgo.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.min(3, Math.max(0, Math.floor(diffDays / 7)));
  }

  const hoursByCoach = new Map<string, number[]>();
  for (const row of histRes.data ?? []) {
    const r = row as {
      coach_id: string | null;
      date: string;
      duration_minutes: number;
    };
    if (!r.coach_id) continue;
    const idx = weekIndexFor(r.date);
    const arr = hoursByCoach.get(r.coach_id) ?? [0, 0, 0, 0];
    arr[idx] += (r.duration_minutes ?? 0) / 60;
    hoursByCoach.set(r.coach_id, arr);
  }

  // Next session: smallest date+time ≥ today per coach.
  const nextByCoach = new Map<string, string>();
  for (const row of fwdRes.data ?? []) {
    const r = row as {
      coach_id: string | null;
      date: string;
      time: string | null;
    };
    if (!r.coach_id) continue;
    const iso = `${r.date}T${r.time ?? "00:00:00"}`;
    const existing = nextByCoach.get(r.coach_id);
    if (!existing || iso < existing) nextByCoach.set(r.coach_id, iso);
  }

  // Last session: largest date+time strictly before today.
  // We already pulled in descending date order, so the first row
  // we see for a given coach is their latest.
  const lastByCoach = new Map<string, string>();
  for (const row of lastEverRes.data ?? []) {
    const r = row as {
      coach_id: string | null;
      date: string;
      time: string | null;
    };
    if (!r.coach_id) continue;
    if (lastByCoach.has(r.coach_id)) continue;
    const iso = `${r.date}T${r.time ?? "00:00:00"}`;
    lastByCoach.set(r.coach_id, iso);
  }

  const data: StaffListItem[] = profiles.map((p) => {
    const weekHours = hoursByCoach.get(p.id) ?? [0, 0, 0, 0];
    const regionIds = ((p as Record<string, unknown>).region_ids ?? null) as
      | string[]
      | null;
    return {
      ...p,
      compliance_summary: complianceMap.get(p.id) ?? {
        total: 0,
        verified: 0,
        expired: 0,
        pending: 0,
      },
      region_id:
        Array.isArray(regionIds) && regionIds.length > 0 ? regionIds[0] : null,
      hours_this_week: Math.round(weekHours[3] * 10) / 10,
      hours_last_4_weeks: weekHours.map((h) => Math.round(h * 10) / 10),
      next_session_at: nextByCoach.get(p.id) ?? null,
      last_session_at: lastByCoach.get(p.id) ?? null,
    };
  });

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

  // Insert profile row. financial_access only meaningful for
  // admin/ops — defaults to false everywhere else regardless of input.
  const financialAccess =
    (data.role === "admin" || data.role === "ops") &&
    data.financial_access === true;
  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    email: data.email,
    name: data.name,
    phone: data.phone ?? null,
    role: data.role,
    default_pay_rate: data.default_pay_rate ?? null,
    financial_access: financialAccess,
    status: "active" as UserStatus,
  });

  if (profileError) {
    // Attempt to clean up the auth user if profile insert fails
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { data: null, error: profileError.message };
  }

  // Audit log when the new profile lands with financial access on. We
  // log against the new profile id so the staff detail's history view
  // surfaces the grant alongside any subsequent toggle. Best-effort —
  // a logging hiccup must never sink the create.
  if (financialAccess) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user: actor },
      } = await supabase.auth.getUser();
      await supabase.from("activity_log").insert({
        user_id: actor?.id ?? null,
        action: "staff_financial_access_granted",
        entity_type: "profile",
        entity_id: authUser.user.id,
        metadata: { financial_access: true, granted_at_create: true },
      });
    } catch (err) {
      console.error("financial-access activity_log on create failed:", err);
    }
  }

  // Seed Mon–Fri 8:00am–4:30pm availability so the new staff member
  // is immediately rosterable. Defensive: if any slots already exist
  // (shouldn't happen on fresh create, but guards against re-runs),
  // skip the seed rather than duplicate rows. Non-fatal on failure —
  // ops can add slots from the Availability tab if seeding hiccups.
  try {
    const { count: existingSlotCount } = await admin
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.user.id);

    if ((existingSlotCount ?? 0) === 0) {
      const slots = generateDefaultAvailabilitySlots(authUser.user.id);
      const { error: slotError } = await admin
        .from("availability_slots")
        .insert(slots);
      if (slotError) {
        console.error("default availability seed failed:", slotError);
      }
    }
  } catch (err) {
    console.error("default availability seed exception:", err);
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
// Financial access toggle
// ============================================================
/**
 * Grant or revoke per-profile financial-data visibility. Admin only —
 * the actor must be an admin profile. Writes an activity_log entry so
 * the audit trail captures who flipped the switch when.
 *
 * The column itself is read by `requireFinancialAccess()` server guard
 * (lib/auth/financial-access.ts) and mirrored in the sidebar / bottom-
 * tabs nav filtering.
 */
export async function setStaffFinancialAccess(
  staffId: string,
  value: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!actor || actor.role !== "admin") {
    return { error: "Only admins can change financial access." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      financial_access: value,
      updated_at: new Date().toISOString(),
    })
    .eq("id", staffId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: value ? "staff_financial_access_granted" : "staff_financial_access_revoked",
    entity_type: "profile",
    entity_id: staffId,
    metadata: { financial_access: value },
  });

  return { error: null };
}

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

// ============================================================
// Bulk actions for the staff list (admin/ops only)
// ============================================================
//
// All four bulk actions follow the same shape — auth gate the caller,
// iterate the selected ids, swallow per-row errors so a single bad
// row doesn't sink the whole batch, and write one activity_log entry
// per successful action. The sticky bulk-action bar in the list view
// shows the result via sonner toasts.

interface BulkAuthOk {
  ok: true;
  actorId: string;
}
interface BulkAuthBlocked {
  ok: false;
  error: string;
}
type BulkAuth = BulkAuthOk | BulkAuthBlocked;

async function requireBulkActor(
  allow: Array<UserRole>,
): Promise<BulkAuth> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !allow.includes(profile.role as UserRole)) {
    return { ok: false, error: "Not authorised." };
  }
  return { ok: true, actorId: user.id };
}

export interface BulkResetResult {
  reset: number;
  errors: Array<{ id: string; error: string }>;
  error: string | null;
}

/**
 * Reset passwords for the selected staff members. Admin only. Each
 * reset generates a new temp password via `adminResetStaffPassword`
 * and sends the existing Supabase recovery email; we surface a single
 * toast in the UI summarising the count + any per-row failures.
 *
 * Empty selection short-circuits before any auth work.
 */
export async function bulkResetPasswords(
  staffIds: string[],
): Promise<BulkResetResult> {
  if (staffIds.length === 0) {
    return { reset: 0, errors: [], error: "No staff selected." };
  }
  const auth = await requireBulkActor(["admin"]);
  if (!auth.ok) return { reset: 0, errors: [], error: auth.error };

  const supabase = await createSupabaseServerClient();
  let reset = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of staffIds) {
    const { error: resetErr } = await adminResetStaffPassword(id);
    if (resetErr) {
      errors.push({ id, error: resetErr });
      continue;
    }
    reset += 1;
    const { error: logErr } = await supabase.from("activity_log").insert({
      user_id: auth.actorId,
      action: "staff_password_bulk_reset",
      entity_type: "profile",
      entity_id: id,
    });
    if (logErr) {
      console.error("bulkResetPasswords log error:", id, logErr);
    }
  }

  return {
    reset,
    errors,
    error:
      reset === 0 && errors.length > 0
        ? "Failed to reset any passwords."
        : null,
  };
}

export interface BulkArchiveResult {
  archived: number;
  errors: Array<{ id: string; error: string }>;
  error: string | null;
}

/**
 * Archive multiple staff at once. Admin only — `archiveStaffMember`
 * itself also enforces admin/ops, but we gate up front for fail-fast
 * clarity.
 */
export async function bulkArchiveStaff(
  staffIds: string[],
): Promise<BulkArchiveResult> {
  if (staffIds.length === 0) {
    return { archived: 0, errors: [], error: "No staff selected." };
  }
  const auth = await requireBulkActor(["admin"]);
  if (!auth.ok) return { archived: 0, errors: [], error: auth.error };

  let archived = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of staffIds) {
    const { error: archErr } = await archiveStaffMember(id);
    if (archErr) {
      errors.push({ id, error: archErr });
      continue;
    }
    archived += 1;
  }

  return {
    archived,
    errors,
    error:
      archived === 0 && errors.length > 0
        ? "Failed to archive any staff."
        : null,
  };
}

/**
 * Insert one notification per selected staff member with the supplied
 * title/body. Tier is fixed at `important` (it's a deliberate broadcast,
 * not an alarm). Admin/ops may dispatch.
 *
 * The `notifications.type` column is a free string today, so we use
 * `admin_announcement` to namespace these for any future filtering
 * UI — the in-app inbox surfaces the tier badge regardless of type.
 */
export async function bulkSendStaffAnnouncement(
  staffIds: string[],
  title: string,
  body: string,
): Promise<{ sent: number; error: string | null }> {
  if (staffIds.length === 0) {
    return { sent: 0, error: "No staff selected." };
  }
  if (!title.trim() || !body.trim()) {
    return { sent: 0, error: "Title and body are required." };
  }
  const auth = await requireBulkActor(["admin", "ops"]);
  if (!auth.ok) return { sent: 0, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const rows = staffIds.map((id) => ({
    user_id: id,
    type: "admin_announcement",
    title: title.trim(),
    body: body.trim(),
    tier: "important" as const,
    entity_type: null,
    entity_id: null,
    read: false,
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.error("bulkSendStaffAnnouncement error:", error);
    return { sent: 0, error: error.message };
  }

  // One activity_log entry summarising the broadcast — we don't need
  // a per-recipient row because the notification rows already carry
  // the audit trail.
  await supabase.from("activity_log").insert({
    user_id: auth.actorId,
    action: "staff_announcement_sent",
    entity_type: "profile",
    entity_id: null,
    metadata: {
      recipient_count: staffIds.length,
      title: title.trim(),
    },
  });

  return { sent: staffIds.length, error: null };
}

const CSV_STAFF_BASE = [
  "id",
  "name",
  "email",
  "phone",
  "role",
  "status",
  "last_session_at",
  "compliance_total",
  "compliance_verified",
  "compliance_expired",
  "compliance_pending",
] as const;

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV export of the selected staff. `financial_access` is
 * appended as the last column only when the caller themselves carry
 * financial access — denying the column entirely (rather than blanking
 * it) means a leaked file can't be re-shared with the data still
 * embedded. Admin/ops only.
 */
export async function exportStaffCsv(
  staffIds: string[],
): Promise<{ csv: string | null; error: string | null }> {
  if (staffIds.length === 0) {
    return { csv: null, error: "No staff selected." };
  }
  const auth = await requireBulkActor(["admin", "ops"]);
  if (!auth.ok) return { csv: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const hasFinancial = await getFinancialAccess();

  // Use getStaffList() so we reuse the compliance + last_session_at
  // aggregation — we pull the full list and filter in memory. For our
  // current scale this is fine (<50 staff); flagged for the report if
  // it ever needs to scale further.
  const { data: list, error } = await getStaffList();
  if (error) return { csv: null, error };

  const idSet = new Set(staffIds);
  const rows = (list ?? []).filter((r) => idSet.has(r.id));

  const fields = hasFinancial
    ? [...CSV_STAFF_BASE, "financial_access"]
    : [...CSV_STAFF_BASE];

  const header = fields.join(",");
  const lines = rows.map((r) => {
    const flat: Record<string, unknown> = {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      status: r.status,
      last_session_at: r.last_session_at,
      compliance_total: r.compliance_summary.total,
      compliance_verified: r.compliance_summary.verified,
      compliance_expired: r.compliance_summary.expired,
      compliance_pending: r.compliance_summary.pending,
    };
    if (hasFinancial) {
      flat.financial_access = r.financial_access ? "yes" : "no";
    }
    return fields.map((f) => escapeCsv(flat[f])).join(",");
  });

  return { csv: [header, ...lines].join("\n"), error: null };
}
