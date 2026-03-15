import type { Profile } from "@/lib/types/database";
import type { Centre } from "@/lib/types/database";
import type { Session } from "@/lib/types/database";
import type { Child } from "@/lib/types/database";
import type { Lead } from "@/lib/types/database";
import type { Booking, BookingChildEntry } from "@/lib/types/database";
import type { Payment } from "@/lib/types/database";

// ============================================================
// Test data factories
// ============================================================
// Each factory returns a fully typed object with sensible defaults.
// Use the `overrides` parameter to customise specific fields.

const AUSTRALIAN_NAMES = [
  "Liam Mitchell",
  "Olivia Thompson",
  "Noah Williams",
  "Charlotte Davis",
  "Jack Wilson",
  "Amelia Brown",
  "James Taylor",
  "Isla Anderson",
  "William Johnson",
  "Mia Thomas",
];

const SYDNEY_SUBURBS = [
  "Bankstown",
  "Liverpool",
  "Parramatta",
  "Penrith",
  "Campbelltown",
  "Fairfield",
  "Blacktown",
  "Hurstville",
  "Strathfield",
  "Burwood",
];

function randomName(): string {
  return AUSTRALIAN_NAMES[Math.floor(Math.random() * AUSTRALIAN_NAMES.length)];
}

function randomSuburb(): string {
  return SYDNEY_SUBURBS[Math.floor(Math.random() * SYDNEY_SUBURBS.length)];
}

function randomEmail(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ".")}+${Math.floor(Math.random() * 1000)}@example.com`;
}

function randomPhone(): string {
  return `04${Math.floor(10000000 + Math.random() * 90000000)}`;
}

// ============================================================
// Profile factory
// ============================================================

export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  const name = overrides.name ?? randomName();
  return {
    id: crypto.randomUUID(),
    email: randomEmail(name),
    name,
    phone: randomPhone(),
    address: `${Math.floor(1 + Math.random() * 200)} Main St, ${randomSuburb()} NSW 2000`,
    date_of_birth: "1995-06-15",
    emergency_contact_name: randomName(),
    emergency_contact_phone: randomPhone(),
    photo_url: null,
    abn: null,
    gst_registered: false,
    role: "coach",
    default_pay_rate: 40,
    status: "active",
    dnd_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Centre factory
// ============================================================

export function createMockCentre(overrides: Partial<Centre> = {}): Centre {
  const suburb = randomSuburb();
  return {
    id: crypto.randomUUID(),
    name: `${suburb} Early Learning Centre`,
    type: "childcare_centre",
    address: `${Math.floor(1 + Math.random() * 200)} Park Rd, ${suburb} NSW 2200`,
    latitude: -33.9 + Math.random() * 0.2,
    longitude: 150.9 + Math.random() * 0.2,
    primary_contact_name: randomName(),
    primary_contact_phone: randomPhone(),
    primary_contact_email: `admin@${suburb.toLowerCase()}elc.com.au`,
    primary_contact_role: "Centre Director",
    group_size: 20,
    age_groups: ["3-5", "5-8"],
    pricing_model: "centre_funded",
    agreed_rate: 150,
    session_preferences: {},
    contract_status: "active",
    status_changed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    send_feedback_emails: true,
    logo_url: null,
    branding_mode: "bak_branded",
    health_score: 75,
    health_status: "green",
    health_score_updated_at: new Date().toISOString(),
    churn_risk: false,
    profile_checklist_complete: true,
    converted_from_lead_id: null,
    ...overrides,
  };
}

// ============================================================
// Session factory
// ============================================================

export function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: crypto.randomUUID(),
    term_id: crypto.randomUUID(),
    template_id: null,
    date: "2026-03-15",
    time: "09:30",
    duration_minutes: 45,
    centre_id: crypto.randomUUID(),
    coach_id: crypto.randomUUID(),
    sport: "Soccer",
    program_id: null,
    equipment_kit_id: null,
    status: "confirmed",
    pay_rate_override: null,
    pay_rate_resolved: 40,
    cancellation_reason: null,
    started_at: null,
    completed_at: null,
    actual_duration_minutes: null,
    headcount: null,
    coach_notes: null,
    needs_ops_review: false,
    is_trial: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Child factory
// ============================================================

export function createMockChild(overrides: Partial<Child> = {}): Child {
  const firstName =
    ["Oliver", "Jack", "Ava", "Charlotte", "Liam", "Mia", "Noah", "Isla"][
      Math.floor(Math.random() * 8)
    ];
  const lastName =
    ["Smith", "Jones", "Williams", "Brown", "Taylor", "Wilson"][
      Math.floor(Math.random() * 6)
    ];

  return {
    id: crypto.randomUUID(),
    first_name: firstName,
    last_name: lastName,
    date_of_birth: "2020-04-10",
    age_group: "3-5",
    gender: "male",
    medical_notes: null,
    parent_name: randomName(),
    parent_phone: randomPhone(),
    parent_email: randomEmail(`${firstName} ${lastName}`),
    photo_url: null,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Coach factory (Profile with role: "coach")
// ============================================================

export function createMockCoach(overrides: Partial<Profile> = {}): Profile {
  return createMockProfile({
    role: "coach",
    default_pay_rate: 40,
    status: "active",
    ...overrides,
  });
}

// ============================================================
// Lead factory
// ============================================================

export function createMockLead(overrides: Partial<Lead> = {}): Lead {
  const suburb = randomSuburb();
  return {
    id: crypto.randomUUID(),
    centre_name: `${suburb} Kids Academy`,
    type: "childcare_centre",
    contact_name: randomName(),
    contact_email: `info@${suburb.toLowerCase()}kids.com.au`,
    contact_phone: randomPhone(),
    address: `${Math.floor(1 + Math.random() * 200)} High St, ${suburb} NSW 2200`,
    source: "manual",
    stage: "cold_lead",
    stage_changed_at: new Date().toISOString(),
    owner_id: null,
    estimated_value: 5000,
    notes: null,
    lost_reason: null,
    churn_reason: null,
    centre_id: null,
    trial_start_date: null,
    trial_end_date: null,
    trial_sessions_count: 0,
    trial_report_url: null,
    active_sequence_id: null,
    sequence_paused: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Booking factory
// ============================================================

export function createMockBooking(overrides: Partial<Booking> = {}): Booking {
  const childEntry: BookingChildEntry = {
    child_id: crypto.randomUUID(),
    child_name: "Oliver Smith",
    age_group: "5-8",
  };

  return {
    id: crypto.randomUUID(),
    bookable_session_id: crypto.randomUUID(),
    parent_id: crypto.randomUUID(),
    children_json: [childEntry],
    payment_type: "single_payment",
    payment_id: null,
    package_balance_id: null,
    total_cents: 2500,
    status: "confirmed",
    booked_at: new Date().toISOString(),
    cancelled_at: null,
    cancellation_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// Payment factory
// ============================================================

export function createMockPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: crypto.randomUUID(),
    parent_id: crypto.randomUUID(),
    booking_id: crypto.randomUUID(),
    package_id: null,
    amount_cents: 2500,
    payment_type: "session_booking",
    square_payment_id: null,
    square_order_id: null,
    status: "completed",
    refund_amount_cents: null,
    refunded_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
