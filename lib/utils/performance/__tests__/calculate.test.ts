import { describe, it, expect, vi } from "vitest";

// Mock server dependencies so the module can be imported in tests
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

import {
  normaliseMetrics,
  calculateOverallScore,
  METRIC_WEIGHTS,
} from "../calculate";
import type { CoachMetrics } from "@/lib/types/database";

// ============================================================
// Test fixtures
// ============================================================

function makeMetrics(overrides: Partial<CoachMetrics> = {}): CoachMetrics {
  return {
    session_volume: { count: 10, trend: 0.5, previous_count: 7 },
    feedback_rating: { average: 4.2, team_average: 4.0, trend: 0.1, count: 8 },
    attendance_consistency: { average_per_session: 12, trend: "stable" },
    form_completion: { rate: 85, expected: 20, actual: 17 },
    punctuality: { average_minutes: 2, late_count: 1, total_tracked: 10 },
    shift_reliability: { rate: 95, completed: 19, total: 20, cancellations: 1 },
    assessment_thoroughness: { std_dev: 1.0, avg_rating: 3.5, total_ratings: 40, flagged: false },
    equipment_responsibility: { issue_rate: 5, issues: 1, checkins: 20 },
    ...overrides,
  };
}

// ============================================================
// METRIC_WEIGHTS
// ============================================================

