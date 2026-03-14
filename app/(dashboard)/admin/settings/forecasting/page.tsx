import { getForecastConfig } from "@/lib/forecasting/actions";
import { ForecastConfigView } from "@/components/analytics/forecast-config-view";

export default async function ForecastingSettingsPage() {
  const { data, error } = await getForecastConfig();

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load forecast configuration. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <ForecastConfigView config={data} />
    </div>
  );
}
