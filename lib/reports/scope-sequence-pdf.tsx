import React from "react";
import { subjectOf } from "@/lib/curriculum/subjects";
import { frameworkOf, type FrameworkKey } from "@/lib/curriculum/frameworks";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

// The Scope & Sequence, fully written out — the document a PDHPE
// coordinator files as programming evidence. One block per session:
// outcomes, objectives, and the complete lesson plan (warm-up, skill
// development, modified game, cool-down). Rendered by
// /api/client/[centreId]/scope-sequence-pdf.

export interface ScopeSequencePdfData {
  centreName: string;
  isSchool: boolean;
  /** The school's curriculum (migration 095); framing text follows. */
  frameworkKey?: FrameworkKey;
  /** Subject keys present in the term (migration 093); framing text follows. */
  subjects?: string[];
  /** Term plans (migration 096): the programme of record per class × subject. */
  termPlans?: Array<{
    className: string;
    yearGroup: string;
    subject: string;
    title: string;
    status: "draft" | "approved";
    rationale: string;
    units: Array<{ title: string; strand: string; weeks: string; outcomes: string[]; assessment: string | null }>;
  }>;
  termName: string;
  weeks: Array<{
    weekNumber: number;
    sessions: Array<{
      date: string; // pre-formatted
      kind?: "session" | "lesson";
      subject?: string;
      sport: string;
      coach_name: string;
      duration_minutes: number;
      program_title: string | null;
      /** Band label in the school's framework — exact from targeted classes, else band range. */
      stage: string | null;
      class_names: string[];
      outcomes: Array<{ code: string; title: string }>;
      objectives: string[];
      sections: Array<{
        heading: string; // "Warm-up · 8 min"
        name: string;
        description: string;
        bullets: string[]; // progressions / rules / variations
        tip: string | null;
        tipLabel?: string;
      }>;
    }>;
  }>;
  branding: { mode: "bak_branded" | "white_label"; logoUrl?: string | null };
  generatedDate: string;
}

function syllabusList(keys: string[], frameworkKey?: FrameworkKey): string {
  const fw = frameworkOf(frameworkKey);
  const labels = keys.map((k) => fw.subjectLabel(subjectOf(k)));
  if (labels.length <= 1) return labels[0] ?? "PDHPE";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "NSW PDHPE and English syllabus outcomes" / "Victorian Curriculum F–10
 *  Health and Physical Education content descriptions". */
function framingFor(frameworkKey: FrameworkKey | undefined, keys: string[]): string {
  const fw = frameworkOf(frameworkKey);
  const subjects = syllabusList(keys, frameworkKey);
  return fw.key === "vic"
    ? `Victorian Curriculum F–10 ${subjects} ${fw.outcomeNoun}s`
    : `NSW ${subjects} syllabus ${fw.outcomeNoun}s`;
}

const BAK_ORANGE = "#E8712A";
const DARK = "#1A1A1A";
const GREY = "#666666";
const LIGHT = "#F5F5F5";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, padding: 40, color: DARK },
  accentBar: { height: 4, marginBottom: 16, backgroundColor: BAK_ORANGE },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  logo: { width: 72, height: 36, objectFit: "contain", marginBottom: 6 },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10.5, color: GREY, marginTop: 2 },
  meta: { fontSize: 9, color: GREY, textAlign: "right" },
  framing: { fontSize: 9, color: GREY, marginTop: 8, lineHeight: 1.4 },
  planTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 2 },
  planMeta: { fontSize: 9, color: GREY, marginBottom: 4 },
  planRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDDDDD", paddingVertical: 3 },
  planHead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#999999", paddingVertical: 3 },
  planCellWeeks: { width: "14%", fontSize: 8.5 },
  planCellUnit: { width: "44%", fontSize: 8.5, paddingRight: 4 },
  planCellOutcomes: { width: "22%", fontSize: 8, paddingRight: 4 },
  planCellAssess: { width: "20%", fontSize: 8 },
  planHeadText: { fontFamily: "Helvetica-Bold" },
  weekTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BAK_ORANGE,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  sessionBlock: {
    borderWidth: 0.75,
    borderColor: "#DDDDDD",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  sessionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  sessionMeta: { fontSize: 8.5, color: GREY, marginTop: 1.5 },
  outcomesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5 },
  outcome: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#1d4ed8",
    backgroundColor: "#dbeafe",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  outcomeTitle: { fontSize: 7.5, color: GREY, paddingVertical: 1.5 },
  label: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREY,
    marginTop: 7,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  body: { fontSize: 9, lineHeight: 1.45, color: "#333333" },
  bulletRow: { flexDirection: "row", gap: 4, marginTop: 1.5, paddingLeft: 2 },
  bulletDot: { fontSize: 8.5, color: BAK_ORANGE },
  sectionHead: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 6 },
  sectionName: { fontFamily: "Helvetica-Oblique" },
  tip: {
    fontSize: 8,
    color: GREY,
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 5,
    marginTop: 3,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E0E0",
    paddingTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: GREY },
});

