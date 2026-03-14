"use client";

import { GitMerge } from "lucide-react";
import type { TrainingPathway } from "@/lib/types/database";

interface PathwaysPlaceholderProps {
  pathways: Array<TrainingPathway & { module_count: number }>;
}

export function PathwaysPlaceholder({ pathways }: PathwaysPlaceholderProps) {
  if (pathways.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-secondary/20">
        <GitMerge className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground">No pathways yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pathways group modules into structured learning journeys for coaches.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pathways.map((pathway) => (
        <div
          key={pathway.id}
          className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-secondary/30 transition-colors"
        >
          <div>
            <p className="font-medium text-sm">{pathway.title}</p>
            {pathway.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{pathway.description}</p>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {pathway.module_count} module{pathway.module_count !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
