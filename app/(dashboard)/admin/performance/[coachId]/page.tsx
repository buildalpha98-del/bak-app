import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  getCoachPerformanceDetail,
  getTeamPerformanceData,
} from "@/lib/performance/actions";
import { CoachPerformanceDetail } from "@/components/performance/coach-performance-detail";

interface CoachPerformancePageProps {
  params: Promise<{ coachId: string }>;
}

export default async function CoachPerformancePage({
  params,
}: CoachPerformancePageProps) {
  const { coachId } = await params;

  // Fetch this month's period boundaries for team data
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const [detail, team] = await Promise.all([
    getCoachPerformanceDetail(coachId),
    getTeamPerformanceData(periodStart, periodEnd),
  ]);

  if (!detail.coach || detail.coach.id === coachId && detail.coach.name === "Unknown") {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <Link
          href="/admin/performance"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="size-4" /> Back to Team
        </Link>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          {detail.coach.name}
        </h1>
        <p className="mt-1 text-muted-foreground">Performance Profile</p>
      </div>
      <CoachPerformanceDetail
        detail={detail}
        teamAverages={team.averages}
        allCoaches={team.coaches.map((c) => ({
          id: c.id,
          name: c.name,
          normalised: c.normalised,
        }))}
      />
    </div>
  );
}
