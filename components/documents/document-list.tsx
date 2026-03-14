"use client";

import { useMemo, useState } from "react";
import {
  Search,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Calendar,
  User,
  Eye,
  GitBranch,
  SlidersHorizontal,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/documents/constants";
import type { DocumentListItem } from "@/lib/documents/actions";
import type { DocumentVisibility } from "@/lib/types/enums";

// ============================================================
// Document List
// ============================================================

interface DocumentListProps {
  documents: DocumentListItem[];
  onSelect: (doc: DocumentListItem) => void;
}

type SortOption = "newest" | "oldest" | "alpha" | "category";

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

function getFileIcon(fileName: string, size: "sm" | "md" = "md") {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const cls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
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

export function DocumentList({ documents, onSelect }: DocumentListProps) {
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] =
    useState<string>("all_vis");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let result = [...documents];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.file_name.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          (d.uploaded_by_name?.toLowerCase().includes(q) ?? false)
      );
    }

    // Visibility filter
    if (visibilityFilter !== "all_vis") {
      result = result.filter((d) => d.visibility === visibilityFilter);
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        );
        break;
      case "alpha":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "category":
        result.sort((a, b) => a.category.localeCompare(b.category));
        break;
    }

    return result;
  }, [documents, search, visibilityFilter, sortBy]);

  if (documents.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">
          No documents in this category yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + Sort Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? "border-primary text-primary" : ""}
          >
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            Filters
          </Button>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="alpha">A → Z</SelectItem>
              <SelectItem value="category">By Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-secondary p-3">
          <Select
            value={visibilityFilter}
            onValueChange={(v) => setVisibilityFilter(v ?? "")}
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_vis">All Visibility</SelectItem>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="admin_ops">Admin & Ops</SelectItem>
              <SelectItem value="admin_only">Admin Only</SelectItem>
            </SelectContent>
          </Select>

          {visibilityFilter !== "all_vis" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibilityFilter("all_vis")}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-muted-foreground/60">
        {filtered.length} document{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Document rows */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No documents match your search.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
            >
              <div className="mt-0.5 shrink-0">
                {getFileIcon(doc.file_name)}
              </div>
              <div className="flex-1 min-w-0">
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