export function ScopeSequencePDF(data: ScopeSequencePdfData) {
  const isWhiteLabel = data.branding.mode === "white_label";
  const brandName = isWhiteLabel ? data.centreName : "Build Alpha Kids";
  const docName = data.isSchool ? "Scope & Sequence" : "Weekly Program Overview";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accentBar} fixed={false} />
        <View style={styles.headerRow}>
          <View>
            {data.branding.logoUrl && (
              <Image src={data.branding.logoUrl} style={styles.logo} />
            )}
            <Text style={styles.title}>{docName}</Text>
            <Text style={styles.subtitle}>
              {data.centreName} · {data.termName}
            </Text>
          </View>
          <Text style={styles.meta}>Generated {data.generatedDate}</Text>
        </View>
        <Text style={styles.framing}>
          {data.isSchool
            ? `Every session and lesson below is mapped to ${framingFor(data.frameworkKey, data.subjects ?? ["pdhpe"])} before delivery. This document is the written programme of record for the term — plans in full, suitable for programming files and curriculum audit.`
            : "Every session below is mapped to EYLF outcomes. This document is the written programme of record for the term, with session plans in full."}
        </Text>

        {/* Term overview — the plans lead the document (096). */}
        {(data.termPlans ?? []).map((p, pi) => (
          <View key={pi} wrap={false}>
            <Text style={styles.planTitle}>Term overview — {p.className} · {subjectOf(p.subject).label}</Text>
            <Text style={styles.planMeta}>
              {p.title} · {p.status === "approved" ? "Approved" : "Draft"}
              {p.rationale ? ` · ${p.rationale}` : ""}
            </Text>
            <View style={styles.planHead}>
              <Text style={[styles.planCellWeeks, styles.planHeadText]}>Weeks</Text>
              <Text style={[styles.planCellUnit, styles.planHeadText]}>Unit</Text>
              <Text style={[styles.planCellOutcomes, styles.planHeadText]}>Outcomes</Text>
              <Text style={[styles.planCellAssess, styles.planHeadText]}>Assessment</Text>
            </View>
            {p.units.map((u, ui) => (
              <View key={ui} style={styles.planRow}>
                <Text style={styles.planCellWeeks}>{u.weeks}</Text>
                <Text style={styles.planCellUnit}>
                  {u.title}
                  {u.strand ? ` (${u.strand})` : ""}
                </Text>
                <Text style={styles.planCellOutcomes}>{u.outcomes.join(", ")}</Text>
                <Text style={styles.planCellAssess}>{u.assessment ?? "—"}</Text>
              </View>
            ))}
          </View>
        ))}

        {data.weeks.map((week) => (
          <View key={week.weekNumber}>
            <Text style={styles.weekTitle}>Week {week.weekNumber}</Text>
            {/* Sessions may exceed a page when fully written out —
                let the block wrap, keep each SECTION together. */}
            {week.sessions.map((s, i) => (
              <View key={i} style={styles.sessionBlock}>
                <Text style={styles.sessionTitle}>
                  {s.program_title ?? s.sport}
                </Text>
                <Text style={styles.sessionMeta}>
                  {[
                    s.subject && s.subject !== "pdhpe" ? `${subjectOf(s.subject).label} · ${s.sport}` : s.sport,
                    s.date,
                    `${s.duration_minutes} min`,
                    s.kind === "lesson" ? `Teacher ${s.coach_name}` : `Coach ${s.coach_name}`,
                    s.stage,
                    s.class_names.length > 0 ? s.class_names.join(", ") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>

                {s.outcomes.length > 0 && (
                  <View style={styles.outcomesRow}>
                    {s.outcomes.map((o) => (
                      <React.Fragment key={o.code}>
                        <Text style={styles.outcome}>{o.code}</Text>
                        <Text style={styles.outcomeTitle}>{o.title}</Text>
                      </React.Fragment>
                    ))}
                  </View>
                )}

                {s.objectives.length > 0 && (
                  <>
                    <Text style={styles.label}>LEARNING OBJECTIVES</Text>
                    {s.objectives.map((obj) => (
                      <View key={obj} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.body}>{obj}</Text>
                      </View>
                    ))}
                  </>
                )}

                {s.sections.map((sec, j) => (
                  <View key={j} wrap={false}>
                    <Text style={styles.sectionHead}>
                      {sec.heading}
                      {sec.name ? (
                        <Text style={styles.sectionName}> — {sec.name}</Text>
                      ) : null}
                    </Text>
                    {sec.description ? (
                      <Text style={styles.body}>{sec.description}</Text>
                    ) : null}
                    {sec.bullets.map((b) => (
                      <View key={b} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>›</Text>
                        <Text style={styles.body}>{b}</Text>
                      </View>
                    ))}
                    {sec.tip ? (
                      <Text style={styles.tip}>{sec.tipLabel ?? "Coaching tip"}: {sec.tip}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {brandName} · {docName} · {data.termName}
            {isWhiteLabel ? "" : " · buildalphakids.app"}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
