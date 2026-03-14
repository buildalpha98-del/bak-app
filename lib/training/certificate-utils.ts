/**
 * Certificate data utilities for training pathway completion.
 * Pure functions — no server actions, no database access.
 * Actual PDF rendering uses React-PDF (@react-pdf/renderer) in a separate component.
 */

// ─────────────────────────────────────────────
// BRANDING CONSTANTS
// ─────────────────────────────────────────────

export const CERTIFICATE_BRANDING = {
  companyName: "Build Alpha Kids",
  primaryColour: "#E8712A",
  darkText: "#1A1A1A",
  secondaryText: "#666666",
  backgroundWhite: "#FFFFFF",
  backgroundGrey: "#F5F5F5",
  borderColour: "#E8712A",
} as const;

export const CERTIFICATE_LAYOUT = {
  pageWidth: 842, // A4 landscape
  pageHeight: 595,
  margin: 60,
  logoWidth: 120,
  logoHeight: 60,
  titleFontSize: 28,
  subtitleFontSize: 16,
  bodyFontSize: 14,
  footerFontSize: 10,
} as const;

// ─────────────────────────────────────────────
// CERTIFICATE DATA
// ─────────────────────────────────────────────

export interface CertificateData {
  coachName: string;
  pathwayName: string;
  completedAt: string;
  formattedDate: string;
  companyName: string;
  branding: typeof CERTIFICATE_BRANDING;
  layout: typeof CERTIFICATE_LAYOUT;
  certificateTitle: string;
  certificateBody: string;
}

/**
 * Generate structured data for a training completion certificate.
 */
export function generateCertificateData(
  coach: { name: string },
  pathway: { name: string },
  completedAt: string
): CertificateData {
  const date = new Date(completedAt);
  const formattedDate = date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    coachName: coach.name,
    pathwayName: pathway.name,
    completedAt,
    formattedDate,
    companyName: CERTIFICATE_BRANDING.companyName,
    branding: CERTIFICATE_BRANDING,
    layout: CERTIFICATE_LAYOUT,
    certificateTitle: "Certificate of Completion",
    certificateBody: `This is to certify that ${coach.name} has successfully completed the "${pathway.name}" training pathway at Build Alpha Kids.`,
  };
}
