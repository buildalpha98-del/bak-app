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
  AnnouncementAudience,
  DocumentCategory,
  DocumentVisibility,
  TaskPriority,
  NotificationChannel,
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
  qb_customer_id: string | null;
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
  created_at: string;
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
  qb_invoice_id: string | null;
  invoice_number: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
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
  content: string;
  created_at: string;
}

// ========================
// 22. direct_messages
// ========================
export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
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
  rating: number;
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
  integration_tokens: IntegrationToken;
  task_columns: TaskColumn;
  task_activity: TaskActivity;
}

// ========================
// Integration Tokens
// ========================
export interface IntegrationToken {
  id: string;
  provider: string;
  realm_id: string | null;
  token_expiry: string;
  company_name: string | null;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
}
