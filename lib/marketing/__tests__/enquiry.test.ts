import { describe, it, expect } from "vitest";
import {
  buildEnquiryPayload,
  buildSourcePage,
  EMPTY_ENQUIRY_FORM,
  programTitlesFor,
  resolveProgramParam,
  validateEnquiryForm,
  type EnquiryFormState,
} from "../enquiry";
import { PROGRAMS } from "../content";

function form(overrides: Partial<EnquiryFormState> = {}): EnquiryFormState {
  return { ...EMPTY_ENQUIRY_FORM, ...overrides };
}

const VALID = {
  orgName: "Green Valley Public School",
  email: "coordinator@example.com",
  orgType: "school",
} satisfies Partial<EnquiryFormState>;

describe("validateEnquiryForm", () => {
  it("passes a filled enquire form", () => {
    expect(validateEnquiryForm(form(VALID), "enquire")).toEqual({});
  });

  it("requires an org name", () => {
    expect(validateEnquiryForm(form({ ...VALID, orgName: "" }))).toEqual({
      orgName: "required",
    });
  });

  it("treats a whitespace-only org name as missing", () => {
    expect(validateEnquiryForm(form({ ...VALID, orgName: "   " }))).toEqual({
      orgName: "required",
    });
  });

  it("requires an email", () => {
    expect(validateEnquiryForm(form({ ...VALID, email: "" }))).toEqual({
      email: "required",
    });
  });

  it.each(["nope", "no@domain", "no domain@example.com", "@example.com"])(
    "rejects the malformed email %s",
    (email) => {
      expect(validateEnquiryForm(form({ ...VALID, email }))).toEqual({
        email: "invalid",
      });
    }
  );

  it.each(["a+tag@example.com", "first.last@sub.example.com.au"])(
    "accepts the valid email %s",
    (email) => {
      expect(validateEnquiryForm(form({ ...VALID, email }))).toEqual({});
    }
  );

  it("requires an org type on /enquire — a blank one would be filed as a centre", () => {
    expect(validateEnquiryForm(form({ ...VALID, orgType: "" }), "enquire")).toEqual({
      orgType: "required",
    });
  });

  it("does not require an org type in contact mode (the form pins it to other)", () => {
    expect(validateEnquiryForm(form({ ...VALID, orgType: "" }), "contact")).toEqual({});
  });

  it("reports every problem at once rather than one at a time", () => {
    expect(validateEnquiryForm(form({ email: "bogus" }), "enquire")).toEqual({
      orgName: "required",
      email: "invalid",
      orgType: "required",
    });
  });
});

describe("resolveProgramParam", () => {
  it.each(PROGRAMS.map((p) => p.slug))("keeps the known slug %s", (slug) => {
    expect(resolveProgramParam(slug)).toBe(slug);
  });

  it.each([null, undefined, "", "bogus", "Childcare", "../../etc/passwd"])(
    "ignores %s",
    (param) => {
      expect(resolveProgramParam(param)).toBeNull();
    }
  );
});

describe("buildSourcePage", () => {
  it("appends a resolved program so the CRM shows where the lead came from", () => {
    expect(buildSourcePage("/enquire", "childcare")).toBe("/enquire?program=childcare");
  });

  it("is just the path when no program came through", () => {
    expect(buildSourcePage("/contact", null)).toBe("/contact");
  });
});

describe("programTitlesFor", () => {
  it("maps slugs to titles in PROGRAMS display order, not selection order", () => {
    expect(programTitlesFor(["after-school", "childcare"])).toEqual([
      "Childcare Programs",
      "After School Clinics",
    ]);
  });

  it("drops slugs that are not programs", () => {
    expect(programTitlesFor(["bogus"])).toEqual([]);
  });

  it("is empty for an empty selection", () => {
    expect(programTitlesFor([])).toEqual([]);
  });
});

describe("buildEnquiryPayload", () => {
  it("maps the form onto the route's field names", () => {
    const payload = buildEnquiryPayload(
      form({
        orgName: "Green Valley Public School",
        contactName: "Sam Rivers",
        email: "sam@example.com",
        phone: "0400 111 222",
        suburb: "Liverpool",
        orgType: "school",
        programs: ["primary-school"],
        message: "Term 3, Wednesdays.",
      }),
      "/enquire?program=primary-school"
    );

    expect(payload).toEqual({
      centre_name: "Green Valley Public School",
      contact_name: "Sam Rivers",
      contact_email: "sam@example.com",
      contact_phone: "0400 111 222",
      suburb: "Liverpool",
      type: "school",
      programs_of_interest: ["Primary School Programs"],
      message: "Term 3, Wednesdays.",
      source_page: "/enquire?program=primary-school",
      website: "",
    });
  });

  it("trims the values the route stores verbatim", () => {
    const payload = buildEnquiryPayload(
      form({ orgName: "  Sunny Centre  ", email: "  a@b.com  ", contactName: " Jo " }),
      "/enquire"
    );

    expect(payload.centre_name).toBe("Sunny Centre");
    expect(payload.contact_email).toBe("a@b.com");
    expect(payload.contact_name).toBe("Jo");
  });

  it("omits blank optionals so the route writes its own nulls", () => {
    const payload = buildEnquiryPayload(form({ ...VALID, phone: "   " }), "/enquire");

    expect(payload).not.toHaveProperty("contact_name");
    expect(payload).not.toHaveProperty("contact_phone");
    expect(payload).not.toHaveProperty("suburb");
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("programs_of_interest");
  });

  it("omits an unset org type rather than sending an empty string", () => {
    const payload = buildEnquiryPayload(form({ ...VALID, orgType: "" }), "/contact");
    expect(payload).not.toHaveProperty("type");
  });

  it("passes a filled honeypot straight through — the route needs it to discard the bot", () => {
    const payload = buildEnquiryPayload(
      form({ ...VALID, website: "http://spam.example" }),
      "/enquire"
    );
    expect(payload.website).toBe("http://spam.example");
  });
});
