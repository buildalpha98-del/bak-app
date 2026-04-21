// ============================================================
// Database types — mirrors all Supabase tables
// ============================================================

import type {
  UserRole,
  UserStatus,
  RateUnit,
  ComplianceDocType,
  ComplianceStatus,
  CentreType,
  PricingModel,
  ContractStatus,
  CentreNoteCategory,
  TermStatus,
  SessionStatus,
  SwapStatus,
  EquipmentLocationType,
  EquipmentCondition,
  ItemCondition,
  EquipmentAction,
  CoachInvoiceStatus,
  OutboundInvoiceStatus,
  InvoicePaymentMethod,
  AnnouncementAudience,
  DocumentCategory,
  DocumentVisibility,
  TaskPriority,
  NotificationChannel,
  AgeGroup,
  Gender,
  ChildStatus,
  EnrolmentStatus,
  ReportStatus,
  BrandingMode,
  HealthStatus,
  LeadSource,
  LeadStage,
  LeadActivityType,
  EmailSendStatus,
  TrainingModuleType,
  TrainingCategory,
  TrainingStatus,
  TrainingAssignmentStatus,
  OnboardingStatus,
  OnboardingStepType,
  OnboardingStepStatus,
  ParentRelationship,
  BookableSessionType,
  BookableSessionStatus,
  WaitlistStatus,
} from "./enums";

// ========================
// 1. profiles
// ========================
export interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_url: string | null;
  abn: string | null;
  gst_registered: boolean;
  role: UserRole;
  default_pay_rate: number | null;
  status: UserStatus;
  dnd_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ========================
// 2. pay_rates
// ========================
export interface PayRate {
  id: string;
  user_id: string;
  session_type: string;
  rate: number;
  rate_unit: RateUnit;
  effective_from: string;
  created_at: string;
}

