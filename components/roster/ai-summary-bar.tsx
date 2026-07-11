"use client";

import { useState } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SchedulingRunOutputSummary } from "@/lib/types/database";

interface AISummaryBarProps {
  summary: SchedulingRunOutputSummary;
  onPublish: () => Promise<void>;
  onFilterNeedsAttention: (active: boolean) => void;
  filterActive: boolean;
}

export function AISummaryBar({
  summary,
  onPublish,
  onFilterNeedsAttention,
  filterActive,
}: AISummaryBarProps) {
  const [publishing, setPublishing] = useState(false);

  const total = summary.assigned_count + summary.unassigned_count;
  const { green, amber, red } = summary.confidence_breakdown;

  async function handlePublish() {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-orange-50 px-4 py-3">
      <Sparkles className="size-4 shrink-0 text-primary" />

      <p className="text-sm text-foreground">
        AI assigned{" "}
        <span className="font-semibold">{summary.assigned_count}</span> of{" "}
        <span className="font-semibold">{total}</span> sessions
        {" — "}
        <span className="text-green-600 font-medium">{green} high</span>
        {", "}
        <span className="text-amber-500 font-medium">{amber} moderate</span>
        {", "}
        <span className="text-red-500 font-medium">{red} needs attention</span>
      </p>

      <div className="ml-auto flex items-center gap-2">
        {red > 0 && (
          <Button
            variant={filterActive ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterNeedsAttention(!filterActive)}
          >
            <AlertCircle className="size-3.5" />
            Needs Attention ({red})
          </Button>
        )}

        <Button
          size="sm"
          onClick={handlePublish}
          disabled={publishing}
          className="bg-primary hover:bg-[#d4651f] text-white"
        >
          {publishing && <Loader2 className="size-4 animate-spin" />}
          {publishing ? "Publishing..." : "Publish Week"}
        </Button>
      </div>
    </div>
  );
}
