"use client";

import { useState, useMemo } from "react";
import Link from "@/components/ui/app-link";
import { ArrowLeft, ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { upsertPayRate } from "@/lib/staff/actions";
import type { RateCardEntry } from "@/lib/staff/actions";
import type { SessionType, RateUnit } from "@/lib/types/enums";

const SESSION_TYPES: SessionType[] = [
  "childcare",
  "school_local",
  "school_travel",
  "holiday_clinic",
];

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  childcare: "Childcare",
  school_local: "School (Local)",
  school_travel: "School (Travel)",
  holiday_clinic: "Holiday Clinic",
};

type SortColumn = "coach" | SessionType;
type SortDir = "asc" | "desc";

interface RateCardViewProps {
  initialData: RateCardEntry[];
}

export function RateCardView({ initialData }: RateCardViewProps) {
  const [entries, setEntries] = useState(initialData);
  const [editOpen, setEditOpen] = useState(false);
  const [editCoachId, setEditCoachId] = useState("");
  const [editCoachName, setEditCoachName] = useState("");
  const [editSessionType, setEditSessionType] = useState<SessionType>("childcare");
  const [editRate, setEditRate] = useState("");
  const [editRateUnit, setEditRateUnit] = useState<RateUnit>("per_session");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sort state
  const [sortCol, setSortCol] = useState<SortColumn>("coach");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortCol === "coach") {
        aVal = a.coach_name.toLowerCase();
        bVal = b.coach_name.toLowerCase();
      } else {
        aVal = a.rates[sortCol]?.rate ?? -1;
        bVal = b.rates[sortCol]?.rate ?? -1;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [entries, sortCol, sortDir]);

  function toggleSort(col: SortColumn) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function sortIndicator(col: SortColumn) {
    if (sortCol !== col) return null;
    return <span className="ml-1 text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function exportCSV() {
    const headers = ["Coach", ...SESSION_TYPES.map((st) => SESSION_TYPE_LABELS[st])];
    const rows = sortedEntries.map((entry) => [
      entry.coach_name,
      ...SESSION_TYPES.map((st) => {
        const r = entry.rates[st];
        if (!r) return "";
        return `$${r.rate.toFixed(2)}/${r.rate_unit === "per_hour" ? "hr" : "sess"}`;
      }),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rate-card-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openEdit(coachId: string, coachName: string, sessionType: SessionType, currentRate?: { rate: number; rate_unit: RateUnit } | null) {
    setEditCoachId(coachId);
    setEditCoachName(coachName);
    setEditSessionType(sessionType);
    setEditRate(currentRate ? currentRate.rate.toString() : "");
    setEditRateUnit(currentRate?.rate_unit ?? "per_session");
    setError(null);
    setEditOpen(true);
  }

  async function handleSave() {
    const rate = parseFloat(editRate);
    if (!rate || rate <= 0) {
      setError("Please enter a valid rate.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await upsertPayRate({
      user_id: editCoachId,
      session_type: editSessionType,
      rate,
      rate_unit: editRateUnit,
      effective_from: new Date().toISOString().split("T")[0],
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Update local state
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.coach_id !== editCoachId) return entry;
        return {
          ...entry,
          rates: {
            ...entry.rates,
            [editSessionType]: { rate, rate_unit: editRateUnit },
          },
        };
      })
    );

    setEditOpen(false);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/admin/staff" />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rate Card</h1>
            <p className="text-sm text-muted-foreground">
              Coach pay rates by session type. Click a cell to edit.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="size-3.5 mr-1" />
          Export CSV
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No coaches found.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px] cursor-pointer select-none" onClick={() => toggleSort("coach")}>
                  <span className="flex items-center">
                    Coach
                    <ArrowUpDown className="ml-1 size-3 text-muted-foreground" />
                    {sortIndicator("coach")}
                  </span>
                </TableHead>
                {SESSION_TYPES.map((st) => (
                  <TableHead key={st} className="text-center min-w-[120px] cursor-pointer select-none" onClick={() => toggleSort(st)}>
                    <span className="flex items-center justify-center">
                      {SESSION_TYPE_LABELS[st]}
                      <ArrowUpDown className="ml-1 size-3 text-muted-foreground" />
                      {sortIndicator(st)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.map((entry) => (
                <TableRow key={entry.coach_id}>
                  <TableCell className="font-medium">{entry.coach_name}</TableCell>
                  {SESSION_TYPES.map((st) => {
                    const rate = entry.rates[st];
                    return (
                      <TableCell
                        key={st}
                        className="text-center cursor-pointer hover:bg-secondary transition-colors"
                        onClick={() => openEdit(entry.coach_id, entry.coach_name, st, rate)}
                      >
                        {rate ? (
                          <span className="text-sm">
                            ${rate.rate.toFixed(2)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {rate.rate_unit === "per_hour" ? "/hr" : "/sess"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">Not set</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit Rate Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Edit Rate — {editCoachName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="space-y-1">
              <Label>Session Type</Label>
              <Input value={SESSION_TYPE_LABELS[editSessionType]} disabled />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rc-rate">Rate ($)</Label>
              <Input
                id="rc-rate"
                type="number"
                step="0.01"
                min="0"
                value={editRate}
                onChange={(e) => setEditRate(e.target.value)}
                placeholder="e.g. 45.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={editRateUnit} onValueChange={(v) => setEditRateUnit(v as RateUnit)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_session">Per Session</SelectItem>
                  <SelectItem value="per_hour">Per Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Saving..." : "Save Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
