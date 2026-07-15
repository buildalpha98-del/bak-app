"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { welcomeParent, parentBulkInvite } from "@/lib/launch/email-templates";
import { createNotification } from "@/lib/launch/notifications";
import { calculateAgeGroup } from "@/lib/utils/ageGroup";
import { getAuthCallbackUrl, resolveAuthOrigin } from "@/lib/utils/base-url";
import { buildParentMagicLinkRedirect } from "@/lib/parent/safe-next";
import { headers } from "next/headers";
import type { ParentProfile, ParentChild, Child } from "@/lib/types/database";
import type { AgeGroup, Gender, ParentRelationship } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface ChildInput {
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO date string
  gender?: Gender | null;
  medical_notes?: string | null;
}

export interface RegistrationData {
  first_name: string;
  last_name: string;
  phone?: string;
  suburb?: string;
  children: ChildInput[];
  terms_accepted: boolean;
  referral_code?: string;
}

// ============================================================
// Send magic link for parent login
// ============================================================

/**
 * The origin this server action was invoked from, validated against the
 * auth allowlist. Server actions have no request object, so the host
 * comes from headers(): Vercel sets x-forwarded-host (the client-facing
 * domain) and host; prefer the former. Anything unrecognised resolves to
 * the app domain — see resolveAuthOrigin's security note.
 */
async function getRequestAuthOrigin(): Promise<string> {
  const headersList = await headers();
  return resolveAuthOrigin(
    headersList.get("x-forwarded-host") ?? headersList.get("host")
  );
}

export async function sendParentMagicLink(
  email: string,
  next?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    // Parents reach this from either the public site (.com.au) or the
    // app (.app). The two are different TLDs and cannot share a session
    // cookie, so the link must return them to the host they started on.
    const origin = await getRequestAuthOrigin();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // `next` is sanitised to parent-scope paths only; anything
        // else falls back to /parent-login (see lib/parent/safe-next).
        emailRedirectTo: buildParentMagicLinkRedirect(next, origin),
      },
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("sendParentMagicLink error:", err);
    return { error: "Failed to send magic link." };
  }
}

// ============================================================
// Check if current user has a parent profile
// ============================================================

export async function getParentProfile(): Promise<{
  data: ParentProfile | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("parent_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return { data: null, error: error.message };
    }

    return { data: data ?? null, error: null };
  } catch (err) {
    console.error("getParentProfile error:", err);
    return { data: null, error: "Failed to load profile." };
  }
}

// ============================================================
// Complete parent registration
// ============================================================

