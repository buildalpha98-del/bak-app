/**
 * Renders a schema.org record into a <script type="application/ld+json">.
 *
 * The `<` escape is the point of this component existing rather than
 * each page hand-rolling the script tag. Script content is raw text, not
 * parsed markup: a value containing "</script>" would close the element
 * early and the rest would be parsed as HTML. That is a real reachable
 * path here — Article records carry a post's title and excerpt, which
 * are author-supplied strings from the database.
 *
 * Escaping "<" to its unicode form is safe because this is JSON, not
 * HTML: the JSON parser resolves < back to "<", so consumers see
 * the exact intended value while the HTML parser never sees a tag.
 * Doing it here means no call site can forget.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
