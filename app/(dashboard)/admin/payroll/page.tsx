import { getPaymentBatches, createOrGetPaymentBatch } from "@/lib/invoicing/payroll-actions";
import { getFortnightlyPeriod } from "@/lib/utils/payRates";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";

export default async function AdminPayrollPage() {
  const { data: batches, error } = await getPaymentBatches();

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
    <PayrollDashboard
      batches={batches ?? []}
      error={error}
      currentPeriod={currentPeriod}
      previousPeriod={previousPeriod}
    />
  );
}
