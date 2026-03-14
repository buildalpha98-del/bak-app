"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
  Type,
  AlignLeft,
  Hash,
  CalendarIcon,
  Clock,
  ListChecks,
  CheckSquare,
  Camera,
  PenTool,
  Star,
  SeparatorHorizontal,
  List,
  X,
} from "lucide-react";
import type { FormField, FormFieldType, FormTemplate } from "@/lib/types/database";
import { updateFormTemplate } from "@/lib/forms/actions";
import { toast } from "sonner";

// ============================================================
// Template Editor — form builder with field palette + properties
// ============================================================

interface TemplateEditorProps {
  template: FormTemplate;
  basePath: string;
}

// Field type palette items
const FIELD_TYPES: {
  type: FormFieldType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { type: "text", label: "Text", icon: <Type className="h-4 w-4" /> },
  { type: "textarea", label: "Long Text", icon: <AlignLeft className="h-4 w-4" /> },
  { type: "number", label: "Number", icon: <Hash className="h-4 w-4" /> },
  { type: "date", label: "Date", icon: <CalendarIcon className="h-4 w-4" /> },
  { type: "time", label: "Time", icon: <Clock className="h-4 w-4" /> },
  { type: "select", label: "Dropdown", icon: <List className="h-4 w-4" /> },
  { type: "multi_select", label: "Multi-Select", icon: <ListChecks className="h-4 w-4" /> },
  { type: "checkbox", label: "Checkbox", icon: <CheckSquare className="h-4 w-4" /> },
  { type: "file", label: "Photo Upload", icon: <Camera className="h-4 w-4" /> },
  { type: "signature", label: "Signature", icon: <PenTool className="h-4 w-4" /> },
  { type: "rating", label: "Rating (1-5)", icon: <Star className="h-4 w-4" /> },
  { type: "heading", label: "Section Header", icon: <SeparatorHorizontal className="h-4 w-4" /> },
];

