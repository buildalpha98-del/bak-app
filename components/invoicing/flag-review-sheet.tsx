"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle } from "lucide-react";
import { resolveInvoiceFlags } from "@/lib/invoicing/actions";
import { toast } from "sonner";
import type { InvoiceWithCoach } from "@/lib/invoicing/actions";
import type { InvoiceLineItem } from "@/lib/types/database";
import type { FlaggedItem } from "@/lib/utils/invoicing";

interface Props {
  invoice: InvoiceWithCoach | null;
  onClose: () => void;
}

export function FlagReviewSheet({ invoice, onClose }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [editedItems, setEditedItems] = useState<InvoiceLineItem[]>([]);

  // Initialise edited items when invoice changes
  const lineItems = (invoice?.line_items_json ?? []) as InvoiceLineItem[];
  const flags = (invoice?.flagged_items_json ?? []) as unknown as FlaggedItem[];
  const flaggedSessionIds = new Set(flags.map((f) => f.session_id));

  if (editedItems.length === 0 && lineItems.length > 0) {
    // First render — copy line items
    setEditedItems([...lineItems]);
  }

  const handleItemChange = (
    index: number,
    field: "rate" | "duration_minutes",
    value: string
  ) => {
    setEditedItems((prev) => {
      const next = [...prev];
      const num = parseFloat(value) || 0;
      if (field === "rate") {
        next[index] = { ...next[index], rate: num };
        // Recalculate amount
        if (next[index].rate_unit === "per_hour") {
          next[index].amount =
            Math.round(num * (next[index].duration_minutes / 60) * 100) / 100;
        } else {
          next[index].amount = num;
        }
      } else {
        next[index] = { ...next[index], duration_minutes: num };
        // Recalculate amount if per_hour
        if (next[index].rate_unit === "per_hour") {
          next[index].amount =
            Math.round(next[index].rate * (num / 60) * 100) / 100;
        }
      }
      return next;
    });
  };

  const handleResolve = async () => {
    if (!invoice) return;
    setSaving(true);
    const { error } = await resolveInvoiceFlags(
      invoice.id,
      editedItems,
      resolutionNote
    );
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Flags resolved. Invoice is now ready.");
      setEditedItems([]);
      setResolutionNote("");
      onClose();
      startTransition(() => router.refresh());
    }
  };

  return (
    <Sheet open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review Flagged Invoice</SheetTitle>
          <SheetDescription>
            {invoice?.coach_name} · {invoice?.invoice_number}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {editedItems.map((item, i) => {
            const isFlagged = flaggedSessionIds.has(item.session_id);
            const flagInfo = flags.find((f) => f.session_id === item.session_id);

            return (
              <div
                key={i}
                className={`rounded-lg border p-3 space-y-2 ${
                  isFlagged ? "border-amber-300 bg-amber-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {item.sport} — {item.centre_name}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.date + "T00:00:00").toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>

                {isFlagged && flagInfo && (
                  <Badge className="bg-amber-100 text-amber-700 text-xs">
                    ⚑ {flagInfo.issue}
                  </Badge>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Rate ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.rate}
                      onChange={(e) => handleItemChange(i, "rate", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Duration (min)</Label>
                    <Input
                      type="number"
                      value={item.duration_minutes}
                      onChange={(e) =>
                        handleItemChange(i, "duration_minutes", e.target.value)
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Amount</Label>
                    <p className="h-8 flex items-center text-sm font-medium">
                      ${item.amount.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          <div>
            <Label className="text-sm text-muted-foreground">Resolution Note</Label>
            <Textarea
              placeholder="Explain any changes made…"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleResolve}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" /> Mark Resolved
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
