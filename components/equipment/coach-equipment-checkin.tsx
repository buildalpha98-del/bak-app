"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Package,
} from "lucide-react";
import { coachCheckIn } from "@/lib/equipment/actions";
import type { KitListItem } from "@/lib/equipment/types";
import { toast } from "sonner";

// ============================================================
// Coach Equipment Check-In — simplified "All Good" or "Report Issue"
// ============================================================

interface CoachEquipmentCheckinProps {
  kit: KitListItem;
  onComplete: () => void;
}

export function CoachEquipmentCheckin({
  kit,
  onComplete,
}: CoachEquipmentCheckinProps) {
  const [mode, setMode] = useState<"idle" | "reporting">("idle");
  const [issueNotes, setIssueNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAllGood() {
    setSubmitting(true);
    const { error } = await coachCheckIn(kit.id, true);
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Equipment check-in complete — all good!");
      onComplete();
    }
  }

  async function handleReportIssue() {
    if (!issueNotes.trim()) {
      toast.error("Please describe the issue.");
      return;
    }
    setSubmitting(true);
    const { error } = await coachCheckIn(kit.id, false, issueNotes.trim(), {
      reported_items: issueNotes.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Issue reported — ops team has been notified.");
      onComplete();
    }
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{kit.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            {kit.item_count} items
          </Badge>
        </div>

        {mode === "idle" ? (
          <div className="flex gap-2">
            <Button
              className="flex-1 min-h-[44px]"
              onClick={handleAllGood}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              All Good
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-h-[44px] text-orange-600 hover:text-orange-700"
              onClick={() => setMode("reporting")}
              disabled={submitting}
            >
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              Report Issue
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Describe the issue</Label>
              <Input
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="e.g. 2 cones missing, ball punctured..."
                className="min-h-[44px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 min-h-[44px]"
                onClick={handleReportIssue}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="mr-1.5 h-4 w-4" />
                )}
                Submit Issue
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setMode("idle");
                  setIssueNotes("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
