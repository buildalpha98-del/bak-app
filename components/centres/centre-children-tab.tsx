"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Upload, Search, Loader2, UserMinus, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getCentreChildren,
  getChildrenList,
  linkChildToCentre,
  withdrawChildFromCentre,
} from "@/lib/children/actions";
import { getAssessedChildIdsForCentre } from "@/lib/assessments/actions";
import type { CentreChildWithStats, ChildListItem } from "@/lib/children/actions";
import { toast } from "sonner";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAttendance(attended: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((attended / total) * 100)}%`;
}

function formatAgeGroup(ageGroup: string): string {
  return ageGroup;
}

// ============================================================
// Component
// ============================================================

interface CentreChildrenTabProps {
  centreId: string;
  basePath: string;
}

export function CentreChildrenTab({ centreId, basePath }: CentreChildrenTabProps) {
  const router = useRouter();
  const [children, setChildren] = useState<CentreChildWithStats[]>([]);
  const [assessedIds, setAssessedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [childrenResult, assessedResult] = await Promise.all([
      getCentreChildren(centreId),
      getAssessedChildIdsForCentre(centreId),
    ]);
    if (childrenResult.error) {
      setError(childrenResult.error);
    } else {
      setChildren(childrenResult.data ?? []);
    }
    setAssessedIds(new Set(assessedResult.data ?? []));
    setLoading(false);
  }, [centreId]);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  function handleWithdraw(childId: string, childName: string) {
    startTransition(async () => {
      const { error: withdrawError } = await withdrawChildFromCentre(childId, centreId);
      if (withdrawError) {
        toast.error(withdrawError);
      } else {
        toast.success(`${childName} withdrawn from centre.`);
        setChildren((prev) => prev.filter((c) => c.id !== childId));
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="mt-4 min-h-[44px]" onClick={fetchChildren}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => router.push(`${basePath}/children/import?centreId=${centreId}`)}
        >
          <Upload className="size-4" />
          Import CSV
        </Button>
        <Button className="min-h-[44px]" onClick={() => setAddDialogOpen(true)}>
          <Plus className="size-4" />
          Add Child
        </Button>
      </div>

      {/* Table or empty state */}
      {children.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Users className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No children enrolled at this centre</p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age Group</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead className="hidden sm:table-cell">Assessed</TableHead>
                <TableHead>Last Attended</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {children.map((child) => (
                <TableRow key={child.id}>
                  <TableCell className="font-medium">
                    {child.first_name} {child.last_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{formatAgeGroup(child.age_group)}</Badge>
                  </TableCell>
                  <TableCell>
                    {child.sessions_attended}/{child.total_sessions} ={" "}
                    {formatAttendance(child.sessions_attended, child.total_sessions)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {assessedIds.has(child.id) ? (
                      <Badge variant="default" className="gap-1">
                        <ClipboardCheck className="size-3" />
                        Yes
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {child.last_attended ? formatDate(child.last_attended) : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-[44px] text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() =>
                        handleWithdraw(child.id, `${child.first_name} ${child.last_name}`)
                      }
                    >
                      <UserMinus className="size-4" />
                      Withdraw
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Child Dialog */}
      <AddChildDialog
        centreId={centreId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onLinked={() => fetchChildren()}
        existingChildIds={children.map((c) => c.id)}
      />
    </div>
  );
}

// ============================================================
// Add Child Dialog — search existing children and link
// ============================================================

function AddChildDialog({
  centreId,
  open,
  onOpenChange,
  onLinked,
  existingChildIds,
}: {
  centreId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
  existingChildIds: string[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<ChildListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Debounced search
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setResults([]);
      return;
    }

    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await getChildrenList({ search: searchTerm.trim() });
      // Filter out children already at this centre
      const filtered = (data ?? []).filter((c) => !existingChildIds.includes(c.id));
      setResults(filtered);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, open, existingChildIds]);

  function handleLink(childId: string, childName: string) {
    startTransition(async () => {
      const { error } = await linkChildToCentre(childId, centreId);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`${childName} linked to centre.`);
        // Remove from results
        setResults((prev) => prev.filter((c) => c.id !== childId));
        onLinked();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Child to Centre</DialogTitle>
          <DialogDescription>
            Search for an existing child and link them to this centre.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {searching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!searching && searchTerm.trim() && results.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No matching children found.
              </p>
            )}

            {!searching && results.length > 0 && (
              <div className="space-y-2">
                {results.map((child) => (
                  <div
                    key={child.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {child.first_name} {child.last_name}
                      </p>
                      <Badge variant="secondary" className="mt-1">
                        {formatAgeGroup(child.age_group)}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      className="min-h-[44px]"
                      disabled={isPending}
                      onClick={() =>
                        handleLink(child.id, `${child.first_name} ${child.last_name}`)
                      }
                    >
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Link"
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
