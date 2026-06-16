import { describe, it, expect } from "vitest";
import {
  renderMergeFields,
  buildEmailHtml,
  pickSendOutcome,
  type ScheduledSendLike,
  type ActiveLeadLike,
} from "../sequence-render";
import { SPORTS } from "@/lib/types/enums";

// ============================================================
// renderMergeFields
// ============================================================

describe("renderMergeFields", () => {
  it("substitutes {centre_name} and {contact_name}", () => {
    const result = renderMergeFields(
      "Hi {contact_name}, fancy a session at {centre_name}?",
      { centre_name: "Little Stars Bankstown", contact_name: "Aisha" }
    );
    expect(result).toBe("Hi Aisha, fancy a session at Little Stars Bankstown?");
  });

  it("falls back to 'there' when contact_name is null", () => {
    const result = renderMergeFields("Hi {contact_name},", {
      centre_name: "Test Centre",
      contact_name: null,
    });
    expect(result).toBe("Hi there,");
  });

  it("substitutes every occurrence of a token (not just the first)", () => {
    const result = renderMergeFields(
      "{centre_name} - {centre_name} - {centre_name}",
      { centre_name: "Acme", contact_name: "x" }
    );
    expect(result).toBe("Acme - Acme - Acme");
  });

  it("substitutes {sport_list} with the canonical SPORTS join", () => {
    const result = renderMergeFields("Sports: {sport_list}", {
      centre_name: "X",
      contact_name: "Y",
    });
    expect(result).toBe(`Sports: ${SPORTS.join(", ")}`);
  });

  it("substitutes {your_name} with the team signature", () => {
    const result = renderMergeFields("Regards, {your_name}", {
      centre_name: "X",
      contact_name: "Y",
    });
    expect(result).toBe("Regards, The Build Alpha Kids Team");
  });

  it("leaves unknown tokens untouched", () => {
    const result = renderMergeFields("Hi {first_name}!", {
      centre_name: "X",
      contact_name: "Y",
    });
    expect(result).toBe("Hi {first_name}!");
  });

  it("handles empty templates without throwing", () => {
    expect(renderMergeFields("", { centre_name: "X", contact_name: null })).toBe("");
  });
});

// ============================================================
// buildEmailHtml
// ============================================================

describe("buildEmailHtml", () => {
  it("wraps paragraphs in <p> tags split on double newlines", () => {
    const html = buildEmailHtml("First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("<p style=\"margin:0 0 16px;line-height:1.6;\">First paragraph.</p>");
    expect(html).toContain("<p style=\"margin:0 0 16px;line-height:1.6;\">Second paragraph.</p>");
  });

  it("converts single newlines inside a paragraph to <br>", () => {
    const html = buildEmailHtml("line one\nline two");
    expect(html).toContain("line one<br>line two");
  });

  it("includes the BAK branded header and footer", () => {
    const html = buildEmailHtml("Body");
    expect(html).toContain("Build Alpha Kids");
    expect(html).toContain("Multi-Sport Coaching");
  });
});

// ============================================================
// pickSendOutcome — the step picker
// ============================================================

function makeSend(overrides: Partial<ScheduledSendLike> = {}): ScheduledSendLike {
  return {
    id: "send-1",
    lead_id: "lead-1",
    sequence_id: "seq-1",
    step_id: "step-1",
    scheduled_for: "2026-06-17T00:00:00.000Z",
    ...overrides,
  };
}

function makeLead(overrides: Partial<ActiveLeadLike> = {}): ActiveLeadLike {
  return {
    active_sequence_id: "seq-1",
    sequence_paused: false,
    contact_email: "ops@example.com",
    ...overrides,
  };
}

describe("pickSendOutcome", () => {
  const now = new Date("2026-06-17T06:00:00.000Z");

  it("returns send when due and lead is active", () => {
    const outcome = pickSendOutcome(makeSend(), makeLead(), now);
    expect(outcome.status).toBe("send");
    expect(outcome.reason).toBeUndefined();
  });

  it("skips with reason 'paused' when sequence_paused is true", () => {
    const outcome = pickSendOutcome(makeSend(), makeLead({ sequence_paused: true }), now);
    expect(outcome.status).toBe("skip");
    expect(outcome.reason).toBe("paused");
  });

  it("skips with reason 'wrong_sequence' when active_sequence_id differs", () => {
    const outcome = pickSendOutcome(
      makeSend({ sequence_id: "seq-1" }),
      makeLead({ active_sequence_id: "seq-2" }),
      now
    );
    expect(outcome.status).toBe("skip");
    expect(outcome.reason).toBe("wrong_sequence");
  });

  it("skips with reason 'wrong_sequence' when the lead has stopped (active_sequence_id null)", () => {
    const outcome = pickSendOutcome(
      makeSend(),
      makeLead({ active_sequence_id: null }),
      now
    );
    expect(outcome.status).toBe("skip");
    expect(outcome.reason).toBe("wrong_sequence");
  });

  it("skips with reason 'missing_email' when contact_email is null", () => {
    const outcome = pickSendOutcome(makeSend(), makeLead({ contact_email: null }), now);
    expect(outcome.status).toBe("skip");
    expect(outcome.reason).toBe("missing_email");
  });

  it("skips with reason 'not_due' when scheduled_for is in the future", () => {
    const future = new Date(now.getTime() + 60_000).toISOString();
    const outcome = pickSendOutcome(makeSend({ scheduled_for: future }), makeLead(), now);
    expect(outcome.status).toBe("skip");
    expect(outcome.reason).toBe("not_due");
  });

  it("does send when scheduled_for equals now (boundary)", () => {
    const outcome = pickSendOutcome(
      makeSend({ scheduled_for: now.toISOString() }),
      makeLead(),
      now
    );
    expect(outcome.status).toBe("send");
  });

  it("prioritises 'paused' over later skip reasons", () => {
    // Lead is paused AND has no email — paused should win because we want to
    // surface the operator action ('resume') before treating it as undeliverable.
    const outcome = pickSendOutcome(
      makeSend(),
      makeLead({ sequence_paused: true, contact_email: null }),
      now
    );
    expect(outcome.reason).toBe("paused");
  });
});
