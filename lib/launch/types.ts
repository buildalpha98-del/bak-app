// ============================================================
// Launch Foundation — TypeScript types for all new tables
// ============================================================

// ========================
// Email Log
// ========================
export type EmailType =
  | 'booking_confirmation'
  | 'payment_receipt'
  | 'welcome'
  | 'roster_assignment'
  | 'roster_change'
  | 'weekly_schedule'
  | 'session_reminder'
  | 'feedback_request'
  | 'invitation';

export interface EmailLog {
  id: string;
  recipient_email: string;
  recipient_id: string | null;
  email_type: EmailType;
  subject: string;
  status: 'sent' | 'failed' | 'bounced';
  metadata: Record<string, unknown>;
  sent_at: string;
  created_at: string;
}

// ========================
// Notifications (extended — existing table with new columns)
// ========================
export type NotificationType =
  | 'booking_confirmed'
  | 'payment_received'
  | 'session_completed'
  | 'session_reminder'
  | 'roster_assigned'
  | 'roster_changed'
  | 'child_update'
  | 'invoice_ready'
  | 'general';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  tier: 'urgent' | 'important' | 'informational';
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  action_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ========================
// Attendance
// ========================
export type AttendanceStatus = 'present' | 'absent' | 'walk_in';

export interface Attendance {
  id: string;
  session_id: string;
  child_id: string;
  status: AttendanceStatus;
  marked_by: string;
  marked_at: string;
  parent_name: string | null;
  parent_phone: string | null;
}

// ========================
// Session Notes
// ========================
export interface SessionNote {
  id: string;
  session_id: string;
  coach_id: string;
  general_notes: string | null;
  rating: number | null;
  completed_at: string;
  created_at: string;
}

// ========================
// Session Photos
// ========================
export interface SessionPhoto {
  id: string;
  session_id: string;
  uploaded_by: string;
  storage_path: string;
  created_at: string;
}

// ========================
// Child Observations
// ========================
export interface ChildObservation {
  id: string;
  session_id: string;
  child_id: string;
  coach_id: string;
  observation: string;
  created_at: string;
}

// ========================
// Invitations
// ========================
export type InvitationRole = 'parent' | 'centre_director' | 'coach';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'failed';

export interface Invitation {
  id: string;
  name: string;
  email: string;
  role: InvitationRole;
  centre_id: string | null;
  school_id: string | null;
  status: InvitationStatus;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

// ========================
// Invoices
// ========================
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  invoice_number: string;
  centre_id: string | null;
  school_id: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  gst: number;
  total: number;
  status: InvoiceStatus;
  payment_date: string | null;
  pdf_storage_path: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

// ========================
// Invoice Line Items
// ========================
export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  session_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

// ========================
// Reminder Log
// ========================
export type ReminderType = 'parent_24hr' | 'coach_24hr';

export interface ReminderLog {
  id: string;
  session_id: string;
  reminder_type: ReminderType;
  recipient_id: string;
  sent_at: string;
}

// ========================
// Email Template types (for sendTemplatedEmail)
// ========================
export type EmailTemplate =
  | 'welcome_parent'
  | 'welcome_coach'
  | 'welcome_centre'
  | 'booking_confirmation'
  | 'booking_cancellation'
  | 'payment_receipt'
  | 'package_confirmation'
  | 'session_reminder_parent'
  | 'session_reminder_coach'
  | 'roster_assignment'
  | 'roster_change'
  | 'weekly_schedule'
  | 'feedback_request'
  | 'invoice_ready'
  | 'invitation';

// ========================
// Calculated invoice types (for invoice-generator)
// ========================
export interface CentreInvoiceLineItem {
  sessionId: string;
  date: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CentreInvoiceCalculation {
  lineItems: CentreInvoiceLineItem[];
  subtotal: number;
  gst: number;
  total: number;
}

export interface SchoolInvoiceLineItem {
  sessionId: string;
  date: string;
  description: string;
  childCount: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SchoolInvoiceCalculation {
  lineItems: SchoolInvoiceLineItem[];
  subtotal: number;
  gst: number;
  total: number;
}
