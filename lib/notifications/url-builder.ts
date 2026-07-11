// ============================================================
// Build notification click-through URLs based on entity type
// ============================================================

/**
 * Get the in-app URL for a notification click-through.
 * Used for push notification data.url and in-app navigation.
 */
export function getNotificationUrl(
  entityType: string | null,
  entityId: string | null,
  userRole: string = "coach"
): string {
  if (!entityType || !entityId) return `/${userRole}`;

  const base = `/${userRole}`;

  switch (entityType) {
    case "session":
      return `${base}/schedule/${entityId}`;
    case "swap_request":
      return `${base}/schedule`; // Swap requests are handled on the schedule page
    case "form_template":
    case "form_submission":
      return `${base}/forms`;
    case "compliance_doc":
      return `${base}/profile`;
    case "announcement":
      return `${base}/announcements`;
    case "task":
      return userRole === "coach" ? base : `${base}/tasks`;
    case "document":
      return `${base}/documents`;
    case "equipment_kit":
      return `${base}/equipment`;
    case "coach_invoice":
      return `${base}/invoices`;
    case "feedback_rating":
      return `${base}/schedule/${entityId}`;
    case "centre_message":
      // Staff-side inbox for client-portal messages — deep-link the thread.
      return `${base}/centre-messages?centre=${entityId}`;
    case "direct_message":
      return `${base}/messages?coach=${entityId}`;
    default:
      return base;
  }
}
