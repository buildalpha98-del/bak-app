"use client";

// ============================================================
// Form Template List — admin/ops forms management
// ============================================================
//
// Refreshed as part of the closing-out series. Now hosts both
// the Templates and Submissions tabs behind URL-persisted state
// (`?tab=templates|submissions`), an inline status-pulse strip,
// filter chips, and bulk-select with a sticky action bar.
//
// Archive convention: `form_templates` has no `status` column —
// archived state is encoded by a `[Archived] ` prefix on the
// template name. See `lib/forms/actions.ts` for the bulk
// publish/archive helpers that maintain that convention.

import { useState, useEffect, useMemo, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  FileText,
  Building2,
  Copy,
  Loader2,
  Send,
  Archive,
  Download,
  User as UserIcon,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import {
  createFormTemplate,
  duplicateTemplate,
  getCentresForFilter,
  bulkPublishTemplates,
  bulkArchiveTemplates,
  bulkDuplicateTemplates,
  exportTemplatesCsv,
  getFormSubmissions,
} from "@/lib/forms/actions";
import {
  FORM_TYPE_LABELS,
  FORM_TYPES,
  DEFAULT_TEMPLATES,
} from "@/lib/forms/constants";
import type {
  FormTemplateListItem,
  FormSubmissionListItem,
} from "@/lib/forms/actions";
import type { FormsStatusPulse } from "@/lib/forms/status-pulse-actions";
import { FormsStatusPulseStrip } from "./forms-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";
import { toast } from "sonner";
import { SYDNEY_TZ } from "@/lib/utils/sydney-time";

const ARCHIVED_PREFIX = "[Archived] ";

function isArchived(name: string): boolean {
  return name.startsWith(ARCHIVED_PREFIX);
}

function displayName(name: string): string {
  return isArchived(name) ? name.slice(ARCHIVED_PREFIX.length) : name;
}

function templateStatus(t: FormTemplateListItem): "draft" | "published" | "archived" {
  if (isArchived(t.name)) return "archived";
  if (t.is_default) return "published";
  return "draft";
}

// These render timestamps (updated_at, submitted_at), and without an
// explicit timeZone toLocale* uses whatever zone the RUNTIME is in:
// UTC on the server, Sydney in the browser. For the ten hours a day
// those disagree, the two produce different dates for the same instant
// and hydration breaks (React #418) — which is exactly what /admin/forms
// was doing. Name the zone; never inherit it.
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: SYDNEY_TZ,
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SYDNEY_TZ,
  });
}

interface FormTemplateListProps {
  initialTemplates: FormTemplateListItem[];
  initialSubmissions?: FormSubmissionListItem[];
  submissionCounts?: Record<string, number>;
  pulse: FormsStatusPulse;
  basePath: string;
}

