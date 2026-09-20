"use client";

// The star-rating flow: pick a task (one per class at a school), rate each
// child skill by skill, Next Child / Finish. Shared by the coach app and
// the school portal — the two differ only in who saves the row and what
// the people being rated are called, so both are props.

import { useState, useTransition, useCallback, useMemo } from "react";
import { Star, ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Users, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RatingFlowSkill {
  name: string;
  description: string;
}

export interface RatingFlowEntry {
  skill_name: string;
  rating: number;
}

export interface RatingFlowChild {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  already_rated: boolean;
}

export interface RatingFlowTask {
  template_id: string;
  sport: string;
  age_group: string;
  skills: RatingFlowSkill[];
  centre_id: string;
  centre_name: string;
  /** Schools with a class list get one task per class (Seam D). */
  class_id: string | null;
  class_name: string | null;
  term_id: string;
  term_name: string;
  children: RatingFlowChild[];
}

export interface RatingFlowSaveInput {
  assessment_template_id: string;
  child_id: string;
  term_id: string;
  ratings_json: RatingFlowEntry[];
  notes: string | null;
}

interface AssessmentRatingFlowProps {
  tasks: RatingFlowTask[];
  save: (input: RatingFlowSaveInput) => Promise<{ error: string | null }>;
  /** "children" for the coach app, "students" for a school portal. */
  noun?: "children" | "students";
  /** Shown when there is nothing to rate. */
  emptyMessage?: string;
  /** Where the task list shows a centre name; a school portal already knows. */
  showCentreName?: boolean;
  /** Open straight into this task; leaving it calls onExit instead of
   *  showing the built-in task list (the portal has its own). */
  initialTaskIndex?: number;
  onExit?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Star Rating Component                                              */
/* ------------------------------------------------------------------ */

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`Rate ${star} out of 5`}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onChange(star)}
        >
          <Star
            className={`size-7 transition-colors ${
              star <= value
                ? "text-amber-500 fill-amber-500"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Task Card                                                          */
/* ------------------------------------------------------------------ */

function taskTitle(task: RatingFlowTask, showCentreName: boolean) {
  if (task.class_name) {
    return showCentreName ? `${task.class_name} — ${task.centre_name}` : task.class_name;
  }
  return showCentreName ? task.centre_name : `${task.sport} · ${task.age_group}`;
}

function TaskCard({
  task,
  noun,
  showCentreName,
  onSelect,
}: {
  task: RatingFlowTask;
  noun: string;
  showCentreName: boolean;
  onSelect: () => void;
}) {
  const ratedCount = task.children.filter((c) => c.already_rated).length;
  const totalCount = task.children.length;

  return (
    <button
      type="button"
      className="w-full text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      onClick={onSelect}
    >
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{taskTitle(task, showCentreName)}</CardTitle>
            <Badge
              variant="secondary"
              className="bg-orange-100 text-orange-700 border-orange-200 shrink-0"
            >
              {task.age_group}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-2">
            <ClipboardList className="size-3.5" />
            {task.sport} &middot; {task.term_name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            <span>
              {ratedCount} of {totalCount} {noun} assessed
            </span>
          </div>
          {totalCount > 0 && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(ratedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Completion Screen                                                  */
/* ------------------------------------------------------------------ */

function CompletionScreen({
  task,
  ratedInSession,
  noun,
  onReturn,
}: {
  task: RatingFlowTask;
  ratedInSession: number;
  noun: string;
  onReturn: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 text-center animate-fade-up">
      <div className="rounded-full bg-emerald-100 p-4">
        <CheckCircle2 className="size-10 text-emerald-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold font-heading">
          Assessment Complete
        </h2>
        <p className="text-sm text-muted-foreground">
          {task.class_name ? `${task.class_name} · ` : ""}
          {task.centre_name} &middot; {task.sport}
        </p>
      </div>
      <div className="rounded-lg border bg-muted/30 px-6 py-4 text-sm space-y-1">
        <p>
          <span className="font-medium">{ratedInSession}</span> {noun} assessed
          this session
        </p>
        <p>
          <span className="font-medium">{task.children.length}</span> total{" "}
          {noun} in group
        </p>
      </div>
      <Button
        size="lg"
        className="min-h-[44px] mt-2"
        onClick={onReturn}
      >
        Return to Assessments
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AssessmentRatingFlow({
  tasks,
  save,
  noun = "children",
  emptyMessage = "No assessment tasks assigned to you at the moment.",
  showCentreName = true,
  initialTaskIndex,
  onExit,
}: AssessmentRatingFlowProps) {
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(
    initialTaskIndex ?? null
  );
  const [childIndex, setChildIndex] = useState(0);
  const [ratingsMap, setRatingsMap] = useState<
    Record<string, RatingFlowEntry[]>
  >({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [showCompletion, setShowCompletion] = useState(false);
  const [ratedInSession, setRatedInSession] = useState(0);
  const [isPending, startTransition] = useTransition();

  const selectedTask =
    selectedTaskIndex !== null ? tasks[selectedTaskIndex] : null;

  // Order children: un-rated first, then already-rated
  const orderedChildren = useMemo(() => {
    if (!selectedTask) return [];
    const unrated = selectedTask.children.filter((c) => !c.already_rated);
    const rated = selectedTask.children.filter((c) => c.already_rated);
    return [...unrated, ...rated];
  }, [selectedTask]);

  const currentChild = orderedChildren[childIndex] ?? null;
  const singular = noun === "students" ? "Student" : "Child";

  /* ---- Rating helpers ---- */

  const getCurrentRatings = useCallback(
    (childId: string): RatingFlowEntry[] => {
      return ratingsMap[childId] ?? [];
    },
    [ratingsMap]
  );

  const setSkillRating = useCallback(
    (childId: string, skillName: string, rating: number) => {
      setRatingsMap((prev) => {
        const existing = prev[childId] ?? [];
        const updated = existing.filter((e) => e.skill_name !== skillName);
        updated.push({ skill_name: skillName, rating });
        return { ...prev, [childId]: updated };
      });
    },
    []
  );

  const getSkillRating = useCallback(
    (childId: string, skillName: string): number => {
      const ratings = getCurrentRatings(childId);
      return ratings.find((r) => r.skill_name === skillName)?.rating ?? 0;
    },
    [getCurrentRatings]
  );

  /* ---- Save current child ---- */

  const saveCurrentChild = useCallback((): Promise<boolean> => {
    if (!selectedTask || !currentChild) return Promise.resolve(false);

    const ratings = getCurrentRatings(currentChild.id);
    if (ratings.length === 0) {
      toast.error("Please rate at least one skill before continuing.");
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      startTransition(async () => {
        const { error } = await save({
          assessment_template_id: selectedTask.template_id,
          child_id: currentChild.id,
          term_id: selectedTask.term_id,
          ratings_json: ratings,
          notes: notesMap[currentChild.id] || null,
        });
        if (error) {
          toast.error(error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }, [selectedTask, currentChild, getCurrentRatings, notesMap, save]);

  /* ---- Navigation ---- */

  const handleSelectTask = (index: number) => {
    setSelectedTaskIndex(index);
    setChildIndex(0);
    setRatingsMap({});
    setNotesMap({});
    setShowCompletion(false);
    setRatedInSession(0);
  };

  const handleNextChild = async () => {
    const saved = await saveCurrentChild();
    if (!saved) return;

    setRatedInSession((prev) => prev + 1);

    if (childIndex >= orderedChildren.length - 1) {
      setShowCompletion(true);
    } else {
      setChildIndex((prev) => prev + 1);
    }
  };

  const handlePreviousChild = () => {
    if (childIndex > 0) {
      setChildIndex((prev) => prev - 1);
    }
  };

  const leaveTask = () => {
    setShowCompletion(false);
    if (onExit) onExit();
    else setSelectedTaskIndex(null);
  };

  const handleSaveAndExit = async () => {
    const ratings = currentChild ? getCurrentRatings(currentChild.id) : [];
    if (currentChild && ratings.length > 0) {
      const saved = await saveCurrentChild();
      if (!saved) return;
    }
    leaveTask();
  };

  const handleReturnToList = leaveTask;

  /* ---- Task List Mode ---- */

  if (selectedTask === null) {
    return (
      <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
        <h1 className="text-xl font-semibold font-heading text-foreground">
          Assessments
        </h1>
        {tasks.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <TaskCard
                key={`${task.template_id}-${task.centre_id}-${task.class_id ?? "all"}`}
                task={task}
                noun={noun}
                showCentreName={showCentreName}
                onSelect={() => handleSelectTask(i)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---- Completion Screen ---- */

  if (showCompletion) {
    return (
      <div className="mx-auto max-w-lg">
        <CompletionScreen
          task={selectedTask}
          ratedInSession={ratedInSession}
          noun={noun}
          onReturn={handleReturnToList}
        />
      </div>
    );
  }

  /* ---- Assessment Flow Mode ---- */

  if (!currentChild) return null;

  const progressPercent =
    orderedChildren.length > 0
      ? ((childIndex + 1) / orderedChildren.length) * 100
      : 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] gap-1.5"
          onClick={handleSaveAndExit}
          disabled={isPending}
        >
          <LogOut className="size-4" />
          Save &amp; Exit
        </Button>
        <div className="text-right text-xs text-muted-foreground">
          <span className="font-medium">{taskTitle(selectedTask, showCentreName)}</span>
          <br />
          {selectedTask.sport}
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {singular} {childIndex + 1} of {orderedChildren.length}
          </span>
          {currentChild.already_rated && (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200"
            >
              Previously rated
            </Badge>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Child Name */}
      <div className="pt-1">
        <h2 className="text-lg font-semibold font-heading">
          {currentChild.first_name} {currentChild.last_name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {selectedTask.age_group}
        </p>
      </div>

      {/* Skill Ratings */}
      <div className="space-y-4">
        {selectedTask.skills.map((skill) => (
          <div key={skill.name} className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 pt-1">
                <p className="text-sm font-medium leading-tight">
                  {skill.name}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  {skill.description}
                </p>
              </div>
              <StarRating
                value={getSkillRating(currentChild.id, skill.name)}
                onChange={(rating) =>
                  setSkillRating(currentChild.id, skill.name, rating)
                }
              />
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="space-y-1.5 pt-2">
        <label
          htmlFor="child-notes"
          className="text-sm font-medium"
        >
          {noun === "students" ? "Teacher comment" : "Notes"}{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="child-notes"
          placeholder={
            noun === "students"
              ? "Printed on the student's report card..."
              : "Any observations about this child..."
          }
          className="min-h-[44px]"
          value={notesMap[currentChild.id] ?? ""}
          onChange={(e) =>
            setNotesMap((prev) => ({
              ...prev,
              [currentChild.id]: e.target.value,
            }))
          }
        />
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center gap-3 pt-2 pb-6">
        <Button
          variant="outline"
          className="min-h-[44px] flex-1"
          disabled={childIndex === 0 || isPending}
          onClick={handlePreviousChild}
        >
          <ArrowLeft className="size-4 mr-1" />
          Previous
        </Button>
        <Button
          className="min-h-[44px] flex-1"
          disabled={isPending}
          onClick={handleNextChild}
        >
          {isPending
            ? "Saving..."
            : childIndex >= orderedChildren.length - 1
              ? "Finish"
              : `Next ${singular}`}
          {!isPending && childIndex < orderedChildren.length - 1 && (
            <ArrowRight className="size-4 ml-1" />
          )}
          {!isPending && childIndex >= orderedChildren.length - 1 && (
            <CheckCircle2 className="size-4 ml-1" />
          )}
        </Button>
      </div>
    </div>
  );
}
