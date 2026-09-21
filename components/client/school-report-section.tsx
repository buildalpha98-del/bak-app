"use client";

import { Badge } from "@/components/ui/badge";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { SUBJECTS } from "@/lib/curriculum/subjects";
import type { SchoolReportContent } from "@/lib/reports/school-report-model";

// The school term report on screen: by subject and stage, then curriculum
// coverage, report-card status and term plans. Mirrors the PDF.

export function SchoolReportSection({ school }: { school: SchoolReportContent }) {
  const framework = frameworkOf(school.framework);
  const completion = school.assessment_completion;
  const pct = completion.total ? Math.round((completion.done / completion.total) * 100) : null;
  const delta = (d: number | null) =>
    d == null ? "—" : <span className={d > 0 ? "text-green-600" : d < 0 ? "text-red-600" : "text-gray-600"}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>;

  return (
    <div className="sm:col-span-2 space-y-5">
      {/* Status strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-card p-3">
          <p className="text-xs font-medium text-gray-500">Assessments complete</p>
          <p className="text-lg font-semibold text-gray-900">{pct != null ? `${pct}%` : "—"} <span className="text-xs font-normal text-gray-500">{completion.done} of {completion.total}</span></p>
        </div>
        <div className="rounded-lg bg-card p-3">
          <p className="text-xs font-medium text-gray-500">Report cards</p>
          <p className="text-lg font-semibold text-gray-900">{school.report_cards.released ? "Released" : "Not released"}</p>
        </div>
        <div className="rounded-lg bg-card p-3">
          <p className="text-xs font-medium text-gray-500">Delivered</p>
          <p className="text-lg font-semibold text-gray-900">{school.sessions_total} <span className="text-xs font-normal text-gray-500">sessions</span> · {school.lessons_total} <span className="text-xs font-normal text-gray-500">lessons</span></p>
        </div>
      </div>

      {/* By subject */}
      <div>
        <h4 className="text-sm font-medium text-gray-700">By subject</h4>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3 font-medium">Subject</th>
                <th className="py-1.5 pr-3 text-right font-medium">Delivered</th>
                <th className="py-1.5 pr-3 text-right font-medium">Assessed</th>
                <th className="py-1.5 pr-3 text-right font-medium">Avg mark</th>
                <th className="py-1.5 pr-3 text-right font-medium">Movement</th>
                <th className="py-1.5 text-right font-medium">Knowledge checks</th>
              </tr>
            </thead>
            <tbody>
              {school.subjects.map((s) => (
                <tr key={s.subject} className="border-b last:border-0 align-top">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-gray-900">{framework.subjectLabel(SUBJECTS[s.subject])}</span>
                    {s.strands.length > 0 && <span className="block text-xs text-gray-500">{s.strands.join(" · ")}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{[s.sessions > 0 ? `${s.sessions} session${s.sessions === 1 ? "" : "s"}` : "", s.lessons > 0 ? `${s.lessons} lesson${s.lessons === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") || "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{s.assessable > 0 ? `${s.assessed} / ${s.assessable}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600">{s.avg_mark != null ? s.avg_mark.toFixed(1) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{delta(s.mark_delta)}</td>
                  <td className="py-1.5 text-right text-gray-600">{s.quizzes > 0 ? `${s.quizzes}${s.quiz_avg_pct != null ? ` · avg ${s.quiz_avg_pct}%` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By stage per subject */}
      {school.subjects.some((s) => s.by_stage.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-gray-700">By {framework.bandNoun.toLowerCase()}</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-1.5 pr-3 font-medium">{framework.bandNoun}</th>
                  <th className="py-1.5 pr-3 font-medium">Subject</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Students</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Assessed</th>
                  <th className="py-1.5 text-right font-medium">Avg mark</th>
                </tr>
              </thead>
              <tbody>
                {school.subjects.flatMap((s) =>
                  s.by_stage.map((row) => (
                    <tr key={`${s.subject}#${row.stage}`} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-gray-900">{framework.bandLabels[row.stage]}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{s.label}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{row.students}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{row.assessed}</td>
                      <td className="py-1.5 text-right text-gray-600">{row.avg_mark != null ? row.avg_mark.toFixed(1) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Curriculum coverage */}
      {school.subjects.some((s) => s.outcomes.length > 0) && (
        <div>
          <h4 className="text-sm font-medium text-gray-700">{framework.label} {framework.outcomeNoun}s addressed</h4>
          <div className="mt-2 space-y-2">
            {school.subjects.filter((s) => s.outcomes.length > 0).map((s) => (
              <div key={s.subject}>
                <p className="text-xs font-medium text-gray-500">{s.label} · {s.outcomes.length}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.outcomes.map((o) => (
                    <Badge key={o.code} variant="outline" className="bg-card text-gray-700" title={o.title}>{o.code}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Term plans */}
      {school.term_plans.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700">Term plans</h4>
          <ul className="mt-2 divide-y rounded-lg bg-card">
            {school.term_plans.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span><span className="font-medium text-gray-900">{p.class_name}</span> <span className="text-gray-500">· {p.subject === "pdhpe" ? "PDHPE" : p.subject === "english" ? "English" : "Mathematics"} · {p.units} units</span></span>
                <Badge className={p.status === "approved" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}>{p.status === "approved" ? "Approved" : "Draft"}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
