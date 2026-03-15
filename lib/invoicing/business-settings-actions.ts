"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export interface BusinessSettingsMap {
  business_name: string;
  abn: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  bank_name: string;
  bank_bsb: string;
  bank_account_number: string;
  bank_account_name: string;
  payment_terms_text: string;
  payment_terms_days: number;
  gst_enabled: boolean;
  gst_inclusive: boolean;
  gst_rate: number;
  square_online_enabled: boolean;
  square_payment_url: string;
}

const DEFAULTS: BusinessSettingsMap = {
  business_name: "",
  abn: "",
  business_address: "",
  business_phone: "",
  business_email: "",
  bank_name: "",
  bank_bsb: "",
  bank_account_number: "",
  bank_account_name: "",
  payment_terms_text: "Payment due within 14 days of invoice date.",
  payment_terms_days: 14,
  gst_enabled: true,
  gst_inclusive: false,
  gst_rate: 10,
  square_online_enabled: false,
  square_payment_url: "",
};

const BOOLEAN_KEYS: (keyof BusinessSettingsMap)[] = [
  "gst_enabled",
  "gst_inclusive",
  "square_online_enabled",
];

const NUMBER_KEYS: (keyof BusinessSettingsMap)[] = [
  "payment_terms_days",
  "gst_rate",
];

function parseValue(key: keyof BusinessSettingsMap, raw: string): string | number | boolean {
  if (BOOLEAN_KEYS.includes(key)) return raw === "true";
  if (NUMBER_KEYS.includes(key)) return Number(raw);
  return raw;
}

export async function getBusinessSettings(): Promise<{
  data: BusinessSettingsMap | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: rows, error } = await supabase
      .from("business_settings")
      .select("key, value");

    if (error) return { data: null, error: error.message };

    const settings: BusinessSettingsMap = { ...DEFAULTS };

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const key = row.key as keyof BusinessSettingsMap;
        if (key in DEFAULTS) {
          (settings as unknown as Record<string, string | number | boolean>)[key] = parseValue(key, row.value);
        }
      }
    }

    return { data: settings, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

export async function updateBusinessSettings(
  settings: Partial<BusinessSettingsMap>
): Promise<{ data: boolean | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Admin role check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return { data: null, error: "Only administrators can update invoicing settings." };
    }

    const admin = createSupabaseAdmin();

    // Upsert each key-value pair
    const entries = Object.entries(settings) as [keyof BusinessSettingsMap, string | number | boolean][];

    for (const [key, value] of entries) {
      const { error } = await admin
        .from("business_settings")
        .upsert(
          { key, value: String(value) },
          { onConflict: "key" }
        );

      if (error) {
        return { data: null, error: `Failed to save ${key}: ${error.message}` };
      }
    }

    // Activity log
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "business_settings_updated",
      entity_type: "business_settings",
      metadata: {
        keys_updated: Object.keys(settings),
      },
    });

    revalidatePath("/admin/settings/invoicing");

    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}
