/**
 * A portal user's class scope (migration 088). Teachers carry the classes
 * they were invited for; the principal and colleagues carry none and see
 * every class. Pure so the rule is testable without a database.
 */
export function scopeClasses<T extends { id: string }>(
  classes: T[],
  classIds: string[] | null | undefined
): T[] {
  if (!classIds || classIds.length === 0) return classes;
  const allowed = new Set(classIds);
  return classes.filter((c) => allowed.has(c.id));
}

export function isClassScoped(classIds: string[] | null | undefined): boolean {
  return (classIds ?? []).length > 0;
}

/** May this portal user rate this child, given the child's current classes? */
export function canRateChild(
  classIds: string[] | null | undefined,
  childClassIds: string[]
): boolean {
  if (!isClassScoped(classIds)) return true;
  return childClassIds.some((id) => (classIds ?? []).includes(id));
}
