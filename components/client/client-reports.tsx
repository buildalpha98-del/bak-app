"use client";

import { useState } from "react";
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Calendar,
  Trophy,
  BarChart3,
  Star,
  Dumbbell,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClientReport } from "@/lib/client/portal-actions";
import type { ReportContentJson } from "@/lib/types/database";

interface ClientReportsProps {
  reports: ClientReport[];
  centreId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const startFormatted = startDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
  const endFormatted = endDate.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startFormatted} — ${endFormatted}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200">Sent</Badge>;
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function ClientReports({ reports, centreId }: ClientReportsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <div className="animate-fade-up">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
          <a
            href={`/api/client/${centreId}/calendar`}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#0891B2]/30 bg-[#0891B2]/5 px-3 py-2 text-sm font-medium text-[#0891B2] transition-colors hover:bg-[#0891B2]/10"
          >
            <Calendar className="h-4 w-4" />
            Sync Calendar
          </a>
        </div>
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0891B2]/10">
            <FileText className="h-6 w-6 text-[#0891B2]" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No reports yet</h3>
          <p className="mt-2 max-w-sm text-sm text-gray-500">
            No reports available yet — your first report will be generated at the end of
            term.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
        <a
          href={`/api/client/${centreId}/calendar`}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100 transition-colors"
        >
          <Calendar className="h-4 w-4" />
          Sync Calendar
        </a>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Term reports summarising your centre&apos;s coaching sessions.
      </p>

      <div className="mt-6 space-y-3">
        {reports.map((report) => {
          const isExpanded = expandedId === report.id;
          const content = report.content_json as Record<string, string | number | string[] | null> & {
            class_breakdown?: ReportContentJson["class_breakdown"];
          };

          return (
            <Card key={report.id} className="overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-md">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                aria-expanded={isExpanded}
              >
                <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base font-semibold text-gray-900 truncate">
                      {report.title || report.term_name}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDateRange(report.term_start, report.term_end)}
                      </span>
                      {statusBadge(report.status)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {report.sent_at && (
                      <span className="hidden text-xs text-gray-400 sm:inline">
                        Sent {formatDate(report.sent_at.split("T")[0])}
                      </span>
                    )}
                    <a
                      href={`/api/client/${centreId}/report-pdf?reportId=${report.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-card px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      aria-label="Download PDF report"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download PDF</span>
                    </a>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="border-t bg-gray-50 pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Summary */}
                    {content.summary && (
                      <div className="sm:col-span-2">
                        <h4 className="text-sm font-medium text-gray-700">Summary</h4>
                        <p className="mt-1 text-sm text-gray-600">
                          {String(content.summary)}
                        </p>
                      </div>
                    )}

                    {/* Sessions delivered */}
                    {content.sessions_delivered != null && (
                      <div className="flex items-start gap-3 rounded-lg bg-card p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-50">
                          <BarChart3 className="h-4 w-4 text-cyan-600" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500">
                            Sessions Delivered
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {String(content.sessions_delivered)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Average rating */}
                    {content.average_rating != null && (
                      <div className="flex items-start gap-3 rounded-lg bg-card p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50">
                          <Star className="h-4 w-4 text-amber-500" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500">
                            Average Rating
                          </p>
                          <p className="text-lg font-semibold text-gray-900">
                            {Number(content.average_rating).toFixed(1)} / 5
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Sports covered */}
                    {Array.isArray(content.sports_covered) &&
                      content.sports_covered.length > 0 && (
                        <div className="sm:col-span-2">
                          <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            <Dumbbell className="h-3.5 w-3.5" />
                            Sports Covered
                          </h4>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(content.sports_covered as string[]).map((sport) => (
                              <Badge
                                key={sport}
                                variant="outline"
                                className="bg-card text-gray-700"
                              >
                                {sport}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* By class (schools with a class list) */}
                    {Array.isArray(content.class_breakdown) &&
                      content.class_breakdown.length > 0 && (
                        <div className="sm:col-span-2">
                          <h4 className="text-sm font-medium text-gray-700">
                            By Class
                          </h4>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                                  <th className="py-1.5 pr-3 font-medium">Class</th>
                                  <th className="py-1.5 pr-3 text-right font-medium">
                                    Students
                                  </th>
                                  <th className="py-1.5 pr-3 text-right font-medium">
                                    Attendance
                                  </th>
                                  <th className="py-1.5 pr-3 text-right font-medium">
                                    Avg mark
                                  </th>
                                  <th className="py-1.5 text-right font-medium">
                                    Movement
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {content.class_breakdown.map((cls) => (
                                  <tr key={cls.id} className="border-b last:border-0">
                                    <td className="py-1.5 pr-3 font-medium text-gray-900">
                                      {cls.name}{" "}
                                      <span className="text-xs text-gray-500">
                                        Yr {cls.year_group}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-3 text-right text-gray-600">
                                      {cls.student_count}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right text-gray-600">
                                      {cls.attendance_percentage != null
                                        ? `${cls.attendance_percentage}%`
                                        : "—"}
                                    </td>
                                    <td className="py-1.5 pr-3 text-right text-gray-600">
                                      {cls.avg_mark != null
                                        ? cls.avg_mark.toFixed(1)
                                        : "—"}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      {cls.mark_delta != null ? (
                                        <span
                                          className={
                                            cls.mark_delta > 0
                                              ? "text-green-600"
                                              : cls.mark_delta < 0
                                                ? "text-red-600"
                                                : "text-gray-600"
                                          }
                                        >
                                          {cls.mark_delta > 0 ? "+" : ""}
                                          {cls.mark_delta.toFixed(1)}
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    {/* Highlights */}
                    {Array.isArray(content.highlights) &&
                      content.highlights.length > 0 && (
                        <div className="sm:col-span-2">
                          <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            <Trophy className="h-3.5 w-3.5" />
                            Highlights
                          </h4>
                          <ul className="mt-2 space-y-1.5">
                            {(content.highlights as string[]).map((highlight, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm text-gray-600"
                              >
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                                {highlight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
