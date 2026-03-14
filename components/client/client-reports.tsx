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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClientReport } from "@/lib/client/portal-actions";

interface ClientReportsProps {
  reports: ClientReport[];
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

export function ClientReports({ reports }: ClientReportsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
        <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50">
            <FileText className="h-6 w-6 text-cyan-600" />
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
      <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Term reports summarising your centre&apos;s coaching sessions.
      </p>

      <div className="mt-6 space-y-3">
        {reports.map((report) => {
          const isExpanded = expandedId === report.id;
          const content = report.content_json as Record<string, string | number | string[] | null>;

          return (
            <Card key={report.id} className="overflow-hidden">
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
                      <div className="flex items-start gap-3 rounded-lg bg-white p-3">
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
                      <div className="flex items-start gap-3 rounded-lg bg-white p-3">
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
                                className="bg-white text-gray-700"
                              >
                                {sport}
                              </Badge>
                            ))}
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
