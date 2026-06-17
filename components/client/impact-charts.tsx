"use client";

import type React from "react";
import {
  AreaChart,
  Area,
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

// ─── Attendance Chart ────────────────────────────────────────────────────────

interface AttendanceDataPoint {
  week: string;
  headcount: number;
  sessions: number;
}

interface AttendanceChartProps {
  data: AttendanceDataPoint[];
}

export function AttendanceChart({ data }: AttendanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="headcountGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#E8712A" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#E8712A" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            fontSize: "13px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: unknown, name: unknown) => {
            const v = value as number;
            const n = name as string;
            if (n === "headcount") return [v, "Children"];
            if (n === "sessions") return [v, "Sessions"];
            return [v, n];
          }}
        />
        <Area
          type="monotone"
          dataKey="headcount"
          stroke="#E8712A"
          strokeWidth={2}
          fill="url(#headcountGradient)"
          dot={{ fill: "#E8712A", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#E8712A" }}
        />
        <Area
          type="monotone"
          dataKey="sessions"
          stroke="#F4A87B"
          strokeWidth={2}
          fill="none"
          dot={{ fill: "#F4A87B", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#F4A87B" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Rating Chart ─────────────────────────────────────────────────────────────

interface RatingDataPoint {
  month: string;
  rating: number;
}

interface RatingChartProps {
  data: RatingDataPoint[];
}

function ratingColour(rating: number): string {
  if (rating >= 4) return "#10b981";
  if (rating >= 3) return "#E8712A";
  return "#ef4444";
}

export function RatingChart({ data }: RatingChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 5]}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            fontSize: "13px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: unknown) => [(value as number).toFixed(1), "Avg Rating"]}
        />
        <Bar dataKey="rating" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={ratingColour(entry.rating)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Sport Pie Chart ──────────────────────────────────────────────────────────

interface SportDataPoint {
  sport: string;
  sessions: number;
  percentage: number;
}

interface SportPieChartProps {
  data: SportDataPoint[];
}

// Two-tone brand palette mirrors the admin home dashboard. We let
// other sports fall back to a quieter neutral chain so the brand
// colour stays restrained and the pie reads as "Build Alpha Kids".
const SPORT_COLOURS = [
  "#E8712A",
  "#F4A87B",
  "#1F2937",
  "#4B5563",
  "#6B7280",
  "#9CA3AF",
  "#D1D5DB",
  "#0891b2",
  "#10b981",
  "#6366f1",
];

interface PieLabelProps {
  name: string;
  percent: number;
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
}

function renderCustomLabel({ name, percent, cx, cy, midAngle, outerRadius }: PieLabelProps) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 30;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function SportPieChart({ data }: SportPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="sessions"
          nameKey="sport"
          cx="50%"
          cy="50%"
          outerRadius={90}
          labelLine={false}
          label={renderCustomLabel as (props: unknown) => React.ReactElement | null}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={SPORT_COLOURS[index % SPORT_COLOURS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            fontSize: "13px",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: unknown, name: unknown) => {
            const v = value as number;
            return [`${v} session${v === 1 ? "" : "s"}`, name as string];
          }}
        />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: "12px", color: "#6b7280" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
