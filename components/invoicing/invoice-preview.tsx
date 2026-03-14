"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Send, Download, CheckCircle, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FlagDialog } from "./flag-dialog";
import { flagInvoiceItems, sendCoachInvoice } from "@/lib/invoicing/actions";
import { INVOICE_STATUS_CONFIG } from "@/lib/utils/invoicing";
import type { FlaggedItem } from "@/lib/utils/invoicing";
import { toast } from "sonner";
import type { CoachInvoice, InvoiceLineItem } from "@/lib/types/database";
import type { CoachInvoiceProfile } from "@/lib/invoicing/actions";

interface Props {
  invoice: CoachInvoice;
  coachProfile: CoachInvoiceProfile;
  gstRegistered: boolean;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

function fmtRate(rate: number, unit: string): string {
  if (unit === "per_hour") return `$${rate.toFixed(2)}/hr`;
  return `$${rate.toFixed(2)}/sess`;
}

export function InvoicePreview({ invoice, coachProfile, gstRegistered }: Props) {
  const router = useRouter();
  const [flaggedItems, setFlaggedItems] = useState<FlaggedItem[]>([]);
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flaggingSession, setFlaggingSession] = useState<InvoiceLineItem | null>(null);
  const [sending, setSending] = useState(false);
  const [submittingFlags, setSubmittingFlags] = useState(false);
  const [, startTransition] = useTransition();

  const lineItems = (invoice.line_items_json ?? []) as unknown as InvoiceLineItem[];
  const existingFlags = (invoice.flagged_items_json ?? []) as unknown as FlaggedItem[];
  const allFlags = [...existingFlags, ...flaggedItems];

