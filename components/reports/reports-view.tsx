"use client";

// ============================================================
// ReportsView
// ============================================================
//
// Shared list shell for both /admin/reports and /ops/reports. Drives:
//   - filter chip row (term, centre, status) with URL persistence
//   - jump-link chips (overdue, missing_report) from the pulse strip
//   - missing-report mode: replaces the table with a list of centres
//     that still need a report for the active term
//   - bulk-select with a sticky action bar for "Mark as sent" and
//     "Delete drafts"
//   - generate-new-report card preserved (existing functionality)
//
// Design language mirrors the centres / roster / CRM refreshes:
//   - rounded-2xl containers
//   - gap-6 between sections, gap-3 within filter bar
//   - brand orange (#E8712A) reserved for active chips, sticky-bar
//     primary CTA, and the pulse-strip counts

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/ui/app-link";
import {
  FileText,
  Plus,
  Loader2,
  Eye,
  Clock,
  Building2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateReport,
  bulkSendReports,
  bulkDeleteDraftReports,
} from "@/lib/reports/actions";
import type { ReportListItem } from "@/lib/reports/actions";
import type { CentreWithoutReport } from "@/lib/reports/status-pulse-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(report: ReportListItem): boolean {
  if (report.status !== "draft") return false;
  const created = new Date(report.created_at).getTime();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return created < cutoff;
}

function isThisWeek(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  // Monday of current week
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return d.getTime() >= monday.getTime();
}

// ============================================================
// Types
// ============================================================

interface ReportsViewProps {
  options: {
    centres: { id: string; name: string }[];
    terms: { id: string; name: string; status: string }[];
    error: string | null;
  };
  reports: { data: ReportListItem[]; error: string | null };
  /** Optional pre-fetched list of centres missing a report for the active term. */
  centresWithoutReport?: CentreWithoutReport[];
  /** "/admin/reports" or "/ops/reports". Defaults to /ops/reports. */
  basePath?: string;
}

type StatusFilter = "all" | "draft" | "sent";

// ============================================================
// Component
// ============================================================

