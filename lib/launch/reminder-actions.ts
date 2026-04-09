"use server";

// ============================================================
// Launch Foundation — Reminder settings server actions
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ========================
// Toggle reminders on/off
// ========================

export async function toggleReminders(
  enabled: boolean
): Promise<{ success: boolean }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false };

    const adminClient = createSupabaseAdmin();
    const { error } = await adminClient.from("business_settings").upsert(
      {
        key: "session_reminders_enabled",
        value: enabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: !error };
  } catch {
    return { success: false };
  }
}

// ========================
// Manually trigger reminders
// ========================

export async function triggerReminders(): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { success: false, error: "CRON_SECRET not configured." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const response = await fetch(`${appUrl}/api/cron/session-reminders`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Cron returned ${response.status}` };
    }

    const data = await response.json();

    // Save last run results
    const adminClient = createSupabaseAdmin();
    await adminClient.from("business_settings").upsert(
      {
        key: "session_reminders_last_run",
        value: { ...data, ran_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: true, data };
  } catch (err) {
    console.error("triggerReminders error:", err);
    return { success: false, error: "Failed to trigger reminders." };
  }
}
