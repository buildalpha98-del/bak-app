"use client";

// ============================================================
// DocumentList
// ============================================================
//
// Shared list shell for the documents hub. Matches the design
// language from the prior close-outs (centres / staff / children /
// programmes / training):
//   - filter chip row (search, tag, visibility) with URL-state
//     persistence so a filtered view is shareable + refresh-safe
//   - Grid / Table view toggle (URL-persisted via ?view=)
//   - bulk-select with sticky orange action bar (Archive / Tag /
//     Visibility / Delete / Export CSV)
//   - row-as-link overlay for keyboard / right-click / open-in-new-tab
//
// Design language:
//   - rounded-2xl containers
//   - gap-6 between sections
//   - brand orange (#E8712A) reserved for: bulk-action bar, active
//     filter chips, "Open" CTA hover.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Calendar,
  User,
  Eye,
  GitBranch,
  Download,
  Archive,
  Tag as TagIcon,
  Trash2,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS } from "@/lib/documents/constants";
import {
  bulkArchiveDocuments,
  bulkDeleteDocuments,
  bulkSetVisibility,
  bulkTagDocuments,
  exportDocumentsCsv,
} from "@/lib/documents/actions";
import type { DocumentListItem } from "@/lib/documents/actions";
import type { DocumentVisibility } from "@/lib/types/enums";

// ============================================================
// Types + helpers
// ============================================================

interface DocumentListProps {
  documents: DocumentListItem[];
  onSelect: (doc: DocumentListItem) => void;
  userRole: "admin" | "ops" | "coach";
  onRefresh: () => void;
}

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  all: "Everyone",
  admin_ops: "Admin & Ops",
  admin_only: "Admin Only",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getFileIcon(fileName: string, size: "sm" | "md" | "lg" = "md") {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const cls =
    size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  if (ext === "pdf") return <FileText className={`${cls} text-red-500`} />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext ?? ""))
    return <ImageIcon className={`${cls} text-blue-500`} />;
  if (["xls", "xlsx"].includes(ext ?? ""))
    return <FileSpreadsheet className={`${cls} text-green-600`} />;
  if (["doc", "docx"].includes(ext ?? ""))
    return <FileText className={`${cls} text-blue-600`} />;
  return <FileText className={`${cls} text-muted-foreground`} />;
}

export { getFileIcon };

