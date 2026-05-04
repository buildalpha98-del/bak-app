import { describe, it, expect } from "vitest";
import {
  computeSessionVariance,
  varianceLabel,
  type VarianceInput,
} from "../variance";

const SESSION_DATE = "2026-05-04";
const SESSION_TIME = "09:00";
const DURATION = 45; // scheduled end at 09:45

function tsAt(date: string, hh: number, mm: number): string {
  // Local-time ISO so it matches how started_at lands when constructed
  // from `${date}T${time}` with no tz suffix.
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

function input(overrides: Partial<VarianceInput> = {}): VarianceInput {
  return {
    date: SESSION_DATE,
    time: SESSION_TIME,
    duration_minutes: DURATION,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

describe("computeSessionVariance", () => {
  it("returns 'none' when not started", () => {
    const v = computeSessionVariance(input());
    expect(v.status).toBe("none");
    expect(v.startDeltaMin).toBeNull();
    expect(v.endDeltaMin).toBeNull();
  });

  it("returns 'active' when started but not completed", () => {
    const v = computeSessionVariance(
      input({ started_at: tsAt(SESSION_DATE, 9, 3) }),
    );
    expect(v.status).toBe("active");
    expect(v.startDeltaMin).toBe(3);
    expect(v.endDeltaMin).toBeNull();
  });

  it("returns 'on-time' for actualStart within ±5 minutes", () => {
    expect(
      computeSessionVariance(
        input({
          started_at: tsAt(SESSION_DATE, 9, 0),
          completed_at: tsAt(SESSION_DATE, 9, 45),
        }),
      ).status,
    ).toBe("on-time");

    expect(
      computeSessionVariance(
        input({
          started_at: tsAt(SESSION_DATE, 9, 5),
          completed_at: tsAt(SESSION_DATE, 9, 50),
        }),
      ).status,
    ).toBe("on-time");

    expect(
      computeSessionVariance(
        input({
          started_at: tsAt(SESSION_DATE, 8, 55),
          completed_at: tsAt(SESSION_DATE, 9, 40),
        }),
      ).status,
    ).toBe("on-time");
  });

  it("returns 'early' when actualStart is more than 5 minutes before scheduled", () => {
    const v = computeSessionVariance(
      input({
        started_at: tsAt(SESSION_DATE, 8, 50),
        completed_at: tsAt(SESSION_DATE, 9, 35),
      }),
    );
    expect(v.status).toBe("early");
    expect(v.startDeltaMin).toBe(-10);
  });

  it("returns 'late' for 6–29 minutes after scheduled start", () => {
    expect(
      computeSessionVariance(
        input({
          started_at: tsAt(SESSION_DATE, 9, 6),
          completed_at: tsAt(SESSION_DATE, 9, 51),
        }),
      ).status,
    ).toBe("late");

    expect(
      computeSessionVariance(
        input({
          started_at: tsAt(SESSION_DATE, 9, 29),
          completed_at: tsAt(SESSION_DATE, 10, 14),
        }),
      ).status,
    ).toBe("late");
  });

  it("returns 'very-late' for 30+ minutes late", () => {
    const v = computeSessionVariance(
      input({
        started_at: tsAt(SESSION_DATE, 9, 30),
        completed_at: tsAt(SESSION_DATE, 10, 15),
      }),
    );
    expect(v.status).toBe("very-late");
    expect(v.startDeltaMin).toBe(30);
  });

  it("computes endDeltaMin correctly when completed", () => {
    const v = computeSessionVariance(
      input({
        started_at: tsAt(SESSION_DATE, 9, 0),
        completed_at: tsAt(SESSION_DATE, 10, 0),
      }),
    );
    expect(v.endDeltaMin).toBe(15); // 15 min after scheduled end (09:45)
  });

  it("handles 'HH:mm:ss' Postgres time strings", () => {
    const v = computeSessionVariance(
      input({
        time: "09:00:00",
        started_at: tsAt(SESSION_DATE, 9, 2),
        completed_at: tsAt(SESSION_DATE, 9, 47),
      }),
    );
    expect(v.status).toBe("on-time");
    expect(v.startDeltaMin).toBe(2);
  });

  it("never reports 'early' or 'late' while still active (mid-shift glance is just 'active')", () => {
    const v = computeSessionVariance(
      input({ started_at: tsAt(SESSION_DATE, 9, 30), completed_at: null }),
    );
    expect(v.status).toBe("active");
    expect(v.startDeltaMin).toBe(30); // delta still surfaced for tooltip
  });
});

describe("varianceLabel", () => {
  it("renders the pill text for each status", () => {
    expect(varianceLabel({ status: "none", startDeltaMin: null, endDeltaMin: null })).toBe("—");
    expect(varianceLabel({ status: "active", startDeltaMin: 3, endDeltaMin: null })).toBe("active");
    expect(varianceLabel({ status: "on-time", startDeltaMin: 0, endDeltaMin: 0 })).toBe("+0");
    expect(varianceLabel({ status: "late", startDeltaMin: 12, endDeltaMin: 12 })).toBe("+12m");
    expect(varianceLabel({ status: "very-late", startDeltaMin: 35, endDeltaMin: 35 })).toBe("+35m");
    expect(varianceLabel({ status: "early", startDeltaMin: -8, endDeltaMin: -8 })).toBe("-8m");
  });
});
