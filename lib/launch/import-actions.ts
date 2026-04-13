"use server";

// ============================================================
// Launch Foundation — Bulk import actions for centres, schools, coaches
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendIndividualInvitation } from "@/lib/launch/invitation-actions";
import type { UserStatus } from "@/lib/types/enums";

// ========================
// Types
// ========================

export interface ImportResult {
  created: number;
  skipped: number;
  invited: number;
  errors: Array<{ row: number; error: string }>;
}

export interface CentreRow {
  centre_name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  session_day?: string;
  session_time?: string;
  session_rate?: number;
}

export interface SchoolRow {
  school_name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  students_enrolled?: number;
  term_start_date?: string;
  session_day?: string;
}

export interface CoachRow {
  coach_name: string;
  email: string;
  phone?: string;
  abn?: string;
  wwcc_number?: string;
  wwcc_expiry?: string;
  first_aid_expiry?: string;
}

// ========================
// 1. importCentres
// ========================

export async function importCentres(params: {
  rows: CentreRow[];
  sendInvitations: boolean;
  importedBy: string;
}): Promise<ImportResult> {
  const admin = createSupabaseAdmin();
  const result: ImportResult = { created: 0, skipped: 0, invited: 0, errors: [] };

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i];
    try {
      if (!row.centre_name?.trim()) {
        result.errors.push({ row: i + 1, error: "Missing centre name" });
        continue;
      }

      // Check for duplicate (name + postcode)
      const fullAddress = [row.address, row.suburb, row.state, row.postcode]
        .filter(Boolean)
        .join(", ");

      const { data: existing } = await admin
        .from("centres")
        .select("id")
        .ilike("name", row.centre_name.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        // Also match on postcode area to be sure
        const { data: exactMatch } = await admin
          .from("centres")
          .select("id")
          .ilike("name", row.centre_name.trim())
          .ilike("address", `%${row.postcode || ""}%`)
          .limit(1);

        if (exactMatch && exactMatch.length > 0) {
          result.skipped++;
          continue;
        }
      }

      // Insert centre
      const { data: centre, error: centreErr } = await admin
        .from("centres")
        .insert({
          name: row.centre_name.trim(),
          type: "childcare_centre",
          address: fullAddress || null,
          primary_contact_name: row.contact_name?.trim() || null,
          primary_contact_email: row.contact_email?.trim() || null,
          primary_contact_phone: row.contact_phone?.trim() || null,
          agreed_rate: row.session_rate ?? 165,
          session_preferences: row.session_day || row.session_time
            ? { preferred_day: row.session_day, preferred_time: row.session_time }
            : {},
        })
        .select("id")
        .single();

      if (centreErr || !centre) {
        result.errors.push({ row: i + 1, error: centreErr?.message || "Insert failed" });
        continue;
      }

      result.created++;

      // Send invitation if requested
      if (params.sendInvitations && row.contact_email?.trim()) {
        const invResult = await sendIndividualInvitation({
          name: row.contact_name?.trim() || row.centre_name.trim(),
          email: row.contact_email.trim(),
          role: "centre_director",
          centreId: centre.id,
          invitedBy: params.importedBy,
        });

        if (invResult.success) {
          result.invited++;
        }
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  return result;
}

// ========================
// 2. importSchools
// ========================

export async function importSchools(params: {
  rows: SchoolRow[];
  sendInvitations: boolean;
  importedBy: string;
}): Promise<ImportResult> {
  const admin = createSupabaseAdmin();
  const result: ImportResult = { created: 0, skipped: 0, invited: 0, errors: [] };

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i];
    try {
      if (!row.school_name?.trim()) {
        result.errors.push({ row: i + 1, error: "Missing school name" });
        continue;
      }

      const fullAddress = [row.address, row.suburb, row.state, row.postcode]
        .filter(Boolean)
        .join(", ");

      // Schools are stored as centres with type = 'school'
      const { data: existing } = await admin
        .from("centres")
        .select("id")
        .ilike("name", row.school_name.trim())
        .eq("type", "school")
        .limit(1);

      if (existing && existing.length > 0) {
        result.skipped++;
        continue;
      }

      const { data: school, error: schoolErr } = await admin
        .from("centres")
        .insert({
          name: row.school_name.trim(),
          type: "school",
          address: fullAddress || null,
          primary_contact_name: row.contact_name?.trim() || null,
          primary_contact_email: row.contact_email?.trim() || null,
          primary_contact_phone: row.contact_phone?.trim() || null,
          group_size: row.students_enrolled || null,
          session_preferences: row.session_day || row.term_start_date
            ? { preferred_day: row.session_day, term_start_date: row.term_start_date }
            : {},
        })
        .select("id")
        .single();

      if (schoolErr || !school) {
        result.errors.push({ row: i + 1, error: schoolErr?.message || "Insert failed" });
        continue;
      }

      result.created++;

      if (params.sendInvitations && row.contact_email?.trim()) {
        const invResult = await sendIndividualInvitation({
          name: row.contact_name?.trim() || row.school_name.trim(),
          email: row.contact_email.trim(),
          role: "centre_director",
          centreId: school.id,
          invitedBy: params.importedBy,
        });

        if (invResult.success) {
          result.invited++;
        }
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  return result;
}

// ========================
// 3. importCoaches
// ========================

export async function importCoaches(params: {
  rows: CoachRow[];
  sendInvitations: boolean;
  importedBy: string;
}): Promise<ImportResult> {
  const admin = createSupabaseAdmin();
  const result: ImportResult = { created: 0, skipped: 0, invited: 0, errors: [] };

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i];
    try {
      if (!row.coach_name?.trim() || !row.email?.trim()) {
        result.errors.push({ row: i + 1, error: "Missing coach name or email" });
        continue;
      }

      // Check for existing profile with this email
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", row.email.trim())
        .limit(1);

      if (existingProfile && existingProfile.length > 0) {
        result.skipped++;
        continue;
      }

      // Create auth user
      const tempPassword = `BAK-${crypto.randomUUID().slice(0, 8)}`;
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: row.email.trim(),
        password: tempPassword,
        email_confirm: true,
      });

      if (authErr || !authUser?.user) {
        result.errors.push({ row: i + 1, error: authErr?.message || "Auth creation failed" });
        continue;
      }

      // Insert profile
      const { error: profileErr } = await admin.from("profiles").insert({
        id: authUser.user.id,
        email: row.email.trim(),
        name: row.coach_name.trim(),
        phone: row.phone?.trim() || null,
        abn: row.abn?.trim() || null,
        role: "coach",
        status: "onboarding" as UserStatus,
      });

      if (profileErr) {
        await admin.auth.admin.deleteUser(authUser.user.id);
        result.errors.push({ row: i + 1, error: profileErr.message });
        continue;
      }

      // Insert compliance docs if provided
      if (row.wwcc_number?.trim()) {
        await admin.from("compliance_docs").insert({
          user_id: authUser.user.id,
          doc_type: "wwcc",
          doc_number: row.wwcc_number.trim(),
          expiry_date: row.wwcc_expiry || null,
          status: "pending",
        });
      }

      if (row.first_aid_expiry?.trim()) {
        await admin.from("compliance_docs").insert({
          user_id: authUser.user.id,
          doc_type: "first_aid",
          expiry_date: row.first_aid_expiry.trim(),
          status: "pending",
        });
      }

      result.created++;

      // Send invitation if requested
      if (params.sendInvitations) {
        const invResult = await sendIndividualInvitation({
          name: row.coach_name.trim(),
          email: row.email.trim(),
          role: "coach",
          invitedBy: params.importedBy,
        });

        if (invResult.success) {
          result.invited++;
        }
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Unexpected error",
      });
    }
  }

  return result;
}
