"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

function generateRandomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `COMEBACK-${result}`;
}

/**
 * Generate a discount code with a flat amount value.
 */
export async function generateDiscountCode(
  valueCents: number,
  parentId?: string,
  campaignId?: string,
  expiresInDays?: number
): Promise<{
  data: { code: string; id: string } | null;
  error: string | null;
}> {
  try {
    const supabase = createSupabaseAdmin();

    const code = generateRandomCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresInDays ?? 90));

    const { data, error } = await supabase
      .from("discount_codes")
      .insert({
        code,
        type: "flat_amount",
        value_cents: valueCents,
        parent_id: parentId ?? null,
        campaign_id: campaignId ?? null,
        expires_at: expiresAt.toISOString(),
        used: false,
      })
      .select("id, code")
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: { code: data.code, id: data.id }, error: null };
  } catch (err) {
    console.error("Error generating discount code:", err);
    return { data: null, error: "Failed to generate discount code" };
  }
}

/**
 * Validate a discount code. Checks existence, expiry, usage,
 * and parent ownership if applicable.
 */
export async function validateDiscountCode(code: string): Promise<{
  data: { valid: boolean; valueCents: number; codeId: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: discountCode, error } = await supabase
      .from("discount_codes")
      .select("id, code, value_cents, used, expires_at, parent_id")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !discountCode) {
      return {
        data: { valid: false, valueCents: 0, codeId: "" },
        error: null,
      };
    }

    // Check if already used
    if (discountCode.used) {
      return {
        data: { valid: false, valueCents: 0, codeId: discountCode.id },
        error: null,
      };
    }

    // Check if expired
    if (
      discountCode.expires_at &&
      new Date(discountCode.expires_at) < new Date()
    ) {
      return {
        data: { valid: false, valueCents: 0, codeId: discountCode.id },
        error: null,
      };
    }

    // If parent-specific, verify authenticated user matches
    if (discountCode.parent_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { data: null, error: "Authentication required" };
      }

      const { data: parentProfile } = await supabase
        .from("parent_profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!parentProfile || parentProfile.id !== discountCode.parent_id) {
        return {
          data: { valid: false, valueCents: 0, codeId: discountCode.id },
          error: null,
        };
      }
    }

    return {
      data: {
        valid: true,
        valueCents: discountCode.value_cents,
        codeId: discountCode.id,
      },
      error: null,
    };
  } catch (err) {
    console.error("Error validating discount code:", err);
    return { data: null, error: "Failed to validate discount code" };
  }
}

/**
 * Redeem a discount code by marking it as used.
 */
export async function redeemDiscountCode(codeId: string): Promise<{
  error: string | null;
}> {
  try {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from("discount_codes")
      .update({
        used: true,
        used_at: new Date().toISOString(),
      })
      .eq("id", codeId);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    console.error("Error redeeming discount code:", err);
    return { error: "Failed to redeem discount code" };
  }
}

/**
 * Get all valid (unused, unexpired) discount codes for the
 * authenticated parent user.
 */
export async function getParentDiscountCodes(): Promise<{
  data: Array<{
    id: string;
    code: string;
    value_cents: number;
    expires_at: string | null;
  }> | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Authentication required" };
    }

    // Get parent profile
    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentProfile) {
      return { data: null, error: "Parent profile not found" };
    }

    const { data: codes, error } = await supabase
      .from("discount_codes")
      .select("id, code, value_cents, expires_at")
      .eq("parent_id", parentProfile.id)
      .eq("used", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: codes ?? [], error: null };
  } catch (err) {
    console.error("Error fetching parent discount codes:", err);
    return { data: null, error: "Failed to fetch discount codes" };
  }
}
