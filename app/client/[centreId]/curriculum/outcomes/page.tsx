import { redirect } from "next/navigation";
import { BookOpen, ArrowLeft } from "lucide-react";
import Link from "@/components/ui/app-link";
import { getCurrentClientUser } from "@/lib/client/actions";
import { frameworkOf, YEAR_BANDS, type YearBand } from "@/lib/curriculum/frameworks";
import { SUBJECTS, SUBJECT_KEYS, isSubjectKey, type SubjectKey } from "@/lib/curriculum/subjects";
import { outcomesFor, setsFor } from "@/lib/curriculum/knowledge-base";

// Curriculum reference — the outcomes / content descriptions the
// school's framework publishes for each subject and band, straight from
// the knowledge base the AI is held to. A teacher checks a code here
// without leaving the portal; a head of department sees exactly what a
// lesson or report card can be aligned to.

export default async function CurriculumOutcomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ centreId: string }>;
  searchParams: Promise<{ subject?: string; band?: string }>;
}) {
  const { centreId } = await params;
  const sp = await searchParams;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}/curriculum`);

  const framework = frameworkOf(clientUser.centre_framework);
  const subject: SubjectKey = isSubjectKey(sp.subject) ? sp.subject : "pdhpe";
  const band: YearBand | null = (YEAR_BANDS as readonly string[]).includes(sp.band ?? "")
    ? (sp.band as YearBand)
    : null;

  const sets = setsFor(framework, subject);
  const outcomes = outcomesFor({
    framework,
    subject,
    bands: band ? [band] : undefined,
    requireStatement: false,
  });
  const byBand = new Map<YearBand, typeof outcomes>();
  for (const b of YEAR_BANDS) byBand.set(b, []);
  for (const o of outcomes) byBand.get(o.bands[0])?.push(o);

  const href = (q: { subject?: string; band?: string | null }) => {
    const p = new URLSearchParams();
    p.set("subject", q.subject ?? subject);
    const b = q.band === undefined ? band : q.band;
    if (b) p.set("band", b);
    return `/client/${centreId}/curriculum/outcomes?${p.toString()}`;
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-2xl border px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "border-portal-600 bg-portal-600 text-white"
        : "border-portal-200 bg-white text-portal-800 hover:bg-portal-50"
    }`;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <Link
          href={`/client/${centreId}/curriculum`}
          className="inline-flex items-center gap-1 text-sm text-portal-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Scope &amp; Sequence
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold font-heading text-foreground">
          <BookOpen className="h-6 w-6 text-portal-500" />
          Curriculum reference
        </h1>
        <p className="text-muted-foreground mt-1">
          {sets.length > 0
            ? `${sets.map((s) => s.syllabus).join(" and ")} — every ${framework.outcomeNoun} lessons, assessments and report cards at this school are aligned to.`
            : `No ${framework.label} ${SUBJECTS[subject].label} outcomes are loaded.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Subject">
        {SUBJECT_KEYS.map((k) => (
          <Link key={k} href={href({ subject: k })} className={chip(k === subject)} role="radio" aria-checked={k === subject}>
            {framework.subjectLabel(SUBJECTS[k])}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={framework.bandNoun}>
        <Link href={href({ band: null })} className={chip(band === null)} role="radio" aria-checked={band === null}>
          All {framework.bandNoun.toLowerCase()}s
        </Link>
        {YEAR_BANDS.map((b) => (
          <Link key={b} href={href({ band: b })} className={chip(band === b)} role="radio" aria-checked={band === b}>
            {framework.bandLabels[b]}
          </Link>
        ))}
      </div>

      {YEAR_BANDS.filter((b) => (byBand.get(b) ?? []).length > 0).map((b) => (
        <section key={b} className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {framework.bandLabels[b]}{" "}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {(byBand.get(b) ?? []).length} {framework.outcomeNoun}s
            </span>
          </h2>
          <ul className="divide-y divide-portal-100 rounded-2xl border border-portal-200 bg-white">
            {(byBand.get(b) ?? []).map((o) => (
              <li key={o.code} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <code className="text-sm font-semibold text-portal-800">{o.code}</code>
                <div>
                  <p className="text-sm text-foreground">
                    {o.statement || <span className="italic text-muted-foreground">Statement not published on the digital curriculum.</span>}
                  </p>
                  {o.strand && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.strand}
                      {o.substrand ? ` › ${o.substrand}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {sets.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Source: {Array.from(new Set(sets.map((s) => s.source))).join("; ")}.
        </p>
      )}
    </div>
  );
}
