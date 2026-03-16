"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  ClipboardList,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SPORTS, type AgeGroup } from "@/lib/types/enums";
import type { AssessmentSkill } from "@/lib/types/database";
import {
  createAssessmentTemplate,
  type AssessmentTemplateListItem,
} from "@/lib/assessments/actions";

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  "3-5": "3\u20135 years",
  "5-8": "5\u20138 years",
  "8-12": "8\u201312 years",
};

interface AssessmentListViewProps {
  templates: AssessmentTemplateListItem[];
  centres: { id: string; name: string }[];
  terms: { id: string; name: string }[];
  basePath: string;
}

export function AssessmentListView({
  templates,
  centres,
  terms,
  basePath,
}: AssessmentListViewProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.sport.toLowerCase().includes(q));
  }, [templates, search]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by sport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          className="min-h-[44px] sm:min-h-0"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create Assessment
        </Button>
      </div>

      {/* Table or Empty State */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No assessment templates found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try adjusting your search."
              : "Create your first assessment template to get started."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sport</TableHead>
                <TableHead>Age Group</TableHead>
                <TableHead className="hidden sm:table-cell">Skills</TableHead>
                <TableHead className="hidden md:table-cell">Term</TableHead>
                <TableHead className="hidden md:table-cell">Centre</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`${basePath}/${template.id}`)}
                >
                  <TableCell className="font-medium">
                    {template.sport}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {AGE_GROUP_LABELS[template.age_group]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {template.skill_count}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {template.term_name ?? "\u2014"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {template.centre_name ?? "\u2014"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {new Date(template.created_at).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <CreateAssessmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        centres={centres}
        terms={terms}
      />
    </div>
  );
}

// ============================================================
// Create Assessment Dialog
// ============================================================

function CreateAssessmentDialog({
  open,
  onOpenChange,
  centres,
  terms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centres: { id: string; name: string }[];
  terms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sport, setSport] = useState("");
  const [ageGroup, setAgeGroup] = useState<AgeGroup | "">("");
  const [termId, setTermId] = useState("");
  const [centreId, setCentreId] = useState("");
  const [skills, setSkills] = useState<AssessmentSkill[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();

  function resetForm() {
    setSport("");
    setAgeGroup("");
    setTermId("");
    setCentreId("");
    setSkills([]);
    setIsGenerating(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleGenerate() {
    if (!sport || !ageGroup) {
      toast.error("Please select a sport and age group first.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/assessments/generate-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, ageGroup }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate skills.");
      }

      const data = await res.json();
      setSkills(data.data ?? []);
      toast.success("Skills generated successfully.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate skills."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRemoveSkill(index: number) {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddSkill() {
    setSkills((prev) => [...prev, { name: "", description: "" }]);
  }

  function handleSkillChange(
    index: number,
    field: keyof AssessmentSkill,
    value: string
  ) {
    setSkills((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function handleSave() {
    if (!sport || !ageGroup) {
      toast.error("Please select a sport and age group.");
      return;
    }

    const validSkills = skills.filter((s) => s.name.trim());
    if (validSkills.length === 0) {
      toast.error("Please add at least one skill.");
      return;
    }

    startSaveTransition(async () => {
      const { data, error } = await createAssessmentTemplate({
        sport,
        age_group: ageGroup as AgeGroup,
        skills_json: validSkills,
        term_id: termId || null,
        centre_id: centreId || null,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success("Assessment template created.");
      handleOpenChange(false);
      router.refresh();
    });
  }

  const canGenerate = sport && ageGroup;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Assessment Template</DialogTitle>
          <DialogDescription>
            Select a sport and age group, then generate or add skills to assess.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sport Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Sport <span className="text-destructive">*</span>
            </label>
            <Select
              value={sport}
              onValueChange={(v) => setSport(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                {SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Age Group Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Age Group <span className="text-destructive">*</span>
            </label>
            <Select
              value={ageGroup}
              onValueChange={(v) => setAgeGroup((v ?? "") as AgeGroup | "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="Select age group" />
              </SelectTrigger>
              <SelectContent>
                {AGE_GROUPS.map((ag) => (
                  <SelectItem key={ag} value={ag}>
                    {AGE_GROUP_LABELS[ag]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Term Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Term{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <Select
              value={termId}
              onValueChange={(v) => setTermId(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="All terms" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Centre Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Centre{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <Select
              value={centreId}
              onValueChange={(v) => setCentreId(v ?? "")}
            >
              <SelectTrigger className="w-full min-h-[44px]">
                <SelectValue placeholder="All centres" />
              </SelectTrigger>
              <SelectContent>
                {centres.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Generate Skills Button */}
          <Button
            variant="secondary"
            className="w-full min-h-[44px]"
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? "Generating skills..." : "Generate Skills"}
          </Button>

          {/* Skills List */}
          {skills.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Skills ({skills.length})
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAddSkill}
                  className="min-h-[44px] sm:min-h-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Skill
                </Button>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto rounded-lg border border-border p-3">
                {skills.map((skill, index) => (
                  <div
                    key={index}
                    className="flex gap-2 items-start rounded-md border border-border bg-muted/30 p-2"
                  >
                    <div className="flex-1 space-y-1.5">
                      <Input
                        placeholder="Skill name"
                        value={skill.name}
                        onChange={(e) =>
                          handleSkillChange(index, "name", e.target.value)
                        }
                        className="text-sm min-h-[44px]"
                      />
                      <Input
                        placeholder="Description"
                        value={skill.description}
                        onChange={(e) =>
                          handleSkillChange(
                            index,
                            "description",
                            e.target.value
                          )
                        }
                        className="text-sm min-h-[44px]"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-1 min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveSkill(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove skill</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            className="min-h-[44px]"
            onClick={handleSave}
            disabled={isSaving || skills.length === 0}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
