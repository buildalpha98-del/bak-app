import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Any database touch is a failure: the consent checks must reject the
// request before a client is even created.
const { createServerClient, createAdmin } = vi.hoisted(() => ({
  createServerClient: vi.fn(() => {
    throw new Error("server client created before consent was checked");
  }),
  createAdmin: vi.fn(() => {
    throw new Error("admin client created before consent was checked");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createServerClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: createAdmin,
}));

import { completeParentRegistration, type RegistrationData } from "../actions";

const BASE: RegistrationData = {
  first_name: "Sam",
  last_name: "Parent",
  children: [
    { first_name: "Kid", last_name: "Parent", date_of_birth: "2020-01-01" },
  ],
  terms_accepted: true,
  confirmed_over_18: true,
};

describe("completeParentRegistration consent checks", () => {
  beforeEach(() => {
    createServerClient.mockClear();
    createAdmin.mockClear();
  });

  it("refuses a registration without the 18+ confirmation", async () => {
    const res = await completeParentRegistration({
      ...BASE,
      confirmed_over_18: false,
    });
    expect(res.error).toBe("You must be 18 or over to create an account.");
    expect(createServerClient).not.toHaveBeenCalled();
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it("refuses a registration without accepted terms", async () => {
    const res = await completeParentRegistration({
      ...BASE,
      terms_accepted: false,
    });
    expect(res.error).toBe("Please accept the terms to continue.");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("refuses a payload that omits the field entirely", async () => {
    const { confirmed_over_18: _omit, ...rest } = BASE;
    const res = await completeParentRegistration(
      rest as unknown as RegistrationData
    );
    expect(res.error).toBe("You must be 18 or over to create an account.");
  });
});
