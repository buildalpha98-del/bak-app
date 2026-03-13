"use client";

import Link from "next/link";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WidgetWrapper } from "@/components/ops/widget-wrapper";
import type { ComplianceAlert } from "@/lib/ops/actions";

// ============================================================
// Compliance Alerts widget for command centre
// ============================================================

function formatDocType(docType: string): string {
  return docType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function SeverityBadge({ alert }: { alert: ComplianceAlert }) {
  switch (alert.severity) {
    case "expired":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
          Expired
        </Badge>
      );
    case "critical":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200" variant="outline">
          Expires in {alert.days_remaining} days
        </Badge>
      );
    case "warning":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">
          Expires in {alert.days_remaining} days
        </Badge>
      );
    default:
      return null;
  }
}

interface ComplianceAlertsWidgetProps {
  alerts: ComplianceAlert[];
  onRefresh: () => void;
}

export function ComplianceAlertsWidget({ alerts }: ComplianceAlertsWidgetProps) {
  return (
    <WidgetWrapper title="Compliance Alerts" icon={ShieldAlert} count={alerts.length}>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <span className="text-sm text-muted-foreground">All compliance up to date</span>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {alerts.map((alert, idx) => (
            <div key={`${alert.coach_id}-${alert.doc_type}-${idx}`} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-0.5">
                <Link
                  href="/ops/staff"
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors duration-200"
                >
                  {alert.coach_name}
                </Link>
                <p className="text-sm text-muted-foreground">{formatDocType(alert.doc_type)}</p>
              </div>
              <div className="shrink-0">
                <SeverityBadge alert={alert} />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetWrapper>
  );
}
