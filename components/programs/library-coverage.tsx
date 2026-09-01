"use client";

// Library coverage grid (curriculum build): sport × age band, series
// counted once. Makes gaps visible ("no 8-12 Netball block") instead
// of inferred from 150 cards. Collapsed by default — it's a planning
// tool, not the library itself.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Grid3x3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getLibraryCoverage,
  type CoverageCell,
} from "@/lib/programs/actions";

const BANDS = ["3-5", "5-8", "8-12"] as const;

export function LibraryCoverage() {
  const [open, setOpen] = useState(false);
  const [cells, setCells] = useState<CoverageCell[] | null>(null);

  useEffect(() => {
    if (!open || cells !== null) return;
    getLibraryCoverage().then(({ data }) => setCells(data));
  }, [open, cells]);

  const bySportBand = new Map(
    (cells ?? []).map((c) => [`${c.sport}|${c.band}`, c])
  );
  const sports = [...new Set((cells ?? []).map((c) => c.sport))].sort();

  const gapCount = cells
    ? sports.reduce(
        (n, sport) =>
          n +
          BANDS.filter((b) => {
            const cell = bySportBand.get(`${sport}|${b}`);
            return !cell || (cell.series === 0 && cell.singles === 0);
          }).length,
        0
      )
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center justify-between"
          onClick={() => setOpen(!open)}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <Grid3x3 className="size-4 text-primary" />
            Library coverage
            {open && gapCount !== null && gapCount > 0 && (
              <span className="text-xs font-normal text-amber-700">
                {gapCount} sport/age gaps
              </span>
            )}
          </CardTitle>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="overflow-x-auto">
          {cells === null ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Sport</th>
                  {BANDS.map((b) => (
                    <th key={b} className="py-1.5 pr-3 font-medium">
                      {b} yrs
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sports.map((sport) => (
                  <tr key={sport} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-medium">{sport}</td>
                    {BANDS.map((band) => {
                      const cell = bySportBand.get(`${sport}|${band}`);
                      const hasSeries = (cell?.series ?? 0) > 0;
                      const hasSingles = (cell?.singles ?? 0) > 0;
                      return (
                        <td key={band} className="py-1.5 pr-3">
                          {hasSeries ? (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                              {cell!.longestSeries}-week series
                              {cell!.series > 1 ? ` ×${cell!.series}` : ""}
                            </span>
                          ) : hasSingles ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              {cell!.singles} single
                              {cell!.singles === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Fill gaps with{" "}
            <code className="rounded bg-muted px-1">
              npx tsx scripts/build-program-library.ts
            </code>{" "}
            (batch AI generation) or the Generate page for one-offs.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
