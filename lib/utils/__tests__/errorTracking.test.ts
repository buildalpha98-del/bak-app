import { describe, it, expect, vi, beforeEach } from "vitest";

const { captureException, captureMessage } = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException, captureMessage }));

import {
  captureError,
  captureMessage as reportMessage,
} from "../errorTracking";

beforeEach(() => vi.clearAllMocks());

describe("captureError", () => {
  it("sends an exception to Sentry at error level by default", () => {
    captureError(new Error("boom"), { action: "getTasks" });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
    expect(opts.level).toBe("error");
    expect(opts.tags).toEqual({ action: "getTasks" });
  });

  // The escalation the "only hard-down" alert rule keys on: fatal is what
  // pages Jayden. If this default ever flips, every alert goes silent.
  it("escalates to fatal when asked", () => {
    captureError(new Error("db down"), { fatal: true });
    expect(captureException.mock.calls[0][1].level).toBe("fatal");
  });

  it("wraps a non-Error value so Sentry always gets an Error", () => {
    captureError("just a string");
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(captureException.mock.calls[0][0].message).toBe("just a string");
  });

  it("attaches the user id when given", () => {
    captureError(new Error("x"), { userId: "u1" });
    expect(captureException.mock.calls[0][1].user).toEqual({ id: "u1" });
  });
});

describe("captureMessage", () => {
  it("reports at warning level by default", () => {
    reportMessage("something odd");
    expect(captureMessage).toHaveBeenCalledWith("something odd", {
      level: "warning",
      user: undefined,
      tags: undefined,
      extra: undefined,
    });
  });

  it("escalates to fatal when asked", () => {
    reportMessage("login loop", { fatal: true });
    expect(captureMessage.mock.calls[0][1].level).toBe("fatal");
  });
});
