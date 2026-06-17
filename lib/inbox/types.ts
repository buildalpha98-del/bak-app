// ============================================================
// Unified inbox — shared types
// ============================================================
//
// `InboxItem` is the lingua franca for every action-needing thing
// the admin/ops viewer should triage from a single timeline. The
// inbox is purely a read-side aggregation; each underlying source
// (tasks, notifications, feedback, sessions, messages, centres,
// swap requests) keeps its own canonical write surface.
//
// Sources concatenate, sort by tier then createdAt desc, cap at
// 100, and link back to the source-of-truth page via `href`.

export type InboxSource =
  | "task"
  | "notification"
  | "flagged_feedback"
  | "needs_replacement_shift"
  | "unread_message"
  | "churn_alert"
  | "unconfirmed_shift"
  | "swap_request";

export type InboxTier = "urgent" | "important" | "informational";

export type InboxEntityType =
  | "centre"
  | "coach"
  | "lead"
  | "session"
  | "feedback"
  | "message"
  | null;

export interface InboxItem {
  /** Stable unique id within source. */
  id: string;
  /** Discriminator. */
  source: InboxSource;
  /** Human label — "task", "message", etc. */
  sourceLabel: string;
  /** One-line headline. */
  title: string;
  /** Optional 1-2 sentence preview. */
  description: string | null;
  /** Created/triggered at — ISO. */
  createdAt: string;
  /** Optional due/expiry. */
  dueAt: string | null;
  /** Tier — drives sort + left border colour. */
  tier: InboxTier;
  /** Route to drill into. */
  href: string;
  /** Related entity. */
  entity: {
    type: InboxEntityType;
    id: string | null;
    label: string | null;
  };
  /** Quick-action affordances available for this item. */
  actions: Array<{
    key: string;
    label: string;
    variant?: "default" | "destructive";
  }>;
}

export interface InboxFilters {
  source?: InboxSource;
  status?: "open" | "all";
}

export interface InboxCounts {
  urgent: number;
  important: number;
  informational: number;
}

export const INBOX_TIER_ORDER: Record<InboxTier, number> = {
  urgent: 0,
  important: 1,
  informational: 2,
};

export const INBOX_LIMIT = 100;
