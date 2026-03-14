"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ChecklistContent, ChecklistItem } from "@/lib/types/database";

interface ChecklistEditorProps {
  value: ChecklistContent;
  onChange: (value: ChecklistContent) => void;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function newItem(): ChecklistItem {
  return { id: generateId(), title: "", description: "", requires_note: false };
}

export function ChecklistEditor({ value, onChange }: ChecklistEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function addItem() {
    onChange({ items: [...value.items, newItem()] });
  }

  function removeItem(id: string) {
    onChange({ items: value.items.filter((i) => i.id !== id) });
    setConfirmDelete(null);
  }

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    onChange({
      items: value.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const next = [...value.items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ items: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Checklist Items{" "}
          <Badge variant="outline" className="ml-1 font-normal">
            {value.items.length}
          </Badge>
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      {value.items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No items yet — click "Add Item" to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {value.items.map((item, idx) => (
            <Card key={item.id} className="border-secondary">
              <CardContent className="pt-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Title <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        placeholder="e.g. Confirm roll has been marked"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Description (optional)
                      </Label>
                      <Textarea
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                        placeholder="Additional context or instructions…"
                        rows={2}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`requires-note-${item.id}`}
                        checked={item.requires_note}
                        onCheckedChange={(checked) =>
                          updateItem(item.id, { requires_note: Boolean(checked) })
                        }
                      />
                      <Label
                        htmlFor={`requires-note-${item.id}`}
                        className="text-sm cursor-pointer"
                      >
                        Require a note when marking this item complete
                      </Label>
                    </div>
                  </div>

                  {/* Move + delete controls */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, -1)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={idx === value.items.length - 1}
                      onClick={() => moveItem(idx, 1)}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    {confirmDelete === item.id ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Confirm delete prompt */}
                {confirmDelete === item.id && (
                  <div className="flex items-center gap-2 text-sm text-destructive pl-6">
                    <span>Delete this item?</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      Yes, delete
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" onClick={addItem}>
        <Plus className="h-4 w-4 mr-2" /> Add Item
      </Button>
    </div>
  );
}
