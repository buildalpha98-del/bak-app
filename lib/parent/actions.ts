"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { welcomeParent } from "@/lib/launch/email-templates";
import { createNotification } from "@/lib/launch/notifications";
import { calculateAgeGroup } from "@/lib/utils/ageGroup";
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

export async function sendParentMagicLink(
  email: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseUrl}/parent-login`,
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
