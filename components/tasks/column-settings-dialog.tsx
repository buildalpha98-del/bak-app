"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createColumn,
  renameColumn,
  reorderColumns,
  deleteColumn,
} from "@/lib/tasks/columns";
import type { TaskColumn } from "@/lib/types/database";
import { Lock, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";

interface ColumnSettingsDialogProps {
  columns: TaskColumn[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function ColumnSettingsDialog({
  columns,
  open,
  onOpenChange,
  onUpdate,
}: ColumnSettingsDialogProps) {
  const [localColumns, setLocalColumns] = useState<TaskColumn[]>(columns);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when dialog opens
  useState(() => {
    setLocalColumns(columns);
  });

  const handleAddColumn = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await createColumn(newName.trim());
    if (!error) {
      setNewName("");
      onUpdate();
    }
    setSaving(false);
  };

  const handleRename = async (columnId: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    await renameColumn(columnId, editName.trim());
    setEditingId(null);
    onUpdate();
    setSaving(false);
  };

  const handleDelete = async (columnId: string) => {
    setSaving(true);
    await deleteColumn(columnId);
    onUpdate();
    setSaving(false);
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const reordered = [...localColumns];
    [reordered[index - 1], reordered[index]] = [
      reordered[index],
      reordered[index - 1],
    ];
    // Ensure final column stays last
    const finalIdx = reordered.findIndex((c) => c.is_final);
    if (finalIdx !== reordered.length - 1) return;
    setLocalColumns(reordered);
    await reorderColumns(reordered.map((c) => c.id));
    onUpdate();
  };

  const handleMoveDown = async (index: number) => {
    if (index >= localColumns.length - 1) return;
    // Don't move a column past the final column
    if (localColumns[index + 1]?.is_final) return;
    const reordered = [...localColumns];
    [reordered[index], reordered[index + 1]] = [
      reordered[index + 1],
      reordered[index],
    ];
    setLocalColumns(reordered);
    await reorderColumns(reordered.map((c) => c.id));
    onUpdate();
  };

  const nonFinalCount = localColumns.filter((c) => !c.is_final).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A]">
            Manage Columns
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {localColumns.map((col, idx) => (
            <div
              key={col.id}
              className="flex items-center gap-2 p-2 rounded-md bg-gray-50 border border-gray-200"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col">
                <button
                  onClick={() => handleMoveUp(idx)}
                  disabled={idx === 0 || col.is_final}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMoveDown(idx)}
                  disabled={
                    col.is_final || localColumns[idx + 1]?.is_final
                  }
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Name */}
              <div className="flex-1">
                {editingId === col.id ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleRename(col.id)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleRename(col.id)
                    }
                    autoFocus
                    className="h-8 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(col.id);
                      setEditName(col.name);
                    }}
                    className="text-sm font-medium text-[#1A1A1A] hover:underline"
                  >
                    {col.name}
                  </button>
                )}
              </div>

              {/* Lock icon for final */}
              {col.is_final && (
                <Lock className="w-4 h-4 text-[#666666]" />
              )}

              {/* Delete */}
              {!col.is_final && (
                <button
                  onClick={() => handleDelete(col.id)}
                  disabled={nonFinalCount <= 1 || saving}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                  title={
                    nonFinalCount <= 1
                      ? "Must have at least one non-final column"
                      : "Delete column"
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add column */}
        <div className="flex gap-2 mt-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New column name..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
          />
          <Button
            onClick={handleAddColumn}
            disabled={!newName.trim() || saving}
            className="bg-[#E8712A] hover:bg-[#d4661f] text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
