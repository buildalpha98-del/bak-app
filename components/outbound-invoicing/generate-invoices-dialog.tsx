"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  calculateOutboundInvoices,
  generateOutboundInvoices,
  type OutboundInvoicePreview,
} from "@/lib/outbound-invoicing/actions";

export function GenerateInvoicesDialog() {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [previews, setPreviews] = useState<OutboundInvoicePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function handleCalculate() {
    if (!periodStart || !periodEnd) {
      toast.error("Please select a billing period.");
      return;
    }
    setLoading(true);
    const { data, error } = await calculateOutboundInvoices(periodStart, periodEnd);
    if (error) {
      toast.error(error);
    } else {
      setPreviews(data ?? []);
      if (data?.length === 0) {
        toast.info("No completed sessions found for this period.");
      }
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    const { data, error } = await generateOutboundInvoices(periodStart, periodEnd, previews);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`${data?.count ?? 0} invoices generated.`);
      setOpen(false);
      setPreviews([]);
    }
    setGenerating(false);
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="bg-[#E8712A] hover:bg-[#D4631F]">
        <FileText className="mr-2 h-4 w-4" />
        Generate Invoices
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-6 space-y-4 bg-white">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Generate Outbound Invoices</h3>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium text-[#1A1A1A]">Period Start</label>
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1A1A1A]">Period End</label>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
        <Button onClick={handleCalculate} disabled={loading} variant="outline">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Calculate
        </Button>
      </div>

      {previews.length > 0 && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F5]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Centre</th>
                  <th className="text-left px-4 py-2 font-medium">Model</th>
                  <th className="text-right px-4 py-2 font-medium">Sessions</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previews.map((p) => (
                  <tr key={p.centreId}>
                    <td className="px-4 py-2">{p.centreName}</td>
                    <td className="px-4 py-2 text-[#666666]">{p.pricingModel.replace("_", " ")}</td>
                    <td className="px-4 py-2 text-right">{p.sessionCount}</td>
                    <td className="px-4 py-2 text-right font-medium">${p.totalAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#F5F5F5]">
                <tr>
                  <td className="px-4 py-2 font-semibold" colSpan={2}>
                    Total ({previews.length} centres)
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {previews.reduce((s, p) => s + p.sessionCount, 0)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    ${previews.reduce((s, p) => s + p.totalAmount, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-[#E8712A] hover:bg-[#D4631F]"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Generate All
            </Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setPreviews([]); }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
