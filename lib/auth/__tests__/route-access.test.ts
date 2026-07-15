import { describe, it, expect } from "vitest";
import {
  isFinancialRoute,
  parseRoleHint,
  serializeRoleHint,
  FINANCIAL_ROUTES,
} from "../route-access";

const USER = "eae3d541-def2-493f-8fce-a144dce74dd1";

describe("isFinancialRoute", () => {
  it.each(FINANCIAL_ROUTES)("gates %s exactly", (route) => {
    expect(isFinancialRoute(route)).toBe(true);
  });

  it("gates nested paths under a financial section", () => {
    expect(isFinancialRoute("/admin/payroll/batch/123")).toBe(true);
    expect(isFinancialRoute("/admin/staff/rate-card/edit")).toBe(true);
  });

  it("does not gate the non-financial pages Abdul uses daily", () => {
    for (const p of [
      "/admin",
      "/admin/roster",
      "/admin/staff",
      "/admin/programs",
      "/coach",
      "/ops",
    ]) {
      expect(isFinancialRoute(p), `${p} must not be gated`).toBe(false);
    }
  });

  it("matches on a segment boundary, not a bare prefix", () => {
    // Would wrongly gate an unrelated future route.
    expect(isFinancialRoute("/admin/payrollx")).toBe(false);
    expect(isFinancialRoute("/admin/analytics-export")).toBe(false);
  });

  it("does not gate /ops/analytics — only /ops/invoicing is financial", () => {
    expect(isFinancialRoute("/ops/analytics")).toBe(false);
    expect(isFinancialRoute("/ops/invoicing")).toBe(true);
  });
});

describe("parseRoleHint", () => {
  it("round-trips a serialized hint", () => {
    const raw = serializeRoleHint(USER, "admin", "active", true);
    expect(parseRoleHint(raw, USER)).toEqual({
      role: "admin",
      status: "active",
      financialAccess: true,
    });
  });

  it("round-trips financialAccess=false (Abdul's case)", () => {
    const raw = serializeRoleHint(USER, "admin", "active", false);
    expect(parseRoleHint(raw, USER)).toEqual({
      role: "admin",
      status: "active",
      financialAccess: false,
    });
  });

  it("rejects a hint minted for a different user", () => {
    const raw = serializeRoleHint("someone-else", "admin", "active", true);
    expect(parseRoleHint(raw, USER)).toBeNull();
  });

  // The pre-migration format had no financial_access field. Reading one
  // as "has access" would hand a denied user the financial sections for
  // up to the cookie's lifetime; null just means "ask the database".
  it("rejects a legacy 3-field hint rather than assuming access", () => {
    expect(parseRoleHint(`${USER}:admin:active`, USER)).toBeNull();
  });

  it("rejects junk, empty and missing values", () => {
    expect(parseRoleHint(undefined, USER)).toBeNull();
    expect(parseRoleHint("", USER)).toBeNull();
    expect(parseRoleHint("garbage", USER)).toBeNull();
    expect(parseRoleHint(`${USER}::active:1`, USER)).toBeNull();
    expect(parseRoleHint(`${USER}:admin::1`, USER)).toBeNull();
  });

  it("rejects a non-boolean financial flag instead of coercing it", () => {
    expect(parseRoleHint(`${USER}:admin:active:true`, USER)).toBeNull();
    expect(parseRoleHint(`${USER}:admin:active:2`, USER)).toBeNull();
  });
});
