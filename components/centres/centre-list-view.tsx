"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  GraduationCap,
  Plus,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CentreCard } from "./centre-card";
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

// ============================================================
// Component
// ============================================================

interface CentreListViewProps {
  initialData: CentreListItem[];
  basePath: string; // "/admin/centres" or "/ops/centres"
}

export function CentreListView({ initialData, basePath }: CentreListViewProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CentreType | "all">("all");
  const [contractFilter, setContractFilter] = useState<ContractStatus | "all">("all");
  const [pricingFilter, setPricingFilter] = useState<PricingModel | "all">("all");
  const [sortBy, setSortBy] = useState<CentreFilters["sortBy"]>("name");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const filtered = useMemo(() => {
    let result = [...initialData];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.address && c.address.toLowerCase().includes(q)) ||
          (c.primary_contact_name && c.primary_contact_name.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((c) => c.type === typeFilter);
    }

    // Contract filter
    if (contractFilter !== "all") {
      result = result.filter((c) => c.contract_status === contractFilter);
    }

    // Pricing filter
    if (pricingFilter !== "all") {
      result = result.filter((c) => c.pricing_model === pricingFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "contract_status":
          return a.contract_status.localeCompare(b.contract_status);
        case "created_at":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [initialData, search, typeFilter, contractFilter, pricingFilter, sortBy]);

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

      {/* Filters bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search centres..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CentreType | "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="childcare_centre">Childcare Centre</SelectItem>
            <SelectItem value="school">School</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={contractFilter}
          onValueChange={(v) => setContractFilter(v as ContractStatus | "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="churned">Churned</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={pricingFilter}
          onValueChange={(v) => setPricingFilter(v as PricingModel | "all")}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Pricing" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Pricing</SelectItem>
            <SelectItem value="centre_funded">Centre Funded</SelectItem>
            <SelectItem value="parent_funded">Parent Funded</SelectItem>
            <SelectItem value="per_head">Per Head</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy ?? "name"} onValueChange={(v) => setSortBy(v as CentreFilters["sortBy"])}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="contract_status">Status</SelectItem>
            <SelectItem value="created_at">Newest</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex rounded-lg border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("table")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Building2 className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No centres found
          </p>
          <p className="text-xs text-muted-foreground/70">
            {search || typeFilter !== "all" || contractFilter !== "all" || pricingFilter !== "all"
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
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((centre) => {
                const TypeIcon =
                  centre.type === "childcare_centre" ? Building2 : GraduationCap;
                return (
                  <TableRow key={centre.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="size-4 text-muted-foreground" />
                        <span className="font-medium">{centre.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatCentreType(centre.type)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={contractStatusVariant(centre.contract_status)}>
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
    </div>
  );
}
