"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Building2,
  ChevronDown,
  CalendarDays,
  Receipt,
  FileText,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClientUserCentreSummary } from "@/lib/client/actions";
import { cn } from "@/lib/utils";

interface MultiCentreRollUpProps {
  centres: ClientUserCentreSummary[];
  currentCentreId: string;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

// ============================================================
// MultiCentreRollUp
// ============================================================
//
// Optional summary card surfaced on /client/[centreId] home when
// the user manages more than one centre. Click the header to
// expand; each row shows the next session date, unpaid invoice
// count and unread report count, and routes to that centre.

export function MultiCentreRollUp({ centres, currentCentreId }: MultiCentreRollUpProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  if (centres.length <= 1) return null;

  function handleRowClick(id: string) {
    if (id === currentCentreId) return;
    startTransition(() => router.push(`/client/${id}`));
  }

  // Aggregate totals across all linked centres — gives the
  // director a "how loud is each centre right now?" read at a
  // glance, even while collapsed.
  const totalUnpaid = centres.reduce((s, c) => s + c.unpaid_invoice_count, 0);
  const totalReports = centres.reduce((s, c) => s + c.unread_report_count, 0);

  return (
    <Card className="rounded-2xl border-cyan-200/60 bg-gradient-to-br from-cyan-50/60 to-white">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-card/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0891B2]/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              You manage {centres.length} centres
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {totalUnpaid > 0 || totalReports > 0
                ? `${totalUnpaid} unpaid invoice${totalUnpaid === 1 ? "" : "s"} · ${totalReports} new report${totalReports === 1 ? "" : "s"} across your centres`
                : "Everything is up to date across your centres."}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {expanded && (
          <div className="border-t border-cyan-200/60 px-2 pb-2 pt-2">
            <ul className="flex flex-col gap-1">
              {centres.map((c) => {
                const isCurrent = c.id === currentCentreId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(c.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        isCurrent
                          ? "bg-[#0891B2]/5 ring-1 ring-inset ring-[#0891B2]/30"
                          : "hover:bg-card",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {c.name}
                          </span>
                          {c.is_default && (
                            <Badge variant="outline" className="border-cyan-200 bg-card text-[10px] text-cyan-700">
                              Default
                            </Badge>
                          )}
                          {isCurrent && (
                            <Badge className="bg-[#0891B2]/10 text-[10px] text-[#0891B2] hover:bg-[#0891B2]/10">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            Next: {formatDate(c.next_session_date)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Receipt className="h-3 w-3" />
                            {c.unpaid_invoice_count} unpaid
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {c.unread_report_count} new
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
