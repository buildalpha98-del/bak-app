import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonLd } from "../json-ld";

/**
 * renderToStaticMarkup, not a DOM: this component's whole job is the
 * exact bytes it puts inside a <script>, and asserting on a parsed DOM
 * would hide the one thing worth checking — an early-closed script tag
 * is invisible once a parser has already mangled it.
 */
describe("JsonLd", () => {
  it("renders the record into an ld+json script tag", () => {
    const html = renderToStaticMarkup(<JsonLd data={{ "@type": "Thing" }} />);
    expect(html).toBe(
      '<script type="application/ld+json">{"@type":"Thing"}</script>'
    );
  });

  it("escapes < so a value cannot close the script element early", () => {
    // The reachable version of this: an Article record carries a blog
    // post's title and excerpt, which are author-supplied strings.
    const html = renderToStaticMarkup(
      <JsonLd data={{ headline: '</script><img src=x onerror=alert(1)>' }} />
    );
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
    // Exactly one closing tag — the element's own.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("keeps the escaped value intact for JSON consumers", () => {
    const data = { headline: "5 < 10 & rising" };
    const html = renderToStaticMarkup(<JsonLd data={data} />);
    const body = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    // The escape is a JSON-level one, so parsing returns the original
    // string — the record a crawler reads is unchanged.
    expect(JSON.parse(body)).toEqual(data);
  });
});