// ========================
// 3. compliance_docs
// ========================
export interface ComplianceDoc {
  id: string;
  user_id: string;
  doc_type: ComplianceDocType;
  doc_number: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  status: ComplianceStatus;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 4. availability_slots
// ========================
export interface AvailabilitySlot {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_preferences: string[];
  created_at: string;
}

// ========================
// 5. centres
// ========================
export interface Centre {
  id: string;
  name: string;
  type: CentreType;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  primary_contact_role: string | null;
  group_size: number | null;
  age_groups: string[];
  pricing_model: PricingModel;
  agreed_rate: number | null;
  session_preferences: Record<string, unknown>;
  contract_status: ContractStatus;
  status_changed_at: string | null;
  created_at: string;
  updated_at: string;
  send_feedback_emails: boolean;
  logo_url: string | null;
  branding_mode: BrandingMode;
  health_score: number | null;
  health_status: HealthStatus | null;
  health_score_updated_at: string | null;
  churn_risk: boolean;
  profile_checklist_complete: boolean;
  converted_from_lead_id: string | null;
}

// ========================
// 6. centre_notes
// ========================
export interface CentreNote {
  id: string;
  centre_id: string;
  category: CentreNoteCategory;
  content: string;
  created_by: string;
  created_at: string;
}

// ========================
// 7. terms
// ========================
export interface Term {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  year: number;
  status: TermStatus;
  created_at: string;
}

// ========================
// 8. term_templates
// ========================
export interface TermTemplate {
  id: string;
  term_id: string;
  day_of_week: number;
  time: string;
  duration_minutes: number;
  centre_id: string;
  sport: string;
  default_coach_id: string | null;
  created_at: string;
}

// ========================
// 9. sessions
// ========================
export interface Session {
  id: string;
  term_id: string;
  template_id: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  centre_id: string;
  coach_id: string | null;
  sport: string;
  program_id: string | null;
  equipment_kit_id: string | null;
  status: SessionStatus;
  pay_rate_override: number | null;
  pay_rate_resolved: number | null;
  cancellation_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  actual_duration_minutes: number | null;
  headcount: number | null;
  coach_notes: string | null;
  needs_ops_review: boolean;
  is_trial: boolean;
  created_at: string;
  updated_at: string;
}

// ========================
// 10. swap_requests
// ========================
export interface SwapRequest {
  id: string;
  session_id: string;
  requesting_coach_id: string;
  proposed_coach_id: string;
  status: SwapStatus;
  ops_approved_by: string | null;
  coach_responded_at: string | null;
  ops_responded_at: string | null;
  created_at: string;
}

// ========================
// 11. programs
// ========================
export interface Program {
  id: string;
  sport: string;
  age_group: string | null;
  duration_minutes: number;
  skill_focus: string | null;
  content_json: Record<string, unknown>;
  equipment_used: string[];
  parent_version_id: string | null;
  version_number: number;
  created_by: string;
  created_at: string;
}

// ========================
// 12. equipment_kits
// ========================
export interface EquipmentKit {
  id: string;
  name: string;
  location_type: EquipmentLocationType;
  location_id: string | null;
  condition: EquipmentCondition;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 13. equipment_items
// ========================
export interface EquipmentItem {
  id: string;
  kit_id: string;
  item_type: string;
  quantity: number;
  condition: ItemCondition;
  created_at: string;
  updated_at: string;
}

// ========================
// 14. equipment_logs
// ========================
export interface EquipmentLog {
  id: string;
  kit_id: string;
  action: EquipmentAction;
  user_id: string;
  notes: string | null;
  issues_json: Record<string, unknown> | null;
  created_at: string;
}

// ========================
// 15. form_templates
// ========================
export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multi_select"
  | "checkbox"
  | "radio"
  | "date"
  | "time"
  | "file"
  | "signature"
  | "heading"
  | "rating";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
  locked?: boolean;
  autoPopulate?: string;
  maxFiles?: number;
  conditional_logic?: {
    field_id: string;
    operator: "equals" | "not_equals" | "contains";
    value: string;
  };
}

export interface FormTemplate {
  id: string;
  name: string;
  form_type: string;
  fields_json: FormField[];
  is_default: boolean;
  centre_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ========================
// 16. form_submissions
// ========================
export interface FormSubmission {
  id: string;
  form_template_id: string;
  session_id: string | null;
  submitted_by: string;
  data_json: Record<string, unknown>;
  attachments: string[];
  submitted_at: string;
  synced_at: string | null;
  created_at: string;
}

// ========================
// 17. coach_invoices
// ========================
export interface InvoiceLineItem {
  session_id: string;
  date: string;
  centre_name: string;
  sport: string;
  duration_minutes: number;
  rate: number;
  rate_unit: RateUnit;
  amount: number;
}

export interface CoachInvoice {
  id: string;
  invoice_number: string | null;
  coach_id: string;
  period_start: string;
  period_end: string;
  line_items_json: InvoiceLineItem[];
  total_amount: number;
  gst_amount: number | null;
  status: CoachInvoiceStatus;
  flagged_items_json: Record<string, unknown>[] | null;
  pdf_url: string | null;
  sent_at: string | null;
  resolved_at: string | null;
  // Batch payroll fields (migration 044)
  initiated_by_role: "coach" | "admin";
  payment_batch_id: string | null;
  payment_method: "bank_transfer" | "other" | null;
  payment_reference: string | null;
  payment_date: string | null;
  adjustments: number;
  adjustment_reason: string | null;
  generated_by: string | null;
  created_at: string;
}

// ========================
// 17a. payment_batches
// ========================
export interface PaymentBatch {
  id: string;
  period_start: string;
  period_end: string;
  status: "calculating" | "calculated" | "approved" | "paid" | "closed";
  created_by: string | null;
  calculated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  total_amount: number;
  coach_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 18. outbound_invoices
// ========================
export interface OutboundInvoice {
  id: string;
  centre_id: string;
  period_start: string;
  period_end: string;
  line_items_json: OutboundLineItem[];
  amount: number;
  status: OutboundInvoiceStatus;
  invoice_number: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  due_date: string | null;
  payment_method: InvoicePaymentMethod | null;
  payment_reference: string | null;
  payment_date: string | null;
  paid_amount_cents: number | null;
  pdf_url: string | null;
  email_sent_at: string | null;
  email_opened_at: string | null;
  reminder_sent_at: string | null;
  notes: string | null;
  gst_amount_cents: number | null;
  subtotal_cents: number | null;
  total_cents: number | null;
  payment_history: InvoicePaymentRecord[];
  created_at: string;
  updated_at: string;
}

export interface InvoicePaymentRecord {
  date: string;
  amount_cents: number;
  method: InvoicePaymentMethod;
  reference: string | null;
  notes: string | null;
  recorded_by: string;
  recorded_at: string;
}

export interface BusinessSettings {
  id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface OutboundLineItem {
  session_id: string;
  date: string;
  sport: string;
  coach_name: string;
  headcount: number | null;
  rate: number;
  amount: number;
  description: string;
}

// ========================
// 19. announcements
// ========================
export interface Announcement {
  id: string;
  title: string;
  body: string;
  attachments: string[] | null;
  audience: AnnouncementAudience;
  created_by: string;
  created_at: string;
}

// ========================
// 20. announcement_reads
// ========================
export interface AnnouncementRead {
  id: string;
  announcement_id: string;
  user_id: string;
  read_at: string;
}

// ========================
// 21. shift_threads
// ========================
export interface ShiftThread {
  id: string;
  session_id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  parent_message_id: string | null;
}

// ========================
// 22. direct_messages
// ========================
export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

// ========================
// 23. documents
// ========================
export interface Document {
  id: string;
  title: string;
  category: DocumentCategory;
  file_url: string;
  file_name: string;
  tags: string[];
  version: number;
  parent_document_id: string | null;
  uploaded_by: string;
  visibility: DocumentVisibility;
  created_at: string;
}

// ========================
// 24. tasks
// ========================
export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  column_id: string;
  priority: TaskPriority;
  due_date: string | null;
  column_order: number;
  source: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 25. feedback_ratings
// ========================
export interface FeedbackRating {
  id: string;
  session_id: string;
  centre_id: string;
  coach_id: string | null;
  sport: string | null;
  rating: number | null;
  comment: string | null;
  feedback_token: string;
  submitted_at: string | null;
  created_at: string;
}

// ========================
// 26. activity_log
// ========================
export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ========================
// 27. notification_preferences
// ========================
export interface NotificationPreference {
  id: string;
  user_id: string;
  notification_type: string;
  channel: NotificationChannel;
  created_at: string;
  updated_at: string;
}

// ========================
// 28. notifications
// ========================
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  tier: "urgent" | "important" | "informational";
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

// ========================
// 29. push_subscriptions
// ========================
export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  user_agent: string | null;
  created_at: string;
}

// ========================
// 30. task_columns
// ========================
export interface TaskColumn {
  id: string;
  name: string;
  position: number;
  is_final: boolean;
  created_at: string;
}

// ========================
// 31. task_activity
// ========================
export type TaskActivityType =
  | "comment"
  | "status_change"
  | "assignment_change"
  | "priority_change"
  | "created";

export interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  type: TaskActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ========================
// Task relation types (for queries)
// ========================
export interface TaskWithRelations {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  column_id: string;
  priority: TaskPriority;
  due_date: string | null;
  column_order: number;
  source: string;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  column: { name: string; is_final: boolean };
  assignee: { id: string; name: string; photo_url: string | null } | null;
  creator: { id: string; name: string } | null;
  linked_entity_name: string | null;
}

export interface TaskDetail extends TaskWithRelations {
  activities: (TaskActivity & {
    user: { name: string; photo_url: string | null } | null;
  })[];
}

// ========================
// 32. children
// ========================
export interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  age_group: AgeGroup;
  gender: Gender | null;
  medical_notes: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  photo_url: string | null;
  status: ChildStatus;
  created_at: string;
  updated_at: string;
}

// ========================
// 33. centre_children
// ========================
export interface CentreChild {
  id: string;
  child_id: string;
  centre_id: string;
  enrolled_at: string;
  status: EnrolmentStatus;
  created_at: string;
}

// ========================
// 34. session_attendances
// ========================
export interface SessionAttendance {
  id: string;
  session_id: string;
  child_id: string;
  present: boolean;
  created_at: string;
}

// ========================
// 35. assessment_templates
// ========================
export interface AssessmentSkill {
  name: string;
  description: string;
}

export interface AssessmentTemplate {
  id: string;
  sport: string;
  age_group: AgeGroup;
  skills_json: AssessmentSkill[];
  term_id: string | null;
  centre_id: string | null;
  created_by: string;
  created_at: string;
}

// ========================
// 36. skill_ratings
// ========================
export interface SkillRatingEntry {
  skill_name: string;
  rating: number;
}

export interface SkillRating {
  id: string;
  assessment_template_id: string;
  child_id: string;
  coach_id: string;
  term_id: string;
  ratings_json: SkillRatingEntry[];
  notes: string | null;
  assessed_at: string;
  created_at: string;
}

// ========================
// 37. centre_reports
// ========================
export interface ReportContentJson {
  summary?: string;
  sessions_delivered?: number;
  total_children?: number;
  sports_covered?: string[];
  average_rating?: number;
  highlights?: string[];
  coach_notes?: string[];
  attendance_summary?: {
    total_attendances: number;
    average_per_session: number;
  };
  assessment_summary?: {
    children_assessed: number;
    average_improvement: number;
  };
  photos?: string[];
}

export interface CentreReport {
  id: string;
  centre_id: string;
  term_id: string;
  title: string;
  content_json: ReportContentJson;
  cover_image_url: string | null;
  status: ReportStatus;
  generated_by: string;
  pdf_url: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 38. client_users
// ========================
export interface ClientUser {
  id: string;
  user_id: string;
  centre_id: string;
  name: string;
  email: string;
  role: string;
  is_primary: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 39. shared_links
// ========================
export interface SharedLink {
  id: string;
  centre_id: string;
  created_by: string;
  token: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

// ========================
// 40. health_scores
// ========================
export interface HealthScoreBreakdown {
  signal_name: string;
  weight: number;
  raw_value: number | null;
  signal_score: number;
  status: HealthStatus;
}

export interface HealthScore {
  id: string;
  centre_id: string;
  score: number;
  status: HealthStatus;
  breakdown_json: HealthScoreBreakdown[];
  calculated_at: string;
}

// ========================
// 41. health_score_config
// ========================
export interface HealthScoreConfig {
  id: string;
  signal_name: string;
  weight: number;
  green_threshold: number;
  amber_threshold: number;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

// ========================
// 42. leads
// ========================
export interface Lead {
  id: string;
  centre_name: string;
  type: import("./enums").CentreType | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_role: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  student_count: number | null;
  source: LeadSource;
  source_detail: string | null;
  stage: LeadStage;
  stage_changed_at: string;
  owner_id: string | null;
  estimated_value: number | null;
  probability: number;
  expected_close_date: string | null;
  last_contacted_at: string | null;
  next_follow_up_date: string | null;
  notes: string | null;
  lost_reason: string | null;
  churn_reason: string | null;
  centre_id: string | null;
  trial_start_date: string | null;
  trial_end_date: string | null;
  trial_sessions_count: number;
  trial_report_url: string | null;
  active_sequence_id: string | null;
  sequence_paused: boolean;
  converted_at: string | null;
  lost_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 43. lead_activities
// ========================
export interface LeadActivity {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

// ========================
// 44. demo_sessions
// ========================
export interface DemoSession {
  id: string;
  lead_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  coach_id: string | null;
  attendees_expected: number | null;
  attendees_actual: number | null;
  status: "scheduled" | "delivered" | "cancelled" | "no_show";
  outcome: "positive" | "neutral" | "negative" | null;
  coach_feedback: string | null;
  decision_maker_feedback: string | null;
  created_by: string | null;
  created_at: string;
}

// ========================
// 45. lead_documents
// ========================
export interface LeadDocument {
  id: string;
  lead_id: string;
  document_type: "pitch_deck" | "proposal" | "agreement" | "correspondence" | "other";
  name: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

// ========================
// 46. centre_messages
// ========================
export interface CentreMessage {
  id: string;
  centre_id: string;
  sender_type: "client" | "staff";
  sender_client_id: string | null;
  sender_staff_id: string | null;
  content: string;
  read_at: string | null;
  created_at: string;
}

// ========================
// 45. email_sequences
// ========================
export interface EmailSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_stage: LeadStage;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 46. email_sequence_steps
// ========================
export interface EmailSequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  subject: string;
  body: string;
  created_at: string;
}

// ========================
// 47. email_sends
// ========================
export interface EmailSend {
  id: string;
  lead_id: string;
  sequence_id: string;
  step_id: string;
  status: EmailSendStatus;
  scheduled_for: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

// ========================
// 53. coach_performance_snapshots
// ========================
export interface CoachPerformanceSnapshot {
  id: string;
  coach_id: string;
  period_start: string;
  period_end: string;
  metrics_json: CoachMetrics;
  overall_score: number;
  created_at: string;
}

export interface CoachMetrics {
  session_volume: { count: number; trend: number; previous_count: number };
  feedback_rating: { average: number; team_average: number; trend: number; count: number };
  attendance_consistency: { average_per_session: number; trend: "growing" | "stable" | "declining" };
  form_completion: { rate: number; expected: number; actual: number };
  punctuality: { average_minutes: number; late_count: number; total_tracked: number };
  shift_reliability: { rate: number; completed: number; total: number; cancellations: number };
  assessment_thoroughness: { std_dev: number; avg_rating: number; total_ratings: number; flagged: boolean };
  equipment_responsibility: { issue_rate: number; issues: number; checkins: number };
}

// ========================
// 54. coach_badges
// ========================
export interface CoachBadge {
  id: string;
  coach_id: string;
  badge_key: string;
  earned_at: string;
  metadata: Record<string, unknown>;
}

// ========================
// 55. training_modules
// ========================
export interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  type: TrainingModuleType;
  category: TrainingCategory;
  content_json: VideoContent | DocumentContent | QuizContent | ChecklistContent;
  estimated_minutes: number | null;
  is_mandatory: boolean;
  required_for_sports: string[] | null;
  status: TrainingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoContent {
  video_url: string;
  video_type: "upload" | "youtube" | "vimeo";
  duration_seconds: number;
  require_full_watch: boolean;
}

export interface DocumentContent {
  file_url: string;
  file_name: string;
  file_type: "pdf" | "docx";
  require_acknowledgement: boolean;
}

export interface QuizContent {
  pass_mark: number;
  allow_retries: boolean;
  max_retries: number;
  randomise_order: boolean;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
}

export interface ChecklistContent {
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requires_note: boolean;
}

// ========================
// 56. training_pathways
// ========================
export interface TrainingPathway {
  id: string;
  title: string;
  description: string | null;
  category: TrainingCategory;
  is_mandatory_onboarding: boolean;
  status: TrainingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 57. training_pathway_modules
// ========================
export interface TrainingPathwayModule {
  id: string;
  pathway_id: string;
  module_id: string;
  order_index: number;
  created_at: string;
}

// ========================
// 58. training_assignments
// ========================
export interface TrainingAssignment {
  id: string;
  coach_id: string;
  module_id: string | null;
  pathway_id: string | null;
  assigned_by: string | null;
  due_date: string | null;
  status: TrainingAssignmentStatus;
  assigned_at: string;
  completed_at: string | null;
}

// ========================
// 59. training_completions
// ========================
export interface TrainingCompletion {
  id: string;
  coach_id: string;
  module_id: string;
  assignment_id: string | null;
  score: number | null;
  passed: boolean | null;
  attempt_number: number;
  completion_data: Record<string, unknown>;
  completed_at: string;
  created_at: string;
}

// ========================
// 60. centre_onboarding_checklists
// ========================
export interface CentreOnboardingChecklist {
  id: string;
  centre_id: string;
  status: OnboardingStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

// ========================
// 61. centre_onboarding_steps
// ========================
export interface CentreOnboardingStep {
  id: string;
  checklist_id: string;
  step_number: number;
  step_name: string;
  step_type: OnboardingStepType;
  status: OnboardingStepStatus;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  scheduled_for: string | null;
  created_at: string;
}

// ========================
// 62. centre_onboarding_emails
// ========================
export interface CentreOnboardingEmail {
  id: string;
  checklist_id: string;
  step_number: number;
  email_type: string;
  sent_to: string;
  sent_at: string;
  opened_at: string | null;
}

// ========================
// 63. ai_assistant_conversations
// ========================
export interface AiAssistantConversation {
  id: string;
  coach_id: string;
  session_id: string | null;
  messages_json: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

// ========================
// 64. ai_assistant_cache
// ========================
export interface AiAssistantCache {
  id: string;
  cache_key: string;
  response: string;
  created_at: string;
  expires_at: string;
}

// ========================
// 65. ai_assistant_usage
// ========================
export interface AiAssistantUsage {
  id: string;
  coach_id: string;
  usage_date: string;
  count: number;
}

// ========================
// Database type map (for generic helpers)
// ========================
export interface Database {
  profiles: Profile;
  pay_rates: PayRate;
  compliance_docs: ComplianceDoc;
  availability_slots: AvailabilitySlot;
  centres: Centre;
  centre_notes: CentreNote;
  terms: Term;
  term_templates: TermTemplate;
  sessions: Session;
  swap_requests: SwapRequest;
  programs: Program;
  equipment_kits: EquipmentKit;
  equipment_items: EquipmentItem;
  equipment_logs: EquipmentLog;
  form_templates: FormTemplate;
  form_submissions: FormSubmission;
  coach_invoices: CoachInvoice;
  outbound_invoices: OutboundInvoice;
  announcements: Announcement;
  announcement_reads: AnnouncementRead;
  shift_threads: ShiftThread;
  direct_messages: DirectMessage;
  documents: Document;
  tasks: Task;
  feedback_ratings: FeedbackRating;
  activity_log: ActivityLog;
  notification_preferences: NotificationPreference;
  notifications: Notification;
  push_subscriptions: PushSubscription;
  business_settings: BusinessSettings;
  task_columns: TaskColumn;
  task_activity: TaskActivity;
  children: Child;
  centre_children: CentreChild;
  session_attendances: SessionAttendance;
  assessment_templates: AssessmentTemplate;
  skill_ratings: SkillRating;
  centre_reports: CentreReport;
  client_users: ClientUser;
  shared_links: SharedLink;
  centre_messages: CentreMessage;
  health_scores: HealthScore;
  health_score_config: HealthScoreConfig;
  leads: Lead;
  lead_activities: LeadActivity;
  email_sequences: EmailSequence;
  email_sequence_steps: EmailSequenceStep;
  email_sends: EmailSend;
  revenue_forecasts: RevenueForecast;
  forecast_config: ForecastConfig;
  scheduling_preferences: SchedulingPreference;
  scheduling_runs: SchedulingRun;
  rerostering_events: RerosteringEvent;
  coach_performance_snapshots: CoachPerformanceSnapshot;
  coach_badges: CoachBadge;
  training_modules: TrainingModule;
  training_pathways: TrainingPathway;
  training_pathway_modules: TrainingPathwayModule;
  training_assignments: TrainingAssignment;
  training_completions: TrainingCompletion;
  centre_onboarding_checklists: CentreOnboardingChecklist;
  centre_onboarding_steps: CentreOnboardingStep;
  centre_onboarding_emails: CentreOnboardingEmail;
  ai_assistant_conversations: AiAssistantConversation;
  ai_assistant_cache: AiAssistantCache;
  ai_assistant_usage: AiAssistantUsage;
  parent_profiles: ParentProfile;
  parent_children: ParentChild;
  bookable_sessions: BookableSession;
  waitlist: WaitlistEntry;
  referral_codes: ReferralCode;
  referrals: Referral;
  referral_rewards: ReferralReward;
  referral_config: ReferralConfig;
  reengagement_campaigns: ReengagementCampaign;
  reengagement_sends: ReengagementSend;
  discount_codes: DiscountCode;
}

// ========================
// 66. parent_profiles
// ========================
export interface ParentProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  suburb: string | null;
  marketing_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

// ========================
// 67. parent_children
// ========================
export interface ParentChild {
  id: string;
  parent_id: string;
  child_id: string;
  relationship: ParentRelationship;
  created_at: string;
}

// ========================
// 68. bookable_sessions
// ========================
export interface BookableSession {
  id: string;
  session_id: string | null;
  title: string;
  description: string | null;
  session_type: BookableSessionType;
  date: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address: string;
  suburb: string;
  sport: string | null;
  age_group_min: number | null;
  age_group_max: number | null;
  max_capacity: number;
  current_bookings: number;
  price_cents: number;
  package_eligible: boolean;
  coach_id: string | null;
  status: BookableSessionStatus;
  booking_opens_at: string | null;
  booking_closes_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 69. waitlist
// ========================
export interface WaitlistEntry {
  id: string;
  bookable_session_id: string;
  parent_id: string;
  child_id: string;
  position: number;
  status: WaitlistStatus;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string;
}

// ========================
// 70. packages
// ========================
export interface Package {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price_cents: number;
  savings_cents: number;
  valid_days: number;
  applicable_session_types: import("./enums").BookableSessionType[] | null;
  status: import("./enums").PackageStatus;
  created_by: string | null;
  created_at: string;
}

// ========================
// 71. payments
// ========================
export interface Payment {
  id: string;
  parent_id: string;
  booking_id: string | null;
  package_id: string | null;
  amount_cents: number;
  payment_type: import("./enums").PaymentType;
  square_payment_id: string | null;
  square_order_id: string | null;
  status: import("./enums").PaymentStatus;
  refund_amount_cents: number | null;
  refunded_at: string | null;
  created_at: string;
}

// ========================
// 72. bookings
// ========================
export interface BookingChildEntry {
  child_id: string;
  child_name: string;
  age_group: string;
}

export interface Booking {
  id: string;
  bookable_session_id: string;
  parent_id: string;
  children_json: BookingChildEntry[];
  payment_type: import("./enums").BookingPaymentType;
  payment_id: string | null;
  package_balance_id: string | null;
  total_cents: number;
  status: import("./enums").BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

// ========================
// 73. package_balances
// ========================
export interface PackageBalance {
  id: string;
  parent_id: string;
  package_id: string;
  purchased_at: string;
  expires_at: string;
  total_sessions: number;
  remaining_sessions: number;
  payment_id: string | null;
  status: import("./enums").PackageBalanceStatus;
  created_at: string;
}

// ========================
// 48. revenue_forecasts
// ========================
export interface RevenueForecast {
  id: string;
  forecast_date: string;
  period_type: import("./enums").ForecastPeriodType;
  period_start: string;
  period_end: string;
  committed_revenue: number;
  pipeline_revenue: number;
  total_projected_revenue: number;
  projected_coach_costs: number;
  projected_profit: number;
  breakdown_json: Record<string, unknown>;
  created_at: string;
}

// ========================
// 49. forecast_config
// ========================
export interface ForecastConfig {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

// ========================
// 50. scheduling_preferences
// ========================
export interface SchedulingPreference {
  id: string;
  coach_id: string;
  centre_id: string;
  preference_type: import("./enums").SchedulingPreferenceType;
  reason: string | null;
  learned: boolean;
  created_by: string;
  created_at: string;
}

// ========================
// 51. scheduling_runs
// ========================
export interface SchedulingRunInputSummary {
  coaches_count: number;
  sessions_count: number;
  constraints: string[];
}

export interface SchedulingRunOutputSummary {
  assigned_count: number;
  unassigned_count: number;
  confidence_breakdown: { green: number; amber: number; red: number };
}

export interface SchedulingAssignment {
  session_id: string;
  assigned_coach_id: string | null;
  score: number;
  confidence: "green" | "amber" | "red";
  reasoning: string[];
  eligible_coaches: { coach_id: string; score: number; name: string }[];
}

export interface SchedulingAdjustment {
  session_id: string;
  original_coach_id: string | null;
  original_score: number;
  replacement_coach_id: string;
  adjusted_by: string;
  adjusted_at: string;
}

export interface SchedulingRun {
  id: string;
  term_id: string;
  week_start: string;
  week_end: string;
  input_summary: SchedulingRunInputSummary;
  output_summary: SchedulingRunOutputSummary;
  assignments_json: SchedulingAssignment[];
  adjustments_json: SchedulingAdjustment[];
  status: import("./enums").SchedulingRunStatus;
  generated_at: string;
  published_at: string | null;
  created_by: string;
  created_at: string;
}

// ========================
// 52. rerostering_events
// ========================
export interface RerosteringSuggestion {
  coach_id: string;
  coach_name: string;
  coach_phone: string | null;
  availability_status: "confirmed" | "potentially_available";
  score: number;
  score_breakdown: {
    familiarity: number;
    utilisation: number;
    location: number;
    preference: number;
    compliance: number;
  };
  last_at_centre: string | null;
  current_week_hours: number;
}

export interface RerosteringEvent {
  id: string;
  session_id: string;
  original_coach_id: string;
  cancellation_reason: import("./enums").CancellationReasonType;
  cancellation_details: string | null;
  suggestions_json: RerosteringSuggestion[];
  selected_replacement_id: string | null;
  offer_status: import("./enums").RerosteringOfferStatus;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  approved_by: string | null;
  escalated: boolean;
  created_at: string;
  resolved_at: string | null;
}

// ========================
// 55. approved_testimonials
// ========================
export interface ApprovedTestimonial {
  id: string;
  feedback_rating_id: string | null;
  centre_name: string;
  comment: string;
  rating: number;
  display_name: string;
  status: import("./enums").TestimonialStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

// ========================
// 56. public_stats_cache
// ========================
export interface PublicStatsCache {
  id: string;
  stat_key: string;
  stat_value: Record<string, unknown>;
  calculated_at: string;
  expires_at: string;
}

// ========================
// 57. referral_codes (Wave 6)
// ========================
export interface ReferralCode {
  id: string;
  code: string;
  owner_type: import("./enums").ReferralOwnerType;
  owner_id: string;
  status: import("./enums").ReferralCodeStatus;
  total_referrals: number;
  total_conversions: number;
  created_at: string;
}

// ========================
// 58. referrals
// ========================
export interface Referral {
  id: string;
  referral_code_id: string;
  referrer_type: import("./enums").ReferralOwnerType;
  referrer_id: string;
  referred_type: import("./enums").ReferralOwnerType;
  referred_id: string | null;
  referred_email: string;
  status: import("./enums").ReferralStatus;
  conversion_type: string | null;
  converted_at: string | null;
  created_at: string;
}

// ========================
// 59. referral_rewards
// ========================
export interface ReferralReward {
  id: string;
  referral_id: string;
  recipient_type: import("./enums").ReferralOwnerType;
  recipient_id: string;
  reward_type: import("./enums").ReferralRewardType;
  reward_value_cents: number | null;
  reward_description: string;
  status: import("./enums").ReferralRewardStatus;
  awarded_at: string;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ========================
// 60. referral_config
// ========================
export interface ReferralConfig {
  id: string;
  config_key: string;
  config_value: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

// ========================
// 61. reengagement_campaigns (Wave 6)
// ========================
export interface ReengagementCampaign {
  id: string;
  name: string;
  audience_type: import("./enums").ReengagementAudienceType;
  trigger_condition: Record<string, unknown>;
  email_sequence_id: string | null;
  status: import("./enums").ReengagementCampaignStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 62. reengagement_sends
// ========================
export interface ReengagementSend {
  id: string;
  campaign_id: string;
  recipient_type: import("./enums").ReengagementRecipientType;
  recipient_id: string;
  trigger_reason: string;
  triggered_at: string;
  email_send_id: string | null;
  status: import("./enums").ReengagementSendStatus;
  engaged_at: string | null;
  created_at: string;
}

// ========================
// 63. discount_codes
// ========================
export interface DiscountCode {
  id: string;
  code: string;
  type: import("./enums").DiscountCodeType;
  value_cents: number;
  parent_id: string | null;
  used: boolean;
  used_at: string | null;
  expires_at: string | null;
  campaign_id: string | null;
  created_at: string;
}

// ========================
// 64. sales_proposals
// ========================
export interface SalesProposal {
  id: string;
  lead_id: string;
  title: string;
  content_json: Record<string, unknown>;
  pdf_url: string | null;
  status: import("./enums").ProposalStatus;
  generated_at: string;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

// ========================
// 65. regions
// ========================
export interface Region {
  id: string;
  name: string;
  code: string;
  suburbs: string[];
  state: string;
  status: import("./enums").RegionStatus;
  regional_manager_id: string | null;
  target_centres: number | null;
  is_franchise: boolean;
  data_isolation_level: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// 66. child_insights
// ========================
export interface ChildInsight {
  id: string;
  child_id: string;
  term_id: string | null;
  centre_id: string | null;
  insight_type: import("./enums").InsightType;
  content_json: Record<string, unknown>;
  summary: string | null;
  strengths: string[];
  areas_for_growth: string[];
  recommendations: string[];
  generated_by: string;
  created_at: string;
}

// ========================
// 67. churn_events
// ========================
export interface ChurnEvent {
  id: string;
  centre_id: string;
  event_type: import("./enums").ChurnEventType;
  risk_score: number | null;
  risk_level: import("./enums").RiskLevel | null;
  indicators: Record<string, unknown>;
  notes: string | null;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
}

// ========================
// 68. churn_risk_indicators
// ========================
export interface ChurnRiskIndicator {
  id: string;
  centre_id: string;
  snapshot_date: string;
  risk_score: number;
  risk_level: import("./enums").RiskLevel;
  health_score: number | null;
  health_trend: string | null;
  engagement_score: number | null;
  communication_score: number | null;
  payment_score: number | null;
  cancellation_rate: number | null;
  session_trend: string | null;
  days_since_last_feedback: number | null;
  days_since_last_communication: number | null;
  indicators_json: Record<string, unknown>;
  created_at: string;
}

// ========================
// Grants (migration 045)
// ========================
export interface Grant {
  id: string;
  name: string;
  funding_body: string | null;
  description: string | null;
  application_url: string | null;
  is_active: boolean;
  created_at: string;
}

export type GrantApplicationStatus =
  | "planning"
  | "submitted"
  | "approved"
  | "rejected"
  | "funded"
  | "expired";

export interface GrantApplication {
  id: string;
  grant_id: string;
  centre_id: string;
  application_term: string;
  application_year: number;
  status: GrantApplicationStatus;
  amount_requested: number | null;
  amount_approved: number | null;
  amount_used: number;
  submitted_date: string | null;
  approved_date: string | null;
  funding_start_date: string | null;
  funding_end_date: string | null;
  bak_is_provider: boolean;
  application_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrantInvoiceAllocation {
  id: string;
  grant_application_id: string;
  invoice_id: string;
  amount_allocated: number;
  allocated_by: string | null;
  created_at: string;
}
