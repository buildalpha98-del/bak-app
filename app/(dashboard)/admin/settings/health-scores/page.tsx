import { getHealthScoreConfig } from "@/lib/health/actions";
import { HealthConfigView } from "@/components/health/health-config-view";

export default async function HealthScoresPage() {
  const { data, error } = await getHealthScoreConfig();

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">
          Health Score Configuration
        </h1>
        <p className="mt-2 text-red-600">
          Failed to load health score configuration: {error}
        </p>
      </div>
    );
  }

  return <HealthConfigView initialConfig={data ?? []} />;
}
