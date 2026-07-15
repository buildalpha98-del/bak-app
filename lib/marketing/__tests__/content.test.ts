import { describe, it, expect } from "vitest";
import {
  ABOUT_PAGE,
  adjacentPrograms,
  BLOG_INDEX,
  CONTACT_PAGE,
  ENQUIRE_PAGE,
  getProgram,
  HOMEPAGE,
  META_DESCRIPTION_MAX,
  PROGRAMS,
  PROGRAMS_INDEX,
  truncateDescription,
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
  ["blog index", BLOG_INDEX.description],
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
    expect(META_DESCRIPTIONS).toHaveLength(6 + PROGRAMS.length);
  });
});

/**
 * The blog's own descriptions can't join the list above — they come
 * from the database, where the admin editor allows a seo_description of
 * up to 200 chars and an excerpt of any length at all. This clamp is
 * what keeps /blog/[slug] inside the cutoff, so it carries the same
 * guarantee the static list gets from a test.
 */
describe("truncateDescription", () => {
  it("leaves a description already inside the limit untouched", () => {
    expect(truncateDescription("Short and sweet.")).toBe("Short and sweet.");
  });

  it("never returns more than the limit, ellipsis included", () => {
    const long = "word ".repeat(80);
    expect(truncateDescription(long).length).toBeLessThanOrEqual(
      META_DESCRIPTION_MAX
    );
  });

  it("clamps a 200-char seo_description — the editor's actual ceiling", () => {
    const atEditorMax = "a".repeat(40) + " " + "b".repeat(159);
    expect(atEditorMax).toHaveLength(200);
    expect(truncateDescription(atEditorMax).length).toBeLessThanOrEqual(
      META_DESCRIPTION_MAX
    );
  });

  it("breaks on a word boundary rather than mid-word", () => {
    const text = "Multi-sport coaching " + "x".repeat(200);
    // The 200-x run can't fit, so the break lands after the last word
    // that does — nothing is half-severed.
    expect(truncateDescription(text)).toBe("Multi-sport coaching…");
  });

  it("falls back to a hard clip when one word exceeds the budget", () => {
    const result = truncateDescription("y".repeat(300));
    expect(result.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(result.endsWith("…")).toBe(true);
    // Not just a lone ellipsis — the text still has to say something.
    expect(result.length).toBeGreaterThan(100);
  });

  it("drops dangling punctuation before the ellipsis", () => {
    const text = "Coaching notes, tips and news, " + "z".repeat(200);
    expect(truncateDescription(text)).toBe("Coaching notes, tips and news…");
  });

  it("collapses whitespace so newlines can't reach a meta tag", () => {
    expect(truncateDescription("one\n\ntwo   three")).toBe("one two three");
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
