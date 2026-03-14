"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  FileText,
  Building2,
  Copy,
  Loader2,
} from "lucide-react";
import {
  createFormTemplate,
  duplicateTemplate,
  getCentresForFilter,
} from "@/lib/forms/actions";
import { FORM_TYPE_LABELS, FORM_TYPES, DEFAULT_TEMPLATES } from "@/lib/forms/constants";
import type { FormTemplateListItem } from "@/lib/forms/actions";
import { toast } from "sonner";

// ============================================================
// Form Template List — admin template management
// ============================================================

interface FormTemplateListProps {
  initialTemplates: FormTemplateListItem[];
  basePath: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FormTemplateList({
  initialTemplates,
  basePath,
}: FormTemplateListProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>(FORM_TYPES[0]);
  const [creating, setCreating] = useState(false);

  // Duplicate dialog state
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeTemplateId, setDupeTemplateId] = useState<string | null>(null);
  const [dupeName, setDupeName] = useState("");
  const [dupeCentreId, setDupeCentreId] = useState<string | null>(null);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [duplicating, setDuplicating] = useState(false);

  const filtered = templates.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && t.form_type !== typeFilter) return false;
    return true;
  });

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("Please enter a template name.");
      return;
    }
    setCreating(true);

    // Use default fields if creating a standard type
    const defaultDef = DEFAULT_TEMPLATES[newType];
    const fields = defaultDef?.fields ?? [];

    const { data, error } = await createFormTemplate({
      name: newName.trim(),
      formType: newType,
      fieldsJson: fields,
      isDefault: false,
      centreId: null,
    });
    setCreating(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success("Template created.");
      setCreateOpen(false);
      setNewName("");
      router.push(`${basePath}/${data.id}/edit`);
    }
  }

  async function openDuplicateDialog(templateId: string, templateName: string) {
    setDupeTemplateId(templateId);
    setDupeName(`${templateName} (Copy)`);
    setDupeCentreId(null);
    setDupeOpen(true);

    // Load centres
    const { data } = await getCentresForFilter();
    setCentres(data ?? []);
  }

  async function handleDuplicate() {
    if (!dupeTemplateId) return;
    setDuplicating(true);
    const { data, error } = await duplicateTemplate(
      dupeTemplateId,
      dupeCentreId,
      dupeName.trim() || undefined
    );
    setDuplicating(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      toast.success("Template duplicated.");
      setDupeOpen(false);
      router.push(`${basePath}/${data.id}/edit`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Form Templates</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage form templates for your organisation.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create Template
        </Button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Form Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {FORM_TYPES.map((ft) => (
              <SelectItem key={ft} value={ft}>
                {FORM_TYPE_LABELS[ft] ?? ft}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Template list */}
      <div className="mt-6 space-y-2">
        {filtered.length > 0 ? (
          filtered.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer transition-shadow hover:shadow-md card-hover"
              onClick={() => router.push(`${basePath}/${template.id}/edit`)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {template.name}
                      </span>
                      {template.is_default && (
                        <Badge className="bg-primary text-white text-[10px]">
                          Default
                        </Badge>
                      )}
                      {template.centre_name && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Building2 className="h-3 w-3" />
                          {template.centre_name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {FORM_TYPE_LABELS[template.form_type] ?? template.form_type} ·{" "}
                      {template.field_count} field{template.field_count !== 1 ? "s" : ""} ·
                      Updated {formatDate(template.updated_at)}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDuplicateDialog(template.id, template.name);
                  }}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Duplicate
                </Button>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No templates found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first form template to get started.
            </p>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Form Template</DialogTitle>
            <DialogDescription>
              Create a new form template. You can customise the fields after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Custom Attendance Form"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Form Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v ?? "")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FORM_TYPE_LABELS[ft] ?? ft}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Template</DialogTitle>
            <DialogDescription>
              Create a copy of this template. Optionally assign it to a specific centre.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>New Template Name</Label>
              <Input
                value={dupeName}
                onChange={(e) => setDupeName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Centre (optional)</Label>
              <Select
                value={dupeCentreId ?? "none"}
                onValueChange={(v) => setDupeCentreId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Global (all centres)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Global (all centres)</SelectItem>
                  {centres.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground/60">
                Centre-specific templates override the default for that centre.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDupeOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDuplicate} disabled={duplicating}>
                {duplicating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Duplicate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
