"use client";

import { useState, useTransition, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  Pencil,
  X,
  Loader2,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  getSessionRateInfo,
  setSessionRateOverride,
  removeSessionRateOverride,
} from "@/lib/pay-rates/actions";
import type { SessionRateInfo } from "@/lib/pay-rates/actions";
import { formatRate, formatAmount } from "@/lib/utils/payRates";
import { toast } from "sonner";

// ============================================================
// Props
// ============================================================

interface SessionRateOverrideProps {
  sessionId: string;
  durationMinutes: number;
  /** If true, shows edit controls (admin/ops only) */
  canEdit: boolean;
}

// ============================================================
// Tier badge styles
// ============================================================

const TIER_STYLES: Record<string, string> = {
  override: "bg-amber-50 text-amber-700 border-amber-200",
  session_type: "bg-blue-50 text-blue-700 border-blue-200",
  default: "bg-secondary text-foreground border-border",
};

// ============================================================
// Component
// ============================================================

export function SessionRateOverride({
  sessionId,
  durationMinutes,
  canEdit,
}: SessionRateOverrideProps) {
  const [rateInfo, setRateInfo] = useState<SessionRateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [overrideRate, setOverrideRate] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadRateInfo();
  }, [sessionId]);

  async function loadRateInfo() {
    setLoading(true);
    const { data } = await getSessionRateInfo(sessionId);
    setRateInfo(data);
    setLoading(false);
  }

  function handleSetOverride() {
    const rate = parseFloat(overrideRate);
    if (!rate || rate <= 0) {
      toast.error("Please enter a valid rate.");
      return;
    }
    if (!overrideReason.trim()) {
      toast.error("Please provide a reason for the override.");
      return;
    }

    startTransition(async () => {
      const res = await setSessionRateOverride({
        sessionId,
        rate,
        reason: overrideReason.trim(),
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Rate override applied.");
        setEditing(false);
        setOverrideRate("");
        setOverrideReason("");
        loadRateInfo();
      }
    });
  }

  function handleRemoveOverride() {
    startTransition(async () => {
      const res = await removeSessionRateOverride(sessionId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Override removed.");
        loadRateInfo();
      }
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Loader2 className="size-5 animate-spin text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Loading rate info…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Pay Rate</h3>
        </div>

        {rateInfo?.rate != null ? (
          <div className="space-y-2">
            {/* Rate display */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {formatRate(rateInfo.rate, rateInfo.rate_unit)}
                </p>
                {rateInfo.amount != null && (
                  <p className="text-xs text-muted-foreground">
                    Session pay: {formatAmount(rateInfo.amount)}
                    {rateInfo.rate_unit === "per_hour" && (
                      <span> ({durationMinutes} min)</span>
                    )}
                  </p>
                )}
              </div>

              <Badge
                variant="outline"
                className={`text-[10px] ${TIER_STYLES[rateInfo.tier ?? ""] ?? ""}`}
              >
                {rateInfo.tierLabel}
              </Badge>
            </div>

            {/* Override reason */}
            {rateInfo.tier === "override" && rateInfo.overrideReason && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2">
                <Info className="size-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  {rateInfo.overrideReason}
                </p>
              </div>
            )}

            {/* Edit controls */}
            {canEdit && !editing && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOverrideRate(rateInfo.rate?.toString() ?? "");
                    setOverrideReason("");
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3 mr-1" />
                  Override Rate
                </Button>
                {rateInfo.tier === "override" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={handleRemoveOverride}
                    disabled={isPending}
                  >
                    <X className="size-3 mr-1" />
                    Remove Override
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3">
            <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700">
                No rate configured
              </p>
              <p className="text-xs text-amber-600">
                The coach has no pay rate set. Please configure a rate or apply
                an override.
              </p>
            </div>
          </div>
        )}

        {/* Override form */}
        {editing && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="override-rate" className="text-xs">
                  Override Rate ($)
                </Label>
                <Input
                  id="override-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={overrideRate}
                  onChange={(e) => setOverrideRate(e.target.value)}
                  placeholder="e.g. 50.00"
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Overrides are per-session and take highest priority.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="override-reason" className="text-xs">
                  Reason for Override
                </Label>
                <Textarea
                  id="override-reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Extended session, travel required..."
                  rows={2}
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSetOverride}
                  disabled={isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isPending && (
                    <Loader2 className="size-3 animate-spin mr-1" />
                  )}
                  Apply Override
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}

        {/* No rate — allow override creation */}
        {rateInfo?.rate == null && canEdit && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOverrideRate("");
              setOverrideReason("");
              setEditing(true);
            }}
          >
            <DollarSign className="size-3 mr-1" />
            Set Rate Override
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
