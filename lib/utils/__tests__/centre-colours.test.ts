import { describe, it, expect } from "vitest";
import {
  CENTRE_COLOURS,
  centreColour,
  defaultCentreColour,
  isValidCentreColour,
} from "../centre-colours";

describe("defaultCentreColour", () => {
  it("is deterministic for a given id", () => {
    const id = "eae3d541-def2-493f-8fce-a144dce74dd1";
    expect(defaultCentreColour(id)).toBe(defaultCentreColour(id));
  });

  it("only ever returns a palette colour", () => {
    for (const id of ["a", "bb", "centre-123", "x".repeat(40)]) {
      expect(CENTRE_COLOURS).toContain(defaultCentreColour(id));
    }
  });
});

describe("centreColour", () => {
  it("uses the stored colour when it's a valid hex", () => {
    expect(centreColour({ id: "abc", colour: "#123456" })).toBe("#123456");
  });

  it("falls back to the deterministic default when colour is null", () => {
    expect(centreColour({ id: "abc", colour: null })).toBe(
      defaultCentreColour("abc"),
    );
  });

  it("falls back for a blank or malformed stored value", () => {
    // A legacy/garbage value must never reach the UI as an unparseable
    // border colour — the fallback keeps the card renderable.
    expect(centreColour({ id: "abc", colour: "" })).toBe(defaultCentreColour("abc"));
    expect(centreColour({ id: "abc", colour: "red" })).toBe(defaultCentreColour("abc"));
    expect(centreColour({ id: "abc", colour: "#12345" })).toBe(defaultCentreColour("abc"));
  });
});

describe("isValidCentreColour", () => {
  it("accepts a 6-digit hex", () => {
    expect(isValidCentreColour("#E8712A")).toBe(true);
    expect(isValidCentreColour("#abcdef")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidCentreColour("#fff")).toBe(false);
    expect(isValidCentreColour("E8712A")).toBe(false);
    expect(isValidCentreColour("blue")).toBe(false);
  });
});
