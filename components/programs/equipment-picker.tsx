"use client";

import { STANDARD_EQUIPMENT } from "@/lib/ai/types";

// ============================================================
// Equipment Picker — toggle-pill checklist
// ============================================================

interface EquipmentPickerProps {
  /** Full list of items to show (standard + centre-specific merged) */
  items: string[];
  /** Currently selected items */
  selected: string[];
  /** Callback when selection changes */
  onChange: (selected: string[]) => void;
}

export { STANDARD_EQUIPMENT };

export function EquipmentPicker({
  items,
  selected,
  onChange,
}: EquipmentPickerProps) {
  function toggle(item: string) {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  }

  function selectAll() {
    onChange([...items]);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="text-xs text-primary hover:underline"
        >
          Select all
        </button>
        <span className="text-xs text-muted-foreground/30">|</span>
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-muted-foreground hover:underline"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-[var(--brand-orange-light)] text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-border"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground/60">
        {selected.length} of {items.length} selected
      </p>
    </div>
  );
}
