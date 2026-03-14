"use client";

import { useRef } from "react";
import { FileText, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { DocumentContent } from "@/lib/types/database";

interface DocumentEditorProps {
  value: DocumentContent;
  onChange: (value: DocumentContent) => void;
}

export function DocumentEditor({ value, onChange }: DocumentEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine file type from name extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fileType: DocumentContent["file_type"] =
      ext === "docx" ? "docx" : "pdf";

    // In a real implementation this would upload to Supabase Storage
    // and set file_url to the returned public URL. For now we track the name.
    onChange({
      ...value,
      file_name: file.name,
      file_type: fileType,
      // file_url will be set after actual upload
    });
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">Click to upload document</p>
          <p className="text-xs text-muted-foreground">PDF or DOCX, max 20 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* File preview */}
      {value.file_name ? (
        <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-lg border">
          <FileText className="h-5 w-5 text-purple-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{value.file_name}</p>
            <p className="text-xs text-muted-foreground uppercase">{value.file_type}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={() => onChange({ ...value, file_name: "", file_url: "" })}
          >
            Remove
          </Button>
        </div>
      ) : null}

      {/* Manual URL input (for existing files) */}
      <div className="space-y-1.5">
        <Label htmlFor="file-url">Or enter file URL</Label>
        <Input
          id="file-url"
          type="url"
          value={value.file_url}
          onChange={(e) => onChange({ ...value, file_url: e.target.value })}
          placeholder="https://storage.supabase.co/…"
        />
      </div>

      {/* Require acknowledgement */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="require-ack"
          checked={value.require_acknowledgement}
          onCheckedChange={(checked) =>
            onChange({ ...value, require_acknowledgement: Boolean(checked) })
          }
        />
        <Label htmlFor="require-ack" className="cursor-pointer">
          Require coaches to acknowledge they have read this document
        </Label>
      </div>
    </div>
  );
}
