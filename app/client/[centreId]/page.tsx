import { redirect } from "next/navigation";
import {
  getCurrentClientUser,
  getClientUserCentresSummary,
} from "@/lib/client/actions";
import { getClientDashboard } from "@/lib/client/portal-actions";
import { getClientStatusPulse } from "@/lib/client/status-pulse-actions";
import { getCalendarToken } from "@/lib/calendar/actions";
import { ClientDashboard } from "@/components/client/client-dashboard";
import { WelcomeBanner } from "@/components/client/welcome-banner";
import { SchoolDashboard } from "@/components/client/school-dashboard";
import { getSchoolDashboard } from "@/lib/client/school-dashboard-actions";

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // is_authorised_for_current is set after the join lookup. Falsey
  // means the user can't see this centre — bounce them back to the
  // default one rather than 404 / login.
  if (clientUser.is_authorised_for_current === false) {
    redirect(`/client/${clientUser.centre_id}`);
  }

  // Schools land on their own dashboard: term plans, assessments and
  // report cards, this week's lessons and sessions (September 2026).
  if (clientUser.centre_type === "school") {
    const { data: school, error: schoolError } = await getSchoolDashboard(centreId);
    if (school && !schoolError) {
      // "Mrs Bennett" greets as "Mrs Bennett", not "Mrs".
      const tokens = (clientUser.name ?? "").trim().split(/\s+/);
      const first = /^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(tokens[0] ?? "") ? tokens.join(" ") : tokens[0] || "there";
      return <SchoolDashboard data={school} centreId={centreId} firstName={first} />;
    }
  }

  const [{ data, error }, pulse, { token: calToken }, centresSummaryRes] =
    await Promise.all([
      getClientDashboard(centreId),
      getClientStatusPulse(centreId),
      getCalendarToken("centre", centreId),
      getClientUserCentresSummary(),
    ]);

  if (error || !data) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load dashboard data. Please try again later.
        </p>
      </div>
    );
  }

  const calendarFeedUrl = calToken
    ? `https://buildalphakids.app/api/calendar/centre/${calToken}.ics`
    : null;

  const firstName = (clientUser.name ?? "").split(" ")[0] || "there";

  return (
    <div className="space-y-6">
      {/* One-time orientation for brand-new directors. */}
      {!clientUser.welcomed_at && (
        <WelcomeBanner centreId={centreId} firstName={firstName} />
      )}
      <ClientDashboard
        data={data}
        centreId={centreId}
        pulse={pulse}
        calendarFeedUrl={calendarFeedUrl}
        centresSummary={centresSummaryRes.data ?? []}
        isSchool={clientUser.centre_type === "school"}
      />
    </div>
  );
}
