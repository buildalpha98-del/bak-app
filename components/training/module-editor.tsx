"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTrainingModule,
  updateTrainingModule,
  publishTrainingModule,
} from "@/lib/training/actions";
import type { TrainingModule, VideoContent, DocumentContent, QuizContent, ChecklistContent } from "@/lib/types/database";
import type { TrainingModuleType, TrainingCategory } from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";
import { VideoEditor } from "@/components/training/editors/video-editor";
import { DocumentEditor } from "@/components/training/editors/document-editor";
import { QuizEditor } from "@/components/training/editors/quiz-editor";
import { ChecklistEditor } from "@/components/training/editors/checklist-editor";

// ─── Default content per type ──────────────────────────────────────────────

function defaultVideoContent(): VideoContent {
  return { video_url: "", video_type: "youtube", duration_seconds: 0, require_full_watch: false };
}
function defaultDocumentContent(): DocumentContent {
  return { file_url: "", file_name: "", file_type: "pdf", require_acknowledgement: false };
}
function defaultQuizContent(): QuizContent {
  return { pass_mark: 80, allow_retries: true, max_retries: 3, randomise_order: false, questions: [] };
}
function defaultChecklistContent(): ChecklistContent {
  return { items: [] };
}

function defaultContent(type: TrainingModuleType): VideoContent | DocumentContent | QuizContent | ChecklistContent {
  switch (type) {
    case "video":     return defaultVideoContent();
    case "document":  return defaultDocumentContent();
    case "quiz":      return defaultQuizContent();
    case "checklist": return defaultChecklistContent();
  }
}

// ─── Status badge ───────────────────────────────────────────────────────────

const STATUS_STYLE = {
  draft:     "bg-secondary text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700",
  archived:  "bg-red-100 text-red-700",
} as const;

// ─── Props ──────────────────────────────────────────────────────────────────

interface ModuleEditorProps {
  mode: "create";
  module?: undefined;
}
interface ModuleEditorEditProps {
  mode: "edit";
  module: TrainingModule;
}

type Props = ModuleEditorProps | ModuleEditorEditProps;

// ─── Component ──────────────────────────────────────────────────────────────

export function ModuleEditor({ mode, module }: Props) {
  const router = useRouter();

  // Common fields
  const [title, setTitle]                     = useState(module?.title ?? "");
  const [description, setDescription]         = useState(module?.description ?? "");
  const [type, setType]                       = useState<TrainingModuleType>(module?.type ?? "video");
  const [category, setCategory]               = useState<TrainingCategory>(module?.category ?? "onboarding");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>(
    module?.estimated_minutes != null ? String(module.estimated_minutes) : ""
  );
  const [isMandatory, setIsMandatory]         = useState(module?.is_mandatory ?? false);
  const [requiredSports, setRequiredSports]   = useState<string[]>(module?.required_for_sports ?? []);

  // Type-specific content
  const [content, setContent] = useState<VideoContent | DocumentContent | QuizContent | ChecklistContent>(
    module?.content_json ?? defaultContent(module?.type ?? "video")
  );

  const [saving, setSaving]       = useState(false);
  const [publishing, setPublishing] = useState(false);

  // When type changes on create, reset content
  function handleTypeChange(newType: TrainingModuleType) {
    setType(newType);
    setContent(defaultContent(newType));
  }

  function toggleSport(sport: string) {
    setRequiredSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  const handleContentChange = useCallback(
    (next: VideoContent | DocumentContent | QuizContent | ChecklistContent) => {
      setContent(next);
    },
    []
  );

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Please enter a module title.");
      return;
    }

    const payload = {
      title:               title.trim(),
      description:         description.trim() || undefined,
      type,
      category,
      content_json:        content as unknown as Record<string, unknown>,
      estimated_minutes:   estimatedMinutes ? Number(estimatedMinutes) : undefined,
      is_mandatory:        isMandatory,
      required_for_sports: requiredSports.length > 0 ? requiredSports : undefined,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const result = await createTrainingModule(payload);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success("Module saved as draft.");
        router.push(`/admin/training/modules/${result.id}/edit`);
      } else {
        const result = await updateTrainingModule(module.id, {
          title:               payload.title,
          description:         payload.description,
          category:            payload.category,
          content_json:        payload.content_json as unknown as Record<string, unknown>,
          estimated_minutes:   payload.estimated_minutes,
          is_mandatory:        payload.is_mandatory,
          required_for_sports: payload.required_for_sports,
        });
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success("Module updated.");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (mode === "create") {
      toast.error("Save the module first before publishing.");
      return;
    }
    setPublishing(true);
    try {
      const result = await publishTrainingModule(module.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Module published.");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status indicator (edit mode only) */}
      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Badge className={STATUS_STYLE[module.status]}>
            {module.status.charAt(0).toUpperCase() + module.status.slice(1)}
          </Badge>
          {module.status === "published" && (
            <BadgeCheck className="h-4 w-4 text-emerald-600" />
          )}
        </div>
      )}

      {/* Common fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Soccer Session Safety Checklist"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of what this module covers…"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => handleTypeChange(v as TrainingModuleType)}
                disabled={mode === "edit"}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="quiz">Quiz</SelectItem>
                  <SelectItem value="checklist">Checklist</SelectItem>
                </SelectContent>
              </Select>
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">
                  Type cannot be changed after creation.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as TrainingCategory)}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="sport_specific">Sport Specific</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="professional_development">
                    Professional Development
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="estimated-minutes">Estimated Duration (minutes)</Label>
              <Input
                id="estimated-minutes"
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="e.g. 15"
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="is-mandatory"
                checked={isMandatory}
                onCheckedChange={(checked) => setIsMandatory(Boolean(checked))}
              />
              <Label htmlFor="is-mandatory" className="cursor-pointer">
                Mandatory for all coaches
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required for sports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Required for Sports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Select which sports this module is required for. Leave blank if it applies to all
            or is not sport-specific.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SPORTS.map((sport) => (
              <div key={sport} className="flex items-center gap-2">
                <Checkbox
                  id={`sport-${sport}`}
                  checked={requiredSports.includes(sport)}
                  onCheckedChange={() => toggleSport(sport)}
                />
                <Label htmlFor={`sport-${sport}`} className="text-sm cursor-pointer">
                  {sport}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Type-specific content editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          {type === "video" && (
            <VideoEditor
              value={content as VideoContent}
              onChange={handleContentChange as (v: VideoContent) => void}
            />
          )}
          {type === "document" && (
            <DocumentEditor
              value={content as DocumentContent}
              onChange={handleContentChange as (v: DocumentContent) => void}
            />
          )}
          {type === "quiz" && (
            <QuizEditor
              value={content as QuizContent}
              onChange={handleContentChange as (v: QuizContent) => void}
            />
          )}
          {type === "checklist" && (
            <ChecklistEditor
              value={content as ChecklistContent}
              onChange={handleContentChange as (v: ChecklistContent) => void}
            />
          )}
        </CardContent>
      </Card>

      {/* Footer actions */}
      <div className="flex items-center gap-3 pb-8">
        <Button
          onClick={handleSave}
          disabled={saving || publishing}
          className="bg-primary text-white hover:bg-primary/90"
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Draft
        </Button>

        {mode === "edit" && module.status !== "published" && (
          <Button
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePublish}
            disabled={saving || publishing}
          >
            {publishing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish
          </Button>
        )}

        <Link href="/admin/training" className="ml-auto">
          <Button variant="ghost">Cancel</Button>
        </Link>
      </div>
    </div>
  );
}