function getMondayDate(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ============================================================
// Component
// ============================================================

export function DocumentList({
  documents,
  onSelect,
  userRole,
  onRefresh,
}: DocumentListProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  // ============================================================
  // URL-backed filter state
  // ============================================================

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [tagFilter, setTagFilterState] = useState<string>(
    params.get("tag") ?? "all",
  );
  const [visibilityFilter, setVisibilityFilterState] = useState<string>(
    params.get("visibility") ?? "all",
  );
  const view = (params.get("view") as "grid" | "table" | null) ?? "table";

  // Pulse-driven jump chips.
  const rangeThisWeek = params.get("range") === "this_week";
  const ageExpiring = params.get("age") === "expiring";

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
    [params, router],
  );

  function setSearch(v: string) {
    setSearchState(v);
    replaceParam("search", v || null);
  }
  function setTagFilter(v: string) {
    setTagFilterState(v);
    replaceParam("tag", v === "all" ? null : v);
  }
  function setVisibilityFilter(v: string) {
    setVisibilityFilterState(v);
    replaceParam("visibility", v === "all" ? null : v);
  }
  function setView(v: "grid" | "table") {
    replaceParam("view", v === "table" ? null : v);
  }
  function clearJump(key: "range" | "age") {
    replaceParam(key, null);
  }
  function clearAllFilters() {
    setSearchState("");
    setTagFilterState("all");
    setVisibilityFilterState("all");
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("search");
    next.delete("tag");
    next.delete("visibility");
    next.delete("range");
    next.delete("age");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  // ============================================================
  // Available tags — distinct values from the visible documents
  // ============================================================

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      for (const tag of doc.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [documents]);

  // ============================================================
  // Bulk-select state
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    let result = [...documents];
    const monday = getMondayDate();

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          (d.uploaded_by_name?.toLowerCase().includes(q) ?? false),
      );
    }

    // Visibility filter — "all" is the filter sentinel (no filter); to
    // filter for visibility === "all" we use the synthetic sentinel
    // "visibility-everyone".
    if (visibilityFilter !== "all") {
      const target =
        visibilityFilter === "visibility-everyone" ? "all" : visibilityFilter;
      result = result.filter((d) => d.visibility === target);
    }

    // Tag filter — special-cased "untagged" + "needs_review" jump
    if (tagFilter === "untagged") {
      result = result.filter((d) => !d.tags || d.tags.length === 0);
    } else if (tagFilter && tagFilter !== "all") {
      result = result.filter((d) => d.tags.includes(tagFilter));
    }

    // Range chip — uploaded this week
    if (rangeThisWeek) {
      result = result.filter(
        (d) => new Date(d.created_at).getTime() >= monday.getTime(),
      );
    }

    // Age chip — compliance docs 90+ days old.
    if (ageExpiring) {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      result = result.filter(
        (d) =>
          d.category === "compliance" &&
          new Date(d.created_at).getTime() < cutoff,
      );
    }

    // Newest first by default.
    result.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return result;
  }, [documents, search, tagFilter, visibilityFilter, rangeThisWeek, ageExpiring]);

  const allVisibleIds = useMemo(() => filtered.map((d) => d.id), [filtered]);
  const allVisibleSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allVisibleIds));
  }

  // Drop selection when the filtered set changes and our selection
  // would refer to rows that aren't visible (e.g. switched filters).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(allVisibleIds);
    let trimmed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (visible.has(id)) next.add(id);
      else trimmed = true;
    }
    if (trimmed) setSelectedIds(next);
  }, [allVisibleIds, selectedIds]);

  const selectionActive = selectedIds.size > 0;

  const anyFilterActive =
    search.trim().length > 0 ||
    tagFilter !== "all" ||
    visibilityFilter !== "all" ||
    rangeThisWeek ||
    ageExpiring;

  // ============================================================
  // Empty (no docs at all)
  // ============================================================

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/20 p-8 text-center">
        <FileText className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          No documents in this category yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Upload your first document to start the library.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active jump chips */}
      {(rangeThisWeek || ageExpiring) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {rangeThisWeek && (
            <JumpChip
              label="Uploaded this week"
              onClear={() => clearJump("range")}
            />
          )}
          {ageExpiring && (
            <JumpChip
              label="Compliance — expiring"
              onClear={() => clearJump("age")}
            />
          )}
        </div>
      )}

      {/* Filter chip row */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, file, tags, uploader..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[40px] pl-9"
          />
        </div>

        <Select
          value={tagFilter}
          onValueChange={(v) => setTagFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            <SelectItem value="untagged">Untagged</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            {availableTags
              .filter((t) => t !== "needs_review")
              .map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={visibilityFilter}
          onValueChange={(v) => setVisibilityFilter(v ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            <SelectItem value="visibility-everyone">Everyone</SelectItem>
            <SelectItem value="admin_ops">Admin & Ops</SelectItem>
            <SelectItem value="admin_only">Admin Only</SelectItem>
          </SelectContent>
        </Select>

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40"
          >
            <X className="size-3" />
            Clear all
          </button>
        )}

        <div className="sm:ml-auto inline-flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition ${
              view === "table"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={view === "table"}
          >
            <ListIcon className="size-3.5" />
            Table
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition ${
              view === "grid"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-pressed={view === "grid"}
          >
            <LayoutGrid className="size-3.5" />
            Grid
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {documents.length} document
        {documents.length === 1 ? "" : "s"}
      </p>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/20 p-8 text-center">
          <Search className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No documents match your filters.
          </p>
        </div>
      ) : view === "grid" ? (
        <DocumentGrid
          documents={filtered}
          onSelect={onSelect}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <DocumentTable
          documents={filtered}
          onSelect={onSelect}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          allVisibleSelected={allVisibleSelected}
        />
      )}

      {/* Sticky bulk-action bar */}
      {selectionActive && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          userRole={userRole}
          onClear={clearSelection}
          onCompleted={() => {
            clearSelection();
            startTransition(() => {
              onRefresh();
            });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// JumpChip — removable pulse-link chip
// ============================================================

function JumpChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
        aria-label={`Clear ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

// ============================================================
// DocumentTable — desktop list
// ============================================================

function DocumentTable({
  documents,
  onSelect,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
}: {
  documents: DocumentListItem[];
  onSelect: (doc: DocumentListItem) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-background">
      {/* Header */}
      <div className="grid grid-cols-[36px_1fr] items-center gap-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
        <Checkbox
          checked={allVisibleSelected}
          onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
          aria-label="Select all visible"
        />
        <span>Documents</span>
      </div>

      <ul className="divide-y divide-border">
        {documents.map((doc) => {
          const selected = selectedIds.has(doc.id);
          return (
            <li
              key={doc.id}
              className={`relative grid grid-cols-[36px_1fr_auto] items-start gap-3 px-4 py-3 transition hover:bg-muted/30 ${
                selected ? "bg-primary/5" : ""
              }`}
            >
              <div
                className="relative z-10 mt-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(doc.id)}
                  aria-label={`Select ${doc.title}`}
                />
              </div>

              <Link
                href={`#doc-${doc.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect(doc);
                }}
                className="flex min-w-0 items-start gap-3 outline-none focus-visible:underline"
              >
                <div className="mt-0.5 shrink-0">
                  {getFileIcon(doc.file_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {doc.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {doc.version > 1 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5"
                        >
                          <GitBranch className="h-2.5 w-2.5" />v{doc.version}
                        </Badge>
                      )}
                      {doc.visibility !== "all" && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-0.5"
                        >
                          <Eye className="h-2.5 w-2.5" />
                          {VISIBILITY_LABELS[doc.visibility]}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {CATEGORY_LABELS[doc.category]}
                    </Badge>
                    {doc.tags.slice(0, 3).map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px]"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {doc.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground/60">
                        +{doc.tags.length - 3} more
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground/60">
                    {doc.uploaded_by_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {doc.uploaded_by_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(doc.created_at)}
                    </span>
                  </div>
                </div>
              </Link>

              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-primary"
                aria-label={`Open ${doc.title} in new tab`}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// DocumentGrid — 3-col grid view
// ============================================================

function DocumentGrid({
  documents,
  onSelect,
  selectedIds,
  onToggleSelect,
}: {
  documents: DocumentListItem[];
  onSelect: (doc: DocumentListItem) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {documents.map((doc) => {
        const selected = selectedIds.has(doc.id);
        return (
          <div
            key={doc.id}
            className={`relative flex flex-col gap-2 rounded-2xl border bg-background p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
              selected ? "bg-primary/5 ring-1 ring-primary/30" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              <div
                className="relative z-10 mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(doc.id)}
                  aria-label={`Select ${doc.title}`}
                />
              </div>
              <div className="shrink-0">{getFileIcon(doc.file_name, "lg")}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground leading-tight">
                  {doc.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {doc.file_name}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {CATEGORY_LABELS[doc.category]}
              </Badge>
              {doc.version > 1 && (
                <Badge variant="outline" className="text-[10px] gap-0.5">
                  <GitBranch className="h-2.5 w-2.5" />v{doc.version}
                </Badge>
              )}
              {doc.tags.slice(0, 2).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[10px]"
                >
                  {tag}
                </Badge>
              ))}
              {doc.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{doc.tags.length - 2}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground/70">
              <span className="flex items-center gap-1 truncate">
                {doc.uploaded_by_name && (
                  <>
                    <User className="h-3 w-3" />
                    <span className="truncate">{doc.uploaded_by_name}</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Calendar className="h-3 w-3" />
                {formatDate(doc.created_at)}
              </span>
            </div>

            <div className="mt-1 flex items-center justify-end gap-1">
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-primary"
                aria-label={`Open ${doc.title} in new tab`}
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <Link
              href={`#doc-${doc.id}`}
              onClick={(e) => {
                e.preventDefault();
                onSelect(doc);
              }}
              className="absolute inset-0 rounded-2xl"
              aria-label={`Open ${doc.title}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// BulkActionBar — fixed bottom-right, brand orange ring
// ============================================================

function BulkActionBar({
  selectedIds,
  userRole,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  userRole: "admin" | "ops" | "coach";
  onClear: () => void;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const isAdmin = userRole === "admin";

  const [archiving, setArchiving] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [visChanging, setVisChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [tagOpen, setTagOpen] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [visOpen, setVisOpen] = useState(false);
  const [visValue, setVisValue] = useState<DocumentVisibility>("all");
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      const result = await bulkArchiveDocuments(selectedIds);
      if (result.error && result.updated === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Archived ${result.updated} document${result.updated === 1 ? "" : "s"}` +
          (result.errors.length ? ` (${result.errors.length} skipped).` : "."),
      );
      onCompleted();
    } finally {
      setArchiving(false);
    }
  }

  async function handleTag() {
    if (!tagValue.trim()) {
      toast.error("Tag cannot be empty.");
      return;
    }
    setTagging(true);
    try {
      const result = await bulkTagDocuments(selectedIds, tagValue.trim());
      if (result.error && result.updated === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Tagged ${result.updated} document${result.updated === 1 ? "" : "s"}.`,
      );
      setTagOpen(false);
      setTagValue("");
      onCompleted();
    } finally {
      setTagging(false);
    }
  }

  async function handleVisibility() {
    setVisChanging(true);
    try {
      const result = await bulkSetVisibility(selectedIds, visValue);
      if (result.error && result.updated === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Updated visibility for ${result.updated} document${result.updated === 1 ? "" : "s"}.`,
      );
      setVisOpen(false);
      onCompleted();
    } finally {
      setVisChanging(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const result = await bulkDeleteDocuments(selectedIds);
      if (result.error && result.updated === 0) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Deleted ${result.updated} document${result.updated === 1 ? "" : "s"}.`,
      );
      setDeleteOpen(false);
      onCompleted();
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { csv, error } = await exportDocumentsCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Export failed.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documents-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${selectedIds.length} document${selectedIds.length === 1 ? "" : "s"}.`,
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6">
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} document{count === 1 ? "" : "s"} selected
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
          onClick={handleArchive}
          disabled={archiving}
        >
          {archiving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Archive className="size-4" />
          )}
          Archive
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setTagOpen(true)}
          disabled={tagging}
        >
          {tagging ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <TagIcon className="size-4" />
          )}
          Tag
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setVisOpen(true)}
          disabled={visChanging}
        >
          {visChanging ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Eye className="size-4" />
          )}
          Visibility
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export CSV
        </Button>

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
            className="text-red-600 hover:text-red-700"
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
        )}
      </div>

      {/* Tag dialog */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tag documents</DialogTitle>
            <DialogDescription>
              Add a tag to {count} selected document{count === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-tag-input">Tag</Label>
            <Input
              id="bulk-tag-input"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="e.g. q3-review, archived-pre-2025"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTag();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTagOpen(false);
                setTagValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTag}
              disabled={tagging || !tagValue.trim()}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {tagging && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Apply tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visibility dialog */}
      <Dialog open={visOpen} onOpenChange={setVisOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change visibility</DialogTitle>
            <DialogDescription>
              Set visibility for {count} selected document
              {count === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-vis-select">Visibility</Label>
            <Select
              value={visValue}
              onValueChange={(v) => setVisValue(v as DocumentVisibility)}
            >
              <SelectTrigger id="bulk-vis-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="admin_ops">Admin & Ops</SelectItem>
                <SelectItem value="admin_only">Admin Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVisOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleVisibility}
              disabled={visChanging}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {visChanging && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete documents?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {count} document
              {count === 1 ? "" : "s"} from the library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

