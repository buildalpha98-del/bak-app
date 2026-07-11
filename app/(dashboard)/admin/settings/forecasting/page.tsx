import { getForecastConfig } from "@/lib/forecasting/actions";
import { ForecastConfigView } from "@/components/analytics/forecast-config-view";
import { LoadError } from "@/components/ui/load-error";

export default async function ForecastingSettingsPage() {
  const { data, error } = await getForecastConfig();

  if (error) {
    return (
      <LoadError message="Failed to load forecast configuration. Please try refreshing." />
    );
  }

  return (
    <div className="animate-fade-up">
      <ForecastConfigView config={data} />
    </div>
  );
}
