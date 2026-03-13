import type { NotificationEventType } from "@/lib/types/enums";

// ============================================================
// Notification event definitions and tier mapping
// ============================================================

export interface NotificationEvent {
  type: NotificationEventType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}

export type NotificationTier = "urgent" | "important" | "informational";

/**
 * Maps each notification event type to its tier.
 * Urgent: push + email always (cannot be opted out)
 * Important: push + email if preference allows
 * Informational: in-app only (Realtime handles bell)
 */
export const EVENT_TIER_MAP: Record<NotificationEventType, NotificationTier> = {
  // Urgent
  shift_assigned: "urgent",
  shift_declined: "urgent",
  shift_cancelled: "urgent",
  swap_request_created: "urgent",
  swap_request_accepted: "urgent",
  swap_approved: "urgent",
  incident_reported: "urgent",
  compliance_expiry_7d: "urgent",

  // Important
  shift_confirmed: "important",
  shift_reminder: "important",
  bulk_shifts_confirmed: "important",
  swap_request_declined: "important",
  swap_rejected: "important",
  session_duration_review: "important",
  form_reminder: "important",
  compliance_expiry_30d: "important",
  announcement_posted: "important",
  task_assigned: "important",
  task_overdue_reminder: "important",

  // Informational
  document_added: "informational",
  equipment_changed: "informational",
  invoice_status_changed: "informational",
  feedback_received: "informational",
  task_completed: "informational",
  low_session_rating: "important",
  dm_received: "important",
  shift_thread_message: "informational",
};
