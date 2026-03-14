import type { TrainingModuleType } from "@/lib/types/enums";

export interface CompletionByType {
  type: TrainingModuleType;
  total: number;
  completed: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM
  label: string; // e.g. "Mar 2026"
  completions: number;
}

export interface TrainingAnalytics {
  totalModules: number;
  totalAssignments: number;
  completionRate: number;
  averageQuizScore: number | null;
  overdueCount: number;
  completionByType: CompletionByType[];
  monthlyTrend: MonthlyTrend[];
}

export interface LeaderboardEntry {
  coachId: string;
  coachName: string;
  totalAssigned: number;
  completed: number;
  completionPercentage: number;
  averageQuizScore: number | null;
}

export interface ModuleStats {
  totalAssigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  averageCompletionDays: number | null;
  averageQuizScore: number | null;
}
