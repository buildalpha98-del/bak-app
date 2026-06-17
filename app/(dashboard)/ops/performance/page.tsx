import { getTeamPerformanceData } from "@/lib/performance/actions";
import { getPerformanceStatusPulse } from "@/lib/performance/status-pulse-actions";
import { getRegions } from "@/lib/regions/actions";
import { TeamPerformanceView } from "@/components/performance/team-performance-view";
import { PerformanceStatusPulseStrip } from "@/components/performance/performance-status-pulse";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface OpsPerformancePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OpsPerformancePage({
  searchParams,
}: OpsPerformancePageProps) {
  const sp = await searchParams;
  const fromRaw = sp.from;
  const toRaw = sp.to;
  const fromParam = Array.isArray(fromRaw) ? fromRaw[0] : fromRaw;
  const toParam = Array.isArray(toRaw) ? toRaw[0] : toRaw;
  const periodStart = fromParam ?? firstOfMonth();
  const periodEnd = toParam ?? today();

  const [data, pulse, regionsRes] = await Promise.all([
    getTeamPerformanceData(periodStart, periodEnd),
    getPerformanceStatusPulse(periodStart, periodEnd),
    getRegions(),
  ]);

  const regions = (regionsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Analytics
        </p>
        <h1 className="page-header-sport text-3xl font-bold font-heading tracking-tight text-foreground">
          Team Performance
        </h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          Monitor coach performance across sessions, feedback, forms, and reliability for the Build Alpha Kids team.
        </p>
      </div>

      <PerformanceStatusPulseStrip
        pulse={pulse}
        basePath="/ops/performance"
      />

      <TeamPerformanceView
        initialData={data}
        basePath="/ops/performance"
        regions={regions}
      />
    </div>
  );
}
