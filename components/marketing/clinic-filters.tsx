"use client";

import { useMemo, useState } from "react";
import { ClinicCard } from "@/components/marketing/clinic-card";
import {
  groupClinicsByWeek,
  type PublicClinic,
} from "@/lib/marketing/clinics-shared";

/**
 * Client-side filters for /holiday-clinics. Receives the full
 * server-fetched clinic array as props (the page stays a small ISR
 * server component); filtering and week-grouping happen in-page
 * with zero extra queries. Option lists derive from the data, so
 * only suburbs/sports that actually have clinics appear.
 */
const SELECT_CLASSES =
  "h-11 min-w-40 appearance-none rounded-full border-2 border-[#111] bg-white px-4 pr-9 font-heading text-sm font-bold text-[#111] shadow-[3px_3px_0_#111]";

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2.5 font-heading text-sm font-bold text-[#111]">
      {label}
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={SELECT_CLASSES}
        >
          <option value="all">{allLabel}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {/* Custom caret — appearance-none removes the native one. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#111]"
        >
          ▼
        </span>
      </span>
    </label>
  );
}

export function ClinicFilters({ clinics }: { clinics: PublicClinic[] }) {
  const [suburb, setSuburb] = useState("all");
  const [sport, setSport] = useState("all");

  const suburbs = useMemo(
    () => [...new Set(clinics.map((c) => c.suburb))].sort(),
    [clinics]
  );
  const sports = useMemo(
    () =>
      [...new Set(clinics.flatMap((c) => (c.sport ? [c.sport] : [])))].sort(),
    [clinics]
  );

  const filtered = clinics.filter(
    (c) =>
      (suburb === "all" || c.suburb === suburb) &&
      (sport === "all" || c.sport === sport)
  );

  const weeks = groupClinicsByWeek(filtered);

  const isFiltered = suburb !== "all" || sport !== "all";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <FilterSelect
          label="Suburb"
          value={suburb}
          onChange={setSuburb}
          allLabel="All suburbs"
          options={suburbs}
        />
        <FilterSelect
          label="Sport"
          value={sport}
          onChange={setSport}
          allLabel="All sports"
          options={sports}
        />
        <p aria-live="polite" className="text-sm font-semibold text-[#1A1A1A]/70">
          {filtered.length} {filtered.length === 1 ? "clinic" : "clinics"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed border-[#111]/40 bg-white px-6 py-14 text-center">
          <p className="font-heading text-xl font-extrabold tracking-tight text-[#111]">
            No clinics match those filters
          </p>
          <button
            type="button"
            onClick={() => {
              setSuburb("all");
              setSport("all");
            }}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full border-2 border-[#111] bg-[#FFD23F] px-6 font-heading text-sm font-bold text-[#111] shadow-[4px_4px_0_#111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#111]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        weeks.map((week) => (
          <section key={week.mondayIso} className="mt-12" aria-label={week.label}>
            <h2 className="inline-block -rotate-1 rounded-full border-2 border-[#111] bg-[#FFF7F2] px-4 py-1.5 font-heading text-sm font-bold uppercase tracking-widest text-[#111] shadow-[2px_2px_0_#111]">
              {week.label}
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {week.clinics.map((clinic) => (
                <ClinicCard key={clinic.id} clinic={clinic} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Keep filters honest: hide nothing silently. */}
      {isFiltered && filtered.length > 0 && (
        <p className="mt-10 text-sm font-medium text-[#1A1A1A]/60">
          Showing {filtered.length} of {clinics.length} upcoming clinics.
        </p>
      )}
    </div>
  );
}
