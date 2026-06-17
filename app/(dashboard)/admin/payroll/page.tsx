import { getPaymentBatches } from "@/lib/invoicing/payroll-actions";
import { getPayrollStatusPulse } from "@/lib/invoicing/payroll-status-pulse-actions";
import { getFortnightlyPeriod } from "@/lib/utils/payRates";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";
import { PayrollStatusPulseStrip } from "@/components/payroll/payroll-status-pulse";

export default async function AdminPayrollPage() {
  const [{ data: batches, error }, pulse] = await Promise.all([
    getPaymentBatches(),
    getPayrollStatusPulse(),
  ]);

  // Compute current + previous fortnightly periods
  const current = getFortnightlyPeriod(new Date());
  const prevDate = new Date();
  prevDate.setDate(prevDate.getDate() - 14);
  const previous = getFortnightlyPeriod(prevDate);

  const toDateStr = (d: Date) => d.toISOString().split("T")[0];

  const currentPeriod = {
    start: toDateStr(current.start),
    end: toDateStr(current.end),
  };
  const previousPeriod = {
    start: toDateStr(previous.start),
    end: toDateStr(previous.end),
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PayrollStatusPulseStrip pulse={pulse} basePath="/admin/payroll" />
      <PayrollDashboard
        batches={batches ?? []}
        error={error}
        currentPeriod={currentPeriod}
        previousPeriod={previousPeriod}
      />
    </div>
  );
}
