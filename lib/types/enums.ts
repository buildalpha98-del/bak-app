// ============================================================
// Enums — mirrors PostgreSQL custom types
// ============================================================

export type UserRole = "admin" | "ops" | "coach";

export type UserStatus = "active" | "inactive" | "onboarding";

export type RateUnit = "per_session" | "per_hour";

export type ComplianceDocType =
  | "wwcc"
  | "first_aid"
  | "police_check"
  | "insurance"
  | "coaching_cert"
  | "code_of_conduct"
  | "policy_ack"
  | "other";

export type ComplianceStatus = "pending" | "verified" | "expired" | "rejected";

export type CentreType = "childcare_centre" | "school";

export type PricingModel = "centre_funded" | "parent_funded" | "per_head";

export type ContractStatus = "active" | "trial" | "paused" | "churned";

export type CentreNoteCategory =
  | "general"
  | "access_logistics"
  | "safety"
  | "client_relationship";

export type TermStatus = "draft" | "active" | "completed";

export type SessionStatus =
  | "draft"
  | "published"
  | "pending_confirmation"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export type SwapStatus =
  | "pending_coach"
  | "pending_ops"
  | "approved"
  | "rejected"
  | "cancelled";

export type EquipmentLocationType = "coach" | "centre" | "storage";

export type EquipmentCondition =
  | "good"
  | "needs_attention"
  | "needs_replacement";

export type ItemCondition = "good" | "fair" | "poor" | "missing";

export type EquipmentAction =
  | "check_out"
  | "check_in"
  | "issue_flagged"
  | "created"
  | "updated";

export type CoachInvoiceStatus =
  | "draft"
  | "flagged"
  | "ready"
  | "sent"
  | "paid";

export type OutboundInvoiceStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "paid";

export type AnnouncementAudience =
  | "all"
  | "ops_and_coaches"
  | "coaches_only";

export type DocumentCategory =
  | "program"
  | "policy"
  | "risk_assessment"
  | "onboarding"
  | "centre_doc"
  | "compliance"
  | "template"
  | "other";

export type DocumentVisibility = "all" | "admin_ops" | "admin_only";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type NotificationChannel = "push" | "email" | "in_app" | "none";

export type NotificationEventType =
  | "shift_assigned"
  | "shift_confirmed"
  | "shift_declined"
  | "shift_cancelled"
  | "shift_reminder"
  | "bulk_shifts_confirmed"
  | "swap_request_created"
  | "swap_request_accepted"
  | "swap_request_declined"
  | "swap_approved"
  | "swap_rejected"
  | "incident_reported"
  | "session_duration_review"
  | "form_reminder"
  | "compliance_expiry_30d"
  | "compliance_expiry_7d"
  | "announcement_posted"
  | "task_assigned"
  | "task_overdue_reminder"
  | "task_completed"
  | "document_added"
  | "equipment_changed"
  | "invoice_status_changed"
  | "feedback_received"
  | "low_session_rating";

// Session types used for pay rate lookup
export type SessionType =
  | "childcare"
  | "school_local"
  | "school_travel"
  | "holiday_clinic";

// Sports offered
export const SPORTS = [
  "Soccer",
  "Basketball",
  "Athletics",
  "Yoga",
  "Pilates",
  "Boot Camp",
  "Swimming",
  "Pickleball",
  "Golf",
  "Hockey",
  "Lacrosse",
  "Motor Skills",
  "Multi-Sport",
  "Cricket",
  "Netball",
  "Tennis",
  "Volleyball",
  "Dance",
  "Gymnastics",
] as const;

export type Sport = (typeof SPORTS)[number];
