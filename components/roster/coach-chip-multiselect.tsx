"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, GripVertical, Award, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ============================================================
// Types
// ============================================================

export interface CoachOption {
  id: string;
  name: string;
  /** Archived/inactive coaches are filtered from the picker but
   *  retained in `value` chips with an "(archived)" suffix. */
  inactive?: boolean;
}

export interface ChipCoach {
  id: string;
  name: string;
  /** Mirrors `CoachOption.inactive` for chips that pre-date archival. */
  inactive?: boolean;
}

interface Props {
  /** Already-selected coaches, in display order (index 0 = primary). */
  value: ChipCoach[];
  /** Full pickable list — pass active coaches only; archived chips in `value`
   *  display with an "(archived)" tag but cannot be re-picked. */
  options: CoachOption[];
  /** Caller persists the new order; first item becomes primary. */
  onChange: (next: ChipCoach[]) => void;
  /** Disable while a save is in flight. */
  disabled?: boolean;
}

// ============================================================
// Component
// ============================================================

export function CoachChipMultiselect({
  value,
  options,
  onChange,
  disabled,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = value.findIndex((c) => c.id === e.active.id);
    const newIdx = value.findIndex((c) => c.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(value, oldIdx, newIdx));
  }

  function addCoach(id: string) {
    const opt = options.find((o) => o.id === id);
    if (!opt) return;
    if (value.some((v) => v.id === id)) return;
    onChange([...value, { id, name: opt.name, inactive: opt.inactive }]);
  }

  function removeCoach(id: string) {
    onChange(value.filter((v) => v.id !== id));
  }

  function makePrimary(id: string) {
    const idx = value.findIndex((v) => v.id === id);
    if (idx <= 0) return;
    onChange(arrayMove(value, idx, 0));
  }

  // Filter pickable options: exclude already-selected AND archived.
  const pickable = options.filter(
    (o) => !value.some((v) => v.id === o.id) && !o.inactive
  );

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={value.map((v) => v.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {value.map((c, i) => (
              <SortableChip
                key={c.id}
                coach={c}
                isPrimary={i === 0}
                disabled={disabled}
                onRemove={() => removeCoach(c.id)}
                onMakePrimary={() => makePrimary(c.id)}
              />
            ))}
            <AddCoachButton
              options={pickable}
              onPick={addCoach}
              disabled={disabled}
            />
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-2 text-xs text-muted-foreground">
        Primary coach drives the pay rate. Others paid at their own rates.
      </p>
    </div>
  );
}

// ============================================================
// SortableChip
// ============================================================

function SortableChip({
  coach,
  isPrimary,
  disabled,
  onRemove,
  onMakePrimary,
}: {
  coach: ChipCoach;
  isPrimary: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: coach.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
        isPrimary ? "border-orange-500 bg-orange-50" : "border-input bg-background"
      } ${coach.inactive ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      {isPrimary ? (
        <Award className="h-3 w-3 text-orange-500" aria-label="Primary" />
      ) : null}
      <span className="font-medium">
        {coach.name}
        {coach.inactive ? " (archived)" : ""}
      </span>
      {!isPrimary ? (
        <DropdownMenu>
          {/* base-ui: trigger takes a render prop, NOT asChild */}
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                disabled={disabled}
                aria-label={`${coach.name} chip actions`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onMakePrimary}>
              Make primary
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button
        type="button"
        aria-label={`Remove ${coach.name}`}
        disabled={disabled}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive disabled:cursor-not-allowed"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ============================================================
// AddCoachButton
// ============================================================

function AddCoachButton({
  options,
  onPick,
  disabled,
}: {
  options: CoachOption[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      {/* base-ui: trigger takes a render prop, NOT asChild. */}
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || options.length === 0}
            className="h-7 rounded-full text-xs"
          >
            + Add coach
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {options.length === 0 ? (
          <DropdownMenuItem disabled>No more coaches to add</DropdownMenuItem>
        ) : (
          options.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => onPick(o.id)}>
              {o.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
