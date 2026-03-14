import type { DocumentCategory } from "@/lib/types/enums";

// ============================================================
// Category metadata
// ============================================================

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  program: "Programs",
  policy: "Policies & Procedures",
  risk_assessment: "Risk Assessments",
  onboarding: "Coach Onboarding",
  centre_doc: "Centre Documents",
  compliance: "Compliance",
  template: "Templates",
  other: "General",
};

export const CATEGORY_ORDER: DocumentCategory[] = [
  "program",
  "policy",
  "risk_assessment",
  "onboarding",
  "centre_doc",
  "compliance",
  "template",
  "other",
];
