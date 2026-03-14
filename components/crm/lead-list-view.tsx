"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List,
  Trash2,
  UserPlus,
  MoveRight,
  Loader2,
  Users,
  DollarSign,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  bulkChangeStage,
  bulkAssignOwner,
  bulkDeleteLeads,
  getCrmStaffMembers,
} from "@/lib/crm/actions";
import type { LeadWithOwner } from "@/lib/crm/actions";
import type { LeadStage, LeadSource } from "@/lib/types/enums";

// ============================================================
// Constants
// ============================================================

const STAGE_CONFIG: Record<LeadStage, { label: string; className: string }> = {
  cold_lead: { label: "Cold Lead", className: "bg-slate-100 text-slate-700" },
  contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700" },
  interested: { label: "Interested", className: "bg-purple-100 text-purple-700" },
  free_trial: { label: "Free Trial", className: "bg-amber-100 text-amber-700" },
  proposal_sent: { label: "Proposal Sent", className: "bg-indigo-100 text-indigo-700" },
  won: { label: "Won", className: "bg-emerald-100 text-emerald-700" },
  lost: { label: "Lost", className: "bg-red-100 text-red-700" },
  churned: { label: "Churned", className: "bg-gray-100 text-gray-600" },
};

const SOURCE_CONFIG: Record<LeadSource, { label: string; className: string }> = {
  manual: { label: "Manual", className: "bg-slate-100 text-slate-600" },
  csv_import: { label: "CSV Import", className: "bg-blue-100 text-blue-600" },
  web_form: { label: "Web Form", className: "bg-emerald-100 text-emerald-600" },
  referral: { label: "Referral", className: "bg-purple-100 text-purple-600" },
};

type SortField =
  | "centre_name"
  | "contact_name"
  | "type"
  | "stage"
  | "source"
  | "owner_name"
  | "estimated_value"
  | "days_in_stage"
  | "updated_at"
  | "created_at";

type SortDir = "asc" | "desc";

// ============================================================
// Helpers
// ============================================================

