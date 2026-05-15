"use client";

import { useState } from "react";
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
  /** Optional: called when user adds a custom equipment item */
  onAddCustom?: (name: string) => Promise<void>;
}

export { STANDARD_EQUIPMENT };

export function EquipmentPicker({
  items,
  selected,
  onChange,
  onAddCustom,
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
      {onAddCustom && (
        <AddCustomEquipmentRow existing={items} onAdd={onAddCustom} />
      )}
      <p className="text-xs text-muted-foreground/60">
        {selected.length} of {items.length} selected
      </p>
    </div>
  );
}

// ============================================================
// AddCustomEquipmentRow — inline row to add a custom item
// ============================================================

function AddCustomEquipmentRow({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const duplicate = existing.some(
    (e) => e.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = trimmed.length > 0 && trimmed.length <= 64 && !duplicate;

  async function handle() {
    if (!canAdd || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 pt-2 border-t">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="+ Add custom equipment (e.g. tackle bags)"
          className="flex-1 rounded border bg-card px-2 py-1 text-xs"
          maxLength={64}
        />
        <button
          type="button"
          onClick={handle}
          disabled={!canAdd || busy}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Adding..." : "Add"}
        </button>
      </div>
      {duplicate && trimmed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          "{trimmed}" is already in the list.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
