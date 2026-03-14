import { getLatestForecasts } from "@/lib/forecasting/actions";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default async function AnalyticsPage() {
  const { data, error } = await getLatestForecasts();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load forecast data. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <AnalyticsDashboard monthly={data.monthly} quarterly={data.quarterly} />
    </div>
  );
}
