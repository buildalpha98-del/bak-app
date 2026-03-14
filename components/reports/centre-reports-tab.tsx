"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { getCentreReports } from "@/lib/reports/actions";
import type { ReportListItem } from "@/lib/reports/actions";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Component
// ============================================================

interface CentreReportsTabProps {
  centreId: string;
  centreName: string;
}

export function CentreReportsTab({ centreId, centreName }: CentreReportsTabProps) {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchReports() {
      setLoading(true);
      const { data } = await getCentreReports(centreId);
      if (!cancelled) {
        setReports(data ?? []);
        setLoading(false);
      }
    }

    fetchReports();
    return () => { cancelled = true; };
  }, [centreId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mb-3" />
        <p className="text-sm">No reports generated for this centre</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Term</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Sent</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="font-medium">{report.title}</TableCell>
            <TableCell>{report.term_name ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={report.status === "sent" ? "default" : "outline"}>
                {report.status === "sent" ? "Sent" : "Draft"}
              </Badge>
            </TableCell>
            <TableCell>
              {report.sent_at ? formatDate(report.sent_at) : "—"}
            </TableCell>
            <TableCell>{formatDate(report.created_at)}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" render={<Link href={`/ops/reports/${report.id}`} />}>
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
