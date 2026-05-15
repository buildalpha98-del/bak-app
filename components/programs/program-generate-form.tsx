"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Save, RefreshCw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { EquipmentPicker, STANDARD_EQUIPMENT } from "./equipment-picker";
import { ProgramView } from "./program-view";
import { ProgramEditor } from "./program-editor";
import { SportCombobox } from "./sport-combobox";
import { AgeGroupCheckboxes } from "./age-group-checkboxes";
import {
  addCustomEquipment,
} from "@/lib/programs/custom-taxonomy-actions";
import { type AgeBand } from "@/lib/utils/programs/age-bands";
import {
  saveProgram,
  getCentreListSimple,
  getCentreEquipment,
  getRecentProgramsForCentre,
} from "@/lib/programs/actions";
import type { ProgramContentJson, SessionDuration } from "@/lib/ai/types";

// ============================================================
// Programme Generation Form
// ============================================================

type FormStatus = "idle" | "generating" | "preview" | "editing" | "saving";

interface ProgramGenerateFormProps {
  basePath: string;
}

const DURATIONS: { value: SessionDuration; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "60 minutes" },
];

export function ProgramGenerateForm({ basePath }: ProgramGenerateFormProps) {
  const router = useRouter();

  // Form fields
  const [sport, setSport] = useState<string>("");
  const [ageGroups, setAgeGroups] = useState<AgeBand[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<SessionDuration | 0>(0);
  const [skillFocus, setSkillFocus] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([
    ...STANDARD_EQUIPMENT,
  ]);
  const [centreId, setCentreId] = useState<string>("");

  // Async data
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [centreEquipmentItems, setCentreEquipmentItems] = useState<string[]>([]);
  const [recentPrograms, setRecentPrograms] = useState<
    { title: string; sport: string; skillFocus: string | null }[]
  >([]);

  // Generation state
  const [status, setStatus] = useState<FormStatus>("idle");
  const [generatedContent, setGeneratedContent] =
    useState<ProgramContentJson | null>(null);
  const [editedContent, setEditedContent] =
    useState<ProgramContentJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(true);

  // Load centres on mount
  useEffect(() => {
    getCentreListSimple().then(({ data }) => {
      if (data) setCentres(data);
    });
  }, []);

  // Load centre equipment when centre changes
  useEffect(() => {
    if (!centreId || centreId === "none") {
      setCentreEquipmentItems([]);
      return;
    }
    getCentreEquipment(centreId).then(({ data }) => {
      if (data) {
        setCentreEquipmentItems(data);
        // Merge with standard, selecting centre items by default
        const merged = [
          ...new Set([...STANDARD_EQUIPMENT, ...data]),
        ];
        setSelectedEquipment(merged);
      }
    });
  }, [centreId]);

  // Load recent programmes when centre + sport change
  useEffect(() => {
    if (!centreId || centreId === "none" || !sport) {
      setRecentPrograms([]);
      return;
    }
    getRecentProgramsForCentre(centreId, sport).then(({ data }) => {
      if (data) setRecentPrograms(data);
    });
  }, [centreId, sport]);

  // Equipment list to display
  const equipmentItems = centreId && centreId !== "none"
    ? [...new Set([...STANDARD_EQUIPMENT, ...centreEquipmentItems])]
    : [...STANDARD_EQUIPMENT];

  // Rate limit cooldown
  const startCooldown = useCallback(() => {
    setCanGenerate(false);
    setTimeout(() => setCanGenerate(true), 10_000);
  }, []);

  // Validation
  const isFormValid = sport && ageGroups.length > 0 && durationMinutes && selectedEquipment.length > 0;

  // Generate handler
  async function handleGenerate() {
    if (!isFormValid || !canGenerate) return;

    setStatus("generating");
    setError(null);
    startCooldown();

    try {
      const centreData = centreId && centreId !== "none"
        ? {
            centreName:
              centres.find((c) => c.id === centreId)?.name ?? "Unknown",
            recentPrograms,
          }
        : undefined;

      const res = await fetch("/api/ai/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          ageGroups,
          durationMinutes,
          skillFocus: skillFocus.trim() || undefined,
          availableEquipment: selectedEquipment,
          centreContext: centreData,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to generate programme.");
      }

      setGeneratedContent(json.data as ProgramContentJson);
      setEditedContent(null);
      setStatus("preview");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setStatus("idle");
    }
  }

  // Save handler
  async function handleSave() {
    const contentToSave = editedContent ?? generatedContent;
    if (!contentToSave) return;

    setStatus("saving");
    setError(null);

    try {
      const { error: saveError } = await saveProgram({
        sport: sport as string,
        ageGroups,
        durationMinutes: durationMinutes as number,
        skillFocus: skillFocus.trim() || undefined,
        contentJson: contentToSave,
        equipmentUsed: contentToSave.equipmentNeeded ?? selectedEquipment,
      });

      if (saveError) throw new Error(saveError);

      toast.success("Programme saved to library.");
      router.push(basePath);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save programme.";
      setError(message);
      setStatus(editedContent ? "editing" : "preview");
    }
  }

  // Regenerate handler
  function handleRegenerate() {
    setGeneratedContent(null);
    setEditedContent(null);
    setStatus("idle");
    // Automatically trigger generation
    setTimeout(handleGenerate, 0);
  }

  // Edit handler
  function handleStartEdit() {
    setEditedContent(
      editedContent ?? generatedContent
        ? JSON.parse(JSON.stringify(generatedContent))
        : null
    );
    setStatus("editing");
  }

  // Back to preview
  function handleCancelEdit() {
    setEditedContent(null);
    setStatus("preview");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-lg font-semibold text-foreground">
        Generate Programme
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Use AI to create a structured coaching session plan.
      </p>

      {/* Error display */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
          {status === "idle" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          )}
        </div>
      )}

      {/* Form (visible in idle and generating states) */}
      {(status === "idle" || status === "generating") && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Sport */}
              <div>
                <Label>Sport *</Label>
                <SportCombobox value={sport} onChange={setSport} />
              </div>

              {/* Age Group */}
              <div>
                <Label>Age group *</Label>
                <AgeGroupCheckboxes value={ageGroups} onChange={setAgeGroups} />
              </div>

              {/* Duration */}
              <div>
                <Label htmlFor="duration">Session duration *</Label>
                <Select
                  value={durationMinutes ? String(durationMinutes) : ""}
                  onValueChange={(v) =>
                    setDurationMinutes(parseInt(v ?? "0") as SessionDuration)
                  }
                >
                  <SelectTrigger id="duration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Skill Focus */}
              <div>
                <Label htmlFor="skill-focus">Skill focus (optional)</Label>
                <Input
                  id="skill-focus"
                  value={skillFocus}
                  onChange={(e) => setSkillFocus(e.target.value)}
                  placeholder="e.g. ball handling, teamwork, balance"
                />
              </div>

              {/* Centre Context */}
              <div>
                <Label htmlFor="centre">Centre context (optional)</Label>
                <Select
                  value={centreId}
                  onValueChange={(v) => setCentreId(v ?? "")}
                >
                  <SelectTrigger id="centre">
                    <SelectValue placeholder="No centre — general programme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      No centre — general programme
                    </SelectItem>
                    {centres.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Recent programmes at centre */}
              {recentPrograms.length > 0 && (
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Recent programmes at this centre (AI will avoid repeating):
                  </p>
                  <ul className="space-y-0.5">
                    {recentPrograms.map((p, i) => (
                      <li key={i} className="text-xs text-foreground">
                        • {p.title}
                        {p.skillFocus ? ` (${p.skillFocus})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Equipment Picker */}
          <Card>
            <CardHeader>
              <Label>Available equipment *</Label>
              {centreId && centreId !== "none" && centreEquipmentItems.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Includes equipment stored at this centre.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <EquipmentPicker
                items={equipmentItems}
                selected={selectedEquipment}
                onChange={setSelectedEquipment}
                onAddCustom={async (name) => {
                  const result = await addCustomEquipment(name);
                  if (result.data) {
                    setCentreEquipmentItems((prev) => [...prev, result.data!.name]);
                    setSelectedEquipment((prev) => [...prev, result.data!.name]);
                  } else if (result.error) {
                    toast.error(result.error);
                  }
                }}
              />
            </CardContent>
          </Card>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={!isFormValid || !canGenerate || status === "generating"}
            className="w-full bg-primary hover:bg-primary/90 text-white"
            size="lg"
          >
            {status === "generating" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating programme…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Programme
              </>
            )}
          </Button>
          {!canGenerate && status === "idle" && (
            <p className="text-center text-xs text-muted-foreground/60">
              Please wait a few seconds before generating again.
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {status === "preview" && generatedContent && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardContent className="pt-6">
              <ProgramView content={generatedContent} />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleSave}
              className="flex-1 bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="mr-2 h-4 w-4" />
              Save to Library
            </Button>
            <Button variant="outline" onClick={handleStartEdit} className="flex-1">
              <Pencil className="mr-2 h-4 w-4" />
              Edit &amp; Save
            </Button>
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={!canGenerate}
              className="flex-1"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </div>
      )}

      {/* Editor */}
      {status === "editing" && editedContent && (
        <div className="mt-6 space-y-6">
          <ProgramEditor
            content={editedContent}
            onChange={setEditedContent}
          />

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleSave}
              className="flex-1 bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Programme
            </Button>
            <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
              Back to Preview
            </Button>
          </div>
        </div>
      )}

      {/* Saving state */}
      {status === "saving" && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Saving programme…</p>
        </div>
      )}
    </div>
  );
}
