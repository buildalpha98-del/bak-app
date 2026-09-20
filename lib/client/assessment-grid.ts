// Pure shaping for the class assessment grid (students × skills). Who
// authored an existing row decides whether the viewer may edit it: a
// coach's row is read-only in the portal, a colleague's row is visible but
// theirs, the viewer's own row is editable, and an empty row is open.

export interface GridStudent {
  id: string;
  first_name: string;
  last_name: string;
}

export interface GridRatingRow {
  child_id: string;
  coach_id: string | null;
  client_user_id: string | null;
  ratings_json: Array<{ skill_name: string; rating: number }>;
  notes: string | null;
}

export type GridAuthor = "coach" | "me" | "colleague" | null;

export interface GridRow {
  child: GridStudent;
  marks: Record<string, number>;
  notes: string;
  author: GridAuthor;
  editable: boolean;
}

export function gridAuthor(
  row: GridRatingRow | undefined,
  viewerClientUserId: string
): GridAuthor {
  if (!row) return null;
  if (row.coach_id) return "coach";
  if (row.client_user_id === viewerClientUserId) return "me";
  return "colleague";
}

export function buildGridRows(
  students: GridStudent[],
  ratings: GridRatingRow[],
  viewerClientUserId: string
): GridRow[] {
  const byChild = new Map(ratings.map((r) => [r.child_id, r]));
  return students.map((child) => {
    const row = byChild.get(child.id);
    const author = gridAuthor(row, viewerClientUserId);
    const marks: Record<string, number> = {};
    for (const m of row?.ratings_json ?? []) marks[m.skill_name] = m.rating;
    return {
      child,
      marks,
      notes: row?.notes ?? "",
      author,
      editable: author === null || author === "me",
    };
  });
}

/** Progress for a class card: how many of its students have any rating. */
export function countAssessed(rows: Pick<GridRow, "author">[]): number {
  return rows.filter((r) => r.author !== null).length;
}
