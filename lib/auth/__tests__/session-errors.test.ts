import { describe, expect, it } from "vitest";
import { isRevokedSessionError } from "@/lib/auth/session-errors";

describe("isRevokedSessionError", () => {
  it("returns false for AuthSessionMissingError — the normal anonymous state", () => {
    expect(
      isRevokedSessionError({
        name: "AuthSessionMissingError",
        status: 400,
        code: undefined,
      })
    ).toBe(false);
  });

  it("returns true for a banned user", () => {
    expect(
      isRevokedSessionError({
        name: "AuthApiError",
        code: "user_banned",
        status: 403,
      })
    ).toBe(true);
  });

  it("returns true for a rotated-away refresh token", () => {
    expect(
      isRevokedSessionError({
        name: "AuthApiError",
        code: "refresh_token_not_found",
        status: 400,
      })
    ).toBe(true);
  });

  it("returns true for a plain 400 AuthApiError (malformed/invalid token)", () => {
    expect(
      isRevokedSessionError({ name: "AuthApiError", status: 400 })
    ).toBe(true);
  });

  it("returns false for server errors and unknown failures", () => {
    expect(
      isRevokedSessionError({ name: "AuthRetryableFetchError", status: 500 })
    ).toBe(false);
    expect(isRevokedSessionError({})).toBe(false);
  });
});
