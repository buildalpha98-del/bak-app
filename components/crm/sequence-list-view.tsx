"use client";

import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Plus,
  Loader2,
  ToggleLeft,
  ToggleRight,
  ListChecks,
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
  createSequence,
  updateSequence,
} from "@/lib/crm/sequence-actions";
import type { SequenceWithSteps } from "@/lib/crm/sequence-actions";
import { toast } from "sonner";

// ============================================================
// Helpers
// ============================================================

const TRIGGER_STAGES = [
  { value: "cold_lead", label: "Cold Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "free_trial", label: "Free Trial" },
  { value: "proposal_sent", label: "Proposal Sent" },
] as const;

function formatTriggerStage(stage: string): string {
  const found = TRIGGER_STAGES.find((s) => s.value === stage);
  return found?.label ?? stage;
}

function triggerStageBadgeVariant(
  stage: string
): "default" | "secondary" | "outline" | "destructive" {
  switch (stage) {
    case "cold_lead":
      return "outline";
    case "contacted":
      return "secondary";
    case "interested":
      return "default";
    case "free_trial":
      return "default";
    case "proposal_sent":
      return "secondary";
    default:
      return "outline";
  }
}

// ============================================================
// Component
// ============================================================

interface SequenceListViewProps {
  sequences: SequenceWithSteps[];
}

export function SequenceListView({ sequences }: SequenceListViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerStage, setTriggerStage] = useState("cold_lead");
  const [error, setError] = useState<string | null>(null);

  // Toggle active state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setDescription("");
    setTriggerStage("cold_lead");
    setError(null);
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Sequence name is required.");
      return;
    }
    setCreating(true);
    setError(null);

    const { error: createError } = await createSequence({
      name: name.trim(),
      description: description.trim() || undefined,
      trigger_stage: triggerStage,
    });

    setCreating(false);

    if (createError) {
      setError(createError);
      return;
    }

    toast.success("Sequence created.");
    setDialogOpen(false);
    resetForm();
    startTransition(() => router.refresh());
  }

  async function handleToggleActive(seq: SequenceWithSteps) {
    setTogglingId(seq.id);
    const { error: toggleError } = await updateSequence(seq.id, {
      is_active: !seq.is_active,
    });
    setTogglingId(null);

    if (toggleError) {
      toast.error(toggleError);
      return;
    }

    toast.success(
      seq.is_active ? "Sequence deactivated." : "Sequence activated."
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Email Sequences
          </h1>
          <p className="text-sm text-muted-foreground">
            {sequences.length} sequence{sequences.length !== 1 ? "s" : ""}{" "}
            configured
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Create Sequence
        </Button>
      </div>

      {/* Sequence list */}
      {sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Mail className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No sequences yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Create your first email sequence to automate outreach
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sequences.map((seq) => (
            <Card
              key={seq.id}
              className="group relative transition-shadow hover:shadow-md"
            >
              <CardContent className="p-4">
                {/* Clickable area */}
                <Link
                  href={`/admin/crm/sequences/${seq.id}`}
                  className="block space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {seq.name}
                    </h3>
                    <Badge
                      variant={triggerStageBadgeVariant(seq.trigger_stage)}
                      className="shrink-0 text-xs"
                    >
                      {formatTriggerStage(seq.trigger_stage)}
                    </Badge>
                  </div>

                  {seq.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {seq.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListChecks className="size-3.5" />
                      {seq.step_count} step{seq.step_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </Link>

                {/* Active toggle — outside the link */}
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">
                    {seq.is_active ? "Active" : "Inactive"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={togglingId === seq.id || isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleToggleActive(seq);
                    }}
                  >
                    {togglingId === seq.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : seq.is_active ? (
                      <ToggleRight className="size-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="size-4 text-muted-foreground" />
                    )}
                    {seq.is_active ? "On" : "Off"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Sequence Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Sequence</DialogTitle>
            <DialogDescription>
              Set up a new automated email sequence for leads
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seqName">Name</Label>
              <Input
                id="seqName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. New Centre Welcome Series"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seqDescription">Description</Label>
              <Textarea
                id="seqDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this sequence..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seqTrigger">Trigger Stage</Label>
              <Select
                value={triggerStage}
                onValueChange={(v) => setTriggerStage(v ?? "")}
              >
                <SelectTrigger id="seqTrigger">
                  <SelectValue placeholder="Select trigger stage" />
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

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="size-4 animate-spin" />}
              {creating ? "Creating..." : "Create Sequence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
