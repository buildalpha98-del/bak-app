"use client";

// ============================================================
// Shared-link portal view — token-gated, read-only snapshot
// ============================================================
//
// Committee members / assistant directors land here from a link the
// primary contact shared. Real (thin) data replaces the old
// placeholder cards: next sessions, enrolment count, recent reports.
// Full detail requires a proper sign-in.

import { AlertTriangle, Calendar, Users, FileText } from "lucide-react";
import { AppLogo } from "@/components/shared/app-logo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { SharedPortalSnapshot } from "@/lib/client/actions";

interface SharedPortalViewProps {
  centreId: string;
  centreName: string;
  /** White-label centres' own mark; null renders the BAK crest. */
  centreLogoUrl: string | null;
  /** White-label accent anchor; null keeps the default portal cyan. */
  centreBrandColour: string | null;
  primaryUserName: string;
  snapshot: SharedPortalSnapshot;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SharedPortalView({
  centreName,
  centreLogoUrl,
  centreBrandColour,
  primaryUserName,
  snapshot,
}: SharedPortalViewProps) {
  return (
    <div
      className="min-h-screen bg-slate-50"
      style={
        centreBrandColour
          ? ({ "--portal-brand": centreBrandColour } as React.CSSProperties)
          : undefined
      }
    >
      {/* Shared link warning banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>
            You&apos;re viewing a shared link &mdash; contact{" "}
            <span className="font-medium">{primaryUserName}</span> for full
            access
          </p>
        </div>
      </div>

      {/* Top bar */}
      <header className="border-b bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <AppLogo size="sm" logoUrl={centreLogoUrl} alt={centreName} />
          <span className="text-base font-semibold text-foreground">
            {centreName}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{centreName}</h1>
          <p className="text-sm text-muted-foreground">
            A read-only snapshot of the centre portal. Sign in for the full
            schedule, reports, children and messaging.
          </p>
          <a
            href="/client-login"
            className="inline-block mt-2 text-sm font-medium text-portal-600 hover:underline"
          >
            Sign in for full access
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Upcoming sessions */}
          <Card className="rounded-2xl transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-portal-600" />
                <CardTitle className="text-base">Upcoming</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {snapshot.upcomingSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sessions scheduled yet.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {snapshot.upcomingSessions.map((s, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate text-foreground">{s.sport}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {fmtDate(s.date)} {s.time.slice(0, 5)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Children */}
          <Card className="rounded-2xl transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-portal-600" />
                <CardTitle className="text-base">Children</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {snapshot.childrenCount}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                enrolled in the program
              </p>
            </CardContent>
          </Card>

          {/* Recent reports */}
          <Card className="rounded-2xl transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-portal-600" />
                <CardTitle className="text-base">Reports</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {snapshot.recentReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reports sent yet.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {snapshot.recentReports.map((r, i) => (
                    <li key={i} className="truncate text-foreground">
                      {r.title}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Sign in to read full reports.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
