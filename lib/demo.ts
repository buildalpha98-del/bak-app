// The demo-school viewer identity, shared by the /demo/school entry
// route (which signs visitors in as this account) and the client shell
// (which shows the self-guided tour only to this account).
export const DEMO_VIEWER_EMAIL = "demo-viewer@buildalphakids.app";

export function isDemoViewerEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === DEMO_VIEWER_EMAIL;
}
