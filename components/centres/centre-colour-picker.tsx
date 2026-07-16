"use client";

import { Check } from "lucide-react";
import { CENTRE_COLOURS } from "@/lib/utils/centre-colours";

interface CentreColourPickerProps {
  value: string;
  onChange: (colour: string) => void;
}

/**
 * Swatch grid for a centre's roster colour (P4). Deliberately a fixed
 * palette, not a free hex field — every colour in it is picked to stay
 * distinguishable as a card accent in both themes, and the DB constrains
 * the column to a 6-digit hex regardless.
 */
export function CentreColourPicker({ value, onChange }: CentreColourPickerProps) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="radiogroup"
      aria-label="Centre roster colour"
    >
      {CENTRE_COLOURS.map((colour) => {
        const selected = colour.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={colour}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={colour}
            onClick={() => onChange(colour)}
            className={`flex size-8 items-center justify-center rounded-full transition ${
              selected
                ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                : "hover:scale-110"
            }`}
            style={{ backgroundColor: colour }}
          >
            {selected && <Check className="size-4 text-white" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
