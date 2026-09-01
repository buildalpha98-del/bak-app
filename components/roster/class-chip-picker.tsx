"use client";

// Class targeting picker for creation flows (Seam B). Self-gating: it
// loads the centre's current-year classes and renders nothing when
// there are none, so childcare centres never see it and callers don't
// need to know the centre type. Selection is local state — the caller
// submits it with the rest of the form (unlike the detail sheet's
// chips, which save per toggle on an existing session).

import { useEffect, useState } from "react";
import {
  getClassOptionsForCentre,
  type ClassOption,
} from "@/lib/schools/class-actions";

interface ClassChipPickerProps {
  centreId: string | null | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function ClassChipPicker({
  centreId,
  value,
  onChange,
  disabled,
}: ClassChipPickerProps) {
  const [options, setOptions] = useState<ClassOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!centreId) {
      setOptions([]);
      return;
    }
    getClassOptionsForCentre(centreId).then(({ data }) => {
      if (!cancelled) setOptions(data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [centreId]);

  // Drop selections that don't belong to the current centre's classes
  // (the user switched centres after picking).
  useEffect(() => {
    if (options.length === 0) {
      if (value.length > 0) onChange([]);
      return;
    }
    const valid = new Set(options.map((o) => o.id));
    const kept = value.filter((id) => valid.has(id));
    if (kept.length !== value.length) onChange(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  if (options.length === 0) return null;

  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
  };

  // Rooms parity: childcare rooms store an age band as their group, so
  // the header self-infers without threading centre type through props.
  const isRooms =
    options.length > 0 && options.every((o) => /^\d+-\d+$/.test(o.year_group));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {isRooms ? "Rooms" : "Classes"}
        </span>
        <span className="text-xs text-muted-foreground">
          {value.length === 0
            ? isRooms
              ? "Whole centre"
              : "Whole school"
            : `${value.length} selected`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((cls) => {
          const selected = value.includes(cls.id);
          return (
            <button
              key={cls.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(cls.id)}
              title={cls.teacher_name ?? undefined}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60 ${
                selected
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              {cls.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
