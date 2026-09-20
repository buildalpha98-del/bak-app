// Pure helpers for the portal's Team access card (migration 088 roles).

export interface TeamClass {
  id: string;
  name: string;
  year_group: string;
  teacher_name: string | null;
}

export interface TeamMemberLike {
  role: string;
  is_primary: boolean;
  class_ids: string[];
}

/** "Primary", "Teacher · 2R, 4T", "Teacher · all classes" or "Colleague". */
export function describeTeamRole(member: TeamMemberLike, classes: TeamClass[]): string {
  if (member.is_primary) return "Primary";
  if (member.role !== "teacher") return "Colleague";
  const names = (member.class_ids ?? [])
    .map((id) => classes.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return "Teacher · all classes";
  return `Teacher · ${names.join(", ")}`;
}

/** Only class ids that exist at this centre survive an invite. */
export function validClassIds(requested: string[], classes: TeamClass[]): string[] {
  const known = new Set(classes.map((c) => c.id));
  return Array.from(new Set(requested.filter((id) => known.has(id))));
}
