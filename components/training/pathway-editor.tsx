"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  GripVertical,
  Plus,
  X,
  Save,
  Loader2,
  Search,
  BookOpen,
  BadgeCheck,
  Video,
  FileText,
  HelpCircle,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createTrainingPathway,
  updateTrainingPathway,
  addModuleToPathway,
  removeModuleFromPathway,
  reorderPathwayModules,
  publishTrainingPathway,
  getPublishedModulesForSearch,
} from "@/lib/training/actions";
import type {
  TrainingPathway,
  TrainingPathwayModule,
  TrainingModule,
} from "@/lib/types/database";
import type { TrainingCategory, TrainingModuleType } from "@/lib/types/enums";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MODULE_TYPE_ICON: Record<TrainingModuleType, typeof Video> = {
  video: Video,
  document: FileText,
  quiz: HelpCircle,
  checklist: CheckSquare,
};

const STATUS_STYLE = {
  draft: "bg-secondary text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-neutral-100 text-neutral-500",
} as const;

// ─── Local module type for unified state ────────────────────────────────────

interface LocalModule {
  localId: string;
  junctionId?: string;
  module_id: string;
  title: string;
  type: TrainingModuleType;
  estimated_minutes: number | null;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface PathwayEditorCreateProps {
  mode: "create";
  pathway?: undefined;
}

interface PathwayEditorEditProps {
  mode: "edit";
  pathway: TrainingPathway & {
    modules: Array<TrainingPathwayModule & { module: TrainingModule }>;
  };
}

type Props = PathwayEditorCreateProps | PathwayEditorEditProps;

// ─── Component ──────────────────────────────────────────────────────────────

export function PathwayEditor({ mode, pathway }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.includes("/ops/") ? "/ops/training" : "/admin/training";
  const [isPending, startTransition] = useTransition();

  // Form fields
  const [title, setTitle] = useState(pathway?.title ?? "");
  const [description, setDescription] = useState(pathway?.description ?? "");
  const [category, setCategory] = useState<TrainingCategory>(
    pathway?.category ?? "onboarding"
  );
  const [isMandatory, setIsMandatory] = useState(
    pathway?.is_mandatory_onboarding ?? false
  );

  // Module management
  const [modules, setModules] = useState<LocalModule[]>(() => {
    if (mode === "edit" && pathway?.modules) {
      return pathway.modules.map((pm) => ({
        localId: pm.id,
        junctionId: pm.id,
        module_id: pm.module_id,
        title: pm.module.title,
        type: pm.module.type,
        estimated_minutes: pm.module.estimated_minutes,
      }));
    }
    return [];
  });

  // Drag state
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Module search dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [availableModules, setAvailableModules] = useState<
    Array<{ id: string; title: string; type: string; estimated_minutes: number | null }>
  >([]);
  const [searching, setSearching] = useState(false);

  // Computed total time
  const totalMinutes = modules.reduce(
    (sum, m) => sum + (m.estimated_minutes ?? 0),
    0
  );

  // ─── Load published modules for dialog ─────────────────────────────────

  const loadModules = useCallback(async () => {
    setSearching(true);
    try {
      const results = await getPublishedModulesForSearch();
      setAvailableModules(results);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleDialogOpen(open: boolean) {
    setDialogOpen(open);
    if (open) {
      setSearchQuery("");
      loadModules();
    }
  }

  // Filter available modules by search query and exclude already-added
  const filteredAvailable = availableModules.filter((m) => {
    const existingIds = new Set(modules.map((mod) => mod.module_id));
    if (existingIds.has(m.id)) return false;
    if (
      searchQuery.trim() !== "" &&
      !m.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  // ─── Add module (local state for both modes) ──────────────────────────

  function handleAddModuleLocal(mod: {
    id: string;
    title: string;
    type: string;
    estimated_minutes: number | null;
  }) {
    setModules((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}-${mod.id}`,
        module_id: mod.id,
        title: mod.title,
        type: mod.type as TrainingModuleType,
        estimated_minutes: mod.estimated_minutes,
      },
    ]);
    setDialogOpen(false);
    toast.success(`Added "${mod.title}" to pathway.`);
  }

  // ─── Remove module ────────────────────────────────────────────────────

  async function handleRemoveModule(localId: string, moduleTitle: string) {
    const mod = modules.find((m) => m.localId === localId);

    if (mode === "edit" && mod?.junctionId) {
      startTransition(async () => {
        const result = await removeModuleFromPathway(mod.junctionId!);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        setModules((prev) => prev.filter((m) => m.localId !== localId));
        toast.success(`Removed "${moduleTitle}" from pathway.`);
      });
    } else {
      setModules((prev) => prev.filter((m) => m.localId !== localId));
      toast.success(`Removed "${moduleTitle}" from pathway.`);
    }
  }

  // ─── Drag and drop ────────────────────────────────────────────────────

  function handleDragStart(index: number) {
    dragItem.current = index;
    setDragIndex(index);
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index;
  }

  function handleDragEnd() {
    if (
      dragItem.current === null ||
      dragOverItem.current === null ||
      dragItem.current === dragOverItem.current
    ) {
      setDragIndex(null);
      return;
    }

    const reordered = [...modules];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setModules(reordered);
    setDragIndex(null);

    dragItem.current = null;
    dragOverItem.current = null;

    // Persist reorder immediately in edit mode
    if (mode === "edit") {
      const orderedModuleIds = reordered.map((m) => m.module_id);
      startTransition(async () => {
        const result = await reorderPathwayModules(pathway.id, orderedModuleIds);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        toast.success("Module order updated.");
      });
    }
  }

  // ─── Save handler ────────────────────────────────────────────────────

  function handleSave() {
    if (!title.trim()) {
      toast.error("Please enter a pathway title.");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        is_mandatory_onboarding: isMandatory,
      };

      if (mode === "create") {
        const result = await createTrainingPathway(payload);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        // Add modules sequentially
        for (let i = 0; i < modules.length; i++) {
          const addResult = await addModuleToPathway(
            result.id,
            modules[i].module_id,
            i
          );
          if ("error" in addResult) {
            toast.error(
              `Pathway created but failed to add module "${modules[i].title}": ${addResult.error}`
            );
          }
        }

        toast.success("Pathway created.");
        router.push(basePath);
      } else {
        const result = await updateTrainingPathway(pathway.id, payload);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        // Handle newly added modules (no junctionId)
        const newModules = modules.filter((m) => !m.junctionId);
        for (let i = 0; i < newModules.length; i++) {
          const idx = modules.indexOf(newModules[i]);
          const addResult = await addModuleToPathway(
            pathway.id,
            newModules[i].module_id,
            idx
          );
          if ("error" in addResult) {
            toast.error(
              `Failed to add module "${newModules[i].title}": ${addResult.error}`
            );
          }
        }

        // Reorder all modules
        const orderedModuleIds = modules.map((m) => m.module_id);
        await reorderPathwayModules(pathway.id, orderedModuleIds);

        toast.success("Pathway updated.");
        router.push(basePath);
      }
    });
  }

  // ─── Publish handler ──────────────────────────────────────────────────

  function handlePublish() {
    if (!title.trim()) {
      toast.error("Please enter a pathway title.");
      return;
    }

    startTransition(async () => {
      if (mode === "create") {
        const payload = {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          is_mandatory_onboarding: isMandatory,
        };

        const result = await createTrainingPathway(payload);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        for (let i = 0; i < modules.length; i++) {
          await addModuleToPathway(result.id, modules[i].module_id, i);
        }

        const pubResult = await publishTrainingPathway(result.id);
        if ("error" in pubResult) {
          toast.error(pubResult.error);
          return;
        }

        toast.success("Pathway created and published.");
        router.push(basePath);
      } else {
        const payload = {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          is_mandatory_onboarding: isMandatory,
        };
        const saveResult = await updateTrainingPathway(pathway.id, payload);
        if ("error" in saveResult) {
          toast.error(saveResult.error);
          return;
        }

        const newModules = modules.filter((m) => !m.junctionId);
        for (let i = 0; i < newModules.length; i++) {
          const idx = modules.indexOf(newModules[i]);
          await addModuleToPathway(pathway.id, newModules[i].module_id, idx);
        }

        const orderedModuleIds = modules.map((m) => m.module_id);
        await reorderPathwayModules(pathway.id, orderedModuleIds);

        const pubResult = await publishTrainingPathway(pathway.id);
        if ("error" in pubResult) {
          toast.error(pubResult.error);
          return;
        }

        toast.success("Pathway published.");
        router.push(basePath);
      }
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Status indicator (edit mode only) */}
      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Badge className={STATUS_STYLE[pathway.status]}>
            {pathway.status.charAt(0).toUpperCase() + pathway.status.slice(1)}
          </Badge>
          {pathway.status === "published" && (
            <BadgeCheck className="h-4 w-4 text-emerald-600" />
          )}
        </div>
      )}

      {/* Pathway details */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pathway-title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pathway-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Coach Onboarding"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pathway-description">Description</Label>
            <Textarea
              id="pathway-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of what this pathway covers..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pathway-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as TrainingCategory)}
              >
                <SelectTrigger id="pathway-category">
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

            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="is-mandatory-onboarding"
                checked={isMandatory}
                onCheckedChange={(checked) => setIsMandatory(Boolean(checked))}
              />
              <Label htmlFor="is-mandatory-onboarding" className="cursor-pointer">
                Mandatory for onboarding
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modules section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              Modules ({modules.length})
            </h3>
            <Dialog open={dialogOpen} onOpenChange={handleDialogOpen}>
              <DialogTrigger
                render={
                  <Button size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Module
                  </Button>
                }
              />
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Module to Pathway</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search published modules..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {searching && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!searching && filteredAvailable.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No published modules found.
                      </p>
                    )}
                    {!searching &&
                      filteredAvailable.map((mod) => {
                        const Icon =
                          MODULE_TYPE_ICON[mod.type as TrainingModuleType] ?? FileText;
                        return (
                          <div
                            key={mod.id}
                            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer"
                            onClick={() => handleAddModuleLocal(mod)}
                          >
                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {mod.title}
                              </p>
                              {mod.estimated_minutes && (
                                <p className="text-xs text-muted-foreground">
                                  {mod.estimated_minutes} min
                                </p>
                              )}
                            </div>
                            <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {modules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center border rounded-xl bg-secondary/20">
              <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No modules added yet. Click &ldquo;Add Module&rdquo; to get
                started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {modules.map((pm, index) => {
                const Icon = MODULE_TYPE_ICON[pm.type] ?? FileText;
                return (
                  <div
                    key={pm.localId}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className={`flex items-center gap-3 p-3 border rounded-lg transition-colors ${
                      dragIndex === index
                        ? "opacity-50 bg-secondary/40"
                        : "hover:bg-secondary/30"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                    <span className="text-xs text-muted-foreground font-mono w-6 text-center shrink-0">
                      {index + 1}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{pm.title}</p>
                      {pm.estimated_minutes && (
                        <p className="text-xs text-muted-foreground">
                          {pm.estimated_minutes} min
                        </p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-red-600 h-8 w-8"
                      disabled={isPending}
                      onClick={() => handleRemoveModule(pm.localId, pm.title)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer: total time + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pb-8">
        {totalMinutes > 0 && (
          <p className="text-sm text-muted-foreground">
            Total estimated time:{" "}
            <span className="font-medium text-foreground">{totalMinutes} min</span>
          </p>
        )}

        <div className="flex items-center gap-3 sm:ml-auto">
          <Button
            variant="outline"
            onClick={() => router.push(basePath)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-primary text-white hover:bg-primary/90"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button onClick={handlePublish} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <BadgeCheck className="h-4 w-4 mr-2" />
            )}
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
