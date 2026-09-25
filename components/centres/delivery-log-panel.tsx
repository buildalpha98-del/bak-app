"use client";

// The centre's term delivery log: the plain record behind the term
// report — sessions delivered, minutes, children, coaches, outcomes —
// with the CSV to attach to an invoice or take into a renewal.

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCentreDeliveryLog, type DeliveryLogTerm } from "@/lib/centres/delivery-log-actions";
import type { DeliveryLog } from "@/lib/centres/delivery-log";

export function DeliveryLogPanel({ centreId }: { centreId: string }) {
  const [termId, setTermId] = useState<string | null>(null);
  const [state, setState] = useState<{ term: DeliveryLogTerm; terms: DeliveryLogTerm[]; log: DeliveryLog } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCentreDeliveryLog(centreId, termId).then(({ data }) => {
      if (cancelled) return;
      setLoading(false);
      if (data) setState({ term: data.term, terms: data.terms, log: data.log });
    });
    return () => {
      cancelled = true;
    };
  }, [centreId, termId]);

  const t = state?.log.totals;
  const hours = t ? Math.round((t.minutes_delivered / 60) * 10) / 10 : 0;
  return (
    <div className="mb-4 rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileSpreadsheet className="size-4 text-primary" /> Delivery log
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {state && state.terms.length > 1 && (
            <Select value={state.term.id} onValueChange={(v) => v && setTermId(v)}>
              <SelectTrigger className="h-9 w-44" aria-label="Term">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {state.terms.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {state && (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/centres/${centreId}/delivery-log?term=${state.term.id}`} />}>
              <Download className="size-3.5" /> Download CSV
            </Button>
          )}
        </div>
      </div>
      {loading || !t ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Delivered</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {t.delivered}
              <span className="text-xs font-normal text-muted-foreground"> session{t.delivered === 1 ? "" : "s"} · {hours}h</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Children (sum of headcounts)</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{t.children_sum}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Upcoming / cancelled</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {t.upcoming} <span className="text-xs font-normal text-muted-foreground">/ {t.cancelled}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Coaches · sports · outcomes</dt>
            <dd className="text-sm text-foreground">
              {t.coaches.join(", ") || "—"} · {t.sports.join(", ") || "—"} · {t.outcome_codes.length} code{t.outcome_codes.length === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
