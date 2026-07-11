import { getLeads, getPipelineSummary, getCrmStaffMembers } from "@/lib/crm/actions";
import {
  getCrmStatusPulse,
  getHotLeadIds,
  getSequencesSummary,
} from "@/lib/crm/status-pulse-actions";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { getRegions } from "@/lib/regions/actions";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { LoadError } from "@/components/ui/load-error";

export default async function OpsCrmPage() {
  const [
    leadsResult,
    summaryResult,
    pulse,
    hotLeadIds,
    sequencesSummary,
    financialAccess,
    staffResult,
    regionsResult,
  ] = await Promise.all([
    getLeads(),
    getPipelineSummary(),
    getCrmStatusPulse(),
    getHotLeadIds(),
    getSequencesSummary(),
    getFinancialAccess(),
    getCrmStaffMembers(),
    getRegions(),
  ]);

  if (leadsResult.error || summaryResult.error) {
    return (
      <LoadError message={leadsResult.error ?? summaryResult.error} />
    );
  }

  return (
    <PipelineBoard
      leads={leadsResult.data}
      summary={summaryResult.data!}
      basePath="/ops/crm"
      pulse={pulse}
      hotLeadIds={hotLeadIds}
      sequencesSummary={sequencesSummary}
      financialAccess={financialAccess}
      staff={staffResult.data}
      regions={(regionsResult.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        suburbs: r.suburbs,
      }))}
    />
  );
}
