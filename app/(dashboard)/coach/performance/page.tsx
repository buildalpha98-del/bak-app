import { getCoachSelfPerformance } from "@/lib/performance/actions";
import { CoachSelfView } from "@/components/performance/coach-self-view";

export default async function CoachPerformancePage() {
  const data = await getCoachSelfPerformance();
  return (
    <div className="space-y-8">
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
      <CoachSelfView data={data} />
    </div>
  );
}
