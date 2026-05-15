"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from "@/lib/utils/programs/age-bands";

interface AgeGroupCheckboxesProps {
  value: AgeBand[];
  onChange: (next: AgeBand[]) => void;
}

export function AgeGroupCheckboxes({ value, onChange }: AgeGroupCheckboxesProps) {
  function toggle(band: AgeBand) {
    if (value.includes(band)) {
      onChange(value.filter((b) => b !== band));
    } else {
      onChange([...value, band]);
    }
  }

  return (
    <div className="space-y-2">
      {AGE_BANDS.map((band) => {
        const id = `age-band-${band}`;
        const checked = value.includes(band);
        return (
          <div key={band} className="flex items-center gap-3">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => toggle(band)}
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {AGE_BAND_LABELS[band]}
            </Label>
          </div>
        );
      })}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Select at least one age band.
        </p>
      )}
    </div>
  );
}
