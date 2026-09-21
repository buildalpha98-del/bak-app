// The demo-school identities, shared by the /demo/* entry routes (which
// sign visitors in as these accounts) and the client shell (which shows
// the self-guided tour only to the viewer).
//
// * DEMO_VIEWER_EMAIL — "Visiting Principal": a non-primary colleague on
//   the demo school; sees everything, no settings powers. The proposal
//   link (/demo/school).
// * DEMO_TEACHER_EMAIL — a class teacher on the demo school, scoped to
//   one class; what a teacher sees and can do. The teacher link
//   (/demo/teacher).
export const DEMO_VIEWER_EMAIL = "demo-viewer@buildalphakids.app";
export const DEMO_TEACHER_EMAIL = "demo-teacher@buildalphakids.app";

export function isDemoViewerEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === DEMO_VIEWER_EMAIL;
}

export function isDemoTeacherEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === DEMO_TEACHER_EMAIL;
}