export async function completeParentRegistration(
  data: RegistrationData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const adminClient = createSupabaseAdmin();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    // Check if already registered
    const { data: existing } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (existing) return { error: "Already registered." };

    // 1. Create profiles row with role = 'parent' (using admin client for RLS bypass)
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? data.first_name.toLowerCase() + "@parent.local",
        name: `${data.first_name} ${data.last_name}`,
        role: "parent",
        status: "active",
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      return { error: "Failed to create profile." };
    }

    // 2. Create parent_profiles record
    const { data: parentProfile, error: parentError } = await adminClient
      .from("parent_profiles")
      .insert({
        user_id: user.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: user.email!,
        phone: data.phone || null,
        suburb: data.suburb || null,
      })
      .select()
      .single();

    if (parentError || !parentProfile) {
      return { error: parentError?.message ?? "Failed to create parent profile." };
    }

    // 3. Process each child
    const childNames: string[] = [];

    for (const childInput of data.children) {
      const dob = new Date(childInput.date_of_birth);
      const ageGroup = calculateAgeGroup(dob);

      // Match check 1: name + DOB (case-insensitive)
      const { data: nameMatch } = await adminClient
        .from("children")
        .select("id")
        .ilike("first_name", childInput.first_name)
        .ilike("last_name", childInput.last_name)
        .eq("date_of_birth", childInput.date_of_birth)
        .limit(1);

      // Match check 2: parent_email match
      const { data: emailMatch } = await adminClient
        .from("children")
        .select("id")
        .ilike("parent_email", user.email!)
        .limit(10);

      let childId: string | null = null;

      if (nameMatch && nameMatch.length > 0) {
        // Found by name + DOB — link to existing
        childId = nameMatch[0].id;
      } else if (emailMatch && emailMatch.length > 0) {
        // Check if any email-matched child has same first name
        const { data: emailNameMatch } = await adminClient
          .from("children")
          .select("id")
          .ilike("parent_email", user.email!)
          .ilike("first_name", childInput.first_name)
          .limit(1);

        if (emailNameMatch && emailNameMatch.length > 0) {
          childId = emailNameMatch[0].id;
        }
      }

      if (!childId) {
        // Create new child record
        const { data: newChild, error: childError } = await adminClient
          .from("children")
          .insert({
            first_name: childInput.first_name,
            last_name: childInput.last_name,
            date_of_birth: childInput.date_of_birth,
            age_group: ageGroup,
            gender: childInput.gender || null,
            medical_notes: childInput.medical_notes || null,
            parent_name: `${data.first_name} ${data.last_name}`,
            parent_email: user.email,
            parent_phone: data.phone || null,
            status: "active",
          })
          .select()
          .single();

        if (childError || !newChild) {
          console.error("Child creation error:", childError);
          continue;
        }
        childId = newChild.id;
      }

      // Create parent_children junction
      await adminClient.from("parent_children").upsert(
        {
          parent_id: parentProfile.id,
          child_id: childId,
          relationship: "parent" as ParentRelationship,
        },
        { onConflict: "parent_id,child_id" }
      );

      childNames.push(childInput.first_name);
    }

    // 4. Generate referral code for this parent
    try {
      const { generateReferralCode } = await import("@/lib/referrals/actions");
      await generateReferralCode("parent", parentProfile.id);
    } catch (refErr) {
      console.error("Referral code generation error:", refErr);
    }

    // 5. If referred by someone, mark that referral as registered
    if (data.referral_code) {
      try {
        const { markReferralRegistered } = await import("@/lib/referrals/actions");
        await markReferralRegistered(user.email!, parentProfile.id);
      } catch (refErr) {
        console.error("Referral registration error:", refErr);
      }
    }

    // 6. Send welcome email (via launch email utility — logged to email_log)
    if (user.email) {
      const welcome = welcomeParent({ name: data.first_name });
      void sendEmail({
        to: user.email,
        subject: welcome.subject,
        html: welcome.html,
        recipientId: user.id,
        emailType: "welcome",
        metadata: { role: "parent" },
      }).catch((err) => console.error("Welcome email error:", err));

      void createNotification({
        userId: user.id,
        type: "general",
        title: "Welcome to Build Alpha Kids!",
        message: "Your account is set up. Browse sessions and book your first activity.",
        actionUrl: "/parent/book",
      }).catch(console.error);
    }

    return { error: null };
  } catch (err) {
    console.error("completeParentRegistration error:", err);
    return { error: "Registration failed. Please try again." };
  }
}

// ============================================================
// Get parent's children
// ============================================================

export async function getParentChildren(): Promise<{
  data: (ParentChild & { child: Child })[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: [], error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { data: [], error: "No parent profile." };

    const { data, error } = await supabase
      .from("parent_children")
      .select("*, children(*)")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: true });

    if (error) return { data: [], error: error.message };

    const result = (data ?? []).map((pc) => ({
      ...pc,
      child: (pc as Record<string, unknown>).children as unknown as Child,
      children: undefined,
    })) as (ParentChild & { child: Child })[];

    return { data: result, error: null };
  } catch (err) {
    console.error("getParentChildren error:", err);
    return { data: [], error: "Failed to load children." };
  }
}

// ============================================================
// Add a child (post-registration)
// ============================================================

