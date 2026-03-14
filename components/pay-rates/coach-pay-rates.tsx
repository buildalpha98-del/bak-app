"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";
import {
  updateCoachDefaultRate,
  upsertCoachSessionRate,
  deleteCoachSessionRate,
} from "@/lib/pay-rates/actions";
import type { CoachPayRateDisplay } from "@/lib/pay-rates/actions";
import type { SessionType, RateUnit } from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Constants
// ============================================================

const SESSION_TYPES: SessionType[] = [
  "childcare",
  "school_local",
  "school_travel",
  "holiday_clinic",
];

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  childcare: "Childcare",
  school_local: "School (Local)",
  school_travel: "School (Travel)",
  holiday_clinic: "Holiday Clinic",
};

// ============================================================
// Props
// ============================================================

interface CoachPayRatesProps {
  initialDefaultRate: number | null;
  initialRates: CoachPayRateDisplay[];
}

// ============================================================
// Component
// ============================================================

export function CoachPayRates({
  initialDefaultRate,
  initialRates,
}: CoachPayRatesProps) {
  const [defaultRate, setDefaultRate] = useState(
    initialDefaultRate?.toString() ?? ""
  );
  const [rates, setRates] = useState(initialRates);
  const [editingDefault, setEditingDefault] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRate, setEditRate] = useState<CoachPayRateDisplay | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state for dialog
  const [formType, setFormType] = useState<SessionType>("childcare");
  const [formRate, setFormRate] = useState("");
  const [formUnit, setFormUnit] = useState<RateUnit>("per_session");
  const [formEffective, setFormEffective] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Group rates by session type (show latest per type)
  const ratesByType = new Map<string, CoachPayRateDisplay>();
  for (const r of rates) {
    const existing = ratesByType.get(r.session_type);
    if (
      !existing ||
      new Date(r.effective_from) > new Date(existing.effective_from)
    ) {
      ratesByType.set(r.session_type, r);
    }
  }

  // Determine which session types already have rates
  const typesWithRates = new Set(ratesByType.keys());
  const availableTypes = SESSION_TYPES.filter(
    (t) => !typesWithRates.has(t)
  );

  function handleSaveDefault() {
    const rate = parseFloat(defaultRate);
    if (!rate || rate <= 0) {
      toast.error("Please enter a valid rate.");
      return;
    }
    startTransition(async () => {
      const res = await updateCoachDefaultRate(rate);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Default rate updated.");
        setEditingDefault(false);
      }
    });
  }

  function openAddDialog() {
    setEditRate(null);
    setFormType(availableTypes[0] ?? "childcare");
    setFormRate("");
    setFormUnit("per_session");
    setFormEffective(new Date().toISOString().split("T")[0]);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(rate: CoachPayRateDisplay) {
    setEditRate(rate);
    setFormType(rate.session_type);
    setFormRate(rate.rate.toString());
    setFormUnit(rate.rate_unit);
    setFormEffective(rate.effective_from);
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSaveRate() {
    const rate = parseFloat(formRate);
    if (!rate || rate <= 0) {
      setFormError("Please enter a valid rate.");
      return;
    }
    setFormError(null);

    startTransition(async () => {
      const res = await upsertCoachSessionRate({
        id: editRate?.id,
        session_type: formType,
        rate,
        rate_unit: formUnit,
        effective_from: formEffective,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        // Update local state
        if (editRate) {
          setRates((prev) =>
            prev.map((r) =>
              r.id === editRate.id
                ? {
                    ...r,
                    rate,
                    rate_unit: formUnit,
                    effective_from: formEffective,
                  }
                : r
            )
          );
        } else {
          setRates((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              session_type: formType,
              rate,
              rate_unit: formUnit,
              effective_from: formEffective,
            },
          ]);
        }
        toast.success(editRate ? "Rate updated." : "Rate added.");
        setDialogOpen(false);
      }
    });
  }

  function handleDeleteRate(rateId: string) {
    startTransition(async () => {
      const res = await deleteCoachSessionRate(rateId);
      if (res.error) {
        toast.error(res.error);
      } else {
        setRates((prev) => prev.filter((r) => r.id !== rateId));
        toast.success("Rate deleted.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Default Base Rate */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="size-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Default Base Rate
              </h3>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              Tier 3 Fallback
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Used when no session-type rate is configured. This is your base rate
            for all sessions.
          </p>

          {editingDefault ? (
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="default-rate" className="text-xs">
                  Rate ($)
                </Label>
                <Input
                  id="default-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveDefault}
                disabled={isPending}
                className="h-10 bg-primary hover:bg-primary/90"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDefaultRate(initialDefaultRate?.toString() ?? "");
                  setEditingDefault(false);
                }}
                className="h-10"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-foreground">
                {defaultRate ? `$${parseFloat(defaultRate).toFixed(2)}` : "Not set"}
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  /session
                </span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingDefault(true)}
              >
                <Pencil className="size-3.5 mr-1" />
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session-Type Rates */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="size-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Session-Type Rates
              </h3>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              Tier 2 Priority
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Rates specific to each session type. These take priority over your
            default base rate.
          </p>

          {ratesByType.size > 0 ? (
            <div className="space-y-2">
              {Array.from(ratesByType.entries()).map(([type, rate]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {SESSION_TYPE_LABELS[type as SessionType] ?? type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${rate.rate.toFixed(2)}/
                      {rate.rate_unit === "per_hour" ? "hr" : "session"}
                      <span className="ml-2">
                        From{" "}
                        {new Date(rate.effective_from).toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => openEditDialog(rate)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteRate(rate.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 text-center py-2">
              No session-type rates set. Your default base rate will apply.
            </p>
          )}

          {availableTypes.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={openAddDialog}
            >
              <Plus className="size-3.5 mr-1" />
              Add Session Type Rate
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Rate Hierarchy Info */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            How Pay Rates Work
          </h3>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>
              <strong>Session Override</strong> — Admin/ops can set a custom rate
              on specific sessions
            </li>
            <li>
              <strong>Session-Type Rate</strong> — Your rate for the session type
              (childcare, school, etc.)
            </li>
            <li>
              <strong>Default Base Rate</strong> — Your fallback rate when no
              session-type rate exists
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Add/Edit Rate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editRate ? "Edit Rate" : "Add Session-Type Rate"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}

            <div className="space-y-1">
              <Label>Session Type</Label>
              {editRate ? (
                <Input
                  value={
                    SESSION_TYPE_LABELS[formType] ?? formType
                  }
                  disabled
                />
              ) : (
                <Select
                  value={formType}
                  onValueChange={(v) => setFormType(v as SessionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {SESSION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="rate-amount">Rate ($)</Label>
              <Input
                id="rate-amount"
                type="number"
                step="0.01"
                min="0"
                value={formRate}
                onChange={(e) => setFormRate(e.target.value)}
                placeholder="e.g. 45.00"
              />
            </div>

            <div className="space-y-1">
              <Label>Unit</Label>
              <Select
                value={formUnit}
                onValueChange={(v) => setFormUnit(v as RateUnit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_session">Per Session</SelectItem>
                  <SelectItem value="per_hour">Per Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="effective-date">Effective From</Label>
              <Input
                id="effective-date"
                type="date"
                value={formEffective}
                onChange={(e) => setFormEffective(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground/60">
                New rate applies to sessions on or after this date.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRate}
              disabled={isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin mr-1" />
              ) : null}
              {editRate ? "Update Rate" : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
