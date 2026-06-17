import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoachPayRates } from "@/lib/pay-rates/actions";
import { CoachPayRates } from "@/components/pay-rates/coach-pay-rates";
import { GSTToggle } from "@/components/invoicing/gst-toggle";
import { EditProfileDialog } from "@/components/coach/edit-profile-dialog";
import { SmsOptInToggle } from "@/components/sms/sms-opt-in-toggle";
import { PushOptInToggle } from "@/components/push/push-opt-in-toggle";
import { getPushSubscriptionCount } from "@/lib/push/actions";

export default async function CoachProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch profile for display
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, phone, abn, photo_url, gst_registered, sms_opt_in")
    .eq("id", user.id)
    .single();

  // Fetch pay rates
  const { data: payData } = await getCoachPayRates();

  // Count active push subscriptions for the opt-in card. Rendered
  // server-side so the toggle has a non-flicker starting state.
  const pushCount = await getPushSubscriptionCount(user.id);

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-up">
      <h1 className="text-xl font-semibold font-heading text-foreground">Profile</h1>

      {/* Basic info */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3 stagger-1 transition-shadow hover:shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Personal Details
          </h2>
          <EditProfileDialog
            currentPhone={profile?.phone ?? null}
            currentAbn={profile?.abn ?? null}
          />
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium text-foreground">
              {profile?.name ?? "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">
              {profile?.email ?? user.email ?? "—"}
            </span>
          </div>
          {profile?.phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium text-foreground">
                {profile.phone}
              </span>
            </div>
          )}
          {profile?.abn && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">ABN</span>
              <span className="font-medium text-foreground">{profile.abn}</span>
            </div>
          )}
        </div>
      </div>

      {/* GST Registration */}
      <GSTToggle initialValue={profile?.gst_registered ?? false} />

      {/* Push opt-in -- primary urgent-tier channel. SMS escalates only when
          push + in-app both miss; see lib/sms/actions.ts::sendUrgentNotificationViaSms. */}
      <PushOptInToggle initialCount={pushCount} />

      {/* SMS escalation opt-in (urgent notifications fall through to SMS when
          push fails — see lib/sms/actions.ts::sendUrgentNotificationViaSms). */}
      <SmsOptInToggle scope="profile" initialValue={profile?.sms_opt_in ?? false} />

      {/* Pay Rates */}
      <div className="space-y-3 stagger-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Pay Rates
        </h2>
        <CoachPayRates
          initialDefaultRate={payData?.defaultRate ?? null}
          initialRates={payData?.rates ?? []}
        />
      </div>
    </div>
  );
}
