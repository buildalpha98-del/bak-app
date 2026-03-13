"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  Star,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import type { FormField } from "@/lib/types/database";
import { uploadFormAttachment } from "@/lib/forms/actions";
import { toast } from "sonner";

// ============================================================
// FormRenderer — dynamically renders forms from field definitions
// ============================================================

interface SessionContext {
  sessionId?: string;
  coachName?: string;
  dateTime?: string;
  centreName?: string;
  centreId?: string;
  sport?: string;
}

interface FormRendererProps {
  fields: FormField[];
  sessionContext?: SessionContext;
  mode?: "edit" | "view";
  initialData?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>, attachments: string[]) => void;
  submitting?: boolean;
  isOffline?: boolean;
}

function getAutoPopulatedValue(
  field: FormField,
  ctx?: SessionContext
): string {
  if (!field.autoPopulate || !ctx) return "";
  switch (field.autoPopulate) {
    case "session_id":
      return ctx.sessionId ?? "";
    case "coach_name":
      return ctx.coachName ?? "";
    case "date_time":
      return ctx.dateTime ?? "";
    case "centre_name":
      return ctx.centreName ?? "";
    default:
      return "";
  }
}

function shouldShowField(
  field: FormField,
  formData: Record<string, unknown>
): boolean {
  if (!field.conditional_logic) return true;
  const { field_id, operator, value } = field.conditional_logic;
  const currentVal = String(formData[field_id] ?? "");

  switch (operator) {
    case "equals":
      return currentVal === value;
    case "not_equals":
      return currentVal !== value;
    case "contains":
      return currentVal.toLowerCase().includes(value.toLowerCase());
    default:
      return true;
  }
}

