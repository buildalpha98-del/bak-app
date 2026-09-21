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
import { stageSummaryFromClasses } from "@/lib/schools/stage-summary";
import { bandSummaryHeading, frameworkOf, type FrameworkKey } from "@/lib/curriculum/frameworks";
import type { SchoolReportContent } from "@/lib/reports/school-report-model";
import { SUBJECTS } from "@/lib/curriculum/subjects";

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
  /** The school's curriculum (migration 095): names the rollup bands. */
  frameworkKey?: FrameworkKey;
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
  classTable: {
    marginBottom: 12,
  },
  classRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
    alignItems: "center",
  },
  classHeaderRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#C0C0C0",
  },
  classCellName: { flex: 2.2, fontSize: 10, fontFamily: "Helvetica-Bold" },
  classCellTeacher: { flex: 2, fontSize: 9, color: GREY },
  classCell: { flex: 1.1, fontSize: 10, textAlign: "right" },
  classHeaderCell: {
    fontSize: 8,
    color: GREY,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
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
  frameworkKey,
}: ReportPDFProps) {
  const framework = frameworkOf(frameworkKey);
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

        {/* School term report (Sept 2026): by subject and stage. */}
        {content.school && <SchoolReportPages school={content.school} accent={accent} />}

        {/* Key Stats */}
        {!content.school && (
        <>
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

        </>
        )}

        {/* Sports Covered */}
        {!content.school && content.sports_covered && content.sports_covered.length > 0 && (
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
                {content.assessment_summary.average_improvement > 0
                  ? ` Skill marks improved by an average of ${content.assessment_summary.average_improvement.toFixed(1)} (on the 1–5 scale) since last term.`
                  : ""}
              </Text>
            </>
          )}

        {/* By class (schools with a class list) */}
        {content.class_breakdown && content.class_breakdown.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: accent }]}>
              By Class
            </Text>
            <View style={styles.classTable}>
              <View style={styles.classHeaderRow}>
                <Text style={[styles.classCellName, styles.classHeaderCell]}>
                  Class
                </Text>
                <Text style={[styles.classCellTeacher, styles.classHeaderCell]}>
                  Teacher
                </Text>
                <Text style={[styles.classCell, styles.classHeaderCell]}>
                  Students
                </Text>
                <Text style={[styles.classCell, styles.classHeaderCell]}>
                  Attendance
                </Text>
                <Text style={[styles.classCell, styles.classHeaderCell]}>
                  Avg Mark
                </Text>
                <Text style={[styles.classCell, styles.classHeaderCell]}>
                  Movement
                </Text>
              </View>
              {content.class_breakdown.map((cls) => (
                <View key={cls.id} style={styles.classRow}>
                  <Text style={styles.classCellName}>
                    {cls.name} (Year {cls.year_group})
                  </Text>
                  <Text style={styles.classCellTeacher}>
                    {cls.teacher_name ?? ""}
                  </Text>
                  <Text style={styles.classCell}>{cls.student_count}</Text>
                  <Text style={styles.classCell}>
                    {cls.attendance_percentage != null
                      ? `${cls.attendance_percentage}%`
                      : "—"}
                  </Text>
                  <Text style={styles.classCell}>
                    {cls.avg_mark != null ? cls.avg_mark.toFixed(1) : "—"}
                  </Text>
                  <Text style={styles.classCell}>
                    {cls.mark_delta != null
                      ? `${cls.mark_delta > 0 ? "+" : ""}${cls.mark_delta.toFixed(1)}`
                      : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* By stage — how a PDHPE coordinator reads the same numbers.
            Derived from class_breakdown, so it appears for schools and
            silently stays absent for childcare rooms. */}
        {(() => {
          const stages = stageSummaryFromClasses(content.class_breakdown);
          if (stages.length === 0) return null;
          return (
            <>
              <Text style={[styles.sectionTitle, { color: accent }]}>
                {bandSummaryHeading(framework)}
              </Text>
              <View style={styles.classTable}>
                <View style={styles.classHeaderRow}>
                  <Text style={[styles.classCellName, styles.classHeaderCell]}>
                    {framework.bandNoun}
                  </Text>
                  <Text style={[styles.classCell, styles.classHeaderCell]}>
                    Students
                  </Text>
                  <Text style={[styles.classCell, styles.classHeaderCell]}>
                    Attendance
                  </Text>
                  <Text style={[styles.classCell, styles.classHeaderCell]}>
                    Avg Mark
                  </Text>
                  <Text style={[styles.classCell, styles.classHeaderCell]}>
                    Movement
                  </Text>
                </View>
                {stages.map((row) => (
                  <View key={row.stage} style={styles.classRow}>
                    <Text style={styles.classCellName}>{framework.bandLabels[row.stage]}</Text>
                    <Text style={styles.classCell}>{row.student_count}</Text>
                    <Text style={styles.classCell}>
                      {row.attendance_percentage != null
                        ? `${row.attendance_percentage}%`
                        : "—"}
                    </Text>
                    <Text style={styles.classCell}>
                      {row.avg_mark != null ? row.avg_mark.toFixed(1) : "—"}
                    </Text>
                    <Text style={styles.classCell}>
                      {row.mark_delta != null
                        ? `${row.mark_delta > 0 ? "+" : ""}${row.mark_delta.toFixed(1)}`
                        : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          );
        })()}

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


// ============================================================
// School term report — by subject and stage (September 2026)
// ============================================================

const school = StyleSheet.create({
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDDDDD", paddingVertical: 3 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#999999", paddingVertical: 3 },
  headText: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  cell: { fontSize: 8.5, paddingRight: 4 },
  sub: { fontSize: 7.5, color: GREY },
  chip: { fontSize: 7.5, backgroundColor: "#EEF6F8", color: "#1B5E6B", paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3, marginRight: 3, marginBottom: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  statRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
});

function SchoolReportPages({ school: s, accent }: { school: SchoolReportContent; accent: string }) {
  const fw = frameworkOf(s.framework);
  const pct = s.assessment_completion.total ? Math.round((s.assessment_completion.done / s.assessment_completion.total) * 100) : null;
  const w = { subject: "26%", delivered: "18%", assessed: "14%", mark: "12%", move: "12%", quiz: "18%" };
  return (
    <>
      <Text style={[styles.sectionTitle, { color: accent }]}>Term Overview</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: accent }]}>{pct != null ? `${pct}%` : "—"}</Text>
          <Text style={styles.statLabel}>{s.assessment_completion.done} of {s.assessment_completion.total} assessments complete</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: accent }]}>{s.report_cards.released ? "Released" : "Pending"}</Text>
          <Text style={styles.statLabel}>Report cards</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: accent }]}>{s.sessions_total}</Text>
          <Text style={styles.statLabel}>Coaching sessions</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: accent }]}>{s.lessons_total}</Text>
          <Text style={styles.statLabel}>Teacher lessons</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: accent }]}>By Subject</Text>
      <View style={school.head}>
        <Text style={[school.headText, { width: w.subject }]}>Subject</Text>
        <Text style={[school.headText, { width: w.delivered }]}>Delivered</Text>
        <Text style={[school.headText, { width: w.assessed }]}>Assessed</Text>
        <Text style={[school.headText, { width: w.mark }]}>Avg mark</Text>
        <Text style={[school.headText, { width: w.move }]}>Movement</Text>
        <Text style={[school.headText, { width: w.quiz }]}>Knowledge checks</Text>
      </View>
      {s.subjects.map((x) => (
        <View key={x.subject} style={school.row}>
          <View style={{ width: w.subject }}>
            <Text style={school.cell}>{fw.subjectLabel(SUBJECTS[x.subject])}</Text>
            {x.strands.length > 0 && <Text style={school.sub}>{x.strands.join(" · ")}</Text>}
          </View>
          <Text style={[school.cell, { width: w.delivered }]}>
            {[x.sessions > 0 ? `${x.sessions} session${x.sessions === 1 ? "" : "s"}` : "", x.lessons > 0 ? `${x.lessons} lesson${x.lessons === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") || "—"}
          </Text>
          <Text style={[school.cell, { width: w.assessed }]}>{x.assessable > 0 ? `${x.assessed} / ${x.assessable}` : "—"}</Text>
          <Text style={[school.cell, { width: w.mark }]}>{x.avg_mark != null ? x.avg_mark.toFixed(1) : "—"}</Text>
          <Text style={[school.cell, { width: w.move }]}>{x.mark_delta != null ? `${x.mark_delta > 0 ? "+" : ""}${x.mark_delta.toFixed(1)}` : "—"}</Text>
          <Text style={[school.cell, { width: w.quiz }]}>{x.quizzes > 0 ? `${x.quizzes}${x.quiz_avg_pct != null ? ` · avg ${x.quiz_avg_pct}%` : ""}` : "—"}</Text>
        </View>
      ))}

      {s.subjects.some((x) => x.by_stage.length > 0) && (
        <>
          <Text style={[styles.sectionTitle, { color: accent }]}>By {fw.bandNoun}</Text>
          <View style={school.head}>
            <Text style={[school.headText, { width: "26%" }]}>{fw.bandNoun}</Text>
            <Text style={[school.headText, { width: "26%" }]}>Subject</Text>
            <Text style={[school.headText, { width: "16%" }]}>Students</Text>
            <Text style={[school.headText, { width: "16%" }]}>Assessed</Text>
            <Text style={[school.headText, { width: "16%" }]}>Avg mark</Text>
          </View>
          {s.subjects.flatMap((x) =>
            x.by_stage.map((row) => (
              <View key={`${x.subject}#${row.stage}`} style={school.row}>
                <Text style={[school.cell, { width: "26%" }]}>{fw.bandLabels[row.stage]}</Text>
                <Text style={[school.cell, { width: "26%" }]}>{x.label}</Text>
                <Text style={[school.cell, { width: "16%" }]}>{row.students}</Text>
                <Text style={[school.cell, { width: "16%" }]}>{row.assessed}</Text>
                <Text style={[school.cell, { width: "16%" }]}>{row.avg_mark != null ? row.avg_mark.toFixed(1) : "—"}</Text>
              </View>
            ))
          )}
        </>
      )}

      {s.subjects.some((x) => x.outcomes.length > 0) && (
        <>
          <Text style={[styles.sectionTitle, { color: accent }]}>{fw.label} {fw.outcomeNoun}s addressed</Text>
          {s.subjects.filter((x) => x.outcomes.length > 0).map((x) => (
            <View key={x.subject} wrap={false}>
              <Text style={[school.sub, { marginBottom: 2 }]}>{x.label} · {x.outcomes.length}</Text>
              <View style={school.chips}>
                {x.outcomes.map((o) => (
                  <Text key={o.code} style={school.chip}>{o.code}</Text>
                ))}
              </View>
            </View>
          ))}
        </>
      )}

      {s.term_plans.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: accent }]}>Term Plans</Text>
          {s.term_plans.map((p, i) => (
            <View key={i} style={school.row}>
              <Text style={[school.cell, { width: "16%" }]}>{p.class_name}</Text>
              <Text style={[school.cell, { width: "20%" }]}>{SUBJECTS[p.subject as keyof typeof SUBJECTS]?.label ?? p.subject}</Text>
              <Text style={[school.cell, { width: "46%" }]}>{p.title} ({p.units} units)</Text>
              <Text style={[school.cell, { width: "18%" }]}>{p.status === "approved" ? "Approved" : "Draft"}</Text>
            </View>
          ))}
        </>
      )}
    </>
  );
}
