import { getLeads, getPipelineSummary } from "@/lib/crm/actions";
import { PipelineBoard } from "@/components/crm/pipeline-board";

export default async function AdminCrmPage() {
  const [leadsResult, summaryResult] = await Promise.all([
    getLeads(),
    getPipelineSummary(),
  ]);

  if (leadsResult.error || summaryResult.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {leadsResult.error ?? summaryResult.error}
      </div>
    );
  }

  return (
    <PipelineBoard
      leads={leadsResult.data}
      summary={summaryResult.data!}
      basePath="/admin/crm"
    />
  );
}
