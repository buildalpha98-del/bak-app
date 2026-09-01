import { redirect } from "next/navigation";
import { BarChart3, Users, Star, TrendingUp, Activity, Dumbbell } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getImpactDashboard } from "@/lib/client/impact-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AttendanceChart,
  RatingChart,
  SportPieChart,
} from "@/components/client/impact-charts";

export default async function ImpactDashboardPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  // Multi-campus: authorisation comes from the join table, not the
  // default centre. Bounce only when genuinely unauthorised.
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  const data = await getImpactDashboard(centreId);
  if (!data) redirect(`/client/${clientUser.centre_id}`);
  const { stats, attendanceTrend, ratingTrend, sportBreakdown, classRollups, termName } =
    data;

  const sessionChange =
    stats.sessionsLastTerm > 0
      ? Math.round(
          ((stats.sessionsThisTerm - stats.sessionsLastTerm) / stats.sessionsLastTerm) * 100
        )
      : null;

  const statCards = [
    {
      label: "Sessions This Term",
      value: stats.sessionsThisTerm,
      icon: BarChart3,
      iconBg: "bg-portal-50",
      iconColour: "text-portal-600",
      suffix: null,
      badge:
        sessionChange !== null ? (
          <Badge
            className={
              sessionChange >= 0
                ? "bg-green-50 text-green-700 border-green-200 text-xs"
                : "bg-red-50 text-red-700 border-red-200 text-xs"
            }
          >
            {sessionChange >= 0 ? "+" : ""}
            {sessionChange}% vs last term
          </Badge>
        ) : null,
    },
    {
      label: "Total Children",
      value: stats.totalChildren,
      icon: Users,
      iconBg: "bg-purple-50",
      iconColour: "text-purple-600",
      suffix: null,
      badge: null,
    },
    {
      label: "Sports Delivered",
      value: stats.uniqueSportsDelivered,
      icon: Dumbbell,
      iconBg: "bg-orange-50",
      iconColour: "text-orange-600",
      suffix: null,
      badge: null,
    },
    {
      label: "Average Rating",
      value: stats.averageRating.toFixed(1),
      icon: Star,
      iconBg: "bg-amber-50",
      iconColour: "text-amber-500",
      suffix: "/ 5",
      badge: null,
    },
    {
      label: "Attendance Rate",
      value: stats.attendanceRate,
      icon: Activity,
      iconBg: "bg-green-50",
      iconColour: "text-green-600",
      suffix: "%",
      badge: null,
    },
    {
      label: "All-Time Sessions",
      value: stats.totalSessionsAllTime,
      icon: TrendingUp,
      iconBg: "bg-portal-50",
      iconColour: "text-portal-600",
      suffix: null,
      badge: null,
    },
  ];

  const hasAnyData =
    stats.totalSessionsAllTime > 0 ||
    attendanceTrend.length > 0 ||
    ratingTrend.length > 0 ||
    sportBreakdown.length > 0;

  if (!hasAnyData) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Impact Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{termName}</p>
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-portal-600/10">
            <BarChart3 className="h-6 w-6 text-portal-600" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No data yet</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            Impact data will appear here once coaching sessions have been completed at
            your centre.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Impact Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">{termName}</p>
      </div>

      {/* Stats hero row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="rounded-2xl bg-card transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${stat.iconBg}`}
                  >
                    <Icon className={`h-4 w-4 ${stat.iconColour}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                    <p className="mt-0.5 text-xl font-bold text-foreground">
                      {stat.value}
                      {stat.suffix && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          {stat.suffix}
                        </span>
                      )}
                    </p>
                    {stat.badge && <div className="mt-1">{stat.badge}</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* By class — schools with a class list (design phase 2) */}
      {classRollups.length > 0 && (
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground">By class</h2>
            <span className="text-xs text-muted-foreground">
              Attendance &amp; average skill mark, {termName}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {classRollups.map((cls) => (
              <Card
                key={cls.id}
                className="rounded-2xl bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-foreground">{cls.name}</p>
                    <Badge
                      variant="secondary"
                      className="bg-portal-50 text-portal-700 hover:bg-portal-50"
                    >
                      Year {cls.year_group}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[cls.teacher_name, `${cls.student_count} students`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {cls.attendance_percentage != null
                          ? `${cls.attendance_percentage}%`
                          : "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Attendance</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {cls.avg_mark != null ? (
                          <>
                            {cls.avg_mark.toFixed(1)}
                            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                              / 5
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Avg skill mark</p>
                    </div>
                  </div>
                  {cls.mark_delta != null && cls.mark_delta !== 0 && (
                    <Badge
                      className={`mt-2 text-xs ${
                        cls.mark_delta > 0
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {cls.mark_delta > 0 ? "▲" : "▼"} {Math.abs(cls.mark_delta).toFixed(1)}{" "}
                      vs last term
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Charts section */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Attendance Trend — full width on mobile, spans 1 col on lg */}
        <Card className="rounded-2xl bg-card transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Attendance Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Weekly headcount &amp; sessions this term</p>
          </CardHeader>
          <CardContent>
            {attendanceTrend.length > 0 ? (
              <AttendanceChart data={attendanceTrend} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No attendance data for the current term.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Session Ratings */}
        <Card className="rounded-2xl bg-card transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Session Ratings
            </CardTitle>
            <p className="text-xs text-muted-foreground">Monthly average coach feedback scores</p>
          </CardHeader>
          <CardContent>
            {ratingTrend.length > 0 ? (
              <RatingChart data={ratingTrend} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No rating data available yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sport Breakdown — full width */}
        <Card className="rounded-2xl bg-card transition-shadow hover:shadow-md lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-gray-900">
              Sport Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Distribution of all-time completed sessions by sport
            </p>
          </CardHeader>
          <CardContent>
            {sportBreakdown.length > 0 ? (
              <SportPieChart data={sportBreakdown} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No sport data available yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
