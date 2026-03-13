"use client";

import type { TermTemplateWithRelations } from "@/lib/terms/actions";
import { sportColour } from "@/lib/utils/sport-colours";

// ============================================================
// Component
// ============================================================

interface TemplateEntryCardProps {
  entry: TermTemplateWithRelations;
  onClick: () => void;
}

export function TemplateEntryCard({ entry, onClick }: TemplateEntryCardProps) {
  const colour = sportColour(entry.sport);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${entry.sport} session at ${entry.centre_name}, ${entry.duration_minutes} minutes${entry.coach_name ? `, ${entry.coach_name}` : ", unassigned"}`}
      className="group flex w-full cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1.5 text-left shadow-sm transition-all hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ borderLeftWidth: 3, borderLeftColor: colour }}
    >
      <span className="truncate text-xs font-medium text-foreground">
        {entry.centre_name}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">
        {entry.sport} · {entry.duration_minutes}min
      </span>
      <span
        className={`truncate text-[11px] ${
          entry.coach_name ? "text-muted-foreground" : "italic text-muted-foreground"
        }`}
      >
        {entry.coach_name ?? "Unassigned"}
      </span>
    </button>
  );
}
