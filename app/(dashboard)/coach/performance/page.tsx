import { getCoachSelfPerformance } from "@/lib/performance/actions";
import { CoachSelfView } from "@/components/performance/coach-self-view";
import { CoachSelfPulseStrip } from "@/components/performance/coach-self-pulse";

export default async function CoachPerformancePage() {
  const data = await getCoachSelfPerformance();

  // Compute pulse stats from the snapshot the page already pulled —
  // no extra round-trips. Keeps "own data only" guarantee.
  const metricsJson = data.current?.metrics_json as unknown as
    | Record<string, Record<string, unknown>>
    | null;
  const sessionsThisPeriod =
    (metricsJson?.session_volume?.count as number) ?? 0;
  const badgesEarned = data.badges.length;
  const monthsTracked = data.snapshots.length;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Your Stats
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          My Performance
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Track your progress, earn badges, and see how you compare.
        </p>
      </div>

      <div className="animate-fade-up stagger-1">
        <CoachSelfPulseStrip
          sessionsThisPeriod={sessionsThisPeriod}
          badgesEarned={badgesEarned}
          monthsTracked={monthsTracked}
        />
      </div>

      <div className="animate-fade-up stagger-2">
        <CoachSelfView data={data} />
      </div>
    </div>
  );
}