function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function TemplateEditor({ template, basePath }: TemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [fields, setFields] = useState<FormField[]>(template.fields_json ?? []);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lockedFields = fields.filter((f) => f.locked);
  const editableFields = fields.filter((f) => !f.locked);
  const selectedField = fields.find((f) => f.id === selectedFieldId);

  function addField(type: FormFieldType) {
    const newField: FormField = {
      id: generateFieldId(),
      type,
      label: FIELD_TYPES.find((ft) => ft.type === type)?.label ?? "New Field",
      required: false,
      options: type === "select" || type === "multi_select" || type === "radio" ? ["Option 1"] : undefined,
      maxFiles: type === "file" ? 3 : undefined,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  }

  function removeField(fieldId: string) {
    const field = fields.find((f) => f.id === fieldId);
    if (field?.locked) return;
    setFields(fields.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  }

  function moveField(fieldId: string, direction: "up" | "down") {
    const editIdx = editableFields.findIndex((f) => f.id === fieldId);
    if (editIdx === -1) return;

    const newEditable = [...editableFields];
    const swapIdx = direction === "up" ? editIdx - 1 : editIdx + 1;
    if (swapIdx < 0 || swapIdx >= newEditable.length) return;

    [newEditable[editIdx], newEditable[swapIdx]] = [newEditable[swapIdx], newEditable[editIdx]];
    setFields([...lockedFields, ...newEditable]);
  }

  function updateField(fieldId: string, updates: Partial<FormField>) {
    setFields(
      fields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f
      )
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Please enter a template name.");
      return;
    }
    setSaving(true);
    const { error } = await updateFormTemplate(template.id, {
      name: name.trim(),
      fieldsJson: fields,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Template saved.");
      router.push(basePath);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(basePath)}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg font-semibold border-none p-0 h-auto focus-visible:ring-0"
              placeholder="Template Name"
              aria-label="Template name"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              {template.form_type} · {editableFields.length} custom field{editableFields.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Save Template
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Left: Field Palette */}
        <div className="w-48 shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
                Add Field
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-1">
                {FIELD_TYPES.map((ft) => (
                  <button
                    key={ft.type}
                    type="button"
                    onClick={() => addField(ft.type)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {ft.icon}
                    {ft.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Centre: Field List Preview */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Form Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {/* Locked fields */}
              {lockedFields.length > 0 && (
                <>
                  <div className="rounded-lg bg-secondary p-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium">
                      Auto-populated (locked)
                    </p>
                    {lockedFields.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Badge variant="secondary" className="text-[10px]">
                          Locked
                        </Badge>
                        {f.label}
                      </div>
                    ))}
                  </div>
                  <Separator className="my-2" />
                </>
              )}

              {/* Editable fields */}
              {editableFields.length > 0 ? (
                editableFields.map((field, idx) => (
                  <button
                    type="button"
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                      selectedFieldId === field.id
                        ? "border-primary bg-[var(--brand-orange-light)]"
                        : "border-transparent hover:bg-secondary"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {field.label}
                        </span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {FIELD_TYPES.find((ft) => ft.type === field.type)?.label ?? field.type}
                        </Badge>
                        {field.required && (
                          <span className="text-[10px] text-red-500">Required</span>
                        )}
                        {field.conditional_logic && (
                          <Badge variant="outline" className="text-[10px]">
                            Conditional
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Reorder buttons */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(field.id, "up");
                        }}
                        disabled={idx === 0}
                        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                        aria-label="Move field up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(field.id, "down");
                        }}
                        disabled={idx === editableFields.length - 1}
                        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                        aria-label="Move field down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeField(field.id);
                        }}
                        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground/60 hover:text-red-500"
                        aria-label="Delete field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground/60">
                  No custom fields yet. Click a field type on the left to add one.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Field Properties */}
        <div className="w-72 shrink-0">
          {selectedField && !selectedField.locked ? (
            <FieldPropertiesPanel
              field={selectedField}
              allFields={editableFields}
              onUpdate={(updates) => updateField(selectedField.id, updates)}
              onClose={() => setSelectedFieldId(null)}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground/60">
                Select a field to edit its properties.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Field Properties Panel
// ============================================================

interface FieldPropertiesPanelProps {
  field: FormField;
  allFields: FormField[];
  onUpdate: (updates: Partial<FormField>) => void;
  onClose: () => void;
}

function FieldPropertiesPanel({
  field,
  allFields,
  onUpdate,
  onClose,
}: FieldPropertiesPanelProps) {
  const [newOption, setNewOption] = useState("");

  const hasOptions =
    field.type === "select" || field.type === "multi_select" || field.type === "radio";

  // Other fields for conditional logic
  const otherFields = allFields.filter((f) => f.id !== field.id && f.type !== "heading");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs uppercase text-muted-foreground tracking-wide">
          Field Properties
        </CardTitle>
        <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm" aria-label="Close properties">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={field.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        </div>

        {/* Placeholder */}
        {field.type !== "checkbox" &&
          field.type !== "heading" &&
          field.type !== "rating" &&
          field.type !== "file" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
              />
            </div>
          )}

        {/* Required */}
        {field.type !== "heading" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={field.required}
              onCheckedChange={(checked) => onUpdate({ required: !!checked })}
            />
            <span className="text-sm">Required</span>
          </label>
        )}

        {/* Help Text */}
        {field.type !== "heading" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Help Text</Label>
            <Input
              value={field.helpText ?? ""}
              onChange={(e) =>
                onUpdate({ helpText: e.target.value || undefined })
              }
              placeholder="Optional guidance for the user"
            />
          </div>
        )}

        {/* Max Files (for file type) */}
        {field.type === "file" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Max Files</Label>
            <Input
              type="number"
              value={field.maxFiles ?? 3}
              onChange={(e) =>
                onUpdate({ maxFiles: parseInt(e.target.value) || 3 })
              }
              min={1}
              max={10}
            />
          </div>
        )}

        {/* Options editor */}
        {hasOptions && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Options</Label>
              {(field.options ?? []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...(field.options ?? [])];
                      newOptions[idx] = e.target.value;
                      onUpdate({ options: newOptions });
                    }}
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newOptions = (field.options ?? []).filter(
                        (_, i) => i !== idx
                      );
                      onUpdate({ options: newOptions });
                    }}
                    className="text-muted-foreground/60 hover:text-red-500 shrink-0"
                    aria-label="Remove option"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="New option..."
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newOption.trim()) {
                      e.preventDefault();
                      onUpdate({
                        options: [...(field.options ?? []), newOption.trim()],
                      });
                      setNewOption("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0 min-h-[44px] min-w-[44px]"
                  aria-label="Add option"
                  onClick={() => {
                    if (newOption.trim()) {
                      onUpdate({
                        options: [...(field.options ?? []), newOption.trim()],
                      });
                      setNewOption("");
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Conditional Logic */}
        {field.type !== "heading" && otherFields.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!!field.conditional_logic}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onUpdate({
                        conditional_logic: {
                          field_id: otherFields[0].id,
                          operator: "equals",
                          value: "",
                        },
                      });
                    } else {
                      onUpdate({ conditional_logic: undefined });
                    }
                  }}
                />
                <span className="text-xs font-medium">Conditional Display</span>
              </label>

              {field.conditional_logic && (
                <div className="space-y-2 rounded-lg bg-secondary p-2">
                  <p className="text-[10px] text-muted-foreground/60">
                    Show this field only when:
                  </p>
                  <Select
                    value={field.conditional_logic.field_id}
                    onValueChange={(v) =>
                      onUpdate({
                        conditional_logic: {
                          ...field.conditional_logic!,
                          field_id: v ?? "",
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {otherFields.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={field.conditional_logic.operator}
                    onValueChange={(v) =>
                      onUpdate({
                        conditional_logic: {
                          ...field.conditional_logic!,
                          operator: v as "equals" | "not_equals" | "contains",
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="not_equals">Does not equal</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={field.conditional_logic.value}
                    onChange={(e) =>
                      onUpdate({
                        conditional_logic: {
                          ...field.conditional_logic!,
                          value: e.target.value,
                        },
                      })
                    }
                    placeholder="Value..."
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
