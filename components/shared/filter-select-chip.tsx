"use client";

// ============================================================
// FilterSelectChip — pill-style single-value filter
// ============================================================
//
// The closed chip always tells you what it's doing: inactive reads as
// its label ("Status"), active reads "Status: Trial" and lights up in
// brand orange. Extracted from the roster toolbar so every list view
// filters the same way.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterSelectChipProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Value that counts as "no filter" — defaults to "all". */
  allValue?: string;
}

export function FilterSelectChip({
  label,
  value,
  onChange,
  options,
  allValue = "all",
}: FilterSelectChipProps) {
  const active = value !== allValue;
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? label;

  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? allValue)}>
      <SelectTrigger
        className={[
          "h-8 w-auto rounded-full border px-3 text-xs",
          active
            ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/30"
            : "border-border bg-background text-muted-foreground",
        ].join(" ")}
      >
        <SelectValue placeholder={label}>
          <span className="font-medium">
            {active ? `${label}: ${selectedLabel}` : label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
