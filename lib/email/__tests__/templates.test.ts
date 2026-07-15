import { describe, it, expect } from "vitest";
import {
  enquiryAcknowledgementEmail,
  genericNotificationEmail,
  dailyDigestEmail,
} from "../templates";

// ============================================================
// HTML escaping of public, unauthenticated input
// ============================================================
//
// The public enquiry route (app/api/crm/enquiry) renders the enquirer's
// own words into three templates:
//   - enquiryAcknowledgementEmail — straight from the form
//   - genericNotificationEmail    — via triggerNotification, to staff
//   - dailyDigestEmail            — re-renders the stored notification rows
// All three must neutralise markup, or a form submission can inject HTML
// into a staff inbox.

const XSS = '<script>alert("xss")</script>';
const ESCAPED = "&lt;script&gt;";

describe("enquiryAcknowledgementEmail", () => {
  it("escapes the contact and centre names", () => {
    const { html } = enquiryAcknowledgementEmail(XSS, XSS);

    expect(html).not.toContain("<script>");
    expect(html).toContain(ESCAPED);
  });

  it("uses a neutral greeting when no contact name is supplied", () => {
    const { subject, html } = enquiryAcknowledgementEmail(null, "Sunshine ELC");

    expect(subject).toBe("Thanks for your enquiry — Build Alpha Kids");
    expect(html).toContain("Hi there,");
  });

  it("escapes an ampersand in a legitimate centre name without mangling it", () => {
    const { html } = enquiryAcknowledgementEmail("Jane", "Ridge & Vale ELC");

    expect(html).toContain("Ridge &amp; Vale ELC");
  });
});

describe("genericNotificationEmail", () => {
  it("escapes the recipient name and body", () => {
    const { html } = genericNotificationEmail(XSS, "New enquiry", XSS);

    expect(html).not.toContain("<script>");
    expect(html).toContain(ESCAPED);
  });

  it("leaves the subject as plain text", () => {
    // Subjects are headers, not HTML — escaping would surface literal
    // entities in the inbox.
    const { subject } = genericNotificationEmail("Ops", "Ridge & Vale ELC", "body");

    expect(subject).toBe("Ridge & Vale ELC");
  });
});

describe("dailyDigestEmail", () => {
  it("escapes stored notification titles and bodies", () => {
    const { html } = dailyDigestEmail("Ops", [
      { title: XSS, body: XSS, created_at: "2026-07-15T00:00:00Z" },
    ]);

    expect(html).not.toContain("<script>");
    expect(html).toContain(ESCAPED);
  });

  it("escapes the recipient name", () => {
    const { html } = dailyDigestEmail(XSS, []);

    expect(html).not.toContain("<script>");
  });
});