export function ReportsView({
  options,
  reports,
  centresWithoutReport = [],
  basePath = "/ops/reports",
}: ReportsViewProps) {
  const reportList = reports.data ?? [];
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // Generation form state — kept local; not URL-persisted.
  // ============================================================

  const [centreId, setCentreId] = useState("");
  const [termId, setTermId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ============================================================
  // URL-backed filter state
  // ============================================================

  const [termFilter, setTermFilterState] = useState<string>(
    params.get("term") ?? "all"
  );
  const [centreFilter, setCentreFilterState] = useState<string>(
    params.get("centre") ?? "all"
  );
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>(
    (params.get("status") as StatusFilter | null) ?? "all"
  );
  const overdueOnly = params.get("overdue") === "yes";
  const missingReport = params.get("missing_report") === "yes";

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router]
  );

  function setTermFilter(v: string) {
    setTermFilterState(v);
    replaceParam("term", v === "all" ? null : v);
  }
  function setCentreFilter(v: string) {
    setCentreFilterState(v);
    replaceParam("centre", v === "all" ? null : v);
  }
  function setStatusFilter(v: StatusFilter) {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function clearJumpFilter(key: "overdue" | "missing_report") {
    replaceParam(key, null);
  }

  // ============================================================
  // Bulk-select state
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drop selection when the missing-report mode flips on (the table
  // is replaced with the centre list).
  useEffect(() => {
    if (missingReport && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [missingReport, selectedIds.size]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ============================================================
  // Derived list
  // ============================================================

  const filtered = useMemo(() => {
    let result = [...reportList];

    if (termFilter !== "all") {
      result = result.filter((r) => r.term_id === termFilter);
    }
    if (centreFilter !== "all") {
      result = result.filter((r) => r.centre_id === centreFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (overdueOnly) {
      result = result.filter(isOverdue);
    }
    // sent + this_week — the pulse "sent this week" link composes
    // ?status=sent&range=this_week. We only need the range filter
    // when sent is also set, so it's safe to read inline.
    if (params.get("range") === "this_week" && statusFilter === "sent") {
      result = result.filter((r) => isThisWeek(r.sent_at));
    }

    return result;
  }, [reportList, termFilter, centreFilter, statusFilter, overdueOnly, params]);

  const allVisibleIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allVisibleSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allVisibleIds));
  }

  // ============================================================
  // Generation handler
  // ============================================================

  async function handleGenerate() {
    if (!centreId || !termId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const { data, error: e } = await generateReport({ centreId, termId });
      if (e || !data) {
        setGenError(e ?? "Failed to generate report.");
        return;
      }
      router.push(`${basePath}/${data.id}`);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Failed to generate report"
      );
    } finally {
      setGenerating(false);
    }
  }

  // ============================================================
  // Active chips row
  // ============================================================

  const hasActiveChip = overdueOnly || missingReport;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Centre Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Generate, review and send term-end reports to centres
        </p>
      </div>

      {/* Active jump-filter chips (from pulse strip) */}
      {hasActiveChip && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {overdueOnly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Clock className="size-3" />
              Overdue drafts only
              <button
                type="button"
                onClick={() => clearJumpFilter("overdue")}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear overdue filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {missingReport && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Building2 className="size-3" />
              Centres without report
              <button
                type="button"
                onClick={() => clearJumpFilter("missing_report")}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear missing-report filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Generate New Report */}
      <div className="rounded-2xl border bg-background p-4 transition hover:shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Generate new report</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Centre</Label>
            <Select
              value={centreId}
              onValueChange={(v) => setCentreId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select centre" />
              </SelectTrigger>
              <SelectContent>
                {options.centres.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Term</Label>
            <Select value={termId} onValueChange={(v) => setTermId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                {options.terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!centreId || !termId || generating}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            Generate report
          </Button>
        </div>

        {genError && (
          <p className="mt-3 text-sm text-destructive">{genError}</p>
        )}
      </div>

      {/* Missing-report list mode */}
      {missingReport ? (
        <div className="rounded-2xl border bg-background">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">
              Centres without a report for the active term
            </h2>
            <p className="text-xs text-muted-foreground">
              {centresWithoutReport.length === 0
                ? "Every active centre has a report for this term — nice work."
                : `${centresWithoutReport.length} centre${centresWithoutReport.length === 1 ? "" : "s"} still need a report generated.`}
            </p>
          </div>
          {centresWithoutReport.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="mb-3 size-10 text-muted-foreground/50" />
              <p className="text-sm">All centres covered for the active term</p>
            </div>
          ) : (
            <ul className="divide-y">
              {centresWithoutReport.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 p-4 transition hover:bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.term_name && (
                      <p className="text-xs text-muted-foreground">
                        Term: {c.term_name}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCentreId(c.id);
                      if (c.term_id) setTermId(c.term_id);
                      // Scroll back up to the generator block.
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <FileText className="size-3.5" />
                    Generate
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {/* Filter chip row */}
          <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center">
            <Select
              value={termFilter}
              onValueChange={(v) => setTermFilter((v as string | null) ?? "all")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {options.terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={centreFilter}
              onValueChange={(v) =>
                setCentreFilter((v as string | null) ?? "all")
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Centre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All centres</SelectItem>
                {options.centres.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter((v as StatusFilter | null) ?? "all")
              }
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {filtered.length} report{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Report history table */}
          <div className="rounded-2xl border bg-background">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="mb-3 size-10 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No reports found
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try adjusting your filters or generate a new report above
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[36px]">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) =>
                          toggleSelectAll(checked === true)
                        }
                        aria-label="Select all visible"
                      />
                    </TableHead>
                    <TableHead>Centre</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((report) => {
                    const selected = selectedIds.has(report.id);
                    const overdue = isOverdue(report);
                    return (
                      <TableRow
                        key={report.id}
                        data-state={selected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleSelect(report.id)}
                            aria-label={`Select ${report.title}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{report.centre_name}</span>
                            {overdue && (
                              <Badge
                                variant="outline"
                                className="border-primary/40 text-primary"
                              >
                                <Clock className="size-3" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {report.term_name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              report.status === "sent" ? "default" : "outline"
                            }
                          >
                            {report.status === "sent" ? "Sent" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(report.sent_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(report.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <Link href={`${basePath}/${report.id}`} />
                            }
                          >
                            <Eye className="size-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {/* Sticky bulk-action bar */}
      {!missingReport && selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          selectedReports={filtered.filter((r) => selectedIds.has(r.id))}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// BulkActionBar — fixed bottom-right, rounded-2xl, brand-orange ring
// ============================================================

function BulkActionBar({
  selectedIds,
  selectedReports,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  selectedReports: ReportListItem[];
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const draftCount = selectedReports.filter((r) => r.status === "draft").length;
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div
        className={
          "fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6"
        }
      >
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} report{count === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          disabled={draftCount === 0}
        >
          <Trash2 className="size-4" />
          Delete drafts
        </Button>
        <Button
          size="sm"
          onClick={() => setSendOpen(true)}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <Send className="size-4" />
          Mark as sent
        </Button>
      </div>

      <BulkSendSheet
        open={sendOpen}
        onOpenChange={setSendOpen}
        selectedIds={selectedIds}
        selectedReports={selectedReports}
        onDone={() => {
          setSendOpen(false);
          onCompleted();
        }}
      />

      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        selectedIds={selectedIds}
        draftCount={draftCount}
        onDone={() => {
          setDeleteOpen(false);
          onCompleted();
        }}
      />
    </>
  );
}

// ============================================================
// BulkSendSheet — comma-separated recipient input
// ============================================================

function BulkSendSheet({
  open,
  onOpenChange,
  selectedIds,
  selectedReports,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  selectedReports: ReportListItem[];
  onDone: () => void;
}) {
  const [recipients, setRecipients] = useState("");
  const [working, setWorking] = useState(false);

  const alreadySentCount = selectedReports.filter(
    (r) => r.status === "sent"
  ).length;
  const eligibleCount = selectedReports.length - alreadySentCount;

  async function handleSend() {
    const emails = recipients
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (emails.length === 0) {
      toast.error("Add at least one recipient email.");
      return;
    }

    setWorking(true);
    try {
      const { sent, alreadySent, error } = await bulkSendReports(
        selectedIds,
        emails
      );

      if (error && sent === 0) {
        toast.error(error);
        return;
      }
      if (error) {
        toast.warning(error);
      } else {
        const parts: string[] = [];
        if (sent > 0) {
          parts.push(`Sent ${sent} report${sent === 1 ? "" : "s"}`);
        }
        if (alreadySent > 0) {
          parts.push(
            `${alreadySent} already sent (skipped)`
          );
        }
        toast.success(parts.join(" — "));
      }
      setRecipients("");
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Mark reports as sent</SheetTitle>
          <SheetDescription>
            Recipients receive the same email list for each report. {eligibleCount} draft{eligibleCount === 1 ? "" : "s"} will transition to sent.
            {alreadySentCount > 0 &&
              ` ${alreadySentCount} already-sent ${alreadySentCount === 1 ? "report" : "reports"} will be skipped.`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 px-4">
          <div className="space-y-2">
            <Label>Recipient emails (comma-separated)</Label>
            <Input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="alice@centre.com, bob@centre.com"
            />
            <p className="text-xs text-muted-foreground">
              These addresses are stored against each report's sent_to list.
            </p>
          </div>
        </div>
        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={working}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={working || !recipients.trim() || eligibleCount === 0}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {working ? "Marking…" : "Mark as sent"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// BulkDeleteDialog
// ============================================================

function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedIds,
  draftCount,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  draftCount: number;
  onDone: () => void;
}) {
  const [working, setWorking] = useState(false);
  const skippedCount = selectedIds.length - draftCount;

  async function handleDelete() {
    setWorking(true);
    try {
      const { deleted, skipped, error } = await bulkDeleteDraftReports(
        selectedIds
      );
      if (error && deleted === 0) {
        toast.error(error);
        return;
      }
      const parts: string[] = [];
      if (deleted > 0) {
        parts.push(`Deleted ${deleted} draft${deleted === 1 ? "" : "s"}`);
      }
      if (skipped > 0) {
        parts.push(
          `${skipped} sent ${skipped === 1 ? "report" : "reports"} kept`
        );
      }
      if (error) {
        toast.warning(error);
      } else {
        toast.success(parts.join(" — "));
      }
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {draftCount} draft{draftCount === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Sent reports are kept — the audit trail stays intact. Only drafts will be removed.
            {skippedCount > 0 &&
              ` ${skippedCount} already-sent ${skippedCount === 1 ? "report" : "reports"} in your selection will be skipped.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            disabled={working || draftCount === 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {working ? "Deleting…" : "Delete drafts"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
