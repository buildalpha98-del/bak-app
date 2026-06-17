"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  X,
  Loader2,
  Image as ImageIcon,
  FileSpreadsheet,
} from "lucide-react";
import { uploadDocument } from "@/lib/documents/actions";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/documents/constants";
import type { DocumentCategory, DocumentVisibility } from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Upload Document Dialog
// ============================================================

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultCategory?: DocumentCategory;
  userRole?: "admin" | "ops" | "coach";
}

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  all: "Everyone",
  admin_ops: "Admin & Ops Only",
  admin_only: "Admin Only",
};

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-8 w-8 text-red-500" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext ?? ""))
    return <ImageIcon className="h-8 w-8 text-blue-500" />;
  if (["xls", "xlsx"].includes(ext ?? ""))
    return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
  return <FileText className="h-8 w-8 text-muted-foreground" />;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultCategory,
  userRole,
}: DocumentUploadDialogProps) {
  const isCoach = userRole === "coach";
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>(
    isCoach ? "compliance" : (defaultCategory ?? "other")
  );
  const [visibility, setVisibility] = useState<DocumentVisibility>(
    isCoach ? "admin_ops" : "all"
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setCategory(isCoach ? "compliance" : (defaultCategory ?? "other"));
    setVisibility(isCoach ? "admin_ops" : "all");
    setTags([]);
    setTagInput("");
  }

  function handleFileSelect(f: File) {
    setFile(f);
    if (!title) {
      // Auto-populate title from filename (without extension)
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setTitle(name);
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [title]
  );

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const t = tagInput.trim().replace(/,/g, "");
      if (t && !tags.includes(t)) {
        setTags([...tags, t]);
      }
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleUpload() {
    if (!file) return;
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("category", isCoach ? "compliance" : category);
    formData.append("tags", JSON.stringify(tags));
    formData.append("visibility", isCoach ? "admin_ops" : visibility);

    const { error } = await uploadDocument(formData);
    setUploading(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Document uploaded.");
      reset();
      onOpenChange(false);
      onSuccess();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a file to the document hub.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`group cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                dragOver
                  ? "border-[#E8712A] bg-[#E8712A]/5 ring-2 ring-[#E8712A]/20"
                  : "border-border hover:border-[#E8712A]/60 hover:ring-2 hover:ring-[#E8712A]/10"
              }`}
            >
              <Upload
                className={`mx-auto h-10 w-10 transition ${
                  dragOver
                    ? "text-[#E8712A]"
                    : "text-muted-foreground/60 group-hover:text-[#E8712A]/80"
                }`}
              />
              <p className="mt-3 text-sm font-medium text-foreground">
                Drag & drop a file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                PDF, DOC, DOCX, XLS, XLSX, JPEG, PNG, WebP — max 25MB
              </p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 p-3">
              {getFileIcon(file.name)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setFile(null)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            {isCoach ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {CATEGORY_LABELS["compliance"]}
              </div>
            ) : (
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as DocumentCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Visibility — hidden for coaches (auto-set to admin_ops) */}
          {!isCoach && (
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as DocumentVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(VISIBILITY_LABELS) as [
                      DocumentVisibility,
                      string,
                    ][]
                  ).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[36px] rounded-md border border-input bg-background px-3 py-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-0.5 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
                className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !title.trim() || uploading}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {uploading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
