import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// ============================================================
// Per-student term report — the report card a school hands to
// families. Rendered by /api/client/[centreId]/student-report-pdf.
// Marks use the NSW five-point achievement scale so the document
// reads like the school reports principals already know.
// ============================================================

export const MARK_SCALE: Record<number, string> = {
  5: "Outstanding",
  4: "High",
  3: "Sound",
  2: "Basic",
  1: "Limited",
};

export interface StudentReportData {
  studentName: string;
  className: string | null; // "3B — Year 3"
  teacherName: string | null;
  schoolName: string;
  termName: string;
  attendance: { attended: number; total: number } | null;
  /** Per sport: skills with this term's mark and, when known, last term's. */
  assessments: Array<{
    sport: string;
    assessedAt: string; // pre-formatted
    skills: Array<{ name: string; mark: number; previousMark: number | null }>;
  }>;
  insight: {
    summary: string | null;
    strengths: string[];
    areasForGrowth: string[];
    recommendations: string[];
  } | null;
  coachComments: Array<{ text: string; coach: string | null; context: string }>;
  outcomes: Array<{ code: string; title: string }>;
  branding: { mode: "bak_branded" | "white_label"; logoUrl?: string | null };
  generatedDate: string;
}

const BAK_ORANGE = "#E8712A";
const DARK = "#1A1A1A";
const GREY = "#666666";
const LIGHT = "#F5F5F5";
const GREEN = "#1a7a43";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 10, padding: 40, color: DARK },
  accentBar: { height: 4, marginBottom: 18, backgroundColor: BAK_ORANGE },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  logo: { width: 72, height: 36, objectFit: "contain", marginBottom: 6 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 11, color: GREY, marginTop: 2 },
  meta: { fontSize: 9, color: GREY, textAlign: "right" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BAK_ORANGE,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BAK_ORANGE },
  statLabel: { fontSize: 8, color: GREY, marginTop: 2, textAlign: "center" },
  sportHeader: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
    marginBottom: 4,
  },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#EEEEEE",
  },
  skillName: { flex: 1, fontSize: 9.5 },
  markWord: { width: 70, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" },
  delta: { width: 58, fontSize: 8, color: GREY, textAlign: "right" },
  deltaUp: { width: 58, fontSize: 8, color: GREEN, textAlign: "right" },
  pips: { flexDirection: "row", gap: 2, width: 60, justifyContent: "flex-end" },
  pipOn: { width: 8, height: 8, borderRadius: 2, backgroundColor: BAK_ORANGE },
  pipOff: { width: 8, height: 8, borderRadius: 2, backgroundColor: "#E5E0DB" },
  bodyText: { fontSize: 9.5, lineHeight: 1.5, color: "#333333" },
  bulletRow: { flexDirection: "row", gap: 5, marginBottom: 2, paddingLeft: 2 },
  bulletDot: { fontSize: 9, color: BAK_ORANGE },
  listLabel: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: GREY, marginTop: 6, marginBottom: 2 },
  commentBox: {
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 8,
    marginBottom: 5,
  },
  commentMeta: { fontSize: 8, color: GREY, marginTop: 3 },
  outcomeRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
  outcomeCode: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    backgroundColor: "#dbeafe",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  outcomeTitle: { fontSize: 9, color: "#333333", flex: 1 },
  legend: { fontSize: 7.5, color: GREY, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E0E0",
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: GREY, textAlign: "center" },
});

function Pips({ mark }: { mark: number }) {
  return (
    <View style={styles.pips}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View key={n} style={n <= mark ? styles.pipOn : styles.pipOff} />
      ))}
    </View>
  );
}

