"use client";

import Link from "@/components/ui/app-link";
import { Wrench, CheckCircle2 } from "lucide-react";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import type { EquipmentIssue } from "@/lib/ops/actions";

interface EquipmentIssuesWidgetProps {
  issues: EquipmentIssue[];
  onRefresh: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\u2026";
}

export function EquipmentIssuesWidget({
  issues,
}: EquipmentIssuesWidgetProps) {
  return (
    <WidgetWrapper title="Equipment Issues" icon={Wrench} count={issues.length}>
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <span>No equipment issues</span>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {issues.map((issue) => (
            <Link
              key={issue.log_id}
              href={`/ops/equipment/${issue.kit_id}`}
              className="block py-3 transition-colors duration-200 hover:bg-secondary/50 -mx-2 px-2 rounded-lg first:pt-0"
            >
              <p className="text-sm font-semibold text-foreground">
                {issue.kit_name}
              </p>
              {issue.notes && (
                <p className="mt-0.5 text-sm text-foreground/80">
                  {truncate(issue.notes, 80)}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Flagged by {issue.flagged_by_name}</span>
                <span>&middot;</span>
                <span>{formatDate(issue.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </WidgetWrapper>
  );
}