export async function addChild(
  childInput: ChildInput
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const adminClient = createSupabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id, first_name, last_name, phone")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { error: "No parent profile." };

    const dob = new Date(childInput.date_of_birth);
    const ageGroup = calculateAgeGroup(dob);

    // Check for existing child match
    const { data: nameMatch } = await adminClient
      .from("children")
      .select("id")
      .ilike("first_name", childInput.first_name)
      .ilike("last_name", childInput.last_name)
      .eq("date_of_birth", childInput.date_of_birth)
      .limit(1);

    let childId: string;

    if (nameMatch && nameMatch.length > 0) {
      childId = nameMatch[0].id;
    } else {
      const { data: newChild, error: childError } = await adminClient
        .from("children")
        .insert({
          first_name: childInput.first_name,
          last_name: childInput.last_name,
          date_of_birth: childInput.date_of_birth,
          age_group: ageGroup,
          gender: childInput.gender || null,
          medical_notes: childInput.medical_notes || null,
          parent_name: `${parentProfile.first_name} ${parentProfile.last_name}`,
          parent_email: user.email,
          parent_phone: parentProfile.phone || null,
          status: "active",
        })
        .select()
        .single();

      if (childError || !newChild) {
        return { error: childError?.message ?? "Failed to create child." };
      }
      childId = newChild.id;
    }

    // Link
    const { error: linkError } = await adminClient
      .from("parent_children")
      .upsert(
        {
          parent_id: parentProfile.id,
          child_id: childId,
          relationship: "parent" as ParentRelationship,
        },
        { onConflict: "parent_id,child_id" }
      );

    if (linkError) return { error: linkError.message };
    return { error: null };
  } catch (err) {
    console.error("addChild error:", err);
    return { error: "Failed to add child." };
  }
}

// ============================================================
// Update a child
// ============================================================

export async function updateChild(
  childId: string,
  updates: Partial<ChildInput>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const updateData: Record<string, unknown> = {};
    if (updates.first_name) updateData.first_name = updates.first_name;
    if (updates.last_name) updateData.last_name = updates.last_name;
    if (updates.date_of_birth) {
      updateData.date_of_birth = updates.date_of_birth;
      updateData.age_group = calculateAgeGroup(new Date(updates.date_of_birth));
    }
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.medical_notes !== undefined)
      updateData.medical_notes = updates.medical_notes;

    const { error } = await supabase
      .from("children")
      .update(updateData)
      .eq("id", childId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateChild error:", err);
    return { error: "Failed to update child." };
  }
}

// ============================================================
// Remove child link (doesn't delete the child record)
// ============================================================

export async function removeChildLink(
  childId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) return { error: "No parent profile." };

    const { error } = await supabase
      .from("parent_children")
      .delete()
      .eq("parent_id", parentProfile.id)
      .eq("child_id", childId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("removeChildLink error:", err);
    return { error: "Failed to remove child." };
  }
}

// ============================================================
// Update parent profile
// ============================================================

export async function updateParentProfile(
  updates: Partial<Pick<ParentProfile, "first_name" | "last_name" | "phone" | "suburb" | "marketing_opt_in">>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("parent_profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateParentProfile error:", err);
    return { error: "Failed to update profile." };
  }
}

// ============================================================
// Bulk-invite parents from CSV
//
// Admin/Ops upload a CSV of parents to onboard to the beta. For each
// row we:
//   1. Create a Supabase auth user (no password — magic-link only)
//   2. Insert a parent_profiles row keyed to that auth user
//   3. Generate a magic-link via the admin client and email it via
//      Resend using the parentBulkInvite template
//   4. Log an activity_log entry per invite for audit
//
// Duplicates (existing parent_profiles.email, case-insensitive) are
// skipped when opts.skipDuplicates is true (default). Resend or
// per-row failures are captured in `errors` and the batch continues.
// ============================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportParentRow {
  first_name: string;
  last_name?: string;
  email: string;
  phone?: string;
  referral_code_to_credit?: string;
}