  const subtotal =
    Math.round(lineItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

  const statusConfig = INVOICE_STATUS_CONFIG[invoice.status];

  const flaggedSessionIds = new Set(allFlags.map((f) => f.session_id));
  const hasPendingFlags = flaggedItems.length > 0;

  const handleFlagSubmit = (sessionId: string, issue: string) => {
    setFlaggedItems((prev) => [
      ...prev,
      { session_id: sessionId, issue, flagged_at: new Date().toISOString() },
    ]);
    setFlagDialogOpen(false);
    setFlaggingSession(null);
  };

  const handleSubmitFlags = async () => {
    setSubmittingFlags(true);
    const { error } = await flagInvoiceItems(invoice.id, [
      ...existingFlags,
      ...flaggedItems,
    ]);
    setSubmittingFlags(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Flags submitted for review.");
      startTransition(() => router.refresh());
    }
  };

  const handleSend = async () => {
    setSending(true);
    const { error } = await sendCoachInvoice(invoice.id);
    setSending(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Invoice sent!");
      startTransition(() => router.refresh());
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">TAX INVOICE</h2>
            <p className="text-xs text-muted-foreground">
              {invoice.invoice_number ?? "Draft"}
            </p>
          </div>
          <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
        </div>

        {/* From / To */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
              From
            </p>
            <p className="font-medium text-foreground">{coachProfile.name}</p>
            {coachProfile.abn && (
              <p className="text-muted-foreground">ABN: {coachProfile.abn}</p>
            )}
            {coachProfile.address && (
              <p className="text-muted-foreground">{coachProfile.address}</p>
            )}
            <p className="text-muted-foreground">{coachProfile.email}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
              To
            </p>
            <p className="font-medium text-foreground">Build Alpha Kids</p>
            <p className="text-muted-foreground">Bankstown, NSW 2200</p>
            <p className="text-muted-foreground">info@buildalphakids.com.au</p>
          </div>
        </div>
      </Card>

      {/* Line Items Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Centre</TableHead>
              <TableHead className="text-xs">Sport</TableHead>
              <TableHead className="text-xs text-center">Mins</TableHead>
              <TableHead className="text-xs text-right">Rate</TableHead>
              <TableHead className="text-xs text-right">Amount</TableHead>
              {invoice.status === "draft" && (
                <TableHead className="w-10" />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((item, i) => {
              const isFlagged = flaggedSessionIds.has(item.session_id);
              const flagInfo = allFlags.find(
                (f) => f.session_id === item.session_id
              );
              return (
                <TableRow
                  key={i}
                  className={isFlagged ? "bg-amber-50" : undefined}
                >
                  <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                  <TableCell className="text-xs">{item.centre_name}</TableCell>
                  <TableCell className="text-xs">{item.sport}</TableCell>
                  <TableCell className="text-xs text-center">
                    {item.duration_minutes}
                  </TableCell>
                  <TableCell className="text-xs text-right">
                    {fmtRate(item.rate, item.rate_unit)}
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">
                    ${item.amount.toFixed(2)}
                  </TableCell>
                  {invoice.status === "draft" && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${
                          isFlagged
                            ? "text-amber-600"
                            : "text-muted-foreground hover:text-amber-600"
                        }`}
                        onClick={() => {
                          if (!isFlagged) {
                            setFlaggingSession(item);
                            setFlagDialogOpen(true);
                          }
                        }}
                        disabled={isFlagged}
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                  {isFlagged && flagInfo && (
                    <td
                      colSpan={invoice.status === "draft" ? 7 : 6}
                      className="px-4 pb-2 pt-0"
                    >
                      <p className="text-xs text-amber-700 italic">
                        ⚑ {flagInfo.issue}
                      </p>
                    </td>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Totals */}
        <div className="border-t p-4 space-y-1">
          <div className="flex justify-end text-xs">
            <span className="w-24 text-right text-muted-foreground">Subtotal</span>
            <span className="w-24 text-right">${subtotal.toFixed(2)}</span>
          </div>
          {gstRegistered && invoice.gst_amount != null && (
            <div className="flex justify-end text-xs">
              <span className="w-24 text-right text-muted-foreground">GST (10%)</span>
              <span className="w-24 text-right">
                ${invoice.gst_amount.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-primary">
            <span className="w-24 text-right font-bold text-sm">Total</span>
            <span className="w-24 text-right font-bold text-sm text-primary">
              ${invoice.total_amount.toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="space-y-2">
        {invoice.status === "draft" && !hasPendingFlags && (
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Send Invoice
              </>
            )}
          </Button>
        )}

        {invoice.status === "draft" && hasPendingFlags && (
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-white"
            onClick={handleSubmitFlags}
            disabled={submittingFlags}
          >
            {submittingFlags ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" /> Submit Flags for Review
              </>
            )}
          </Button>
        )}

        {invoice.status === "flagged" && (
          <Button className="w-full" variant="outline" disabled>
            Awaiting Review
          </Button>
        )}

        {invoice.status === "ready" && (
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-white"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Send Invoice
              </>
            )}
          </Button>
        )}

        {invoice.status === "sent" && (
          <div className="space-y-2">
            <p className="text-sm text-center text-muted-foreground">
              Sent on{" "}
              {invoice.sent_at
                ? new Date(invoice.sent_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
            {invoice.pdf_url && (
              <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </a>
            )}
          </div>
        )}

        {invoice.status === "paid" && (
          <div className="flex items-center justify-center gap-2 py-3">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <span className="font-medium text-emerald-600">Paid</span>
          </div>
        )}
      </div>

      {/* Flag Dialog */}
      <FlagDialog
        open={flagDialogOpen}
        onClose={() => {
          setFlagDialogOpen(false);
          setFlaggingSession(null);
        }}
        sessionInfo={
          flaggingSession
            ? `${flaggingSession.sport} at ${flaggingSession.centre_name} (${fmtDate(flaggingSession.date)})`
            : ""
        }
        onSubmit={(issue) => {
          if (flaggingSession) {
            handleFlagSubmit(flaggingSession.session_id, issue);
          }
        }}
      />
    </div>
  );
}
