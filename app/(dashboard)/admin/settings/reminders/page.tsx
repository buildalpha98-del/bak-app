import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ReminderSettings } from "@/components/launch/reminder-settings";

export default async function ReminderSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get current settings
  const { data: enabledSetting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("key", "session_reminders_enabled")
    .maybeSingle();

  const { data: lastRunSetting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("key", "session_reminders_last_run")
    .maybeSingle();

  const isEnabled = enabledSetting
    ? enabledSetting.value === true || enabledSetting.value === "true"
    : true;

  const lastRun = lastRunSetting?.value as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Session Reminders
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure automated 24-hour session reminders for parents and coaches.
        </p>
      </div>

      <ReminderSettings
        initialEnabled={isEnabled}
        lastRun={lastRun}
      />
    </div>
  );
}
