"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Trash2,
  Upload,
  GitBranch,
  Calendar,
  User,
  Eye,
  Pencil,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { getFileIcon } from "./document-list";
import {
  updateDocument,
  deleteDocument,
  uploadNewVersion,
  getDocumentVersionHistory,
} from "@/lib/documents/actions";
import { CATEGORY_LABELS } from "@/lib/documents/constants";
import type {
  DocumentListItem,
  DocumentVersionItem,
} from "@/lib/documents/actions";
import type { DocumentVisibility } from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Document Detail Sheet
// ============================================================

interface DocumentDetailSheetProps {
  document: DocumentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  userRole: "admin" | "ops" | "coach";
}

const VISIBILITY_LABELS: Record<DocumentVisibility, string> = {
  all: "Everyone",
  admin_ops: "Admin & Ops Only",
  admin_only: "Admin Only",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isPreviewable(fileName: string): "pdf" | "image" | false {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(ext ?? "")) return "image";
  return false;
}

export function DocumentDetailSheet({
  document: doc,
  open,
  onOpenChange,
  onUpdate,
  userRole,
}: DocumentDetailSheetProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editVisibility, setEditVisibility] =
    useState<DocumentVisibility>("all");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const versionFileRef = useRef<HTMLInputElement>(null);

  // Load version history when doc changes
  useEffect(() => {
    if (doc) {
      setEditing(false);
      setConfirmDelete(false);
      if (doc.parent_document_id || doc.version > 1) {
        setLoadingVersions(true);
        getDocumentVersionHistory(doc.id).then(({ data }) => {
          setVersions(data ?? []);
          setLoadingVersions(false);
        });
      } else {
        setVersions([]);
      }
    }
  }, [doc?.id]);

  if (!doc) return null;

  const previewType = isPreviewable(doc.file_name);
  const isAdmin = userRole === "admin";
  const canEdit = userRole === "admin" || userRole === "ops";

  function startEditing() {
    setEditTitle(doc!.title);
    setEditTags([...doc!.tags]);
    setEditVisibility(doc!.visibility);
    setEditing(true);
  }

  async function handleSaveEdits() {
    setSaving(true);
    const { error } = await updateDocument(doc!.id, {
      title: editTitle.trim() || doc!.title,
      tags: editTags,
      visibility: editVisibility,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Document updated.");
      setEditing(false);
      onUpdate();
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const { error } = await deleteDocument(doc!.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Document deleted.");
      onOpenChange(false);
      onUpdate();
    }
  }

  async function handleVersionUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVersion(true);
    const formData = new FormData();
    formData.append("file", file);

    const { error } = await uploadNewVersion(doc!.id, formData);
    setUploadingVersion(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("New version uploaded.");
      onUpdate();
      onOpenChange(false);
    }

    // Reset file input
    if (versionFileRef.current) versionFileRef.current.value = "";
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const t = tagInput.trim().replace(/,/g, "");
      if (t && !editTags.includes(t)) {
        setEditTags([...editTags, t]);
      }
      setTagInput("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5">{getFileIcon(doc.file_name)}</div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{doc.title}</SheetTitle>
              <SheetDescription>
                {CATEGORY_LABELS[doc.category]} · {doc.file_name}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 gap-6 px-4 pb-4">
          {/* Preview */}
          {previewType === "pdf" && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <iframe
                src={`${doc.file_url}#toolbar=0`}
                className="h-[300px] w-full"
                title={doc.title}
              />
            </div>
          )}

          {previewType === "image" && (
            <div className="rounded-2xl border border-border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.file_url}
                alt={doc.title}
                className="max-h-[300px] w-full object-contain bg-secondary"
              />
            </div>
          )}

          {!previewType && (
            <div className="rounded-2xl border border-border bg-secondary p-8 text-center">
              {getFileIcon(doc.file_name)}
              <p className="mt-2 text-sm text-muted-foreground">
                Preview not available for this file type.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <a href={doc.file_url} download={doc.file_name} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />
                Download
              </Button>
            </a>
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open
              </Button>
            </a>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => versionFileRef.current?.click()}
                  disabled={uploadingVersion}
                >
                  {uploadingVersion ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  New Version
                </Button>
                <input
                  ref={versionFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                  onChange={handleVersionUpload}
                />
              </>
            )}
          </div>

          <Separator />

          {/* Metadata */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Details</h3>
              {canEdit && !editing && (
                <Button variant="ghost" size="sm" onClick={startEditing}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                {/* Title */}
                <div className="space-y-1">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                {/* Visibility */}
                <div className="space-y-1">
                  <Label className="text-xs">Visibility</Label>
                  <Select
                    value={editVisibility}
                    onValueChange={(v) =>
                      setEditVisibility(v as DocumentVisibility)
                    }
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

                {/* Tags */}
                <div className="space-y-1">
                  <Label className="text-xs">Tags</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[36px] rounded-md border border-input bg-background px-3 py-2">
                    {editTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 text-xs"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() =>
                            setEditTags(editTags.filter((t) => t !== tag))
                          }
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
                      placeholder="Add tag…"
                      className="flex-1 min-w-[60px] bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={handleSaveEdits}
                    className="bg-primary text-white hover:bg-primary/90"
                  >
                    {saving && (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>{VISIBILITY_LABELS[doc.visibility]}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDate(doc.created_at)}</span>
                </div>
                {doc.uploaded_by_name && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{doc.uploaded_by_name}</span>
                  </div>
                )}
                {doc.version > 1 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                    <span>Version {doc.version}</span>
                  </div>
                )}
                {doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {doc.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Version History */}
          {versions.length > 1 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">
                  Version History
                </h3>
                {loadingVersions ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (
                  <div className="space-y-1.5">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between rounded-xl px-2 py-1.5 text-xs ${
                          v.id === doc.id
                            ? "bg-[var(--brand-orange-light)] text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        <span>
                          v{v.version} · {v.file_name}
                        </span>
                        <span>
                          {v.uploaded_by_name} · {formatDate(v.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Delete */}
          {isAdmin && (
            <>
              <Separator />
              <div>
                {!confirmDelete ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Delete Document
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={handleDelete}
                    >
                      {deleting && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Confirm Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
