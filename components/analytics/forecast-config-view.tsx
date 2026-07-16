"use client";

import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import type { ForecastConfig } from "@/lib/types/database";
import { updateForecastConfig } from "@/lib/forecasting/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ============================================================
// Constants
// ============================================================

const PIPELINE_STAGES = [
  { key: "cold_lead", label: "Cold Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "free_trial", label: "Free Trial" },
  { key: "proposal_sent", label: "Proposal Sent" },
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const CENTRE_TYPES = [
  { key: "childcare_centre", label: "Childcare Centre" },
  { key: "school", label: "School" },
] as const;

// ============================================================
// Helpers
// ============================================================

function getConfigValue(
  configs: ForecastConfig[],
  key: string
): Record<string, unknown> {
  const found = configs.find((c) => c.key === key);
  return found?.value ?? {};
}

// ============================================================
// Component
// ============================================================

interface ForecastConfigViewProps {
  config: ForecastConfig[];
}

export function ForecastConfigView({ config }: ForecastConfigViewProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  // ── Pipeline conversion rates ──
  const initialPipeline = getConfigValue(config, "pipeline_conversion_rates");
  const [pipelineRates, setPipelineRates] = useState<Record<string, number>>(
    () => {
      const rates: Record<string, number> = {};
      for (const stage of PIPELINE_STAGES) {
        rates[stage.key] =
          typeof initialPipeline[stage.key] === "number"
            ? (initialPipeline[stage.key] as number)
            : 0;
      }
      return rates;
    }
  );
  const [isPipelinePending, startPipelineTransition] = useTransition();

  // ── Seasonal factors ──
  const initialSeasonal = getConfigValue(config, "seasonal_factors");
  const [seasonalFactors, setSeasonalFactors] = useState<Record<string, number>>(
    () => {
      const factors: Record<string, number> = {};
      for (let i = 0; i < 12; i++) {
        const key = String(i + 1);
        factors[key] =
          typeof initialSeasonal[key] === "number"
            ? (initialSeasonal[key] as number)
            : 1.0;
      }
      return factors;
    }
  );
  const [isSeasonalPending, startSeasonalTransition] = useTransition();

  // ── Session frequency ──
  const initialFrequency = getConfigValue(config, "session_frequency");
  const [sessionFrequency, setSessionFrequency] = useState<
    Record<string, number>
  >(() => {
    const freq: Record<string, number> = {};
    for (const ct of CENTRE_TYPES) {
      freq[ct.key] =
        typeof initialFrequency[ct.key] === "number"
          ? (initialFrequency[ct.key] as number)
          : 0;
    }
    return freq;
  });
  const [isFrequencyPending, startFrequencyTransition] = useTransition();

  // ── Handlers ──
  function handleSavePipeline() {
    startPipelineTransition(async () => {
      const { error } = await updateForecastConfig(
        "pipeline_conversion_rates",
        pipelineRates as unknown as Record<string, unknown>
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success("Pipeline conversion rates saved.");
      }
    });
  }

  function handleSaveSeasonal() {
    startSeasonalTransition(async () => {
      const { error } = await updateForecastConfig(
        "seasonal_factors",
        seasonalFactors as unknown as Record<string, unknown>
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success("Seasonal factors saved.");
      }
    });
  }

  function handleSaveFrequency() {
    startFrequencyTransition(async () => {
      const { error } = await updateForecastConfig(
        "session_frequency",
        sessionFrequency as unknown as Record<string, unknown>
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success("Session frequency saved.");
      }
    });
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/forecasts/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Forecasts regenerated successfully.");
    } catch {
      toast.error("Failed to regenerate forecasts.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/admin/settings" />}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-heading text-foreground">
              Forecast Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure parameters used to generate revenue forecasts
            </p>
          </div>
        </div>
        <Button onClick={handleRegenerate} disabled={isRegenerating}>
          {isRegenerating ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Regenerate Forecast
        </Button>
      </div>

      {/* ── Pipeline Conversion Rates ── */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Conversion Rates</CardTitle>
          <CardDescription>
            Expected conversion percentage for each pipeline stage (0-100%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE_STAGES.map((stage) => (
              <div key={stage.key} className="space-y-1.5">
                <Label htmlFor={`pipeline-${stage.key}`}>{stage.label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`pipeline-${stage.key}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={pipelineRates[stage.key]}
                    onChange={(e) =>
                      setPipelineRates((prev) => ({
                        ...prev,
                        [stage.key]: Number(e.target.value),
                      }))
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={handleSavePipeline}
              disabled={isPipelinePending}
            >
              {isPipelinePending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Rates
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Seasonal Factors ── */}
      <Card>
        <CardHeader>
          <CardTitle>Seasonal Factors</CardTitle>
          <CardDescription>
            Multiplier for each month (0.0 to 1.0 scale). A factor of 1.0 means
            no seasonal adjustment; lower values reduce projected revenue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {MONTHS.map((month, idx) => {
              const key = String(idx + 1);
              return (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`seasonal-${key}`}>{month}</Label>
                  <Input
                    id={`seasonal-${key}`}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={seasonalFactors[key]}
                    onChange={(e) =>
                      setSeasonalFactors((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-24"
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveSeasonal}
              disabled={isSeasonalPending}
            >
              {isSeasonalPending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Factors
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Session Frequency ── */}
      <Card>
        <CardHeader>
          <CardTitle>Session Frequency</CardTitle>
          <CardDescription>
            Expected number of sessions per week per centre, by centre type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {CENTRE_TYPES.map((ct) => (
              <div key={ct.key} className="space-y-1.5">
                <Label htmlFor={`freq-${ct.key}`}>{ct.label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`freq-${ct.key}`}
                    type="number"
                    min={0}
                    step={1}
                    value={sessionFrequency[ct.key]}
                    onChange={(e) =>
                      setSessionFrequency((prev) => ({
                        ...prev,
                        [ct.key]: Number(e.target.value),
                      }))
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    sessions / week
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveFrequency}
              disabled={isFrequencyPending}
            >
              {isFrequencyPending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save Frequency
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
