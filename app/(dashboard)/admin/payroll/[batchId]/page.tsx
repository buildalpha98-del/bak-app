import { notFound } from "next/navigation";
import { getBatchDetail } from "@/lib/invoicing/payroll-actions";
import { PayrollBatchDetail } from "@/components/payroll/payroll-batch-detail";

export default async function PayrollBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const { data, error } = await getBatchDetail(batchId);

  if (error || !data) {
    if (error?.includes("not found")) notFound();
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{error ?? "Failed to load batch."}</p>
      </div>
    );
  }

  return <PayrollBatchDetail batch={data.batch} invoices={data.invoices} />;
}
