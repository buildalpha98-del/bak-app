/**
 * Pure utility functions for training compliance checks.
 * No server actions, no database access — safe for use anywhere.
 */

export interface ComplianceCheckInput {
  status: string;
  due_date: string | null;
  module: { title: string };
}

export interface ComplianceResult {
  compliant: boolean;
  overdueCount: number;
  overdueModules: string[];
}

/**
 * Check a coach's training compliance based on their assignments.
 * An assignment is considered overdue if its status is "overdue",
 * or if it has a due_date in the past and is not yet completed.
 */
export function checkTrainingCompliance(
  coachId: string,
  assignments: ComplianceCheckInput[]
): ComplianceResult {
  const now = new Date();
  const overdueModules: string[] = [];

  for (const assignment of assignments) {
    const isOverdueStatus = assignment.status === "overdue";
    const isPastDue =
      assignment.due_date &&
      assignment.status !== "completed" &&
      new Date(assignment.due_date) < now;

    if (isOverdueStatus || isPastDue) {
      overdueModules.push(assignment.module.title);
    }
  }

  return {
    compliant: overdueModules.length === 0,
    overdueCount: overdueModules.length,
    overdueModules,
  };
}

/**
 * Calculate a scheduling penalty based on overdue training count.
 * Used by the roster solver to deprioritise non-compliant coaches.
 *
 * 0 overdue  = 0 penalty
 * 1-2 overdue = -1 penalty
 * 3+ overdue  = -2 penalty
 */
export function getTrainingPenalty(overdueCount: number): number {
  if (overdueCount === 0) return 0;
  if (overdueCount <= 2) return -1;
  return -2;
}
