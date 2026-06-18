"use client";

// ============================================================
// Dashboard charts — lazy-loaded recharts bundle
// ============================================================
//
// Recharts adds ~150kb to whatever bundle imports it. Splitting the
// three /admin home charts into this file lets the parent
// LaunchDashboard load instantly while charts stream in via a
// separate JS chunk. The cards render with a muted placeholder
// until recharts has parsed.

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const BRAND = "#E8712A";
const BRAND_TINT = "#F4A87B";

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCurrencyFull(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

interface MonthlyPoint {
  month: string;
  childcare: number;
  school: number;
}

interface GrowthPoint {
  month: string;
  centres: number;
  schools: number;
}

export function MonthlyRevenueChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={11} />
        <YAxis fontSize={11} tickFormatter={(v: number) => fmtCurrency(v)} />
        <Tooltip
          formatter={(v) => fmtCurrencyFull(Number(v))}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="childcare" stackId="a" fill={BRAND} name="Childcare" />
        <Bar
          dataKey="school"
          stackId="a"
          fill={BRAND_TINT}
          name="School"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CentreGrowthChart({ data }: { data: GrowthPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={11} />
        <YAxis fontSize={11} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="centres"
          stroke="currentColor"
          strokeWidth={2}
          name="Centres"
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="schools"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={2}
          name="Schools"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RevenueSplitPie({
  childcare,
  school,
}: {
  childcare: number;
  school: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={[
            { name: "Childcare", value: childcare },
            { name: "School", value: school },
          ]}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
        >
          <Cell fill={BRAND} />
          <Cell fill={BRAND_TINT} />
        </Pie>
        <Tooltip
          formatter={(v) => fmtCurrencyFull(Number(v))}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
