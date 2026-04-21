"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, ArrowRight } from "lucide-react";
import { getGrantsForCentre } from "@/lib/grants/actions";
import type { GrantApplicationWithCentre } from "@/lib/grants/actions";

interface Props {
  centreId: string;
  centreName: string;
}

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "funded":
    case "approved":
      return "default";
    case "rejected":
    case "expired":
      return "destructive";
    case "submitted":
      return "secondary";
    default:
      return "outline";
  }
}

export function CentreGrantsTab({ centreId, centreName }: Props) {
  const [applications, setApplications] = useState<GrantApplicationWithCentre[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGrantsForCentre(centreId)
      .then(({ data }) => setApplications(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [centreId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading grants…</p>;
  }

  const totalApproved = applications.reduce((s, a) => s + Number(a.amount_approved ?? 0), 0);
  const totalUsed = applications.reduce((s, a) => s + Number(a.amount_used ?? 0), 0);
  const totalRemaining = totalApproved - totalUsed;

  return (
    <div className="space-y-4">
      {applications.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Total Approved</p>
              <p className="text-2xl font-bold">{formatAUD(totalApproved)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Used</p>
              <p className="text-2xl font-bold">{formatAUD(totalUsed)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-2xl font-bold text-primary">{formatAUD(totalRemaining)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="size-4" />
              Grant Applications
            </CardTitle>
            <Button size="sm" variant="outline" render={<Link href="/admin/grants" />}>
              Manage Grants
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No grant applications for {centreName} yet. Create one from the grants dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">Term</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2 pr-4">Approved</th>
                    <th className="text-right py-2 pr-4">Used</th>
                    <th className="text-right py-2 pr-4">Remaining</th>
                    <th className="text-left py-2 pr-4">Funding Period</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a) => (
                    <tr key={a.id} className="border-b">
                      <td className="py-3 pr-4">{a.application_term} {a.application_year}</td>
                      <td className="py-3 pr-4"><Badge variant={statusVariant(a.status)}>{a.status}</Badge></td>
                      <td className="py-3 pr-4 text-right">{a.amount_approved ? formatAUD(Number(a.amount_approved)) : "—"}</td>
                      <td className="py-3 pr-4 text-right">{formatAUD(Number(a.amount_used))}</td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {a.amount_approved ? formatAUD(a.amount_remaining) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {a.funding_start_date && a.funding_end_date
                          ? `${a.funding_start_date} → ${a.funding_end_date}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
