"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Eye,
  Clock,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  updateSequence,
  upsertStep,
  deleteStep,
} from "@/lib/crm/sequence-actions";
import type { SequenceWithSteps } from "@/lib/crm/sequence-actions";
import type { EmailSequenceStep } from "@/lib/types/database";
import { SPORTS } from "@/lib/types/enums";
import { toast } from "sonner";

// ============================================================
// Constants
// ============================================================

const TRIGGER_STAGES = [
  { value: "cold_lead", label: "Cold Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "free_trial", label: "Free Trial" },
  { value: "proposal_sent", label: "Proposal Sent" },
] as const;

const MERGE_FIELDS = [
  { tag: "{centre_name}", label: "Centre Name" },
  { tag: "{contact_name}", label: "Contact Name" },
  { tag: "{your_name}", label: "Your Name" },
  { tag: "{sport_list}", label: "Sport List" },
] as const;

const SAMPLE_MERGE_VALUES: Record<string, string> = {
  "{centre_name}": "Sunshine Childcare",
  "{contact_name}": "Sarah Johnson",
  "{your_name}": "The Build Alpha Kids Team",
  "{sport_list}": SPORTS.slice(0, 5).join(", "),
};

// ============================================================
// Component
// ============================================================

interface SequenceEditorProps {
  sequence: SequenceWithSteps;
}

export function SequenceEditor({ sequence }: SequenceEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Header state
  const [name, setName] = useState(sequence.name);
  const [description, setDescription] = useState(sequence.description ?? "");
  const [triggerStage, setTriggerStage] = useState(sequence.trigger_stage);
  const [isActive, setIsActive] = useState(sequence.is_active);
  const [savingHeader, setSavingHeader] = useState(false);

  // Steps state
  const [steps, setSteps] = useState<EmailSequenceStep[]>(sequence.steps);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [savingStepId, setSavingStepId] = useState<string | null>(null);
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingStep, setAddingStep] = useState(false);

  // Step edit state (for the currently expanded step)
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDelay, setEditDelay] = useState(0);

  // Preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);

  // Body textarea ref for merge field insertion
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Dirty tracking for header
  const headerDirty =
    name !== sequence.name ||
    description !== (sequence.description ?? "") ||
    triggerStage !== sequence.trigger_stage ||
    isActive !== sequence.is_active;

  // ============================================================
  // Header actions
  // ============================================================

  async function handleSaveHeader() {
    if (!name.trim()) {
      toast.error("Sequence name is required.");
      return;
    }
    setSavingHeader(true);
    const { error } = await updateSequence(sequence.id, {
      name: name.trim(),
      description: description.trim() || null,
      trigger_stage: triggerStage,
      is_active: isActive,
    });
    setSavingHeader(false);

    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Sequence updated.");
    startTransition(() => router.refresh());
  }

  async function handleToggleActive() {
    const newValue = !isActive;
    setIsActive(newValue);
    const { error } = await updateSequence(sequence.id, {
      is_active: newValue,
    });
    if (error) {
      setIsActive(!newValue);
      toast.error(error);
      return;
    }
    toast.success(newValue ? "Sequence activated." : "Sequence deactivated.");
    startTransition(() => router.refresh());
  }

  // ============================================================
  // Step actions
  // ============================================================

  function handleExpandStep(step: EmailSequenceStep) {
    if (expandedStepId === step.id) {
      setExpandedStepId(null);
      return;
    }
    setExpandedStepId(step.id);
    setEditSubject(step.subject);
    setEditBody(step.body);
    setEditDelay(step.delay_days);
  }

  function insertMergeField(tag: string) {
    const textarea = bodyRef.current;
    if (!textarea) {
      setEditBody((prev) => prev + tag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editBody.slice(0, start);
    const after = editBody.slice(end);
    const newBody = before + tag + after;
    setEditBody(newBody);

    // Restore cursor position after the inserted tag
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursor = start + tag.length;
      textarea.setSelectionRange(newCursor, newCursor);
    });
  }

  async function handleSaveStep(step: EmailSequenceStep) {
    if (!editSubject.trim()) {
      toast.error("Subject line is required.");
      return;
    }
    setSavingStepId(step.id);
    const { data, error } = await upsertStep(sequence.id, {
      id: step.id,
      step_number: step.step_number,
      delay_days: editDelay,
      subject: editSubject.trim(),
      body: editBody.trim(),
    });
    setSavingStepId(null);

    if (error) {
      toast.error(error);
      return;
    }

    // Update local state
    if (data) {
      setSteps((prev) =>
        prev.map((s) => (s.id === step.id ? data : s))
      );
    }
    toast.success("Step saved.");
    setExpandedStepId(null);
    startTransition(() => router.refresh());
  }

  async function handleDeleteStep(stepId: string) {
    setDeletingStepId(stepId);
    const { error } = await deleteStep(stepId);
    setDeletingStepId(null);
    setConfirmDeleteId(null);

    if (error) {
      toast.error(error);
      return;
    }

    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    if (expandedStepId === stepId) setExpandedStepId(null);
    toast.success("Step deleted.");
    startTransition(() => router.refresh());
  }

  async function handleAddStep() {
    const nextNumber = steps.length + 1;
    const defaultDelay = steps.length === 0 ? 0 : 3;

    setAddingStep(true);
    const { data, error } = await upsertStep(sequence.id, {
      step_number: nextNumber,
      delay_days: defaultDelay,
      subject: "",
      body: "",
    });
    setAddingStep(false);

    if (error) {
      toast.error(error);
      return;
    }

    if (data) {
      setSteps((prev) => [...prev, data]);
      // Auto-expand the new step for editing
      setExpandedStepId(data.id);
      setEditSubject("");
      setEditBody("");
      setEditDelay(defaultDelay);
    }
    toast.success("Step added.");
    startTransition(() => router.refresh());
  }

  // ============================================================
  // Preview
  // ============================================================

  function applyMergeFields(text: string): string {
    let result = text;
    for (const [tag, value] of Object.entries(SAMPLE_MERGE_VALUES)) {
      result = result.replaceAll(tag, value);
    }
    return result;
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 animate-fade-up">
      {/* Back link */}
      <Link
        href="/admin/crm/sequences"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Sequences
      </Link>

      {/* ============================================ */}
      {/* Sequence Header */}
      {/* ============================================ */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-lg font-semibold text-foreground">
              Edit Sequence
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleToggleActive}
              >
                {isActive ? (
                  <ToggleRight className="size-4 text-green-600" />
                ) : (
                  <ToggleLeft className="size-4 text-muted-foreground" />
                )}
                {isActive ? "Active" : "Inactive"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="seqName">Name</Label>
              <Input
                id="seqName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sequence name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seqTrigger">Trigger Stage</Label>
              <Select
                value={triggerStage}
                onValueChange={(v) => { if (v) setTriggerStage(v as typeof triggerStage); }}
              >
                <SelectTrigger id="seqTrigger">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="seqDesc">Description</Label>
            <Textarea
              id="seqDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this sequence do?"
              rows={2}
            />
          </div>

          {headerDirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveHeader}
                disabled={savingHeader || isPending}
              >
                {savingHeader ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {savingHeader ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* Step Timeline */}
      {/* ============================================ */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-medium text-foreground">Steps</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
          disabled={steps.length === 0}
        >
          <Eye className="size-4" />
          Preview
        </Button>
      </div>

      {steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center mb-4">
          <Mail className="mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No steps yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Add your first email step to build the sequence
          </p>
        </div>
      ) : (
        <div className="relative space-y-0 mb-4">
          {/* Vertical timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

          {steps.map((step, idx) => {
            const isExpanded = expandedStepId === step.id;
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="relative pl-12 pb-4">
                {/* Timeline dot */}
                <div className="absolute left-3.5 top-4 size-3 rounded-full border-2 border-primary bg-background" />

                <Card
                  className={`transition-shadow ${
                    isExpanded ? "shadow-md ring-1 ring-primary/20" : ""
                  }`}
                >
                  <CardContent className="p-4">
                    {/* Step header — always visible */}
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 text-left"
                      onClick={() => handleExpandStep(step)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className="shrink-0 text-xs">
                          Step {step.step_number}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <Clock className="size-3" />
                          Day {step.delay_days}
                        </span>
                        <span className="text-sm text-foreground truncate">
                          {step.subject || "(no subject)"}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      )}
                    </button>

                    {/* Expanded edit form */}
                    {isExpanded && (
                      <div className="mt-4 space-y-4 border-t pt-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`step-subject-${step.id}`}>
                              Subject
                            </Label>
                            <Input
                              id={`step-subject-${step.id}`}
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="Email subject line"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`step-delay-${step.id}`}>
                              Delay (days)
                            </Label>
                            <Input
                              id={`step-delay-${step.id}`}
                              type="number"
                              min={0}
                              value={editDelay}
                              onChange={(e) =>
                                setEditDelay(
                                  Math.max(0, parseInt(e.target.value, 10) || 0)
                                )
                              }
                            />
                          </div>
                        </div>

                        {/* Merge field buttons */}
                        <div className="space-y-2">
                          <Label>Merge Fields</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {MERGE_FIELDS.map((field) => (
                              <Button
                                key={field.tag}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => insertMergeField(field.tag)}
                              >
                                {field.tag}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`step-body-${step.id}`}>Body</Label>
                          <Textarea
                            id={`step-body-${step.id}`}
                            ref={bodyRef}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            placeholder="Email body content..."
                            rows={6}
                          />
                        </div>

                        {/* Step actions */}
                        <div className="flex items-center justify-between">
                          <div>
                            {confirmDeleteId === step.id ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={deletingStepId === step.id}
                                  onClick={() => handleDeleteStep(step.id)}
                                >
                                  {deletingStepId === step.id && (
                                    <Loader2 className="size-4 animate-spin" />
                                  )}
                                  Confirm Delete
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => setConfirmDeleteId(step.id)}
                              >
                                <Trash2 className="size-4" />
                                Delete Step
                              </Button>
                            )}
                          </div>

                          <Button
                            size="sm"
                            onClick={() => handleSaveStep(step)}
                            disabled={savingStepId === step.id || isPending}
                          >
                            {savingStepId === step.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4" />
                            )}
                            {savingStepId === step.id
                              ? "Saving..."
                              : "Save Step"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Step button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={handleAddStep}
          disabled={addingStep || isPending}
          className="gap-1.5"
        >
          {addingStep ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {addingStep ? "Adding..." : "Add Step"}
        </Button>
      </div>

      {/* ============================================ */}
      {/* Preview Dialog */}
      {/* ============================================ */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sequence Preview</DialogTitle>
            <DialogDescription>
              Preview emails with sample merge values
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {steps.map((step) => (
              <Card key={step.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Step {step.step_number}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      Day {step.delay_days}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Subject: {applyMergeFields(step.subject) || "(no subject)"}
                  </p>
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-foreground whitespace-pre-wrap">
                    {applyMergeFields(step.body) || "(no body)"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <DialogFooter showCloseButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

