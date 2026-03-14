import { getReportGenerationOptions, listReports } from "@/lib/reports/actions";
import { ReportsView } from "@/components/reports/reports-view";

export default async function OpsReportsPage() {
  const [options, reports] = await Promise.all([
    getReportGenerationOptions(),
    listReports(),
  ]);

  return <ReportsView options={options} reports={reports} />;
}