export interface ImportParentsOptions {
  skipDuplicates?: boolean; // default true
}

export interface ImportParentsResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; email: string; message: string }>;
}

export async function importParents(
  rows: ImportParentRow[],
  opts: ImportParentsOptions = {}
): Promise<{ data: ImportParentsResult; error: string | null }> {
  const skipDuplicates = opts.skipDuplicates !== false;
  const empty: ImportParentsResult = { created: 0, skipped: 0, errors: [] };

  try {
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    // Auth gate — admin/ops only
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: empty, error: "Not authenticated." };
    }

    const { data: callerProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileErr || !callerProfile) {
      return { data: empty, error: "Profile not found." };
    }
    if (callerProfile.role !== "admin" && callerProfile.role !== "ops") {
      return { data: empty, error: "Admin or ops role required." };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return { data: empty, error: "No rows provided." };
    }

    // Normalise + pre-validate
    type Normalised = {
      rowIndex: number;
      first_name: string;
      last_name: string;
      email: string; // lower-cased
      original_email: string;
      phone: string | null;
      referral_code_to_credit: string | null;
    };

    const result: ImportParentsResult = { created: 0, skipped: 0, errors: [] };
    const normalised: Normalised[] = [];

    rows.forEach((row, idx) => {
      const rowNumber = idx + 1;
      const firstName = (row.first_name ?? "").trim();
      const lastName = (row.last_name ?? "").trim();
      const rawEmail = (row.email ?? "").trim();
      const email = rawEmail.toLowerCase();

      if (!firstName) {
        result.errors.push({
          row: rowNumber,
          email: rawEmail,
          message: "Missing first name.",
        });
        return;
      }
      if (!rawEmail) {
        result.errors.push({
          row: rowNumber,
          email: rawEmail,
          message: "Missing email.",
        });
        return;
      }
      if (!EMAIL_PATTERN.test(rawEmail)) {
        result.errors.push({
          row: rowNumber,
          email: rawEmail,
          message: "Invalid email format.",
        });
        return;
      }

      normalised.push({
        rowIndex: rowNumber,
        first_name: firstName,
        last_name: lastName,
        email,
        original_email: rawEmail,
        phone: (row.phone ?? "").trim() || null,
        referral_code_to_credit:
          (row.referral_code_to_credit ?? "").trim() || null,
      });
    });

    if (normalised.length === 0) {
      return { data: result, error: null };
    }

    // Bulk duplicate pre-check (single query)
    const existingEmails = new Set<string>();
    if (skipDuplicates) {
      const { data: existing, error: dupErr } = await admin
        .from("parent_profiles")
        .select("email")
        .in(
          "email",
          normalised.map((n) => n.email)
        );
      if (dupErr) {
        return {
          data: empty,
          error: `Duplicate check failed: ${dupErr.message}`,
        };
      }
      for (const e of existing ?? []) {
        if (e?.email) existingEmails.add(String(e.email).toLowerCase());
      }
    }

    const redirectTo = getAuthCallbackUrl("/parent-login");

    // Process rows one at a time so a single failure doesn't poison
    // the whole batch.
    for (const n of normalised) {
      if (skipDuplicates && existingEmails.has(n.email)) {
        result.skipped++;
        continue;
      }

      try {
        // 1. Create the auth user (or reuse if already present)
        let authUserId: string | null = null;
        const { data: authCreate, error: authErr } =
          await admin.auth.admin.createUser({
            email: n.email,
            email_confirm: true,
            user_metadata: {
              first_name: n.first_name,
              last_name: n.last_name,
              invited_via: "bulk_import",
            },
          });

        if (authCreate?.user?.id) {
          authUserId = authCreate.user.id;
        } else if (authErr) {
          const msg = (authErr.message || "").toLowerCase();
          // Race-safe: if the auth user already exists, treat as
          // duplicate when skipDuplicates is on; otherwise surface
          // an error.
          if (msg.includes("already") || msg.includes("registered")) {
            if (skipDuplicates) {
              result.skipped++;
              continue;
            }
            result.errors.push({
              row: n.rowIndex,
              email: n.original_email,
              message: "Auth user already exists.",
            });
            continue;
          }
          result.errors.push({
            row: n.rowIndex,
            email: n.original_email,
            message: authErr.message,
          });
          continue;
        }

        if (!authUserId) {
          result.errors.push({
            row: n.rowIndex,
            email: n.original_email,
            message: "Failed to create auth user.",
          });
          continue;
        }

        // 2. Insert parent_profiles row
        const { error: insertErr } = await admin
          .from("parent_profiles")
          .insert({
            user_id: authUserId,
            first_name: n.first_name,
            last_name: n.last_name || "",
            email: n.email,
            phone: n.phone,
          });

        if (insertErr) {
          // Roll back auth user so a retry can succeed cleanly.
          await admin.auth.admin
            .deleteUser(authUserId)
            .catch((err) => console.error("rollback auth user failed:", err));
          result.errors.push({
            row: n.rowIndex,
            email: n.original_email,
            message: insertErr.message,
          });
          continue;
        }

        // 3. Generate magic link + send via Resend (custom template)
        let magicLinkUrl = redirectTo;
        try {
          const { data: linkData, error: linkErr } =
            await admin.auth.admin.generateLink({
              type: "magiclink",
              email: n.email,
              options: { redirectTo },
            });
          if (linkErr) {
            // Non-fatal: parent can still hit /parent-login and
            // request a fresh link with the same email. Record the
            // error so the operator can investigate.
            result.errors.push({
              row: n.rowIndex,
              email: n.original_email,
              message: `Magic link generation failed: ${linkErr.message}`,
            });
          } else {
            const props = (
              linkData as { properties?: { action_link?: string } } | null
            )?.properties;
            magicLinkUrl = props?.action_link || redirectTo;
          }
        } catch (linkExc) {
          console.error("generateLink exception:", linkExc);
          result.errors.push({
            row: n.rowIndex,
            email: n.original_email,
            message: "Magic link generation threw.",
          });
        }

        const tpl = parentBulkInvite({
          firstName: n.first_name,
          magicLinkUrl,
        });
        const sendResult = await sendEmail({
          to: n.email,
          subject: tpl.subject,
          html: tpl.html,
          recipientId: authUserId,
          emailType: "parent_bulk_invite",
          metadata: {
            invited_by: user.id,
            referral_code_to_credit: n.referral_code_to_credit,
          },
        });

        if (!sendResult.success) {
          // Insert succeeded but email failed — count as an error
          // for the operator while leaving the row in place. They
          // can re-trigger the magic link from the parent record.
          result.errors.push({
            row: n.rowIndex,
            email: n.original_email,
            message: sendResult.error || "Resend send failed.",
          });
        }

        // 4. Activity log entry per invite
        await admin
          .from("activity_log")
          .insert({
            user_id: user.id,
            action: "parent_invited_via_bulk",
            entity_type: "parent_profile",
            entity_id: authUserId,
            metadata: {
              email: n.email,
              referral_code_to_credit: n.referral_code_to_credit,
              email_sent: sendResult.success,
            },
          })
          .then((res) => {
            if (res.error) {
              console.error("activity_log insert failed:", res.error);
            }
          });

        result.created++;
      } catch (rowErr) {
        console.error("importParents row error:", rowErr);
        result.errors.push({
          row: n.rowIndex,
          email: n.original_email,
          message:
            rowErr instanceof Error ? rowErr.message : "Unexpected error.",
        });
      }
    }

    return { data: result, error: null };
  } catch (err) {
    console.error("importParents error:", err);
    return {
      data: empty,
      error: "Bulk parent import failed. Please try again.",
    };
  }
}
