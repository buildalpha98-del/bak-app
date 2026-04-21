"use client";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Trophy, DollarSign, Target } from "lucide-react";
import type { PipelineMetrics } from "@/lib/crm/metrics-actions";

// ============================================================
// Constants
// ============================================================

const BRAND_ORANGE = "#E8712A";

const FUNNEL_COLOURS = [
  "#94A3B8", // cold lead
  "#60A5FA", // contacted
  "#A78BFA", // interested
  "#FBBF24", // free trial
  "#FB923C", // proposal sent
  "#2D8C3C", // won
  "#EF4444", // lost
  "#9CA3AF", // churned
];

const SOURCE_COLOURS = ["#E8712A", "#60A5FA", "#A78BFA", "#2D8C3C"];

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================
// Component
// ============================================================

interface PipelineMetricsViewProps {
  metrics: PipelineMetrics;
}

export function PipelineMetricsView({ metrics }: PipelineMetricsViewProps) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          CRM
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight page-header-sport">
          Pipeline Metrics
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Track conversion performance and pipeline health across your sales funnel.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <TrendingUp className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Leads</p>
                <p className="text-2xl font-bold">{metrics.activeLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <Trophy className="size-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Won This Year</p>
                <p className="text-2xl font-bold">{metrics.wonThisYear}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2">
                <DollarSign className="size-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Weighted Forecast</p>
                <p className="text-2xl font-bold">{formatAUD(metrics.weightedForecast)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Target className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{metrics.conversionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Funnel chart — 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.funnelData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="stage" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {metrics.funnelData.map((_, idx) => (
                      <Cell key={idx} fill={FUNNEL_COLOURS[idx % FUNNEL_COLOURS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Source breakdown — 1/3 width */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Lead Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.sourceBreakdown}
                    dataKey="count"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, value }: PieLabelRenderProps) => `${name ?? ""}: ${value ?? ""}`}
                  >
                    {metrics.sourceBreakdown.map((_, idx) => (
                      <Cell key={idx} fill={SOURCE_COLOURS[idx % SOURCE_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
