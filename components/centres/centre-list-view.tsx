"use client";

// ============================================================
// CentreListView
// ============================================================
//
// Shared list shell for both /admin/centres and /ops/centres. Drives:
//   - filter bar (search, type, status, pricing, region, sort)
//   - URL-state persistence so a filtered view is shareable / refresh-safe
//   - grid + table view modes (toggled via "view" query param)
//   - table-view bulk select with a sticky action bar
//
// Design language mirrors the /admin home refresh (commit 80ce5a5):
//   - rounded-2xl containers
//   - gap-6 between sections, gap-4 within
//   - brand orange (#E8712A) reserved for the active-filter chip
//     ring and the bulk-action bar's primary action; everything else
//     uses neutral muted/secondary tones

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  GraduationCap,
  Plus,
  Search,
  LayoutGrid,
  List,
  X,
  FileDown,
  MessageSquarePlus,
  CircleEllipsis,
  Receipt,
  AlertTriangle,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { FilterSelectChip } from "@/components/shared/filter-select-chip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { CentreCard } from "./centre-card";
import {
  bulkAddCentreNote,
  bulkUpdateCentreStatus,
  exportCentresCsv,
} from "@/lib/centres/actions";
import type { CentreListItem, CentreFilters } from "@/lib/centres/actions";
import type { CentreType, ContractStatus, PricingModel } from "@/lib/types/enums";

// ============================================================
// Helpers
// ============================================================

function formatCentreType(type: string): string {
  return type === "childcare_centre" ? "Childcare Centre" : "School";
}

function formatPricingModel(model: string): string {
  switch (model) {
    case "centre_funded":
      return "Centre Funded";
    case "parent_funded":
      return "Parent Funded";
    case "per_head":
      return "Per Head";
    default:
      return model;
  }
}

function contractStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "trial":
      return "secondary";
    case "paused":
      return "outline";
    case "churned":
      return "destructive";
    default:
      return "outline";
  }
}

function formatContractStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Map the three-tier health band to a dot colour for the table view. */
function healthDotClass(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ============================================================
// Component
// ============================================================

interface RegionOption {
  id: string;
  name: string;
}

interface CentreListViewProps {
  initialData: CentreListItem[];
  basePath: string; // "/admin/centres" or "/ops/centres"
  regions?: RegionOption[];
  /** Whether the viewer may see financial-tinted bulk actions (CSV rate column, future invoice). */
  hasFinancialAccess?: boolean;
}

type SortBy = NonNullable<CentreFilters["sortBy"]>;

const SORT_VALUES: SortBy[] = [
  "name",
  "contract_status",
  "created_at",
  "last_activity",
];

export function CentreListView({
  initialData,
  basePath,
  regions = [],
  hasFinancialAccess = false,
}: CentreListViewProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed state
  // ============================================================
  //
  // Every filter is mirrored to the query string so a filtered view is
  // shareable + refresh-safe. Default values are NOT serialised so the
  // bare /admin/centres URL stays clean. The setter wrappers below
  // (replaceParam) take care of removing the param when the user
  // clears the filter back to its default.

  const [search, setSearchState] = useState(params.get("search") ?? "");
  const [typeFilter, setTypeFilterState] = useState<CentreType | "all">(
    (params.get("type") as CentreType | null) ?? "all"
  );
  const [contractFilter, setContractFilterState] = useState<
    ContractStatus | "all"
  >((params.get("status") as ContractStatus | null) ?? "all");
  const [pricingFilter, setPricingFilterState] = useState<PricingModel | "all">(
    (params.get("pricing") as PricingModel | null) ?? "all"
  );
  const [regionFilter, setRegionFilterState] = useState<string>(
    params.get("region") ?? "all"
  );
  const [sortBy, setSortByState] = useState<SortBy>(
    (params.get("sort") as SortBy | null) &&
      SORT_VALUES.includes(params.get("sort") as SortBy)
      ? (params.get("sort") as SortBy)
      : "name"
  );
  const [viewMode, setViewModeState] = useState<"grid" | "table">(
    params.get("view") === "table" ? "table" : "grid"
  );

  // Boolean-only filters (driven by the pulse strip jump-links):
  // ?risk=true narrows to churn_risk=true; ?onboarding=behind narrows
  // to centres flagged behind. They aren't user-toggleable inline —
  // visible as "active" chips with a clear-X — to keep the filter bar
  // simple while preserving the jump-link behaviour.
  const riskOnly = params.get("risk") === "true";
  const onboardingBehind = params.get("onboarding") === "behind";

  /** Update a single query param without losing the others. */
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

  function setSearch(v: string) {
    setSearchState(v);
    replaceParam("search", v || null);
  }
  function setTypeFilter(v: CentreType | "all") {
    setTypeFilterState(v);
    replaceParam("type", v === "all" ? null : v);
  }
  function setContractFilter(v: ContractStatus | "all") {
    setContractFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function setPricingFilter(v: PricingModel | "all") {
    setPricingFilterState(v);
    replaceParam("pricing", v === "all" ? null : v);
  }
  function setRegionFilter(v: string) {
    setRegionFilterState(v);
    replaceParam("region", v === "all" ? null : v);
  }
  function setSortBy(v: SortBy) {
    setSortByState(v);
    replaceParam("sort", v === "name" ? null : v);
  }
  function setViewMode(v: "grid" | "table") {
    setViewModeState(v);
    replaceParam("view", v === "grid" ? null : v);
  }

  // ============================================================
  // Bulk-select state (table view only)
  // ============================================================

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // When the viewer flips back to grid, drop selection so the action
  // bar disappears and re-entering the table starts fresh.
  useEffect(() => {
    if (viewMode !== "table" && selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }, [viewMode, selectedIds.size]);

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
  // Behind-onboarding predicate (matches the pulse-strip definition)
  // ============================================================

  function isBehindOnboarding(c: CentreListItem): boolean {
    if (c.profile_checklist_complete) return false;
    if (c.onboarding_steps_total === null) return false;
    const completed = c.onboarding_steps_completed ?? 0;
    return completed < 5;
  }

  // ============================================================
  // Derived list
  // ============================================================

  const filtered = useMemo(() => {
    let result = [...initialData];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.primary_contact_name &&
            c.primary_contact_name.toLowerCase().includes(q))
      );
    }

    if (typeFilter !== "all") {
      result = result.filter((c) => c.type === typeFilter);
    }
    if (contractFilter !== "all") {
      result = result.filter((c) => c.contract_status === contractFilter);
    }
    if (pricingFilter !== "all") {
      result = result.filter((c) => c.pricing_model === pricingFilter);
    }
    if (regionFilter !== "all") {
      result = result.filter((c) => c.region_id === regionFilter);
    }
    if (riskOnly) {
      result = result.filter((c) => c.churn_risk === true);
    }
    if (onboardingBehind) {
      result = result.filter(isBehindOnboarding);
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "contract_status":
          return a.contract_status.localeCompare(b.contract_status);
        case "created_at":
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        case "last_activity": {
          // Nulls sink to the bottom; otherwise most-recent first.
          const aT = a.last_activity_at
            ? new Date(a.last_activity_at).getTime()
            : -Infinity;
          const bT = b.last_activity_at
            ? new Date(b.last_activity_at).getTime()
            : -Infinity;
          return bT - aT;
        }
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [
    initialData,
    search,
    typeFilter,
    contractFilter,
    pricingFilter,
    regionFilter,
    riskOnly,
    onboardingBehind,
    sortBy,
  ]);

  const allVisibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
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

  function clearJumpFilter(key: "risk" | "onboarding") {
    replaceParam(key, null);
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Centres & Schools
          </h1>
          <p className="text-sm text-muted-foreground">
            {initialData.length} venues registered
          </p>
        </div>
        <Button render={<Link href={`${basePath}/add`} />}>
          <Plus className="size-4" />
          Add Centre
        </Button>
      </div>

      {/* Active jump-filter chips (from pulse strip) */}
      {(riskOnly || onboardingBehind) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {riskOnly && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <AlertTriangle className="size-3" />
              At risk only
              <button
                type="button"
                onClick={() => clearJumpFilter("risk")}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear at-risk filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {onboardingBehind && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Compass className="size-3" />
              Behind on onboarding
              <button
                type="button"
                onClick={() => clearJumpFilter("onboarding")}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                aria-label="Clear onboarding filter"
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Filters bar — wrapped in a calm rounded-2xl shell */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search centres..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelectChip
            label="Type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as CentreType | "all")}
            options={[
              { value: "all", label: "All types" },
              { value: "childcare_centre", label: "Childcare" },
              { value: "school", label: "School" },
            ]}
          />
          <FilterSelectChip
            label="Status"
            value={contractFilter}
            onChange={(v) => setContractFilter(v as ContractStatus | "all")}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "trial", label: "Trial" },
              { value: "paused", label: "Paused" },
              { value: "churned", label: "Churned" },
            ]}
          />
          <FilterSelectChip
            label="Region"
            value={regionFilter}
            onChange={(v) => setRegionFilter(v || "all")}
            options={[
              { value: "all", label: "All regions" },
              ...regions.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
          <FilterSelectChip
            label="Pricing"
            value={pricingFilter}
            onChange={(v) => setPricingFilter(v as PricingModel | "all")}
            options={[
              { value: "all", label: "All pricing" },
              { value: "centre_funded", label: "Centre funded" },
              { value: "parent_funded", label: "Parent funded" },
              { value: "per_head", label: "Per head" },
            ]}
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="contract_status">Status</SelectItem>
            <SelectItem value="created_at">Newest</SelectItem>
            <SelectItem value="last_activity">Last activity</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex rounded-lg border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("table")}
            aria-label="Table view"
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <Building2 className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No centres found
          </p>
          <p className="text-xs text-muted-foreground/70">
            {search ||
            typeFilter !== "all" ||
            contractFilter !== "all" ||
            pricingFilter !== "all" ||
            regionFilter !== "all" ||
            riskOnly ||
            onboardingBehind
              ? "Try adjusting your filters"
              : "Add your first centre to get started"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((centre) => (
            <CentreCard key={centre.id} centre={centre} basePath={basePath} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border">
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
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((centre) => {
                const TypeIcon =
                  centre.type === "childcare_centre"
                    ? Building2
                    : GraduationCap;
                const selected = selectedIds.has(centre.id);
                return (
                  <TableRow
                    key={centre.id}
                    data-state={selected ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(centre.id)}
                        aria-label={`Select ${centre.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{centre.name}</span>
                        {centre.churn_risk && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" />
                            At risk
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCentreType(centre.type)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={contractStatusVariant(centre.contract_status)}
                      >
                        {formatContractStatus(centre.contract_status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPricingModel(centre.pricing_model)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {centre.primary_contact_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {centre.session_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {centre.health_score !== null ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={`Health score ${centre.health_score}`}
                                  className={
                                    "inline-block size-2.5 rounded-full " +
                                    healthDotClass(centre.health_score)
                                  }
                                />
                              }
                            />
                            <TooltipContent>
                              Health score: {centre.health_score}/100
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={`${basePath}/${centre.id}`} />}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Sticky bulk-action bar (table view only) */}
      {viewMode === "table" && selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          onClear={clearSelection}
          hasFinancialAccess={hasFinancialAccess}
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
  onClear,
  hasFinancialAccess,
  onCompleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  hasFinancialAccess: boolean;
  onCompleted: () => void;
}) {
  const count = selectedIds.length;
  const [noteOpen, setNoteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ContractStatus>("active");
  const [statusWorking, setStatusWorking] = useState(false);
  const [csvWorking, setCsvWorking] = useState(false);

  // CSV export — buffered in memory and written to a Blob URL. For our
  // current scale (<50 centres) this is fine; if the list grows past
  // a couple thousand rows we'd want to switch to a streamed response
  // route. Tradeoff flagged in the report.
  async function handleExport() {
    setCsvWorking(true);
    try {
      const { csv, error } = await exportCentresCsv(selectedIds);
      if (error || !csv) {
        toast.error(error ?? "Failed to export.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `centres-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} centre${count === 1 ? "" : "s"}.`);
    } finally {
      setCsvWorking(false);
    }
  }

  function handleInvoiceAll() {
    // Real generation lands in Wave B — keeping the chip in the UI
    // ensures the slot exists for when the action wires up.
    toast.info("Bulk invoicing coming in Wave B.");
  }

  async function handleStatusConfirm() {
    setStatusWorking(true);
    try {
      const { updated, error } = await bulkUpdateCentreStatus(
        selectedIds,
        pendingStatus
      );
      if (error && updated === 0) {
        toast.error(error);
        return;
      }
      if (error) {
        // Partial success — surface a warning but still close.
        toast.warning(error);
      } else {
        toast.success(
          `Updated ${updated} centre${updated === 1 ? "" : "s"} → ${pendingStatus}.`
        );
      }
      setStatusOpen(false);
      onCompleted();
    } finally {
      setStatusWorking(false);
    }
  }

  return (
    <>
      <div
        className={
          // Fixed positioning + brand-orange ring lifts the bar above
          // the page so the operator's next move is unmissable, while
          // staying out of the way of normal list browsing.
          "fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-background px-4 py-3 shadow-lg ring-1 ring-primary/20 sm:bottom-6 sm:right-6"
        }
      >
        <div className="flex items-center gap-3 pr-2 text-sm">
          <span className="font-medium text-foreground">
            {count} centre{count === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        {hasFinancialAccess && (
          <Button variant="outline" size="sm" onClick={handleInvoiceAll}>
            <Receipt className="size-4" />
            Invoice all
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNoteOpen(true)}
        >
          <MessageSquarePlus className="size-4" />
          Send announcement
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStatusOpen(true)}
        >
          <CircleEllipsis className="size-4" />
          Change status
        </Button>
        <Button
          size="sm"
          onClick={handleExport}
          disabled={csvWorking}
          className="bg-primary text-white hover:bg-primary/90"
        >
          <FileDown className="size-4" />
          {csvWorking ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Send announcement sheet — writes one centre_note per selected centre */}
      <BulkAnnouncementSheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        selectedIds={selectedIds}
        onDone={() => {
          setNoteOpen(false);
          onCompleted();
        }}
      />

      {/* Change-status confirmation */}
      <AlertDialog open={statusOpen} onOpenChange={setStatusOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change status for {count} centre{count === 1 ? "" : "s"}</AlertDialogTitle>
            <AlertDialogDescription>
              The new status will apply to every selected centre, and
              each change is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>New status</Label>
            <Select
              value={pendingStatus}
              onValueChange={(v) => setPendingStatus(v as ContractStatus)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleStatusConfirm();
              }}
              disabled={statusWorking}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {statusWorking ? "Saving…" : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================
// BulkAnnouncementSheet
// ============================================================
//
// The announcements table is staff-scoped (audience enum), not
// centre-scoped, so this records the outreach against each centre
// via centre_notes (category=client_relationship). Same operator
// intent — "broadcast a touchpoint to N centres" — using the schema
// we actually have. Note generation: one INSERT batch on the server.

function BulkAnnouncementSheet({
  open,
  onOpenChange,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}) {
  const [content, setContent] = useState("");
  const [working, setWorking] = useState(false);

  async function handleSend() {
    if (!content.trim()) return;
    setWorking(true);
    try {
      const { added, error } = await bulkAddCentreNote(
        selectedIds,
        content.trim()
      );
      if (error || added === 0) {
        toast.error(error ?? "Failed to send.");
        return;
      }
      toast.success(
        `Recorded outreach against ${added} centre${added === 1 ? "" : "s"}.`
      );
      setContent("");
      onDone();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col">
        <SheetHeader>
          <SheetTitle>Send announcement</SheetTitle>
          <SheetDescription>
            Recorded as a client-relationship note on each of the {selectedIds.length}{" "}
            selected centre{selectedIds.length === 1 ? "" : "s"}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 px-4">
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type the announcement..."
              rows={8}
            />
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
            disabled={working || !content.trim()}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {working ? "Sending…" : "Send"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
