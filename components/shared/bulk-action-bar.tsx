"use client";

import type { LucideIcon } from "lucide-react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================
// Types
// ============================================================

interface BulkAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
  loading?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
}

// ============================================================
// Component
// ============================================================

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  actions,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-up">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card shadow-2xl px-4 py-2.5">
        {/* Selected count */}
        <span className="text-sm font-medium text-foreground whitespace-nowrap">
          {selectedCount} selected
        </span>

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Action buttons */}
        {actions.map((action) => {
          const Icon = action.icon;
          const isDestructive = action.variant === "destructive";

          return (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              className={`min-h-[44px] gap-1.5 ${
                isDestructive
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              }`}
              onClick={action.onClick}
              disabled={action.loading}
            >
              {action.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
              {action.label}
            </Button>
          );
        })}

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] size-9 p-0 text-muted-foreground hover:text-foreground"
          onClick={onClearSelection}
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