function daysBetween(from: string, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================
// Component
// ============================================================

interface LeadListViewProps {
  leads: LeadWithOwner[];
}

export function LeadListView({ leads }: LeadListViewProps) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStage | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk action state
  const [isPending, startTransition] = useTransition();
  const [bulkStage, setBulkStage] = useState<LeadStage | "">("");
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);

  const now = useMemo(() => new Date(), []);

  // Load staff list on demand (for bulk assign)
  const ensureStaffLoaded = useCallback(() => {
    if (staffLoaded) return;
    setStaffLoaded(true);
    getCrmStaffMembers().then(({ data }) => setStaffList(data));
  }, [staffLoaded]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = [...leads];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.centre_name.toLowerCase().includes(q) ||
          (l.contact_name && l.contact_name.toLowerCase().includes(q)) ||
          (l.contact_email && l.contact_email.toLowerCase().includes(q))
      );
    }

    if (stageFilter !== "all") {
      result = result.filter((l) => l.stage === stageFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((l) => l.type === typeFilter);
    }
    if (sourceFilter !== "all") {
      result = result.filter((l) => l.source === sourceFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "centre_name":
          cmp = a.centre_name.localeCompare(b.centre_name);
          break;
        case "contact_name":
          cmp = (a.contact_name ?? "").localeCompare(b.contact_name ?? "");
          break;
        case "type":
          cmp = (a.type ?? "").localeCompare(b.type ?? "");
          break;
        case "stage":
          cmp = a.stage.localeCompare(b.stage);
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
        case "owner_name":
          cmp = (a.owner_name ?? "").localeCompare(b.owner_name ?? "");
          break;
        case "estimated_value":
          cmp = (a.estimated_value ?? 0) - (b.estimated_value ?? 0);
          break;
        case "days_in_stage":
          cmp =
            daysBetween(a.stage_changed_at, now) -
            daysBetween(b.stage_changed_at, now);
          break;
        case "updated_at":
          cmp =
            new Date(a.updated_at).getTime() -
            new Date(b.updated_at).getTime();
          break;
        case "created_at":
          cmp =
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [leads, search, stageFilter, typeFilter, sourceFilter, sortField, sortDir, now]);

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 inline size-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline size-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 inline size-3 text-primary" />
    );
  };

  // Selection helpers
  const allSelected =
    filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk actions
  const handleBulkStage = () => {
    if (!bulkStage || selected.size === 0) return;
    startTransition(async () => {
      await bulkChangeStage(Array.from(selected), bulkStage as LeadStage);
      setSelected(new Set());
      setBulkStage("");
    });
  };

  const handleBulkAssign = () => {
    if (!bulkOwnerId || selected.size === 0) return;
    startTransition(async () => {
      await bulkAssignOwner(Array.from(selected), bulkOwnerId);
      setSelected(new Set());
      setBulkOwnerId("");
    });
  };

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selected.size} lead${selected.size !== 1 ? "s" : ""}? This cannot be undone.`
      )
    )
      return;
    startTransition(async () => {
      await bulkDeleteLeads(Array.from(selected));
      setSelected(new Set());
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            All Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""} in pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/admin/crm" />}
          >
            <LayoutGrid className="size-4" />
            Pipeline Board
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by centre, contact, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={stageFilter}
          onValueChange={(v) => setStageFilter((v ?? "all") as LeadStage | "all")}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v ?? "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="childcare_centre">Childcare Centre</SelectItem>
            <SelectItem value="school">School</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sourceFilter}
          onValueChange={(v) => setSourceFilter((v ?? "all") as LeadSource | "all")}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="animate-fade-up flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-border" />

          {/* Bulk stage */}
          <Select
            value={bulkStage}
            onValueChange={(v) => setBulkStage((v ?? "") as LeadStage | "")}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Change stage" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkStage}
            disabled={!bulkStage || isPending}
          >
            <MoveRight className="size-3.5" />
            Apply
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Bulk assign */}
          <Select
            value={bulkOwnerId}
            onValueChange={(v) => setBulkOwnerId(v ?? "")}
            onOpenChange={() => ensureStaffLoaded()}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Assign owner" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkAssign}
            disabled={!bulkOwnerId || isPending}
          >
            <UserPlus className="size-3.5" />
            Assign
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isPending}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>

          {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Users className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No leads found
          </p>
          <p className="text-xs text-muted-foreground/70">
            {search || stageFilter !== "all" || typeFilter !== "all" || sourceFilter !== "all"
              ? "Try adjusting your filters"
              : "Add your first lead to get started"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("centre_name")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Centre Name
                    <SortIcon field="centre_name" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    onClick={() => toggleSort("contact_name")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Contact
                    <SortIcon field="contact_name" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort("type")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Type
                    <SortIcon field="type" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    onClick={() => toggleSort("stage")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Stage
                    <SortIcon field="stage" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    onClick={() => toggleSort("source")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Source
                    <SortIcon field="source" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort("owner_name")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Owner
                    <SortIcon field="owner_name" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell text-right">
                  <button
                    onClick={() => toggleSort("estimated_value")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Value
                    <SortIcon field="estimated_value" />
                  </button>
                </TableHead>
                <TableHead className="hidden xl:table-cell text-right">
                  <button
                    onClick={() => toggleSort("days_in_stage")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Days in Stage
                    <SortIcon field="days_in_stage" />
                  </button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <button
                    onClick={() => toggleSort("updated_at")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Last Activity
                    <SortIcon field="updated_at" />
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    onClick={() => toggleSort("created_at")}
                    className="inline-flex items-center whitespace-nowrap font-medium"
                  >
                    Created
                    <SortIcon field="created_at" />
                  </button>
                </TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => {
                const stageStyle =
                  STAGE_CONFIG[lead.stage as LeadStage] ??
                  STAGE_CONFIG.cold_lead;
                const sourceStyle =
                  SOURCE_CONFIG[lead.source as LeadSource] ??
                  SOURCE_CONFIG.manual;
                const daysInStage = daysBetween(lead.stage_changed_at, now);

                return (
                  <TableRow
                    key={lead.id}
                    className={selected.has(lead.id) ? "bg-muted/40" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggleOne(lead.id)}
                        aria-label={`Select ${lead.centre_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/crm/${lead.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {lead.centre_name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <div>
                        {lead.contact_name || "—"}
                        {lead.contact_email && (
                          <span className="block text-xs text-muted-foreground/70">
                            {lead.contact_email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {lead.type === "childcare_centre"
                        ? "Childcare"
                        : lead.type === "school"
                          ? "School"
                          : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${stageStyle.className}`}
                      >
                        {stageStyle.label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${sourceStyle.className}`}
                      >
                        {sourceStyle.label}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {lead.owner_name || "—"}
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {lead.estimated_value != null ? (
                        <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                          {formatCurrency(lead.estimated_value)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right xl:table-cell">
                      <span
                        className={
                          daysInStage > 14
                            ? "font-medium text-amber-600"
                            : daysInStage > 30
                              ? "font-medium text-red-600"
                              : "text-muted-foreground"
                        }
                      >
                        {daysInStage}d
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {formatDate(lead.updated_at)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatDate(lead.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={<Link href={`/admin/crm/${lead.id}`} />}
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
    </div>
  );
}
