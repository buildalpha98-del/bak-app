import { getPipelineMetrics } from "@/lib/crm/metrics-actions";
import { PipelineMetricsView } from "@/components/crm/pipeline-metrics-view";

export default async function PipelineMetricsPage() {
  const { data, error } = await getPipelineMetrics();

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">
          {error ?? "Failed to load pipeline metrics."}
        </p>
      </div>
    );
  }

  return <PipelineMetricsView metrics={data} />;
}
