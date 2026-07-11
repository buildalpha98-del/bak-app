"use client";

// ============================================================
// Parent — My Kids (client surface)
// ============================================================
//
// Big photo-style cards per kid (initials-as-avatar fallback), the
// pulse strip up top, and a friendlier add-child surface than the
// admin /children grid. Kids are always scoped to the parent's
// parent_children join.

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  getParentChildren,
  addChild,
  type ChildInput,
} from "@/lib/parent/actions";
import { ChildForm } from "@/components/parent/child-form";
import { ParentPulseStrip } from "@/components/parent/parent-status-pulse";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Child, ParentChild } from "@/lib/types/database";
import type { ParentKidsPulse } from "@/lib/parent/status-pulse-actions";
import {
  Plus,
  Loader2,
  X,
  Sparkles,
  Calendar,
  ClipboardCheck,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { calculateAge } from "@/lib/utils/ageGroup";

const EMPTY_CHILD: ChildInput = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: null,
  medical_notes: null,
};

const AGE_GROUP_COLOURS: Record<string, string> = {
  "3-5": "bg-green-100 text-green-700 border-green-200",
  "5-8": "bg-blue-100 text-blue-700 border-blue-200",
  "8-12": "bg-purple-100 text-purple-700 border-purple-200",
};

interface ParentKidsClientProps {
  initialPulse: ParentKidsPulse;
}

export default function ParentKidsClient({
  initialPulse,
}: ParentKidsClientProps) {
  const [children, setChildren] = useState<(ParentChild & { child: Child })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newChild, setNewChild] = useState<ChildInput>({ ...EMPTY_CHILD });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadChildren() {
    setLoading(true);
    const { data } = await getParentChildren();
    setChildren(data);
    setLoading(false);
  }

  useEffect(() => {
    loadChildren();
  }, []);

  async function handleAddChild() {
    if (
      !newChild.first_name.trim() ||
      !newChild.last_name.trim() ||
      !newChild.date_of_birth
    )
      return;

    setAdding(true);
    setError(null);

    const { error: addError } = await addChild(newChild);

    setAdding(false);

    if (addError) {
      setError(addError);
      toast.error("Could not add child. Please check the details and try again.");
      return;
    }

    toast.success(`${newChild.first_name} has been added!`);
    setNewChild({ ...EMPTY_CHILD });
    setShowAdd(false);
    loadChildren();
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My kids</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Your children&apos;s profiles, sessions and progress.
          </p>
        </div>
        {!showAdd && (
          <Button
            onClick={() => setShowAdd(true)}
            className="bg-primary text-white hover:bg-[#D4651F] rounded-xl min-h-[44px]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add child
          </Button>
        )}
      </div>

      <ParentPulseStrip
        stats={[
          {
            icon: Sparkles,
            count: initialPulse.insightsReadyCount,
            label:
              initialPulse.insightsReadyCount === 1
                ? "new insight"
                : "new insights",
          },
          {
            icon: Calendar,
            count: initialPulse.sessionsThisWeekCount,
            label: "sessions this week",
          },
          {
            icon: ClipboardCheck,
            count: initialPulse.assessmentsToAcknowledgeCount,
            label:
              initialPulse.assessmentsToAcknowledgeCount === 1
                ? "new assessment"
                : "new assessments",
          },
        ]}
      />

      {error && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add child form */}
      {showAdd && (
        <div className="rounded-2xl border border-orange-100 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add a child</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowAdd(false);
                setNewChild({ ...EMPTY_CHILD });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChildForm
            index={0}
            child={newChild}
            onChange={(_, child) => setNewChild(child)}
          />
          <Button
            onClick={handleAddChild}
            disabled={
              adding ||
              !newChild.first_name.trim() ||
              !newChild.last_name.trim() ||
              !newChild.date_of_birth
            }
            className="w-full h-12 bg-primary text-white hover:bg-[#D4651F] rounded-xl"
          >
            {adding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add child"
            )}
          </Button>
        </div>
      )}

      {/* Children grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : children.length === 0 ? (
        <div className="text-center py-12 rounded-2xl bg-card border border-orange-100 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-primary mx-auto mb-3">
            <Plus className="h-7 w-7" />
          </div>
          <p className="font-medium text-[#1A1A1A]">No kids on your profile yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add a child to start booking sessions.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((pc) => (
            <KidPhotoCard key={pc.child.id} child={pc.child} />
          ))}
        </div>
      )}
    </div>
  );
}

function KidPhotoCard({ child }: { child: Child }) {
  const age = child.date_of_birth ? calculateAge(new Date(child.date_of_birth)) : null;
  const initials = `${child.first_name[0] ?? ""}${child.last_name[0] ?? ""}`;
  const ageGroupColour =
    AGE_GROUP_COLOURS[child.age_group] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Link
      href={`/parent/kids/${child.id}`}
      className="group rounded-2xl border border-orange-100 bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-50 text-primary text-2xl font-bold border-2 border-transparent group-hover:border-primary/40 transition-all">
          {initials}
        </div>
        <Badge variant="outline" className={`text-xs ${ageGroupColour}`}>
          Ages {child.age_group}
        </Badge>
      </div>

      <div className="space-y-1 flex-1">
        <h3 className="font-semibold text-foreground text-lg leading-tight">
          {child.first_name} {child.last_name}
        </h3>
        {age !== null && (
          <p className="text-sm text-muted-foreground">{age} years old</p>
        )}
        {child.medical_notes && (
          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" />
            Medical notes on file
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-orange-50">
        <span className="text-xs text-[#666666] inline-flex items-center justify-center gap-1 rounded-xl bg-orange-50 px-2 py-2 group-hover:bg-orange-100 transition-colors">
          <Sparkles className="h-3 w-3 text-primary" />
          Insights
        </span>
        <span className="text-xs font-medium text-primary inline-flex items-center justify-center gap-1">
          View profile
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
