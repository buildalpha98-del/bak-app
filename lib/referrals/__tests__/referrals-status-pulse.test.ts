import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getReferralsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// The action fans out:
//   1. referral_codes head count where status='active'
//   2. referrals head count where status='converted' AND converted_at
//      >= Monday
//   3. referral_rewards head count where status='pending'
//   4. referral_config select('config_key') — to count drift

interface PulseFixture {
  activeCodesCount?: number;
  conversionsThisWeekCount?: number;
  pendingRewardsCount?: number;
  presentConfigKeys?: string[];
}

function installFixture(opts: PulseFixture) {
  const activeCodesCount = opts.activeCodesCount ?? 0;
  const conversionsThisWeekCount = opts.conversionsThisWeekCount ?? 0;
  const pendingRewardsCount = opts.pendingRewardsCount ?? 0;
  const presentConfigKeys = opts.presentConfigKeys ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "referral_codes") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () =>
            Promise.resolve({
              count: opts2?.head ? activeCodesCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "referrals") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? conversionsThisWeekCount : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "referral_rewards") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () =>
            Promise.resolve({
              count: opts2?.head ? pendingRewardsCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "referral_config") {
      return {
        select: () =>
          Promise.resolve({
            data: presentConfigKeys.map((k) => ({ config_key: k })),
            error: null,
          }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getReferralsStatusPulse", () => {
  it("returns shape for a fresh org — all keys missing means full drift", async () => {
    installFixture({});
    const pulse = await getReferralsStatusPulse();
    expect(pulse).toEqual({
      activeCodesCount: 0,
      conversionsThisWeekCount: 0,
      pendingRewardsCount: 0,
      // None of the 3 expected keys present → drift = 3.
      configDriftCount: 3,
    });
  });

  it("reports zero drift when all expected keys are present", async () => {
    installFixture({
      presentConfigKeys: [
        "parent_instant_reward",
        "parent_milestone",
        "centre_reward",
      ],
    });
    const pulse = await getReferralsStatusPulse();
    expect(pulse.configDriftCount).toBe(0);
  });

  it("reports partial drift when only some keys are present", async () => {
    installFixture({
      presentConfigKeys: ["parent_instant_reward"],
    });
    const pulse = await getReferralsStatusPulse();
    expect(pulse.configDriftCount).toBe(2);
  });

  it("passes active codes, conversions, and pending rewards through", async () => {
    installFixture({
      activeCodesCount: 12,
      conversionsThisWeekCount: 4,
      pendingRewardsCount: 7,
      presentConfigKeys: [
        "parent_instant_reward",
        "parent_milestone",
        "centre_reward",
      ],
    });
    const pulse = await getReferralsStatusPulse();
    expect(pulse).toEqual({
      activeCodesCount: 12,
      conversionsThisWeekCount: 4,
      pendingRewardsCount: 7,
      configDriftCount: 0,
    });
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getReferralsStatusPulse();
    expect(pulse).toEqual({
      activeCodesCount: 0,
      conversionsThisWeekCount: 0,
      pendingRewardsCount: 0,
      configDriftCount: 0,
    });
  });
});
