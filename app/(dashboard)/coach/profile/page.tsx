import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoachPayRates } from "@/lib/pay-rates/actions";
import { CoachPayRates } from "@/components/pay-rates/coach-pay-rates";
import { GSTToggle } from "@/components/invoicing/gst-toggle";
import { EditProfileDialog } from "@/components/coach/edit-profile-dialog";

export default async function CoachProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch profile for display
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, phone, abn, photo_url, gst_registered")
    .eq("id", user.id)
    .single();

  // Fetch pay rates
  const { data: payData } = await getCoachPayRates();

  return (
    <div className="mx-auto max-w-lg space-y-6 animate-fade-up">
      <h1 className="text-xl font-semibold font-heading text-foreground">Profile</h1>

      {/* Basic info */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3 stagger-1">
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
