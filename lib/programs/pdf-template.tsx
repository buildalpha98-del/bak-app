import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ProgramContentJson, SkillDrill } from "@/lib/ai/types";

// ============================================================
// Program session-plan PDF
// ============================================================
//
// One printable A4 plan a coach can take poolside/courtside, and a
// centre director can file. Mirrors the invoice template's plain
// Helvetica + brand-orange accents so exports feel like one product.

const ORANGE = "#E8712A";
const INK = "#1A1A1A";
const MUTED = "#666666";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  header: { borderBottom: `2 solid ${ORANGE}`, paddingBottom: 10, marginBottom: 14 },
  brand: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 3 },
  meta: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  twoCol: { flexDirection: "row", gap: 16, marginBottom: 12 },
  col: { flex: 1 },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: ORANGE,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  block: { marginBottom: 12 },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  duration: { color: MUTED, fontSize: 9 },
  body: { marginTop: 2, lineHeight: 1.45 },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  bulletDot: { width: 10, color: ORANGE },
  bulletText: { flex: 1, lineHeight: 1.4 },
  tip: {
    marginTop: 4,
    backgroundColor: "#FDF1E8",
    borderRadius: 4,
    padding: 6,
    fontSize: 9,
    lineHeight: 1.4,
  },
  tipLabel: { fontFamily: "Helvetica-Bold", color: ORANGE },
  scaffold: { marginTop: 3, fontSize: 9, color: MUTED, lineHeight: 1.35 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: MUTED,
    borderTop: "1 solid #E5E5E5",
    paddingTop: 6,
  },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function Tip({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <Text style={s.tip}>
      <Text style={s.tipLabel}>Coaching tip: </Text>
      {text}
    </Text>
  );
}

function Drill({ drill }: { drill: SkillDrill }) {
  return (
    <View style={s.block} wrap={false}>
      <Text style={s.itemName}>
        {drill.name} <Text style={s.duration}>· {drill.duration} min</Text>
      </Text>
      <Text style={s.body}>{drill.description}</Text>
      {drill.progressions?.length > 0 && <Bullets items={drill.progressions} />}
      {drill.scaffolds &&
        Object.entries(drill.scaffolds).map(([band, note]) => (
          <Text key={band} style={s.scaffold}>
            Ages {band}: {note}
          </Text>
        ))}
      <Tip text={drill.coachingTips} />
    </View>
  );
}

export interface ProgramPdfProps {
  content: ProgramContentJson;
  ageGroups: string[];
  generatedOn: string; // pre-formatted Sydney date string
}

export function ProgramPdf({ content, ageGroups, generatedOn }: ProgramPdfProps) {
  const bands = ageGroups.length > 0 ? ageGroups.join(", ") : content.ageGroup;
  return (
    <Document title={content.title} author="Build Alpha Kids">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>Build Alpha Kids — Session Plan</Text>
          <Text style={s.title}>{content.title}</Text>
          <Text style={s.meta}>
            {content.sport} · Ages {bands} · {content.duration} minutes
          </Text>
        </View>

        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.h2}>Objectives</Text>
            <Bullets items={content.objectives ?? []} />
          </View>
          <View style={s.col}>
            <Text style={s.h2}>Equipment</Text>
            <Bullets items={content.equipmentNeeded ?? []} />
          </View>
        </View>

        {content.warmUp && (
          <View style={s.block}>
            <Text style={s.h2}>Warm-up</Text>
            <Text style={s.itemName}>
              {content.warmUp.name}{" "}
              <Text style={s.duration}>· {content.warmUp.duration} min</Text>
            </Text>
            <Text style={s.body}>{content.warmUp.description}</Text>
            <Tip text={content.warmUp.coachingTips} />
          </View>
        )}

        {content.skillDevelopment?.length > 0 && (
          <View style={s.block}>
            <Text style={s.h2}>Skill development</Text>
            {content.skillDevelopment.map((d, i) => (
              <Drill key={i} drill={d} />
            ))}
          </View>
        )}

        {content.modifiedGame && (
          <View style={s.block} wrap={false}>
            <Text style={s.h2}>Modified game</Text>
            <Text style={s.itemName}>
              {content.modifiedGame.name}{" "}
              <Text style={s.duration}>· {content.modifiedGame.duration} min</Text>
            </Text>
            <Text style={s.body}>{content.modifiedGame.description}</Text>
            {content.modifiedGame.rules?.length > 0 && (
              <Bullets items={content.modifiedGame.rules} />
            )}
            {content.modifiedGame.variations?.length > 0 && (
              <>
                <Text style={[s.body, { fontFamily: "Helvetica-Bold" }]}>
                  Variations
                </Text>
                <Bullets items={content.modifiedGame.variations} />
              </>
            )}
            <Tip text={content.modifiedGame.coachingTips} />
          </View>
        )}

        {content.coolDown && (
          <View style={s.block} wrap={false}>
            <Text style={s.h2}>Cool-down</Text>
            <Text style={s.itemName}>
              {content.coolDown.name}{" "}
              <Text style={s.duration}>· {content.coolDown.duration} min</Text>
            </Text>
            <Text style={s.body}>{content.coolDown.description}</Text>
          </View>
        )}

        {content.reflectionPrompt && (
          <View style={s.block} wrap={false}>
            <Text style={s.h2}>Reflection</Text>
            <Text style={s.body}>{content.reflectionPrompt}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>Build Alpha Kids · buildalphakids.app</Text>
          <Text>Generated {generatedOn}</Text>
        </View>
      </Page>
    </Document>
  );
}