export function FormRenderer({
  fields,
  sessionContext,
  mode = "edit",
  initialData,
  onSubmit,
  submitting = false,
  isOffline = false,
}: FormRendererProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = { ...initialData };
    // Auto-populate locked fields
    for (const field of fields) {
      if (field.locked && field.autoPopulate) {
        initial[field.id] = getAutoPopulatedValue(field, sessionContext);
      }
    }
    return initial;
  });

  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function setValue(fieldId: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    // Clear error
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      if (field.locked) continue;
      if (!shouldShowField(field, formData)) continue;
      if (field.type === "heading") continue;

      if (field.required) {
        const val = formData[field.id];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit() {
    if (!validate()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    onSubmit?.(formData, attachments);
  }

  async function handleFileUpload(fieldId: string, files: FileList | null) {
    if (!files || files.length === 0) return;

    const field = fields.find((f) => f.id === fieldId);
    const maxFiles = field?.maxFiles ?? 3;

    const existingUrls = (formData[fieldId] as string[]) ?? [];
    if (existingUrls.length + files.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} file(s) allowed.`);
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const { url, error } = await uploadFormAttachment(
        fd,
        sessionContext?.sessionId ?? null,
        "form"
      );
      if (error) {
        toast.error(`Upload failed: ${error}`);
      } else if (url) {
        newUrls.push(url);
      }
    }

    const allUrls = [...existingUrls, ...newUrls];
    setValue(fieldId, allUrls);
    setAttachments((prev) => [...prev, ...newUrls]);
    setUploading(false);
  }

  function removeFile(fieldId: string, url: string) {
    const existing = (formData[fieldId] as string[]) ?? [];
    setValue(
      fieldId,
      existing.filter((u) => u !== url)
    );
    setAttachments((prev) => prev.filter((u) => u !== url));
  }

  // Group visible fields (skip hidden locked ones like session_id)
  const visibleFields = fields.filter((f) => {
    if (f.locked && f.id === "locked_session_id") return false;
    return shouldShowField(f, formData);
  });

  const isView = mode === "view";

  return (
    <div className="space-y-4">
      {/* Locked fields summary (view mode shows them inline) */}
      {visibleFields
        .filter((f) => f.locked)
        .length > 0 && (
        <div className="rounded-lg bg-secondary p-3 space-y-1.5">
          {visibleFields
            .filter((f) => f.locked)
            .map((field) => (
              <div key={field.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{field.label}:</span>
                <span className="text-foreground font-medium">
                  {String(formData[field.id] ?? "—")}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Editable fields */}
      {visibleFields
        .filter((f) => !f.locked)
        .map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={formData[field.id]}
            error={errors[field.id]}
            onChange={(val) => setValue(field.id, val)}
            onFileUpload={(files) => handleFileUpload(field.id, files)}
            onFileRemove={(url) => removeFile(field.id, url)}
            uploading={uploading}
            readOnly={isView}
            fileInputRef={(el) => {
              fileInputRefs.current[field.id] = el;
            }}
          />
        ))}

      {/* Submit */}
      {!isView && (
        <div className="pt-2">
          {isOffline && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <WifiOff className="h-4 w-4 shrink-0" />
              <span>You are offline. Form will be saved locally and synced when connected.</span>
            </div>
          )}
          <Button
            className="w-full min-h-[48px]"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
            )}
            {isOffline ? "Save Locally" : "Submit Form"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Individual field renderers
// ============================================================

interface FieldRendererProps {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onFileUpload: (files: FileList | null) => void;
  onFileRemove: (url: string) => void;
  uploading: boolean;
  readOnly: boolean;
  fileInputRef: (el: HTMLInputElement | null) => void;
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
  onFileUpload,
  onFileRemove,
  uploading,
  readOnly,
  fileInputRef,
}: FieldRendererProps) {
  // Section header
  if (field.type === "heading") {
    return (
      <div className="pt-2">
        <Separator />
        <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-primary">
          {field.label}
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      {field.helpText && (
        <p className="text-xs text-muted-foreground/60">{field.helpText}</p>
      )}

      {/* Text */}
      {field.type === "text" && (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className="min-h-[44px]"
        />
      )}

      {/* Textarea */}
      {field.type === "textarea" && (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={readOnly}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          rows={4}
        />
      )}

      {/* Number */}
      {field.type === "number" && (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
          placeholder={field.placeholder}
          disabled={readOnly}
          className="min-h-[44px]"
        />
      )}

      {/* Date */}
      {field.type === "date" && (
        <Input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="min-h-[44px]"
        />
      )}

      {/* Time */}
      {field.type === "time" && (
        <Input
          type="time"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className="min-h-[44px]"
        />
      )}

      {/* Select (dropdown) */}
      {field.type === "select" && (
        readOnly ? (
          <Input value={String(value ?? "")} disabled className="min-h-[44px]" />
        ) : (
          <Select
            value={String(value ?? "")}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue placeholder={field.placeholder ?? "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}

      {/* Radio */}
      {field.type === "radio" && (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 cursor-pointer min-h-[44px]"
            >
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={readOnly}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Multi-select (checkboxes) */}
      {field.type === "multi_select" && (
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            const isChecked = selected.includes(opt);
            return (
              <label
                key={opt}
                className="flex items-center gap-2 cursor-pointer min-h-[44px]"
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) => {
                    if (readOnly) return;
                    const next = checked
                      ? [...selected, opt]
                      : selected.filter((v) => v !== opt);
                    onChange(next);
                  }}
                />
                <span className="text-sm">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Checkbox (single boolean) */}
      {field.type === "checkbox" && (
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <Checkbox
            checked={!!value}
            onCheckedChange={(checked) => {
              if (readOnly) return;
              onChange(!!checked);
            }}
          />
          <span className="text-sm text-foreground">{field.label}</span>
        </label>
      )}

      {/* Rating (1-5 stars) */}
      {field.type === "rating" && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => !readOnly && onChange(star)}
              className={`p-1 transition-colors ${
                readOnly ? "cursor-default" : "cursor-pointer"
              }`}
              disabled={readOnly}
              aria-label={`Rate ${star} out of 5`}
            >
              <Star
                className={`h-7 w-7 ${
                  (value as number) >= star
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/30"
                }`}
              />
            </button>
          ))}
          {value && (
            <span className="ml-2 text-sm text-muted-foreground self-center">
              {value}/5
            </span>
          )}
        </div>
      )}

      {/* File upload */}
      {field.type === "file" && (
        <div className="space-y-2">
          {/* Existing files */}
          {Array.isArray(value) && (value as string[]).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(value as string[]).map((url, idx) => (
                <div
                  key={url}
                  className="relative rounded-lg border overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Attachment ${idx + 1}`}
                    className="h-20 w-20 object-cover"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onFileRemove(url)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-red-500 p-0.5 text-white"
                      aria-label="Remove file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!readOnly && (
            <>
              <input
                id={`file-${field.id}`}
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple={field.maxFiles ? field.maxFiles > 1 : true}
                className="hidden"
                onChange={(e) => onFileUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  const input = document.getElementById(`file-${field.id}`) as HTMLInputElement;
                  input?.click();
                }}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Signature (typed name + acknowledgement) */}
      {field.type === "signature" && (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            value={
              typeof value === "object" && value !== null
                ? (value as Record<string, string>).name ?? ""
                : String(value ?? "")
            }
            onChange={(e) =>
              onChange({
                ...((typeof value === "object" && value !== null
                  ? value
                  : {}) as Record<string, unknown>),
                name: e.target.value,
              })
            }
            placeholder="Type your full name"
            disabled={readOnly}
            className="min-h-[44px]"
          />
          <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
            <Checkbox
              checked={
                typeof value === "object" && value !== null
                  ? !!(value as Record<string, unknown>).acknowledged
                  : false
              }
              onCheckedChange={(checked) => {
                if (readOnly) return;
                onChange({
                  ...((typeof value === "object" && value !== null
                    ? value
                    : {}) as Record<string, unknown>),
                  acknowledged: !!checked,
                });
              }}
            />
            <span className="text-xs text-muted-foreground">
              I confirm the information provided is accurate
            </span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}