describe("METRIC_WEIGHTS", () => {
  it("should sum to 1.0", () => {
    const sum = Object.values(METRIC_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("should have 8 metrics", () => {
    expect(Object.keys(METRIC_WEIGHTS)).toHaveLength(8);
  });
});

// ============================================================
// normaliseMetrics
// ============================================================

describe("normaliseMetrics", () => {
  it("should normalise session_volume: 20 sessions = 100", () => {
    const metrics = makeMetrics({ session_volume: { count: 20, trend: 0, previous_count: 15 } });
    const result = normaliseMetrics(metrics);
    expect(result.session_volume).toBe(100);
  });

  it("should cap session_volume at 100 for > 20 sessions", () => {
    const metrics = makeMetrics({ session_volume: { count: 40, trend: 0, previous_count: 0 } });
    const result = normaliseMetrics(metrics);
    expect(result.session_volume).toBe(100);
  });

  it("should normalise session_volume proportionally for < 20", () => {
    const metrics = makeMetrics({ session_volume: { count: 10, trend: 0, previous_count: 0 } });
    const result = normaliseMetrics(metrics);
    expect(result.session_volume).toBe(50);
  });

  it("should normalise feedback_rating: 5.0 = 100", () => {
    const metrics = makeMetrics({
      feedback_rating: { average: 5.0, team_average: 4.0, trend: 0, count: 10 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.feedback_rating).toBe(100);
  });

  it("should normalise feedback_rating proportionally", () => {
    const metrics = makeMetrics({
      feedback_rating: { average: 4.0, team_average: 3.5, trend: 0, count: 5 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.feedback_rating).toBe(80);
  });

  it("should normalise attendance_consistency: 15 kids = 100", () => {
    const metrics = makeMetrics({
      attendance_consistency: { average_per_session: 15, trend: "stable" },
    });
    const result = normaliseMetrics(metrics);
    expect(result.attendance_consistency).toBe(100);
  });

  it("should cap attendance at 100 for > 15", () => {
    const metrics = makeMetrics({
      attendance_consistency: { average_per_session: 25, trend: "growing" },
    });
    const result = normaliseMetrics(metrics);
    expect(result.attendance_consistency).toBe(100);
  });

  it("should pass through form_completion rate as-is", () => {
    const metrics = makeMetrics({ form_completion: { rate: 75, expected: 20, actual: 15 } });
    const result = normaliseMetrics(metrics);
    expect(result.form_completion).toBe(75);
  });

  it("should normalise punctuality: 0 minutes late = 100", () => {
    const metrics = makeMetrics({
      punctuality: { average_minutes: 0, late_count: 0, total_tracked: 10 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.punctuality).toBe(100);
  });

  it("should decrease punctuality by 10 per minute late", () => {
    const metrics = makeMetrics({
      punctuality: { average_minutes: 3, late_count: 2, total_tracked: 10 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.punctuality).toBe(70);
  });

  it("should floor punctuality at 0 for very late", () => {
    const metrics = makeMetrics({
      punctuality: { average_minutes: 15, late_count: 10, total_tracked: 10 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.punctuality).toBe(0);
  });

  it("should pass through shift_reliability rate", () => {
    const metrics = makeMetrics({
      shift_reliability: { rate: 90, completed: 9, total: 10, cancellations: 1 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.shift_reliability).toBe(90);
  });

  it("should flag assessment_thoroughness with low std_dev as 40", () => {
    const metrics = makeMetrics({
      assessment_thoroughness: { std_dev: 0.3, avg_rating: 3.0, total_ratings: 50, flagged: true },
    });
    const result = normaliseMetrics(metrics);
    expect(result.assessment_thoroughness).toBe(40);
  });

  it("should normalise assessment_thoroughness by std_dev / 1.5 when not flagged", () => {
    const metrics = makeMetrics({
      assessment_thoroughness: { std_dev: 1.5, avg_rating: 3.5, total_ratings: 40, flagged: false },
    });
    const result = normaliseMetrics(metrics);
    expect(result.assessment_thoroughness).toBe(100);
  });

  it("should normalise equipment_responsibility: 0 issue rate = 100", () => {
    const metrics = makeMetrics({
      equipment_responsibility: { issue_rate: 0, issues: 0, checkins: 10 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.equipment_responsibility).toBe(100);
  });

  it("should decrease equipment score by 20 per issue_rate point", () => {
    const metrics = makeMetrics({
      equipment_responsibility: { issue_rate: 3, issues: 3, checkins: 100 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.equipment_responsibility).toBe(40);
  });

  it("should floor equipment at 0 for high issue rate", () => {
    const metrics = makeMetrics({
      equipment_responsibility: { issue_rate: 10, issues: 10, checkins: 100 },
    });
    const result = normaliseMetrics(metrics);
    expect(result.equipment_responsibility).toBe(0);
  });
});

// ============================================================
// calculateOverallScore
// ============================================================

describe("calculateOverallScore", () => {
  it("should return 100 when all metrics are 100", () => {
    const normalised: Record<string, number> = {
      session_volume: 100,
      feedback_rating: 100,
      attendance_consistency: 100,
      form_completion: 100,
      punctuality: 100,
      shift_reliability: 100,
      assessment_thoroughness: 100,
      equipment_responsibility: 100,
    };
    const score = calculateOverallScore(normalised);
    expect(score).toBeCloseTo(100, 5);
  });

  it("should return 0 when all metrics are 0", () => {
    const normalised: Record<string, number> = {
      session_volume: 0,
      feedback_rating: 0,
      attendance_consistency: 0,
      form_completion: 0,
      punctuality: 0,
      shift_reliability: 0,
      assessment_thoroughness: 0,
      equipment_responsibility: 0,
    };
    const score = calculateOverallScore(normalised);
    expect(score).toBe(0);
  });

  it("should weight feedback_rating at 20%", () => {
    const normalised: Record<string, number> = {
      session_volume: 0,
      feedback_rating: 100,
      attendance_consistency: 0,
      form_completion: 0,
      punctuality: 0,
      shift_reliability: 0,
      assessment_thoroughness: 0,
      equipment_responsibility: 0,
    };
    const score = calculateOverallScore(normalised);
    expect(score).toBeCloseTo(20, 5);
  });

  it("should weight shift_reliability at 20%", () => {
    const normalised: Record<string, number> = {
      session_volume: 0,
      feedback_rating: 0,
      attendance_consistency: 0,
      form_completion: 0,
      punctuality: 0,
      shift_reliability: 100,
      assessment_thoroughness: 0,
      equipment_responsibility: 0,
    };
    const score = calculateOverallScore(normalised);
    expect(score).toBeCloseTo(20, 5);
  });

  it("should correctly combine weighted metrics", () => {
    const normalised: Record<string, number> = {
      session_volume: 50,      // 50 * 0.10 = 5
      feedback_rating: 80,     // 80 * 0.20 = 16
      attendance_consistency: 60, // 60 * 0.10 = 6
      form_completion: 90,     // 90 * 0.15 = 13.5
      punctuality: 70,         // 70 * 0.15 = 10.5
      shift_reliability: 95,   // 95 * 0.20 = 19
      assessment_thoroughness: 100, // 100 * 0.05 = 5
      equipment_responsibility: 100, // 100 * 0.05 = 5
    };
    const score = calculateOverallScore(normalised);
    expect(score).toBeCloseTo(80, 0);
  });
});

// ============================================================
// Integration: normalise + score pipeline
// ============================================================

describe("normaliseMetrics → calculateOverallScore pipeline", () => {
  it("should produce a perfect score for ideal metrics", () => {
    const metrics = makeMetrics({
      session_volume: { count: 25, trend: 0, previous_count: 20 },
      feedback_rating: { average: 5.0, team_average: 4.0, trend: 0.5, count: 20 },
      attendance_consistency: { average_per_session: 20, trend: "growing" },
      form_completion: { rate: 100, expected: 50, actual: 50 },
      punctuality: { average_minutes: 0, late_count: 0, total_tracked: 25 },
      shift_reliability: { rate: 100, completed: 25, total: 25, cancellations: 0 },
      assessment_thoroughness: { std_dev: 1.5, avg_rating: 3.5, total_ratings: 100, flagged: false },
      equipment_responsibility: { issue_rate: 0, issues: 0, checkins: 25 },
    });
    const normalised = normaliseMetrics(metrics);
    const score = calculateOverallScore(normalised);
    expect(score).toBeCloseTo(100, 0);
  });

  it("should produce a low score for poor metrics", () => {
    const metrics = makeMetrics({
      session_volume: { count: 2, trend: -0.5, previous_count: 4 },
      feedback_rating: { average: 2.0, team_average: 4.0, trend: -1.0, count: 2 },
      attendance_consistency: { average_per_session: 3, trend: "declining" },
      form_completion: { rate: 20, expected: 4, actual: 1 },
      punctuality: { average_minutes: 8, late_count: 2, total_tracked: 2 },
      shift_reliability: { rate: 50, completed: 2, total: 4, cancellations: 2 },
      assessment_thoroughness: { std_dev: 0.2, avg_rating: 3.0, total_ratings: 10, flagged: true },
      equipment_responsibility: { issue_rate: 8, issues: 4, checkins: 50 },
    });
    const normalised = normaliseMetrics(metrics);
    const score = calculateOverallScore(normalised);
    expect(score).toBeLessThan(40);
  });

  it("should handle zero sessions gracefully", () => {
    const metrics = makeMetrics({
      session_volume: { count: 0, trend: 0, previous_count: 0 },
      feedback_rating: { average: 0, team_average: 0, trend: 0, count: 0 },
      attendance_consistency: { average_per_session: 0, trend: "stable" },
      form_completion: { rate: 100, expected: 0, actual: 0 },
      punctuality: { average_minutes: 0, late_count: 0, total_tracked: 0 },
      shift_reliability: { rate: 100, completed: 0, total: 0, cancellations: 0 },
      assessment_thoroughness: { std_dev: 0, avg_rating: 0, total_ratings: 0, flagged: false },
      equipment_responsibility: { issue_rate: 0, issues: 0, checkins: 0 },
    });
    const normalised = normaliseMetrics(metrics);
    const score = calculateOverallScore(normalised);
    // form_completion=100, punctuality=100, reliability=100, equipment=100, rest=0
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