export function StudentReportPDF(data: StudentReportData) {
  const isWhiteLabel = data.branding.mode === "white_label";
  const brandName = isWhiteLabel ? data.schoolName : "Build Alpha Kids";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accentBar} />
        <View style={styles.headerRow}>
          <View>
            {data.branding.logoUrl && (
              <Image src={data.branding.logoUrl} style={styles.logo} />
            )}
            <Text style={styles.title}>{data.studentName}</Text>
            <Text style={styles.subtitle}>
              {[
                data.className,
                data.teacherName ? `Class teacher: ${data.teacherName}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ") || data.schoolName}
            </Text>
          </View>
          <View>
            <Text style={styles.meta}>{data.schoolName}</Text>
            <Text style={styles.meta}>Sport &amp; Movement Report</Text>
            <Text style={styles.meta}>{data.termName}</Text>
          </View>
        </View>

        {/* Attendance */}
        {data.attendance && (
          <>
            <Text style={styles.sectionTitle}>Participation</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {data.attendance.attended} of {data.attendance.total}
                </Text>
                <Text style={styles.statLabel}>Sessions attended this term</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {data.attendance.total > 0
                    ? Math.round((data.attendance.attended / data.attendance.total) * 100)
                    : 0}
                  %
                </Text>
                <Text style={styles.statLabel}>Attendance</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{data.assessments.length}</Text>
                <Text style={styles.statLabel}>Sports formally assessed</Text>
              </View>
            </View>
          </>
        )}

        {/* Marks */}
        {data.assessments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skills &amp; Achievement</Text>
            {data.assessments.map((a) => (
              <View key={a.sport} wrap={false}>
                <Text style={styles.sportHeader}>
                  {a.sport}
                  <Text style={{ color: GREY, fontFamily: "Helvetica" }}>
                    {"   "}assessed {a.assessedAt}
                  </Text>
                </Text>
                {a.skills.map((s) => {
                  const delta =
                    s.previousMark == null ? null : s.mark - s.previousMark;
                  return (
                    <View key={s.name} style={styles.skillRow}>
                      <Text style={styles.skillName}>{s.name}</Text>
                      <Pips mark={s.mark} />
                      <Text style={styles.markWord}>{MARK_SCALE[s.mark] ?? s.mark}</Text>
                      <Text style={delta && delta > 0 ? styles.deltaUp : styles.delta}>
                        {/* plain words — arrows aren't in the PDF's WinAnsi font set */}
                        {delta == null
                          ? ""
                          : delta > 0
                            ? `up ${delta}`
                            : delta < 0
                              ? `down ${-delta}`
                              : "steady"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
            <Text style={styles.legend}>
              Achievement scale: Outstanding (5) · High (4) · Sound (3) · Basic (2) ·
              Limited (1). Movement compares this term&apos;s assessment with last
              term&apos;s.
            </Text>
          </>
        )}

        {/* Development summary */}
        {data.insight && (
          <>
            <Text style={styles.sectionTitle}>Development Summary</Text>
            {data.insight.summary && (
              <Text style={styles.bodyText}>{data.insight.summary}</Text>
            )}
            {data.insight.strengths.length > 0 && (
              <>
                <Text style={styles.listLabel}>STRENGTHS</Text>
                {data.insight.strengths.map((s) => (
                  <View key={s} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bodyText}>{s}</Text>
                  </View>
                ))}
              </>
            )}
            {data.insight.areasForGrowth.length > 0 && (
              <>
                <Text style={styles.listLabel}>AREAS FOR GROWTH</Text>
                {data.insight.areasForGrowth.map((s) => (
                  <View key={s} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bodyText}>{s}</Text>
                  </View>
                ))}
              </>
            )}
            {data.insight.recommendations.length > 0 && (
              <>
                <Text style={styles.listLabel}>RECOMMENDATIONS</Text>
                {data.insight.recommendations.map((s) => (
                  <View key={s} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bodyText}>{s}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* Coach comments */}
        {data.coachComments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>From the Coaching Team</Text>
            {data.coachComments.map((c, i) => (
              <View key={i} style={styles.commentBox} wrap={false}>
                <Text style={styles.bodyText}>&ldquo;{c.text}&rdquo;</Text>
                <Text style={styles.commentMeta}>
                  {[c.coach, c.context].filter(Boolean).join(" · ")}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Curriculum coverage — kept together so a lone outcome never
            orphans onto its own page */}
        {data.outcomes.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>NSW PDHPE Outcomes Addressed</Text>
            {data.outcomes.map((o) => (
              <View key={o.code} style={styles.outcomeRow}>
                <Text style={styles.outcomeCode}>{o.code}</Text>
                <Text style={styles.outcomeTitle}>{o.title}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {brandName} · {data.termName} · Generated {data.generatedDate}
            {isWhiteLabel ? "" : " · buildalphakids.app"}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
