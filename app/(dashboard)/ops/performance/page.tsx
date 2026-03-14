import { getTeamPerformanceData } from "@/lib/performance/actions";
import { TeamPerformanceView } from "@/components/performance/team-performance-view";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export default async function OpsPerformancePage() {
  const periodStart = firstOfMonth();
  const periodEnd = today();

  const data = await getTeamPerformanceData(periodStart, periodEnd);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Analytics
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Team Performance
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Monitor coach performance across sessions, feedback, forms, and reliability for the Build Alpha Kids team.
        </p>
      </div>

      <TeamPerformanceView initialData={data} />
    </div>
  );
}
