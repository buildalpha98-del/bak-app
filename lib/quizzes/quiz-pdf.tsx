import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { QuizQuestion } from "@/lib/quizzes/quiz-model";

// Printable quiz (migration 092): the student copy has answer lines and
// option boxes; the answer key marks the correct option and shows the
// model answers. Same plain Helvetica + brand orange as the other PDFs.

const ORANGE = "#E8712A";
const INK = "#1A1A1A";
const MUTED = "#666666";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: INK },
  header: { borderBottom: `2 solid ${ORANGE}`, paddingBottom: 8, marginBottom: 14 },
  brand: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 3 },
  meta: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  nameLine: { flexDirection: "row", gap: 24, marginBottom: 14, fontSize: 10.5 },
  q: { marginBottom: 12 },
  prompt: { fontFamily: "Helvetica-Bold", lineHeight: 1.4 },
  opt: { flexDirection: "row", marginTop: 4, marginLeft: 10, lineHeight: 1.35 },
  box: { width: 10, height: 10, border: `1 solid ${INK}`, marginRight: 6, marginTop: 1.5 },
  boxOn: { width: 10, height: 10, border: `1 solid ${ORANGE}`, backgroundColor: ORANGE, marginRight: 6, marginTop: 1.5 },
  line: { borderBottom: "0.8 solid #BBBBBB", height: 16, marginTop: 6, marginLeft: 10 },
  key: { marginTop: 4, marginLeft: 10, color: ORANGE, fontFamily: "Helvetica-Bold" },
  skill: { fontSize: 8.5, color: MUTED, marginLeft: 10, marginTop: 2 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED, borderTop: "1 solid #E5E5E5", paddingTop: 6, flexDirection: "row", justifyContent: "space-between" },
});

export interface QuizPdfProps {
  title: string;
  subjectLabel: string;
  focus: string;
  ageBand: string;
  schoolName: string;
  questions: QuizQuestion[];
  answerKey: boolean;
  generatedOn: string;
}

export function QuizPdf(p: QuizPdfProps) {
  return (
    <Document title={`${p.title}${p.answerKey ? " — answer key" : ""}`} author="Build Alpha Kids">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>
            {p.schoolName} — {p.subjectLabel} knowledge check{p.answerKey ? " — ANSWER KEY" : ""}
          </Text>
          <Text style={s.title}>{p.title}</Text>
          <Text style={s.meta}>
            {p.focus} · ages {p.ageBand} · {p.questions.length} questions
          </Text>
        </View>
        {!p.answerKey && (
          <View style={s.nameLine}>
            <Text>Name: ______________________________</Text>
            <Text>Class: __________</Text>
            <Text>Date: ____________</Text>
          </View>
        )}
        {p.questions.map((q, i) => (
          <View key={q.id} style={s.q} wrap={false}>
            <Text style={s.prompt}>
              {i + 1}. {q.prompt}
            </Text>
            {q.type === "multiple_choice" ? (
              q.options?.map((o, oi) => (
                <View key={oi} style={s.opt}>
                  <View style={p.answerKey && oi === q.answer ? s.boxOn : s.box} />
                  <Text>
                    {String.fromCharCode(65 + oi)}. {o}
                  </Text>
                </View>
              ))
            ) : p.answerKey ? (
              <Text style={s.key}>Model answer: {String(q.answer)}</Text>
            ) : (
              <>
                <View style={s.line} />
                <View style={s.line} />
              </>
            )}
            {p.answerKey && q.skill && <Text style={s.skill}>Checks: {q.skill}</Text>}
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>Build Alpha Kids · buildalphakids.app</Text>
          <Text>Generated {p.generatedOn}</Text>
        </View>
      </Page>
    </Document>
  );
}