export function FormTemplateList({
  initialTemplates,
  initialSubmissions = [],
  submissionCounts = {},
  pulse,
  basePath,
}: FormTemplateListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // URL state
  const tab = (searchParams.get("tab") ?? "templates") as
    | "templates"
    | "submissions";
  const search = searchParams.get("q") ?? "";
  const typeFilter = searchParams.get("type") ?? "all";
  const statusFilter = (searchParams.get("status") ?? "all") as
    | "all"
    | "draft"
    | "published"
    | "archived";
  const centreFilter = searchParams.get("centre") ?? "all";
  const subRange = searchParams.get("range") ?? "all";

  const setParam = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  // Templates state
  const [templates, setTemplates] = useState(initialTemplates);
  const [counts] = useState(submissionCounts);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    getCentresForFilter().then((res) => setCentres(res.data ?? []));
  }, []);

  // Bulk-select state (templates)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [subTypeFilter] = useState<string>(typeFilter);
  const [subCentreFilter] = useState<string>(centreFilter);
  const [subDateFrom, setSubDateFrom] = useState<string>(
    searchParams.get("from") ?? "",
  );
  const [subDateTo, setSubDateTo] = useState<string>(
    searchParams.get("to") ?? "",
  );
  const [subLoading, setSubLoading] = useState(false);

  // Reload submissions when filters/range change (active tab only).
  useEffect(() => {
    if (tab !== "submissions") return;
    let cancelled = false;
    setSubLoading(true);

    const filters: Record<string, string | undefined> = {};
    if (typeFilter !== "all") filters.formType = typeFilter;
    if (centreFilter !== "all") filters.centreId = centreFilter;
    if (subDateFrom) filters.dateFrom = subDateFrom;
    if (subDateTo) filters.dateTo = subDateTo;

    // Convenience range presets — translate to dateFrom only.
    if (subRange === "this_week") {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      filters.dateFrom = monday.toISOString().slice(0, 10);
    }

    getFormSubmissions(filters).then((res) => {
      if (cancelled) return;
      setSubmissions(res.data ?? []);
      setSubLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, typeFilter, centreFilter, subDateFrom, subDateTo, subRange]);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>(FORM_TYPES[0]);
  const [creating, setCreating] = useState(false);

  // Duplicate dialog state
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeTemplateId, setDupeTemplateId] = useState<string | null>(null);
  const [dupeName, setDupeName] = useState("");
  const [dupeCentreId, setDupeCentreId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  // Derived template list (filter chips + status + centre + search).
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const name = displayName(t.name).toLowerCase();
      if (search && !name.includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && t.form_type !== typeFilter) return false;
      if (centreFilter !== "all" && t.centre_id !== centreFilter) return false;

      const status = templateStatus(t);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      return true;
    });
  }, [templates, search, typeFilter, centreFilter, statusFilter]);

  const allFilteredSelected =
    filteredTemplates.length > 0 &&
    filteredTemplates.every((t) => selected.has(t.id));

  function toggleAll() {
    if (allFilteredSelected) {
      const next = new Set(selected);
      for (const t of filteredTemplates) next.delete(t.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const t of filteredTemplates) next.add(t.id);
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // Bulk action handlers
  async function handleBulkPublish() {
    setBulkPending(true);
    const res = await bulkPublishTemplates(Array.from(selected));
    setBulkPending(false);
    if (res.error) toast.error(res.error);
    else toast.success(`Published ${res.published} template(s).`);
    clearSelection();
    router.refresh();
  }

  async function handleBulkArchive() {
    setBulkPending(true);
    const res = await bulkArchiveTemplates(Array.from(selected));
    setBulkPending(false);
    if (res.error) toast.error(res.error);
    else toast.success(`Archived ${res.archived} template(s).`);
    clearSelection();
    router.refresh();
  }

  async function handleBulkDuplicate() {
    setBulkPending(true);
    const res = await bulkDuplicateTemplates(Array.from(selected));
    setBulkPending(false);
    if (res.error) toast.error(res.error);
    else toast.success(`Duplicated ${res.duplicated} template(s).`);
    clearSelection();
    router.refresh();
  }

  async function handleBulkExport() {
    setBulkPending(true);
    const res = await exportTemplatesCsv(Array.from(selected));
    setBulkPending(false);
    if (res.error || !res.csv) {
      toast.error(res.error ?? "Export failed.");
      return;
    }
    const blob = new Blob([res.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `form-templates-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded.");
  }

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("Please enter a template name.");
      return;
    }
    setCreating(true);
    const defaultDef = DEFAULT_TEMPLATES[newType];
    const fields = defaultDef?.fields ?? [];
    const { data, error } = await createFormTemplate({
      name: newName.trim(),
      formType: newType,
      fieldsJson: fields,
      isDefault: false,
      centreId: null,
    });
    setCreating(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success("Template created.");
      setCreateOpen(false);
      setNewName("");
      router.push(`${basePath}/${data.id}/edit`);
    }
  }

  function openDuplicateDialog(templateId: string, templateName: string) {
    setDupeTemplateId(templateId);
    setDupeName(`${displayName(templateName)} (Copy)`);
    setDupeCentreId(null);
    setDupeOpen(true);
  }

  async function handleDuplicate() {
    if (!dupeTemplateId) return;
    setDuplicating(true);
    const { data, error } = await duplicateTemplate(
      dupeTemplateId,
      dupeCentreId,
      dupeName.trim() || undefined,
    );
    setDuplicating(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success("Template duplicated.");
      setDupeOpen(false);
      router.push(`${basePath}/${data.id}/edit`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Pulse strip */}
      <div className="mb-6">
        <FormsStatusPulseStrip pulse={pulse} basePath={basePath} />
      </div>

      {/* Header + Create CTA */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Forms</h1>
          <p className="text-sm text-muted-foreground">
            Manage templates and review submissions.
          </p>
        </div>
        {tab === "templates" && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Template
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div
        className="mt-4 inline-flex rounded-2xl border bg-background p-1"
        role="tablist"
        aria-label="Forms sections"
      >
        <button
          role="tab"
          aria-selected={tab === "templates"}
          onClick={() => setParam({ tab: null })}
          className={`px-4 py-1.5 text-sm rounded-xl transition-colors ${
            tab === "templates"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Templates
          <span className="ml-1.5 text-xs opacity-80">
            {templates.length}
          </span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "submissions"}
          onClick={() => setParam({ tab: "submissions" })}
          className={`px-4 py-1.5 text-sm rounded-xl transition-colors ${
            tab === "submissions"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Submissions
          <span className="ml-1.5 text-xs opacity-80">
            {initialSubmissions.length}
          </span>
        </button>
      </div>

      {tab === "templates" ? (
        <TemplatesTab
          basePath={basePath}
          search={search}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          centreFilter={centreFilter}
          centres={centres}
          setParam={setParam}
          filteredTemplates={filteredTemplates}
          counts={counts}
          selected={selected}
          allSelected={allFilteredSelected}
          toggleAll={toggleAll}
          toggleOne={toggleOne}
          clearSelection={clearSelection}
          bulkPending={bulkPending}
          onBulkPublish={handleBulkPublish}
          onBulkArchive={handleBulkArchive}
          onBulkDuplicate={handleBulkDuplicate}
          onBulkExport={handleBulkExport}
          openDuplicateDialog={openDuplicateDialog}
        />
      ) : (
        <SubmissionsTab
          submissions={submissions}
          loading={subLoading}
          typeFilter={subTypeFilter}
          centreFilter={subCentreFilter}
          dateFrom={subDateFrom}
          dateTo={subDateTo}
          centres={centres}
          range={subRange}
          setParam={setParam}
          setSubDateFrom={setSubDateFrom}
          setSubDateTo={setSubDateTo}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Form Template</DialogTitle>
            <DialogDescription>
              Create a new form template. You can customise the fields after
              creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Custom Attendance Form"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Form Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FORM_TYPE_LABELS[ft] ?? ft}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Template</DialogTitle>
            <DialogDescription>
              Create a copy of this template. Optionally assign it to a specific
              centre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>New Template Name</Label>
              <Input
                value={dupeName}
                onChange={(e) => setDupeName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Centre (optional)</Label>
              <Select
                value={dupeCentreId ?? "none"}
                onValueChange={(v) => setDupeCentreId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Global (all centres)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Global (all centres)</SelectItem>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground/60">
                Centre-specific templates override the default for that centre.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDupeOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDuplicate}
                disabled={duplicating}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {duplicating && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Duplicate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Templates Tab
// ============================================================

interface TemplatesTabProps {
  basePath: string;
  search: string;
  typeFilter: string;
  statusFilter: "all" | "draft" | "published" | "archived";
  centreFilter: string;
  centres: { id: string; name: string }[];
  setParam: (patch: Record<string, string | null>) => void;
  filteredTemplates: FormTemplateListItem[];
  counts: Record<string, number>;
  selected: Set<string>;
  allSelected: boolean;
  toggleAll: () => void;
  toggleOne: (id: string) => void;
  clearSelection: () => void;
  bulkPending: boolean;
  onBulkPublish: () => void;
  onBulkArchive: () => void;
  onBulkDuplicate: () => void;
  onBulkExport: () => void;
  openDuplicateDialog: (id: string, name: string) => void;
}

function TemplatesTab({
  basePath,
  search,
  typeFilter,
  statusFilter,
  centreFilter,
  centres,
  setParam,
  filteredTemplates,
  counts,
  selected,
  allSelected,
  toggleAll,
  toggleOne,
  clearSelection,
  bulkPending,
  onBulkPublish,
  onBulkArchive,
  onBulkDuplicate,
  onBulkExport,
  openDuplicateDialog,
}: TemplatesTabProps) {
  return (
    <div>
      {/* Filter chip row */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) =>
              setParam({ q: e.target.value === "" ? null : e.target.value })
            }
            placeholder="Search templates..."
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setParam({ type: v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Form Type" />
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
        <Select
          value={statusFilter}
          onValueChange={(v) => setParam({ status: v })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={centreFilter}
          onValueChange={(v) => setParam({ centre: v })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Centre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Centres</SelectItem>
            <SelectItem value="none">Global only</SelectItem>
            {centres.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-3 shadow-md">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkPublish}
              disabled={bulkPending}
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              Publish
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkArchive}
              disabled={bulkPending}
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkDuplicate}
              disabled={bulkPending}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkExport}
              disabled={bulkPending}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={bulkPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Select-all checkbox row */}
      {filteredTemplates.length > 0 && (
        <div className="mt-4 flex items-center gap-2 px-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all visible templates"
          />
          <span className="text-xs text-muted-foreground">
            Select all visible ({filteredTemplates.length})
          </span>
        </div>
      )}

      {/* Template list */}
      <div className="mt-2 flex flex-col gap-6">
        {filteredTemplates.length > 0 ? (
          filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              basePath={basePath}
              submissionCount={counts[template.id] ?? 0}
              checked={selected.has(template.id)}
              onToggle={() => toggleOne(template.id)}
              onDuplicate={() =>
                openDuplicateDialog(template.id, template.name)
              }
            />
          ))
        ) : (
          <div className="rounded-2xl border bg-background py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No templates found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the filters or create your first form template.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  basePath,
  submissionCount,
  checked,
  onToggle,
  onDuplicate,
}: {
  template: FormTemplateListItem;
  basePath: string;
  submissionCount: number;
  checked: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const status = templateStatus(template);
  const ticked = useCountUp(submissionCount);

  return (
    <Card className="rounded-2xl transition-shadow hover:shadow-md card-hover">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${displayName(template.name)}`}
          />
          <Link
            href={`${basePath}/${template.id}/edit`}
            className="flex items-center gap-3 min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground truncate">
                  {displayName(template.name)}
                </span>
                {template.is_default && (
                  <Badge className="bg-primary text-white text-[10px]">
                    Default
                  </Badge>
                )}
                {status === "archived" && (
                  <Badge variant="secondary" className="text-[10px]">
                    Archived
                  </Badge>
                )}
                {status === "draft" && (
                  <Badge variant="outline" className="text-[10px]">
                    Draft
                  </Badge>
                )}
                {template.centre_name && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Building2 className="h-3 w-3" />
                    {template.centre_name}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {ticked} submission{submissionCount !== 1 ? "s" : ""}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {FORM_TYPE_LABELS[template.form_type] ?? template.form_type} ·{" "}
                {template.field_count} field
                {template.field_count !== 1 ? "s" : ""} · Updated{" "}
                {formatDate(template.updated_at)}
              </p>
            </div>
          </Link>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Duplicate
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Submissions Tab
// ============================================================

interface SubmissionsTabProps {
  submissions: FormSubmissionListItem[];
  loading: boolean;
  typeFilter: string;
  centreFilter: string;
  dateFrom: string;
  dateTo: string;
  centres: { id: string; name: string }[];
  range: string;
  setParam: (patch: Record<string, string | null>) => void;
  setSubDateFrom: (v: string) => void;
  setSubDateTo: (v: string) => void;
}

function SubmissionsTab({
  submissions,
  loading,
  typeFilter,
  centreFilter,
  dateFrom,
  dateTo,
  centres,
  range,
  setParam,
  setSubDateFrom,
  setSubDateTo,
}: SubmissionsTabProps) {
  return (
    <div>
      {/* Filter chip row */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <Select
          value={typeFilter}
          onValueChange={(v) => setParam({ type: v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Form Type" />
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
        <Select
          value={centreFilter}
          onValueChange={(v) => setParam({ centre: v })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Centre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Centres</SelectItem>
            {centres.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={range}
          onValueChange={(v) => setParam({ range: v })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setSubDateFrom(e.target.value);
              setParam({ from: e.target.value === "" ? null : e.target.value });
            }}
            className="w-[150px]"
            aria-label="From date"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setSubDateTo(e.target.value);
              setParam({ to: e.target.value === "" ? null : e.target.value });
            }}
            className="w-[150px]"
            aria-label="To date"
          />
        </div>
      </div>

      {/* Count */}
      <p className="mt-3 text-xs text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading submissions…
          </span>
        ) : (
          <>
            {submissions.length} submission
            {submissions.length !== 1 ? "s" : ""}
          </>
        )}
      </p>

      {/* Submissions list */}
      <div className="mt-4 flex flex-col gap-6">
        {submissions.length > 0 ? (
          submissions.map((sub) => (
            <Card
              key={sub.id}
              className="rounded-2xl transition-shadow hover:shadow-md card-hover"
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
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-3 w-3" />
                        {sub.coach_name}
                      </span>
                      {sub.centre_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {sub.centre_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {formatDateTime(sub.submitted_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="rounded-2xl border bg-background py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No submissions found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              Submissions appear here when coaches submit forms from their
              portal. Adjust the filters if you expected to see results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
