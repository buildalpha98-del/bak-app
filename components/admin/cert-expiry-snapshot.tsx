"use client";

import { useEffect, useState } from "react";
import Link from "@/components/ui/app-link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, AlertTriangle, Clock } from "lucide-react";
import { getCertExpirySnapshot } from "@/lib/compliance/dashboard-actions";
import type { CertBucketResult } from "@/lib/utils/compliance/cert-expiry-summary";

const DOC_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  police_check: "Police Check",
  insurance: "Insurance",
  coaching_cert: "Coaching Cert",
};

function fmtAuDate(yyyyMmDd: string | null): string {
  if (!yyyyMmDd) return "—";
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function StatRow({
  label,
  count,
  Icon,
  tone,
}: {
  label: string;
  count: number;
  Icon: typeof ShieldAlert;
  tone: "danger" | "warning" | "info" | "muted";
}) {
  const colour =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "info"
          ? "text-blue-600"
          : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`size-4 ${count > 0 ? colour : "text-muted-foreground"}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${count > 0 ? colour : ""}`}>
        {count}
      </span>
    </div>
  );
}

interface CertExpirySnapshotProps {
  /**
   * Server-rendered seed from the admin home's batched
   * `Promise.all`. The widget still re-fetches once on mount so
   * compliance-sensitive numbers stay fresh.
   */
  initialData?: CertBucketResult | null;
}

export function CertExpirySnapshot({
  initialData = null,
}: CertExpirySnapshotProps = {}) {
  const [data, setData] = useState<CertBucketResult | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);

  useEffect(() => {
    let cancelled = false;
    getCertExpirySnapshot()
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allClear = data && data.total === 0;
  const topItems = data
    ? [
        ...data.expiredItems,
        ...data.criticalItems,
        ...data.warningItems,
      ].slice(0, 4)
    : [];

  return (
    <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="size-4" />
          Compliance Health
        </CardTitle>
        <Link
          href="/admin/staff"
          className="text-xs text-primary hover:underline"
        >
          Manage →
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 rounded bg-muted" />
            ))}
          </div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground">
            Unable to load compliance data.
          </p>
        ) : allClear ? (
          <div className="flex items-center gap-2 py-3">
            <ShieldCheck className="size-5 text-emerald-500" />
            <span className="text-sm text-muted-foreground">
              All tracked certificates current.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <StatRow
              label="Expired or rejected"
              count={data.expired}
              Icon={ShieldAlert}
              tone="danger"
            />
            <StatRow
              label="Expires ≤ 7 days"
              count={data.critical}
              Icon={AlertTriangle}
              tone="danger"
            />
            <StatRow
              label="Expires 8–14 days"
              count={data.warning}
              Icon={Clock}
              tone="warning"
            />
            <StatRow
              label="Expires 15–30 days"
              count={data.upcoming}
              Icon={Clock}
              tone="info"
            />

            {topItems.length > 0 && (
              <div className="border-t pt-2 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Most urgent
                </p>
                {topItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate">
                      {item.user_name ?? "Unknown"} —{" "}
                      <span className="text-muted-foreground">
                        {DOC_LABELS[item.doc_type] ?? item.doc_type}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-2 shrink-0 text-[10px]"
                    >
                      {item.status === "rejected"
                        ? "Rejected"
                        : fmtAuDate(item.expiry_date)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
