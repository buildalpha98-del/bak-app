import {
  getReportGenerationOptions,
  listReports,
} from "@/lib/reports/actions";
import {
  getReportsStatusPulse,
  getCentresWithoutReport,
} from "@/lib/reports/status-pulse-actions";
import { ReportsView } from "@/components/reports/reports-view";
import { ReportsStatusPulseStrip } from "@/components/reports/reports-status-pulse";

export default async function OpsReportsPage() {
  const [options, reports, pulse, centresWithoutReport] = await Promise.all([
    getReportGenerationOptions(),
    listReports(),
    getReportsStatusPulse(),
    getCentresWithoutReport(),
  ]);

  return (
    <div className="space-y-6">
      <ReportsStatusPulseStrip pulse={pulse} basePath="/ops/reports" />
      <ReportsView
        options={options}
        reports={reports}
        centresWithoutReport={centresWithoutReport.data}
        basePath="/ops/reports"
      />
    </div>
  );
}
