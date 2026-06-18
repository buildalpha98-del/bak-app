import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { updateAppBadge, isBadgingSupported } from "../badge";

// ============================================================
// badge.test.ts — 5 cases
// ============================================================
// Covers the three primary code paths in `updateAppBadge` plus the
// feature-detect helper. Vitest uses a Node test env so `navigator`
// has to be mocked onto globalThis.

describe("updateAppBadge", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    // Reset to a clean slate so individual tests can attach the
    // shape of navigator they need.
    // @ts-expect-error — assignment is intentional for test setup
    delete globalThis.navigator;
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    } else {
      // @ts-expect-error — restore unset state
      delete globalThis.navigator;
    }
  });

  it("calls setAppBadge with the count when count > 0", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { setAppBadge, clearAppBadge },
      configurable: true,
      writable: true,
    });

    await updateAppBadge(7);

    expect(setAppBadge).toHaveBeenCalledWith(7);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it("calls clearAppBadge when count is 0", async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { setAppBadge, clearAppBadge },
      configurable: true,
      writable: true,
    });

    await updateAppBadge(0);

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it("is a no-op when the Badging API is unsupported", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });

    await expect(updateAppBadge(5)).resolves.toBeUndefined();
  });

  it("swallows errors thrown by setAppBadge (e.g. permission denied)", async () => {
    const setAppBadge = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(globalThis, "navigator", {
      value: { setAppBadge },
      configurable: true,
      writable: true,
    });

    // The whole point is that the caller doesn't need a try/catch.
    await expect(updateAppBadge(3)).resolves.toBeUndefined();
  });

  it("isBadgingSupported reflects feature detection", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { setAppBadge: vi.fn() },
      configurable: true,
      writable: true,
    });
    expect(isBadgingSupported()).toBe(true);

    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(isBadgingSupported()).toBe(false);
  });
});
