import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";

// The component module imports a "use server" actions file, which drags in
// the Supabase server client. The markdown styling map is pure presentation
// and needs none of it.
vi.mock("@/lib/announcements/actions", () => ({
  getAnnouncementDetail: vi.fn(),
}));

import { MARKDOWN_COMPONENTS } from "../announcement-detail";

const FIXTURE = [
  "# Heading one",
  "",
  "## Heading two",
  "",
  "### Heading three",
  "",
  "First paragraph with **bold** and *italic* text.",
  "",
  "Second paragraph, which must not collide with the first.",
  "",
  "- First bullet",
  "- Second bullet",
  "",
  "1. First numbered",
  "2. Second numbered",
  "",
  "> A blockquote.",
  "",
  "[A link](https://example.com)",
].join("\n");

function render(markdown: string): string {
  return renderToStaticMarkup(
    ReactMarkdown({ components: MARKDOWN_COMPONENTS, children: markdown })
  );
}

/**
 * These assertions exist because this bug SHIPPED and compiled cleanly the
 * whole time. The body used `prose prose-sm`, but @tailwindcss/typography is
 * not installed, so those were silent no-ops and announcements rendered as an
 * unstyled wall of text. Nothing failed — there was nothing asserting the
 * markdown carried real styling. That is what this file is.
 */
describe("announcement markdown styling", () => {
  const html = render(FIXTURE);

  it("gives headings visibly distinct sizes", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    // h1 > h2 > h3, and each is larger than body text (text-sm).
    expect(html).toMatch(/<h1[^>]*class="[^"]*\btext-lg\b/);
    expect(html).toMatch(/<h2[^>]*class="[^"]*\btext-base\b/);
    expect(html).toMatch(/<h3[^>]*class="[^"]*\btext-sm\b/);
  });

  it("gives lists real bullets and numbers", () => {
    expect(html).toMatch(/<ul[^>]*class="[^"]*\blist-disc\b/);
    expect(html).toMatch(/<ol[^>]*class="[^"]*\blist-decimal\b/);
    // Preflight zeroes padding; without pl-* the marker is clipped.
    expect(html).toMatch(/<ul[^>]*class="[^"]*\bpl-5\b/);
    expect(html).toMatch(/<ol[^>]*class="[^"]*\bpl-5\b/);
  });

  it("gives paragraphs vertical spacing", () => {
    const paragraphs = html.match(/<p[^>]*>/g) ?? [];
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    for (const p of paragraphs) {
      expect(p).toMatch(/class="[^"]*\bmt-4\b/);
    }
  });

  it("styles inline emphasis, links and blockquotes", () => {
    expect(html).toMatch(/<strong[^>]*class="[^"]*\bfont-semibold\b/);
    expect(html).toMatch(/<em[^>]*class="[^"]*\bitalic\b/);
    expect(html).toMatch(/<a[^>]*class="[^"]*\btext-primary\b/);
    expect(html).toMatch(/<blockquote[^>]*class="[^"]*\bborder-l-4\b/);
  });

  it("uses theme tokens, not hardcoded colours, so dark mode works", () => {
    // The marketing blog body hardcodes hex because it renders on an
    // always-light page. This sheet is themed and must not.
    expect(html).not.toMatch(/class="[^"]*#[0-9A-Fa-f]{3,6}/);
    expect(html).toMatch(/\btext-foreground\b/);
  });

  it("never leaks the mdast node onto the DOM", () => {
    // react-markdown passes `node` to each component; spreading it through
    // emits node="[object Object]" on every element.
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("node=");
  });

  it("no longer relies on the uninstalled typography plugin", () => {
    expect(html).not.toMatch(/\bprose\b/);
  });
});
