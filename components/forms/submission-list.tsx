"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Search,
  FileText,
  Download,
  Eye,
  Calendar,
  User,
  Building2,
} from "lucide-react";
import {
  getFormSubmissions,
  getSubmissionById,
  getFormTemplateById,
  getCoachesForFilter,
  getCentresForFilter,
} from "@/lib/forms/actions";
import { FORM_TYPE_LABELS, FORM_TYPES } from "@/lib/forms/constants";
import type { FormSubmissionListItem } from "@/lib/forms/actions";
import type { FormField } from "@/lib/types/database";
import { FormRenderer } from "./form-renderer";
import { toast } from "sonner";

// ============================================================
// Submission List — ops/admin view of all form submissions
// ============================================================

interface SubmissionListProps {
  initialSubmissions: FormSubmissionListItem[];
  userRole: "admin" | "ops";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SubmissionList({
  initialSubmissions,
  userRole,
}: SubmissionListProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Detail view
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState<FormSubmissionListItem | null>(null);
  const [detailFields, setDetailFields] = useState<FormField[]>([]);

  // Lookups
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([getCoachesForFilter(), getCentresForFilter()]).then(
      ([coachRes, centreRes]) => {
        setCoaches(coachRes.data ?? []);
        setCentres(centreRes.data ?? []);
      }
    );
  }, []);

  async function applyFilters() {
    setLoading(true);
    const { data } = await getFormSubmissions({
      formType: typeFilter !== "all" ? typeFilter : undefined,
      coachId: coachFilter !== "all" ? coachFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
    if (data) setSubmissions(data);
    setLoading(false);
  }

  async function handleViewSubmission(sub: FormSubmissionListItem) {
    // Get the template fields for rendering
    const { data: template } = await getFormTemplateById(sub.form_template_id);
    if (template) {
      setDetailFields(template.fields_json ?? []);
    }
    setDetailSubmission(sub);
    setDetailOpen(true);
  }

  function exportCsv() {
    const exportData = displayed.length > 0 ? displayed : submissions;
    if (exportData.length === 0) {
      toast.error("No submissions to export. Coaches submit forms from the coach portal.");
      return;
    }

    // Build CSV
    const headers = ["Submitted", "Form Type", "Coach", "Centre", "Session Date"];
    // Add data field keys from first submission
    const dataKeys = Object.keys(exportData[0].data_json ?? {});
    headers.push(...dataKeys);

    const rows = exportData.map((s) => {
      const base = [
        formatDateTime(s.submitted_at),
        FORM_TYPE_LABELS[s.form_type] ?? s.form_type,
        s.coach_name,
        s.centre_name ?? "",
        s.session_date ? formatDate(s.session_date) : "",
      ];
      const dataVals = dataKeys.map((k) => {
        const val = s.data_json[k];
        if (typeof val === "boolean") return val ? "Yes" : "No";
        if (Array.isArray(val)) return val.join("; ");
        return String(val ?? "");
      });
      return [...base, ...dataVals];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `form-submissions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded.");
  }

  // Client-side type filter for responsiveness
  const displayed = typeFilter === "all"
    ? submissions
    : submissions.filter((s) => s.form_type === typeFilter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Form Submissions
          </h1>
          <p className="text-sm text-muted-foreground">
            View and export submitted forms.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Form Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {FORM_TYPES.map((ft) => (
                <SelectItem key={ft} value={ft}>
                  {FORM_TYPE_LABELS[ft] ?? ft}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Coach</Label>
          <Select value={coachFilter} onValueChange={(v) => setCoachFilter(v ?? "")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Coaches</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={applyFilters} disabled={loading}>
          Apply Filters
        </Button>
      </div>

      {/* Submissions list */}
      <div className="mt-6 space-y-2">
        {displayed.length > 0 ? (
          displayed.map((sub) => (
            <Card
              key={sub.id}
              className="cursor-pointer transition-shadow hover:shadow-md card-hover"
              onClick={() => handleViewSubmission(sub)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {sub.template_name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {FORM_TYPE_LABELS[sub.form_type] ?? sub.form_type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {sub.coach_name}
                      </span>
                      {sub.centre_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {sub.centre_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(sub.submitted_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground/60" />
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No submissions found
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Form submissions appear here when coaches submit them from their
              coach portal. Coaches can access their forms under{" "}
              <span className="font-medium text-foreground">Coach Portal &rarr; Forms</span>.
            </p>
            {typeFilter !== "all" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setTypeFilter("all"); applyFilters(); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailSubmission?.template_name}</SheetTitle>
            <SheetDescription>
              Submitted by {detailSubmission?.coach_name} on{" "}
              {detailSubmission ? formatDateTime(detailSubmission.submitted_at) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 pt-2">
            {detailFields.length > 0 && detailSubmission && (
              <FormRenderer
                fields={detailFields}
                mode="view"
                initialData={detailSubmission.data_json}
              />
            )}

            {/* Attachments */}
            {detailSubmission?.attachments &&
              detailSubmission.attachments.length > 0 && (
                <div className="mt-4">
                  <Label className="text-xs">Attachments</Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {detailSubmission.attachments.map((url, idx) => (
                      <a
                        key={url}
                        href={String(url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={String(url)}
                          alt={`Attachment ${idx + 1}`}
                          className="h-20 w-20 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
