import { describe, it, expect } from "vitest";
import { phoneHref, SITE } from "@/lib/marketing/content";

describe("phoneHref", () => {
  it("converts an AU mobile to E.164, dropping the leading 0", () =>
    expect(phoneHref("0426 722 003")).toBe("tel:+61426722003"));
  it("strips every non-digit", () =>
    expect(phoneHref("(02) 9876-5432")).toBe("tel:+61298765432"));
  it("leaves an already-international number alone", () =>
    expect(phoneHref("+61 426 722 003")).toBe("tel:+61426722003"));
  it("defaults to the real SITE.phone", () =>
    expect(phoneHref()).toBe("tel:+61426722003"));
  it("SITE.phone carries no placeholder", () =>
    expect(SITE.phone).not.toContain("TODO-CONFIRM"));
  it("SITE.abn carries no placeholder", () =>
    expect(SITE.abn).not.toContain("TODO-CONFIRM"));
});
