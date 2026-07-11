import { getLatestForecasts } from "@/lib/forecasting/actions";
import { getAnalyticsStatusPulse } from "@/lib/forecasting/status-pulse-actions";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { AnalyticsStatusPulseStrip } from "@/components/analytics/analytics-status-pulse";
import { LoadError } from "@/components/ui/load-error";

export default async function AnalyticsPage() {
  const [{ data, error }, pulse] = await Promise.all([
    getLatestForecasts(),
    getAnalyticsStatusPulse(),
  ]);

  if (error) {
    return (
      <LoadError message="Failed to load forecast data. Please try refreshing." />
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      <AnalyticsStatusPulseStrip pulse={pulse} basePath="/admin/analytics" />
      <AnalyticsDashboard monthly={data.monthly} quarterly={data.quarterly} />
    </div>
  );
}
