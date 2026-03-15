"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, CheckCircle, BookOpen } from "lucide-react";
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
import type { TrainingModule } from "@/lib/types/database";
import type { TrainingModuleType, TrainingCategory, TrainingStatus } from "@/lib/types/enums";

interface ModuleListViewProps {
  initialModules: TrainingModule[];
  basePath: string;
}

const TYPE_BADGE: Record<TrainingModuleType, { label: string; className: string }> = {
  video:     { label: "Video",     className: "bg-blue-100 text-blue-700" },
  document:  { label: "Document",  className: "bg-purple-100 text-purple-700" },
  quiz:      { label: "Quiz",      className: "bg-orange-100 text-orange-700" },
  checklist: { label: "Checklist", className: "bg-emerald-100 text-emerald-700" },
};

const STATUS_BADGE: Record<TrainingStatus, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-secondary text-muted-foreground" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-700" },
  archived:  { label: "Archived",  className: "bg-red-100 text-red-700" },
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

export function ModuleListView({ initialModules, basePath }: ModuleListViewProps) {
  const router = useRouter();

  const [typeFilter, setTypeFilter]       = useState<TrainingModuleType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<TrainingCategory | "all">("all");
  const [statusFilter, setStatusFilter]   = useState<TrainingStatus | "all">("all");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);

  const filtered = useMemo(() => {
    return initialModules.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (mandatoryOnly && !m.is_mandatory) return false;
      return true;
    });
  }, [initialModules, typeFilter, categoryFilter, statusFilter, mandatoryOnly]);

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as TrainingModuleType | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="document">Document</SelectItem>
            <SelectItem value="quiz">Quiz</SelectItem>
            <SelectItem value="checklist">Checklist</SelectItem>
          </SelectContent>
        </Select>

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
            id="mandatory-filter"
            checked={mandatoryOnly}
            onCheckedChange={(checked) => setMandatoryOnly(Boolean(checked))}
          />
          <Label htmlFor="mandatory-filter" className="text-sm cursor-pointer">
            Mandatory only
          </Label>
        </div>

        <div className="ml-auto">
          <Button onClick={() => router.push(`${basePath}/modules/new`)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Module
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-secondary/20">
          <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No modules found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Adjust your filters or create a new module.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Mandatory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((module) => {
                const typeBadge   = TYPE_BADGE[module.type];
                const statusBadge = STATUS_BADGE[module.status];
                return (
                  <TableRow
                    key={module.id}
                    className="cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() =>
                      router.push(`${basePath}/modules/${module.id}/edit`)
                    }
                  >
                    <TableCell className="font-medium">{module.title}</TableCell>
                    <TableCell>
                      <Badge className={typeBadge.className}>
                        {typeBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {CATEGORY_LABEL[module.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {module.is_mandatory && (
                        <CheckCircle className="h-4 w-4 text-emerald-600 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadge.className}>
                        {statusBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(module.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {initialModules.length} module
        {initialModules.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
