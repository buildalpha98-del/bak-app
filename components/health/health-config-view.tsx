"use client";

import { useState, useTransition, useMemo } from "react";
import { Pencil, X, Check, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateHealthScoreConfig } from "@/lib/health/actions";
import { toast } from "sonner";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface HealthScoreConfig {
  id: string;
  signal_name: string;
  weight: number;
  green_threshold: number;
  amber_threshold: number;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface EditState {
  weight: string;
  green_threshold: string;
  amber_threshold: string;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function formatSignalName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

interface HealthConfigViewProps {
  initialConfig: HealthScoreConfig[];
}

export function HealthConfigView({ initialConfig }: HealthConfigViewProps) {
  const [config, setConfig] = useState<HealthScoreConfig[]>(initialConfig);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    weight: "",
    green_threshold: "",
    amber_threshold: "",
  });
  const [isPending, startTransition] = useTransition();
  const [isRecalculating, setIsRecalculating] = useState(false);

  const totalWeight = useMemo(
    () => config.reduce((sum, c) => sum + c.weight, 0),
    [config]
  );

  const weightWarning = useMemo(() => {
    const rounded = Math.round(totalWeight * 1000) / 1000;
    return Math.abs(rounded - 1) > 0.001;
  }, [totalWeight]);

  // Start editing a row
  function handleEdit(item: HealthScoreConfig) {
    setEditingId(item.id);
    setEditState({
      weight: String(Math.round(item.weight * 100)),
      green_threshold: String(item.green_threshold),
      amber_threshold: String(item.amber_threshold),
    });
  }

  // Cancel editing
  function handleCancel() {
    setEditingId(null);
  }

  // Save an edited row
  function handleSave(id: string) {
    const weight = parseFloat(editState.weight) / 100;
    const green_threshold = parseFloat(editState.green_threshold);
    const amber_threshold = parseFloat(editState.amber_threshold);

    if (isNaN(weight) || isNaN(green_threshold) || isNaN(amber_threshold)) {
      toast.error("Please enter valid numbers for all fields.");
      return;
    }

    if (weight < 0 || weight > 1) {
      toast.error("Weight must be between 0% and 100%.");
      return;
    }

    if (green_threshold < 0 || green_threshold > 100) {
      toast.error("Green threshold must be between 0 and 100.");
      return;
    }

    if (amber_threshold < 0 || amber_threshold > 100) {
      toast.error("Amber threshold must be between 0 and 100.");
      return;
    }

    if (amber_threshold >= green_threshold) {
      toast.error("Amber threshold must be lower than the green threshold.");
      return;
    }

    startTransition(async () => {
      const { error } = await updateHealthScoreConfig(id, {
        weight,
        green_threshold,
        amber_threshold,
      });

      if (error) {
        toast.error(`Failed to update: ${error}`);
        return;
      }

      setConfig((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, weight, green_threshold, amber_threshold }
            : c
        )
      );
      setEditingId(null);
      toast.success("Configuration updated successfully.");
    });
  }

  // Recalculate all scores
  async function handleRecalculate() {
    setIsRecalculating(true);
    try {
      const response = await fetch("/api/health-scores/calculate", {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Recalculation failed");
      }

      toast.success("Health scores recalculated successfully.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to recalculate scores."
      );
    } finally {
      setIsRecalculating(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Health Score Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure the signals, weights, and thresholds used to calculate
            centre health scores.
          </p>
        </div>
        <Button
          onClick={handleRecalculate}
          disabled={isRecalculating}
          variant="outline"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRecalculating ? "animate-spin" : ""}`}
          />
          {isRecalculating ? "Recalculating..." : "Recalculate Now"}
        </Button>
      </div>

      {/* Weight warning */}
      {weightWarning && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Signal weights currently sum to{" "}
              <strong>{Math.round(totalWeight * 100)}%</strong>. They should
              total exactly 100% for accurate scoring.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Config table */}
      <Card>
        <CardHeader>
          <CardTitle>Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signal</TableHead>
                  <TableHead className="w-[100px]">Weight</TableHead>
                  <TableHead className="w-[120px]">Green &ge;</TableHead>
                  <TableHead className="w-[120px]">Amber &ge;</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Description
                  </TableHead>
                  <TableHead className="w-[80px] text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {formatSignalName(item.signal_name)}
                      </TableCell>

                      {/* Weight */}
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={editState.weight}
                              onChange={(e) =>
                                setEditState((s) => ({
                                  ...s,
                                  weight: e.target.value,
                                }))
                              }
                              className="h-8 w-16 text-sm"
                            />
                            <span className="text-xs text-muted-foreground">
                              %
                            </span>
                          </div>
                        ) : (
                          <span>
                            {Math.round(item.weight * 100)}%
                          </span>
                        )}
                      </TableCell>

                      {/* Green threshold */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={editState.green_threshold}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                green_threshold: e.target.value,
                              }))
                            }
                            className="h-8 w-16 text-sm"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
                            {item.green_threshold}
                          </span>
                        )}
                      </TableCell>

                      {/* Amber threshold */}
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={editState.amber_threshold}
                            onChange={(e) =>
                              setEditState((s) => ({
                                ...s,
                                amber_threshold: e.target.value,
                              }))
                            }
                            className="h-8 w-16 text-sm"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                            {item.amber_threshold}
                          </span>
                        )}
                      </TableCell>

                      {/* Description */}
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {item.description ?? "—"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSave(item.id)}
                              disabled={isPending}
                              title="Save"
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleCancel}
                              disabled={isPending}
                              title="Cancel"
                            >
                              <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Weight summary */}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium text-muted-foreground">
              Total Weight
            </span>
            <span
              className={`text-sm font-semibold ${
                weightWarning ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {Math.round(totalWeight * 100)}%
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
