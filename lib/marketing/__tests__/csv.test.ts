import { describe, it, expect } from "vitest";
import {
  neutraliseFormula,
  escapeCsvField,
  toCsvRow,
  toCsv,
} from "@/lib/marketing/csv";

describe("neutraliseFormula", () => {
  it("leaves an ordinary value alone", () => {
    expect(neutraliseFormula("alice@example.com")).toBe("alice@example.com");
    expect(neutraliseFormula("/holiday-clinics")).toBe("/holiday-clinics");
  });

  it("leaves an empty string alone", () => {
    expect(neutraliseFormula("")).toBe("");
  });

  it.each([
    ["=", "=1+1"],
    ["+", "+1+1"],
    ["-", "-1+1"],
    ["@", "@SUM(A1)"],
    ["tab", "\t=cmd()"],
    ["CR", "\r=cmd()"],
  ])("prefixes a value starting with %s", (_label, value) => {
    expect(neutraliseFormula(value)).toBe(`'${value}`);
  });

  it("only guards the FIRST character — a trigger mid-value is inert", () => {
    expect(neutraliseFormula("a=1+1")).toBe("a=1+1");
    expect(neutraliseFormula("first-last")).toBe("first-last");
  });

  it("defuses the classic command-execution payload", () => {
    const payload = '=cmd|\'/C calc\'!A1';
    expect(neutraliseFormula(payload)).toBe(`'${payload}`);
  });
});

describe("escapeCsvField", () => {
  it("serialises null and undefined to an empty field", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("passes an ordinary value through unquoted", () => {
    expect(escapeCsvField("subscribed")).toBe("subscribed");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvField("Smith, Alice")).toBe('"Smith, Alice"');
  });

  it("quotes and doubles internal double quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline or CRLF", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("quotes a field that is only a quote character", () => {
    expect(escapeCsvField('"')).toBe('""""');
  });

  // The load-bearing interaction: the ' prefix must land INSIDE the
  // quotes, or the parser reads it as stray text before the field.
  it("neutralises before quoting when a value is both a formula and quotable", () => {
    expect(escapeCsvField('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    );
  });

  it("neutralises a formula that needs no quoting", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
  });

  // A CR-prefixed value trips both rules at once.
  it("neutralises and quotes a CR-prefixed value", () => {
    expect(escapeCsvField("\r=cmd()")).toBe('"\'\r=cmd()"');
  });
});

describe("toCsvRow", () => {
  it("joins fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("preserves empty fields positionally", () => {
    expect(toCsvRow(["a", null, "c"])).toBe("a,,c");
    expect(toCsvRow([null, null])).toBe(",");
  });

  it("escapes each field independently", () => {
    expect(toCsvRow(["plain", "has,comma", "=formula"])).toBe(
      'plain,"has,comma",\'=formula'
    );
  });

  it("returns an empty string for no fields", () => {
    expect(toCsvRow([])).toBe("");
  });
});

describe("toCsv", () => {
  it("emits a CRLF-terminated header-only document when there are no rows", () => {
    expect(toCsv(["email", "status"], [])).toBe("email,status\r\n");
  });

  it("emits header then rows, CRLF terminated throughout", () => {
    const csv = toCsv(
      ["email", "status", "source_page", "created_at"],
      [
        ["alice@example.com", "subscribed", "/", "2026-07-15T00:00:00.000Z"],
        ["bob@example.com", "unsubscribed", null, "2026-07-14T00:00:00.000Z"],
      ]
    );
    expect(csv).toBe(
      "email,status,source_page,created_at\r\n" +
        "alice@example.com,subscribed,/,2026-07-15T00:00:00.000Z\r\n" +
        "bob@example.com,unsubscribed,,2026-07-14T00:00:00.000Z\r\n"
    );
  });

  // The whole point: a hostile row must not be able to add a column,
  // add a row, or become executable.
  it("keeps a hostile row on one line and inert", () => {
    const csv = toCsv(
      ["email", "source_page"],
      [['=cmd|\'/C calc\'!A1@x.co', "/a,b\r\nc"]]
    );
    const [header, ...rest] = csv.trimEnd().split("\r\n");
    expect(header).toBe("email,source_page");
    // The embedded CRLF stays inside the quoted field, so re-splitting
    // on CRLF yields the quoted fragment, not a new record.
    expect(rest.join("\r\n")).toBe('\'=cmd|\'/C calc\'!A1@x.co,"/a,b\r\nc"');
    expect(csv.startsWith("email")).toBe(true);
    expect(csv.includes("\r\n=cmd")).toBe(false);
  });
});
