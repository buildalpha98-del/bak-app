"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BookOpen, CheckCircle2, AlertTriangle, Trophy } from "lucide-react";
import type {
  TrainingAnalytics,
  LeaderboardEntry,
} from "@/lib/training/analytics-actions";

interface TrainingAnalyticsViewProps {
  analytics: TrainingAnalytics;
  leaderboard: LeaderboardEntry[];
}

export function TrainingAnalyticsView({
  analytics,
  leaderboard,
}: TrainingAnalyticsViewProps) {
  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Total Modules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-heading">
              {analytics.totalModules}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completion Rate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-heading">
              {analytics.completionRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <Trophy className="h-3.5 w-3.5" />
              Avg Quiz Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-heading">
              {analytics.averageQuizScore !== null
                ? `${analytics.averageQuizScore}%`
                : "N/A"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Overdue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-heading text-red-600">
              {analytics.overdueCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Completion by type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-heading">
              Completion by Module Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.completionByType}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickFormatter={(value: string) =>
                      value.charAt(0).toUpperCase() + value.slice(1)
                    }
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Complete"]}
                  />
                  <Bar
                    dataKey="percentage"
                    fill="#E8712A"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-heading">
              Monthly Completions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={analytics.monthlyTrend}
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="completions"
                    stroke="#E8712A"
                    strokeWidth={2}
                    dot={{ fill: "#E8712A", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-heading">
            Coach Leaderboard
          </CardTitle>
          <CardDescription>
            Coaches ranked by training completion rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No training data yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coach</TableHead>
                    <TableHead className="text-right">Assigned</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Completion %</TableHead>
                    <TableHead className="text-right">Avg Quiz</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((entry) => (
                    <TableRow key={entry.coachId}>
                      <TableCell className="font-medium">
                        {entry.coachName}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.totalAssigned}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.completed}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.completionPercentage}%
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.averageQuizScore !== null
                          ? `${entry.averageQuizScore}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
