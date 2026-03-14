"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicePreview } from "./invoice-preview";
import { InvoiceHistoryList } from "./invoice-history-list";
import { generateCoachInvoice } from "@/lib/invoicing/actions";
import { toast } from "sonner";
import type { CoachInvoice } from "@/lib/types/database";
import type { EarningsSessionItem } from "@/lib/pay-rates/actions";
import type { CoachInvoiceProfile } from "@/lib/invoicing/actions";

interface Props {
  periodOffset: number;
  periodStart: string;
  periodEnd: string;
  existingInvoice: CoachInvoice | null;
  uninvoicedSessions: EarningsSessionItem[];
  invoiceHistory: CoachInvoice[];
  gstRegistered: boolean;
  coachProfile: CoachInvoiceProfile;
}

function formatPeriodLabel(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

export function InvoicingDashboard({
  periodOffset,
  periodStart,
  periodEnd,
  existingInvoice,
  uninvoicedSessions,
  invoiceHistory,
  gstRegistered,
  coachProfile,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const navigatePeriod = (dir: -1 | 1) => {
    const next = periodOffset + dir;
    startTransition(() => {
      router.push(`/coach/invoicing?period=${next}`);
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const { error } = await generateCoachInvoice(periodStart, periodEnd);
    setGenerating(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Invoice generated.");
      router.refresh();
    }
  };

  // Summary stats
  const sessionCount = existingInvoice
    ? (existingInvoice.line_items_json as unknown[])?.length ?? 0
    : uninvoicedSessions.length;
  const totalHours = (
    existingInvoice
      ? ((existingInvoice.line_items_json as { duration_minutes: number }[]) ?? []).reduce(
          (sum, item) => sum + item.duration_minutes,
          0
        )
      : uninvoicedSessions.reduce((sum, s) => sum + s.duration_minutes, 0)
  ) / 60;
  const totalEarnings = existingInvoice
    ? existingInvoice.total_amount
    : uninvoicedSessions.reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Invoicing</h1>

      {/* Period Navigator */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigatePeriod(-1)}
          disabled={isPending}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {formatPeriodLabel(periodStart, periodEnd)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigatePeriod(1)}
          disabled={isPending || periodOffset >= 0}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Summary Cards */}
      {(sessionCount > 0 || existingInvoice) && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <FileText className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{sessionCount}</p>
            <p className="text-xs text-muted-foreground">Sessions</p>
          </Card>
          <Card className="p-3 text-center">
            <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-bold text-foreground">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Hours</p>
          </Card>
          <Card className="p-3 text-center">
            <DollarSign className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-bold text-primary">
              ${totalEarnings.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Total</p>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="current">
        <TabsList className="w-full">
          <TabsTrigger value="current" className="flex-1">
            Current Period
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            Invoice History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4 space-y-4">
          {existingInvoice ? (
            <InvoicePreview
              invoice={existingInvoice}
              coachProfile={coachProfile}
              gstRegistered={gstRegistered}
            />
          ) : uninvoicedSessions.length > 0 ? (
            <div className="space-y-4">
              {/* Session preview list */}
              <Card className="divide-y">
                {uninvoicedSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {s.sport} — {s.centre_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.date + "T00:00:00").toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        · {s.duration_minutes} min
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      ${s.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </Card>

              <Button
                className="w-full bg-primary hover:bg-primary/90 text-white"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Generating…" : "Generate Invoice"}
              </Button>
            </div>
          ) : (
            <Card className="p-8 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">
                No completed sessions for this period.
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <InvoiceHistoryList invoices={invoiceHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
