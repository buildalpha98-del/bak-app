import { describe, it, expect } from "vitest";
import {
  ABOUT_PAGE,
  adjacentPrograms,
  CONTACT_PAGE,
  ENQUIRE_PAGE,
  getProgram,
  HOMEPAGE,
  PROGRAMS,
  PROGRAMS_INDEX,
} from "../content";

describe("PROGRAMS integrity", () => {
  it("has unique slugs (duplicates would collide in generateStaticParams)", () => {
    const slugs = PROGRAMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(PROGRAMS.length);
  });

  it("gives every program a distinct accent colour", () => {
    const accents = PROGRAMS.map((p) => p.accent.color);
    expect(new Set(accents).size).toBe(PROGRAMS.length);
  });
});

/**
 * Every string that ends up in a page's <meta name="description">.
 * The homepage passes HOMEPAGE.heroSub; the rest each expose a
 * purpose-written `description`. Add new marketing pages here — the
 * guard is only worth having if it covers all of them.
 */
const META_DESCRIPTIONS: [name: string, text: string][] = [
  ["homepage", HOMEPAGE.heroSub],
  ["programs index", PROGRAMS_INDEX.description],
  ["about", ABOUT_PAGE.description],
  ["contact", CONTACT_PAGE.description],
  ["enquire", ENQUIRE_PAGE.description],
  ...PROGRAMS.map(
    (p): [string, string] => [`program: ${p.slug}`, p.metaDescription]
  ),
];

describe("meta descriptions", () => {
  it.each(META_DESCRIPTIONS)(
    "%s stays inside the ~155 char search cutoff",
    (_name, text) => {
      expect(text.length).toBeLessThanOrEqual(160);
    }
  );

  it("covers every marketing page (guard is useless if one slips through)", () => {
    expect(META_DESCRIPTIONS).toHaveLength(5 + PROGRAMS.length);
  });
});

describe("getProgram", () => {
  it("returns the program for a known slug", () => {
    expect(getProgram("childcare")?.title).toBe("Childcare Programs");
  });

  it("returns undefined for an unknown slug (drives notFound())", () => {
    expect(getProgram("not-a-program")).toBeUndefined();
  });
});

describe("adjacentPrograms", () => {
  it("returns the single neighbour for the first program", () => {
    expect(adjacentPrograms("childcare").map((p) => p.slug)).toEqual([
      "primary-school",
    ]);
  });

  it("returns both neighbours for a middle program", () => {
    expect(adjacentPrograms("high-school").map((p) => p.slug)).toEqual([
      "primary-school",
      "after-school",
    ]);
  });

  it("excludes holiday programs — every page links to /holiday-clinics instead", () => {
    expect(adjacentPrograms("after-school").map((p) => p.slug)).toEqual([
      "high-school",
    ]);
  });

  it("returns the neighbour for the last program", () => {
    expect(adjacentPrograms("holiday-programs").map((p) => p.slug)).toEqual([
      "after-school",
    ]);
  });

  it("returns nothing for an unknown slug", () => {
    expect(adjacentPrograms("not-a-program")).toEqual([]);
  });

  it("never links a program to itself", () => {
    for (const program of PROGRAMS) {
      expect(adjacentPrograms(program.slug).map((p) => p.slug)).not.toContain(
        program.slug
      );
    }
  });
});
