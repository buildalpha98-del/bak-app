import { describe, it, expect } from "vitest";
import { safeFetch } from "../safe-fetch";

describe("safeFetch", () => {
  it("passes through the resolved value", async () =>
    expect(await safeFetch(async () => [1, 2], [])).toEqual([1, 2]));

  it("resolves to the fallback when the fetch rejects", async () =>
    expect(
      await safeFetch(async () => {
        throw new Error("db down");
      }, "fallback")
    ).toBe("fallback"));
});
