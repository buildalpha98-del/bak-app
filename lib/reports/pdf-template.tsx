import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReportContentJson } from "@/lib/types/database";

// ============================================================
// Props
// ============================================================

export interface ReportPDFProps {
  title: string;
  centreName: string;
  termName: string;
  content: ReportContentJson;
  branding: {
    mode: "bak_branded" | "white_label";
    logoUrl?: string | null;
    primaryColour?: string;
  };
  generatedDate: string;
}

// ============================================================
// Styles
// ============================================================

const BAK_ORANGE = "#E8712A";
const DARK = "#1A1A1A";
const GREY = "#666666";
const LIGHT_GREY = "#F5F5F5";

function getAccentColour(branding: ReportPDFProps["branding"]): string {
  return branding.primaryColour ?? BAK_ORANGE;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: DARK,
  },
  accentBar: {
    height: 4,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 40,
    objectFit: "contain",
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: GREY,
  },
  dateText: {
    fontSize: 9,
    color: GREY,
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 20,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  summaryText: {
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    width: "22%",
    padding: 10,
    borderRadius: 6,
    backgroundColor: LIGHT_GREY,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  statLabel: {
    fontSize: 8,
    color: GREY,
    marginTop: 2,
    textAlign: "center",
  },
  sportTag: {
    fontSize: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: LIGHT_GREY,
    marginRight: 6,
    marginBottom: 4,
  },
  sportsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 10,
    marginRight: 6,
    color: GREY,
  },
  bulletText: {
    fontSize: 10,
    flex: 1,
    lineHeight: 1.5,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ratingValue: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
  },
  ratingLabel: {
    fontSize: 10,
    color: GREY,
    marginLeft: 8,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E0E0",
    paddingTop: 8,
  },
  footerText: {
    fontSize: 8,
    color: GREY,
    textAlign: "center",
  },
});

// ============================================================
// Component
// ============================================================

export function ReportPDF({
  title,
  centreName,
  termName,
  content,
  branding,
  generatedDate,
}: ReportPDFProps) {
  const accent = getAccentColour(branding);
  const isWhiteLabel = branding.mode === "white_label";
  const brandName = isWhiteLabel ? centreName : "Build Alpha Kids";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            {branding.logoUrl && (
              <Image src={branding.logoUrl} style={styles.logo} />
            )}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {centreName} — {termName}
            </Text>
          </View>
          <View>
            <Text style={styles.dateText}>Generated {generatedDate}</Text>
          </View>
        </View>

        {/* Summary */}
        {content.summary && (
          <Text style={styles.summaryText}>{content.summary}</Text>
        )}

        {/* Key Stats */}
        <Text style={[styles.sectionTitle, { color: accent }]}>
          Term Overview
        </Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: accent }]}>
              {content.sessions_delivered ?? 0}
            </Text>
            <Text style={styles.statLabel}>Sessions Delivered</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: accent }]}>
              {content.total_children ?? 0}
            </Text>
            <Text style={styles.statLabel}>Children</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: accent }]}>
              {content.attendance_summary?.average_per_session ?? "—"}
            </Text>
            <Text style={styles.statLabel}>Avg per Session</Text>
          </View>
          {content.average_rating !== undefined && (
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: accent }]}>
                {content.average_rating.toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Avg Rating</Text>
            </View>
          )}
        </View>

        {/* Sports Covered */}
        {content.sports_covered && content.sports_covered.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: accent }]}>
              Sports Covered
            </Text>
            <View style={styles.sportsRow}>
              {content.sports_covered.map((sport, i) => (
                <Text key={i} style={styles.sportTag}>
                  {sport}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Assessment Summary */}
        {content.assessment_summary &&
          content.assessment_summary.children_assessed > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: accent }]}>
                Skill Assessments
              </Text>
              <Text style={styles.summaryText}>
                {content.assessment_summary.children_assessed} children were
                formally assessed during this term.
              </Text>
            </>
          )}

        {/* Highlights */}
        {content.highlights && content.highlights.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: accent }]}>
              Highlights
            </Text>
            {content.highlights.map((highlight, i) => (
              <View key={i} style={styles.bulletItem}>
                <Text style={[styles.bulletDot, { color: accent }]}>•</Text>
                <Text style={styles.bulletText}>{highlight}</Text>
              </View>
            ))}
          </>
        )}

        {/* Coach Notes */}
        {content.coach_notes && content.coach_notes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: accent }]}>
              Coach Observations
            </Text>
            {content.coach_notes.map((note, i) => (
              <View key={i} style={styles.bulletItem}>
                <Text style={[styles.bulletDot, { color: accent }]}>•</Text>
                <Text style={styles.bulletText}>{note}</Text>
              </View>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {brandName} · Term Report · {centreName}
          </Text>
          {!isWhiteLabel && (
            <Text style={styles.footerText}>
              Build Alpha Kids · Multi-sport coaching · South-West Sydney
            </Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
