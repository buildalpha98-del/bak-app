/** Types for the scheduling solver */

export interface SchedulingCoach {
  id: string;
  name: string;
  phone: string | null;
  default_pay_rate: number | null;
  status: string;
  availability_slots: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    location_preferences: string[];
  }[];
  compliance_docs: {
    doc_type: string;
    status: string;
    expiry_date: string | null;
  }[];
  pay_rates: {
    session_type: string;
    rate: number;
    rate_unit: string;
  }[];
}

export interface SchedulingSession {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  centre_id: string;
  coach_id: string | null;
  sport: string;
  status: string;
  template_id: string | null;
}

export interface SchedulingCentre {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

export interface SchedulingPreferenceInput {
  coach_id: string;
  centre_id: string;
  preference_type: "preferred" | "avoid";
}

export interface SessionHistory {
  coach_id: string;
  centre_id: string;
  session_count: number;
}

export interface SchedulingInput {
  sessions: SchedulingSession[];
  coaches: SchedulingCoach[];
  centres: Map<string, SchedulingCentre>;
  preferences: SchedulingPreferenceInput[];
  history: SessionHistory[];
  currentAssignments: Map<string, SchedulingSession[]>; // coach_id -> sessions this week
}

export interface ScoringContext {
  input: SchedulingInput;
  runningAssignments: Map<string, SchedulingSession[]>; // mutable state during assignment
}

export interface AssignmentResult {
  sessionId: string;
  assignedCoachId: string | null;
  score: number;
  confidence: "green" | "amber" | "red";
  reasoning: string[];
  eligibleCoaches: { coachId: string; score: number; name: string }[];
}
