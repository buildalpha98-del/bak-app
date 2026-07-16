import Link from "@/components/ui/app-link";
import { ArrowLeft } from "lucide-react";
import { getRecentActivity } from "@/lib/launch/dashboard-actions";
import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Full activity list — surfaced from the home dashboard's "View all
 * activity →" link. Reuses the same `<ActivityTimeline>` component
 * with `showChips` enabled for the same client-side filter UX.
 *
 * Pagination is deliberately deferred — the brief caps this at 200 for
 * the beta cohort. Spool out an "older →" link when we have a need.
 */
export default async function AdminActivityPage() {
  const items = await getRecentActivity(200);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          All Activity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The most recent {items.length} events across centres, coaches, sessions, payments and CRM.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="py-4">
          <ActivityTimeline items={items} />
        </CardContent>
      </Card>
    </div>
  );
}
