"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, GitMerge, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import type { TrainingPathway } from "@/lib/types/database";
import type { TrainingCategory, TrainingStatus } from "@/lib/types/enums";

interface PathwayListViewProps {
  pathways: Array<TrainingPathway & { module_count: number }>;
}

const STATUS_BADGE: Record<TrainingStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-secondary text-muted-foreground" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700" },
  archived:  { label: "Archived",  className: "bg-neutral-100 text-neutral-500" },
};

const CATEGORY_LABEL: Record<TrainingCategory, string> = {
  onboarding:               "Onboarding",
  sport_specific:           "Sport Specific",
  compliance:               "Compliance",
  professional_development: "Professional Development",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PathwayListView({ pathways }: PathwayListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.includes("/ops/") ? "/ops/training" : "/admin/training";

  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | "all">("all");
  const [statusFilter, setStatusFilter]     = useState<TrainingStatus | "all">("all");
  const [mandatoryOnly, setMandatoryOnly]   = useState(false);

  const filtered = useMemo(() => {
    return pathways.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (mandatoryOnly && !p.is_mandatory_onboarding) return false;
      return true;
    });
  }, [pathways, categoryFilter, statusFilter, mandatoryOnly]);

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as TrainingCategory | "all")}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="sport_specific">Sport Specific</SelectItem>
            <SelectItem value="compliance">Compliance</SelectItem>
            <SelectItem value="professional_development">Professional Development</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TrainingStatus | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Checkbox
            id="mandatory-pathway-filter"
            checked={mandatoryOnly}
            onCheckedChange={(checked) => setMandatoryOnly(Boolean(checked))}
          />
          <Label htmlFor="mandatory-pathway-filter" className="text-sm cursor-pointer">
            Mandatory only
          </Label>
        </div>

        <div className="ml-auto">
          <Button onClick={() => router.push(`${basePath}/pathways/new`)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Pathway
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-secondary/20">
          <GitMerge className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No pathways found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adjust your filters or create a new pathway.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Modules</TableHead>
                <TableHead className="text-center">Mandatory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((pathway) => {
                const statusBadge = STATUS_BADGE[pathway.status];
                return (
                  <TableRow
                    key={pathway.id}
                    className="cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() =>
                      router.push(`${basePath}/pathways/${pathway.id}`)
                    }
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{pathway.title}</p>
                        {pathway.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {pathway.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORY_LABEL[pathway.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {pathway.module_count}
                    </TableCell>
                    <TableCell className="text-center">
                      {pathway.is_mandatory_onboarding && (
                        <CheckCircle className="h-4 w-4 text-emerald-600 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadge.className}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(pathway.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {pathways.length} pathway
        {pathways.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
