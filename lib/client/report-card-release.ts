// Pure rules for report-card release (migration 090).

export interface ReleaseState {
  due_date: string | null;
  released_at: string | null;
}

/**
 * May this portal user open a student's report card for the term?
 * Primary contacts always can (they sign off); everyone else waits for
 * the release. Childcare centres have no sign-off step.
 */
export function canOpenReportCard(input: {
  isSchool: boolean;
  isPrimary: boolean;
  release: ReleaseState | null;
}): boolean {
  if (!input.isSchool) return true;
  if (input.isPrimary) return true;
  return !!input.release?.released_at;
}

/** Days until the teachers' due date; negative when overdue; null when unset. */
export function daysUntilDue(release: ReleaseState | null, todayIso: string): number | null {
  if (!release?.due_date) return null;
  const due = Date.UTC(
    Number(release.due_date.slice(0, 4)),
    Number(release.due_date.slice(5, 7)) - 1,
    Number(release.due_date.slice(8, 10))
  );
  const today = Date.UTC(
    Number(todayIso.slice(0, 4)),
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10))
  );
  return Math.round((due - today) / 86_400_000);
}
