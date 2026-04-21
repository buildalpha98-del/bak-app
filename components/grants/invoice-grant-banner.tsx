"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Award, X } from "lucide-react";
import {
  getActiveGrantsForCentre,
  getAllocationsForInvoice,
  allocateInvoiceToGrant,
  removeAllocation,
} from "@/lib/grants/actions";
import type { GrantApplicationWithCentre } from "@/lib/grants/actions";

interface Props {
  invoiceId: string;
  centreId: string;
  centreType: "school" | "childcare_centre" | null;
  invoiceTotal: number; // in dollars
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

interface AllocationRow {
  id: string;
  grant_application_id: string;
  amount_allocated: number;
  grant_application_term: string;
  grant_application_year: number;
}

export function InvoiceGrantBanner({ invoiceId, centreId, centreType, invoiceTotal }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeGrants, setActiveGrants] = useState<GrantApplicationWithCentre[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [selectedGrantId, setSelectedGrantId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");

  useEffect(() => {
    if (centreType !== "school") {
      setLoading(false);
      return;
    }
    Promise.all([
      getActiveGrantsForCentre(centreId),
      getAllocationsForInvoice(invoiceId),
    ])
      .then(([grantsRes, allocsRes]) => {
        setActiveGrants(grantsRes.data);
        setAllocations(
          allocsRes.data.map((a) => ({
            id: a.id,
            grant_application_id: a.grant_application_id,
            amount_allocated: Number(a.amount_allocated),
            grant_application_term: a.grant_application_term,
            grant_application_year: a.grant_application_year,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [centreId, centreType, invoiceId]);

  if (centreType !== "school" || loading) return null;

  const totalAllocated = allocations.reduce((s, a) => s + a.amount_allocated, 0);
  const remainingToAllocate = invoiceTotal - totalAllocated;
  const totalAvailable = activeGrants.reduce((s, g) => s + g.amount_remaining, 0);

  // Nothing to show if no active grants and no existing allocations
  if (activeGrants.length === 0 && allocations.length === 0) return null;

  function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGrantId || !allocAmount) return;
    startTransition(async () => {
      const { error } = await allocateInvoiceToGrant({
        grantApplicationId: selectedGrantId,
        invoiceId,
        amount: Number(allocAmount),
      });
      if (error) { toast.error(error); return; }
      toast.success("Allocated to grant");
      setAllocateOpen(false);
      setSelectedGrantId("");
      setAllocAmount("");
      // Reload
      const [g, a] = await Promise.all([
        getActiveGrantsForCentre(centreId),
        getAllocationsForInvoice(invoiceId),
      ]);
      setActiveGrants(g.data);
      setAllocations(
        a.data.map((x) => ({
          id: x.id,
          grant_application_id: x.grant_application_id,
          amount_allocated: Number(x.amount_allocated),
          grant_application_term: x.grant_application_term,
          grant_application_year: x.grant_application_year,
        }))
      );
      router.refresh();
    });
  }

  function handleRemove(allocationId: string) {
    startTransition(async () => {
      const { error } = await removeAllocation(allocationId);
      if (error) { toast.error(error); return; }
      toast.success("Allocation removed");
      const [g, a] = await Promise.all([
        getActiveGrantsForCentre(centreId),
        getAllocationsForInvoice(invoiceId),
      ]);
      setActiveGrants(g.data);
      setAllocations(
        a.data.map((x) => ({
          id: x.id,
          grant_application_id: x.grant_application_id,
          amount_allocated: Number(x.amount_allocated),
          grant_application_term: x.grant_application_term,
          grant_application_year: x.grant_application_year,
        }))
      );
      router.refresh();
    });
  }

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/20 p-2 flex-shrink-0">
                <Award className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Sporting Schools grant funding available</p>
                {activeGrants.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatAUD(totalAvailable)} across {activeGrants.length} active grant{activeGrants.length > 1 ? "s" : ""}
                    {remainingToAllocate > 0 && ` · ${formatAUD(remainingToAllocate)} of invoice unallocated`}
                  </p>
                )}
              </div>
            </div>
            {activeGrants.length > 0 && remainingToAllocate > 0 && (
              <Button size="sm" onClick={() => {
                setSelectedGrantId(activeGrants[0].id);
                setAllocAmount(Math.min(remainingToAllocate, activeGrants[0].amount_remaining).toFixed(2));
                setAllocateOpen(true);
              }}>
                Allocate
              </Button>
            )}
          </div>

          {allocations.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-primary/20">
              <p className="text-xs font-medium text-muted-foreground">Current allocations</p>
              {allocations.map((a) => {
                const grant = activeGrants.find((g) => g.id === a.grant_application_id);
                return (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {a.grant_application_term} {a.grant_application_year}
                      </Badge>
                      <span className="font-medium">{formatAUD(a.amount_allocated)}</span>
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={() => handleRemove(a.id)} disabled={isPending}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate Invoice to Grant</DialogTitle>
            <DialogDescription>
              Apply grant funds to offset this invoice. Invoice total: {formatAUD(invoiceTotal)}. Unallocated: {formatAUD(remainingToAllocate)}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAllocate} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Grant Application</Label>
              <Select value={selectedGrantId} onValueChange={(v) => {
                if (!v) return;
                setSelectedGrantId(v);
                const g = activeGrants.find((x) => x.id === v);
                if (g) setAllocAmount(Math.min(remainingToAllocate, g.amount_remaining).toFixed(2));
              }}>
                <SelectTrigger><SelectValue placeholder="Choose a grant" /></SelectTrigger>
                <SelectContent>
                  {activeGrants.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.application_term} {g.application_year} · {formatAUD(g.amount_remaining)} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount to Allocate (AUD)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                required
              />
              {selectedGrantId && (
                <p className="text-xs text-muted-foreground">
                  Max: {formatAUD(Math.min(remainingToAllocate, activeGrants.find((g) => g.id === selectedGrantId)?.amount_remaining ?? 0))}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAllocateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Allocating…" : "Allocate"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
