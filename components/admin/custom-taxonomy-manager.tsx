"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  addCustomSport,
  addCustomEquipment,
  renameCustomSport,
  renameCustomEquipment,
  deleteCustomSport,
  deleteCustomEquipment,
  type CustomTaxonomyItem,
} from "@/lib/programs/custom-taxonomy-actions";

interface Props {
  initialSports: CustomTaxonomyItem[];
  initialEquipment: CustomTaxonomyItem[];
}

export function CustomTaxonomyManager({ initialSports, initialEquipment }: Props) {
  const [sports, setSports] = useState(initialSports);
  const [equipment, setEquipment] = useState(initialEquipment);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TaxonomyCard
        title="Custom Sports"
        items={sports}
        add={addCustomSport}
        rename={renameCustomSport}
        remove={deleteCustomSport}
        onUpdate={setSports}
      />
      <TaxonomyCard
        title="Custom Equipment"
        items={equipment}
        add={addCustomEquipment}
        rename={renameCustomEquipment}
        remove={deleteCustomEquipment}
        onUpdate={setEquipment}
      />
    </div>
  );
}

function TaxonomyCard({
  title,
  items,
  add,
  rename,
  remove,
  onUpdate,
}: {
  title: string;
  items: CustomTaxonomyItem[];
  add: (name: string) => Promise<{ data: CustomTaxonomyItem | null; error: string | null }>;
  rename: (id: string, newName: string) => Promise<{ data: null; error: string | null }>;
  remove: (id: string) => Promise<{ data: null; error: string | null }>;
  onUpdate: (next: CustomTaxonomyItem[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const result = await add(trimmed);
    if (result.data) {
      onUpdate([...items, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  async function handleRename(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const result = await rename(id, trimmed);
    if (!result.error) {
      onUpdate(
        items
          .map((i) => (i.id === id ? { ...i, name: trimmed } : i))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Programs already saved against this name keep their text.`)) return;
    const result = await remove(id);
    if (!result.error) {
      onUpdate(items.filter((i) => i.id !== id));
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add new…"
            maxLength={64}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button onClick={handleAdd} disabled={!newName.trim()}>
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded border bg-card px-3 py-1.5"
              >
                {editingId === item.id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(item.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <div className="flex gap-1 ml-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRename(item.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{item.name}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditValue(item.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(item.id, item.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
