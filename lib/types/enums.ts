// ============================================================
// Enums — mirrors PostgreSQL custom types
// ============================================================

export type UserRole = "admin" | "ops" | "coach" | "parent";

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
  | "cancelled"
  | "needs_replacement";

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
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

export type InvoicePaymentMethod = "bank_transfer" | "square_online" | "other";

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
  | "low_session_rating"
  | "dm_received"
  | "shift_thread_message"
  | "centre_message_received"
  | "assessment_ready"
  | "assessment_reminder"
  | "rerostering_offer"
  | "rerostering_accepted"
  | "rerostering_declined"
  | "rerostering_expired"
  | "rerostering_escalation"
  | "roster_generated"
  | "roster_published"
  | "badge_earned"
  | "performance_review_ready"
  | "training_assigned"
  | "training_completed"
  | "training_overdue"
  | "waitlist_offer"
  | "waitlist_expired"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_reminder"
  | "package_purchased"
  | "invoice_overdue"
  | "demo_scheduled"
  | "demo_reminder"
  | "demo_outcome_recorded"
  | "lead_document_added"
  | "payment_batch_created"
  | "payment_batch_approved"
  | "coach_payment_ready"
  | "grant_approved"
  | "grant_expiring"
  | "grant_application_stale";

// Children & attendance
export type AgeGroup = "3-5" | "5-8" | "8-12";

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type ChildStatus = "active" | "inactive";

export type EnrolmentStatus = "active" | "withdrawn";

// Report status
export type ReportStatus = "draft" | "sent";

// Centre branding mode
export type BrandingMode = "bak_branded" | "white_label";

// Health status
export type HealthStatus = "green" | "amber" | "red";

// CRM
export type LeadSource = "manual" | "csv_import" | "web_form" | "referral";

export type LeadStage =
  | "cold_lead"
  | "contacted"
  | "interested"
  | "free_trial"
  | "proposal_sent"
  | "won"
  | "lost"
  | "churned";

export type LeadActivityType =
  | "note"
  | "email_sent"
  | "email_opened"
  | "email_clicked"
  | "call"
  | "meeting"
  | "stage_change"
  | "task_created"
  | "system";

// Demo sessions
export type DemoSessionStatus = "scheduled" | "delivered" | "cancelled" | "no_show";
export type DemoOutcome = "positive" | "neutral" | "negative";
export type LeadDocumentType = "pitch_deck" | "proposal" | "agreement" | "correspondence" | "other";

// Payment batches (payroll)
export type PaymentBatchStatus = "calculating" | "calculated" | "approved" | "paid" | "closed";
export type PaymentMethod = "bank_transfer" | "other";

// Email sequence
export type EmailSendStatus = "scheduled" | "sent" | "opened" | "clicked" | "failed" | "skipped";

// Forecast period type
export type ForecastPeriodType = "monthly" | "quarterly";

// Session types used for pay rate lookup
export type SessionType =
  | "childcare"
  | "school_local"
  | "school_travel"
  | "holiday_clinic";

// Scheduling
export type SchedulingPreferenceType = "preferred" | "avoid";
export type SchedulingRunStatus = "generated" | "reviewed" | "published" | "discarded";

// Rerostering
export type CancellationReasonType = "sick" | "emergency" | "personal" | "other";
export type RerosteringOfferStatus =
  | "pending_offer"
  | "offer_sent"
  | "accepted"
  | "declined"
  | "expired"
  | "no_replacement";

// Training LMS
export type TrainingModuleType = "video" | "document" | "quiz" | "checklist";
export type TrainingCategory = "onboarding" | "sport_specific" | "compliance" | "professional_development";
export type TrainingStatus = "draft" | "published" | "archived";
export type TrainingAssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";

// Parent
export type ParentRelationship = "parent" | "guardian" | "carer";

// Bookable sessions
export type BookableSessionType = "holiday_clinic" | "after_school" | "weekend" | "specialist" | "other";
export type BookableSessionStatus = "draft" | "open" | "closed" | "cancelled" | "completed";
export type WaitlistStatus = "waiting" | "offered" | "accepted" | "expired" | "cancelled";

// Packages & Bookings
export type PackageStatus = "active" | "inactive";
export type PackageBalanceStatus = "active" | "expired" | "used_up";
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "refunded" | "no_show";
export type BookingPaymentType = "single_payment" | "package_redemption";
export type PaymentType = "session_booking" | "package_purchase";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

// Testimonials (marketing)
export type TestimonialStatus = "pending" | "approved" | "rejected";

// Referrals (Wave 6)
export type ReferralOwnerType = "parent" | "centre";
export type ReferralStatus = "pending" | "registered" | "converted" | "expired";
export type ReferralRewardType = "instant_discount" | "milestone_free_session" | "invoice_credit" | "badge";
export type ReferralRewardStatus = "pending" | "awarded" | "redeemed" | "expired";
export type ReferralCodeStatus = "active" | "inactive";

// Re-engagement (Wave 6)
export type ReengagementAudienceType = "dormant_parents" | "declining_centres" | "cold_leads" | "untrained_coaches";
export type ReengagementCampaignStatus = "active" | "paused" | "inactive";
export type ReengagementSendStatus = "triggered" | "email_sent" | "engaged" | "unsubscribed";
export type ReengagementRecipientType = "parent" | "centre" | "lead" | "coach";
export type DiscountCodeType = "flat_amount";

// Sales proposals
export type ProposalStatus = "draft" | "final" | "sent";

// Regions
export type RegionStatus = "active" | "planned" | "inactive";

// Child insights
export type InsightType = "term_end" | "on_demand";

// Churn
export type ChurnEventType = "churned" | "recovered" | "at_risk";
export type RiskLevel = "low" | "medium" | "high" | "critical";

// Centre onboarding
export type OnboardingStatus = "in_progress" | "completed" | "stalled";
export type OnboardingStepType = "manual" | "auto_email" | "auto_triggered";
export type OnboardingStepStatus = "pending" | "in_progress" | "completed" | "skipped";

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
