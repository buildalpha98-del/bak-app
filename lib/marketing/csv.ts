// ============================================================
// CSV serialisation — pure, no I/O
// ============================================================
//
// Two separate jobs, deliberately kept apart:
//
//   1. RFC 4180 escaping — so a comma, quote or newline inside a
//      value can't break the row apart. This is about the file
//      being *parsed* correctly.
//   2. Formula-injection neutralising — so a value can't be
//      *executed* by Excel/Sheets/LibreOffice when the operator
//      opens the export. This is about the file being *opened*
//      safely, and no amount of RFC 4180 quoting helps: quotes are
//      stripped by the parser before the cell is evaluated.
//
// Order matters. Neutralise first, escape second — the `'` prefix is
// part of the value, so it must be inside the quoting, not outside.
//
// Scope note: these helpers assume TEXT columns. `neutraliseFormula`
// prefixes a leading "-", which would mangle a genuine negative
// number, so don't reach for this to export a numeric report without
// revisiting that trade-off. The subscriber export is email / status
// / source_page / created_at — all text, none negative.

/**
 * Leading characters that make a spreadsheet treat a cell as a
 * formula rather than a string.
 *
 * `=` and `+` start a formula outright. `-` does too (it parses as
 * negation, so `-1+cmd|'…'!A1` runs). `@` starts a function call in
 * Excel. Tab and CR are here because Excel strips them and then
 * evaluates whatever follows — so "\t=cmd()" is a formula wearing a
 * disguise.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/** Characters that force RFC 4180 quoting of a field. */
const MUST_QUOTE = /[",\r\n]/;

/**
 * Defuses a value a spreadsheet would otherwise execute, by prefixing
 * a single quote — the standard "treat as literal text" marker, which
 * the major spreadsheet apps honour and hide from the displayed cell.
 *
 * Applied to every field rather than only the ones we think are
 * caller-controlled. `source_page` is already path-restricted by
 * subscribeToNewsletter (`normaliseSourcePage` drops anything not
 * starting with "/"), but `email` is NOT: the capture form's
 * deliberately-loose EMAIL_PATTERN (`[^\s@]+@[^\s@]+\.[^\s@]+`)
 * happily accepts `=HYPERLINK("http://evil","click")@x.co`. Guarding
 * one column and trusting the other is how this regresses the next
 * time a validator loosens.
 */
export function neutraliseFormula(value: string): string {
  if (value.length === 0) return value;
  return FORMULA_TRIGGERS.includes(value[0]) ? `'${value}` : value;
}

/**
 * One field, neutralised then escaped per RFC 4180: wrap in double
 * quotes if it contains a comma, quote, CR or LF, and double any
 * internal quote. null/undefined serialise to an empty field — an
 * absent source_page is a blank cell, not the text "null".
 */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const safe = neutraliseFormula(String(value));
  return MUST_QUOTE.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One record → one CSV line (no trailing terminator). */
export function toCsvRow(fields: readonly (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",");
}

/**
 * Header + records → a complete CSV document.
 *
 * CRLF terminated per RFC 4180 §2.1, including a trailing one: Excel
 * accepts both, but some naive parsers treat a missing final
 * terminator as a truncated file.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | null | undefined)[])[]
): string {
  return [headers, ...rows].map(toCsvRow).join("\r\n") + "\r\n";
}
