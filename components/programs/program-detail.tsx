"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  User,
  GitBranch,
  Trash2,
  Copy,
  ChevronLeft,
  Package,
  Target,
  MapPin,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProgramView } from "./program-view";
import { ProgramEditor } from "./program-editor";
import {
  deleteProgram,
  createNewVersion,
} from "@/lib/programs/actions";
import type {
  ProgramDetail as ProgramDetailType,
  ProgramUsageStats,
  ProgramVersionItem,
  SaveProgramInput,
} from "@/lib/programs/actions";
import type { ProgramContentJson } from "@/lib/ai/types";
import { toast } from "sonner";

// ============================================================
// Programme Detail — full view with metadata + actions
// ============================================================

interface ProgramDetailProps {
  program: ProgramDetailType;
  versions: ProgramVersionItem[];
  usage: ProgramUsageStats;
  basePath: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProgramDetailView({
  program,
  versions,
  usage,
  basePath,
}: ProgramDetailProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState<ProgramContentJson>(
    program.content_json as unknown as ProgramContentJson
  );
  const [savingVersion, setSavingVersion] = useState(false);

  const content = program.content_json as unknown as ProgramContentJson;

  async function handleDelete() {
    setDeleting(true);
    const { error } = await deleteProgram(program.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Programme deleted.");
      router.push(basePath);
      router.refresh();
    }
  }

  async function handleSaveNewVersion() {
    setSavingVersion(true);
    const input: SaveProgramInput = {
      sport: program.sport,
      ageGroups: program.age_groups?.length ? program.age_groups : (program.age_group ? [program.age_group] : []),
      durationMinutes: program.duration_minutes,
      skillFocus: program.skill_focus ?? undefined,
      contentJson: editContent,
      equipmentUsed: program.equipment_used,
    };
    const { data, error } = await createNewVersion(program.id, input);
    setSavingVersion(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Version ${data?.version_number} created.`);
      setEditing(false);
      router.push(`${basePath}/${data?.id}`);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Back link */}
      <Link
        href={basePath}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Programmes
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {program.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{program.sport}</Badge>
            {program.age_group && (
              <Badge variant="secondary">Ages {program.age_group}</Badge>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {program.duration_minutes} min
            </span>
            {program.version_number > 1 && (
              <Badge variant="outline" className="gap-0.5 text-xs">
                <GitBranch className="h-3 w-3" />v{program.version_number}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Edit &amp; Create Version
              </Button>
              {!confirmDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : null}
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
            </>
          )}
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Created Info */}
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground/60">
              Created
            </p>
            <div className="mt-1 space-y-1">
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(program.created_at)}
              </p>
              {program.created_by_name && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {program.created_by_name}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground/60">
              Usage
            </p>
            <div className="mt-1 space-y-1">
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                {usage.sessionCount} session
                {usage.sessionCount !== 1 ? "s" : ""}
              </p>
              {usage.centresUsed.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {usage.centresUsed.length} centre
                  {usage.centresUsed.length !== 1 ? "s" : ""}
                </p>
              )}
              {usage.lastUsedAt && (
                <p className="text-xs text-muted-foreground/60">
                  Last used: {formatDate(usage.lastUsedAt)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium uppercase text-muted-foreground/60">
              Details
            </p>
            <div className="mt-1 space-y-1">
              {program.skill_focus && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  {program.skill_focus}
                </p>
              )}
              {program.equipment_used.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  {program.equipment_used.length} equipment item
                  {program.equipment_used.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Version History */}
      {versions.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-foreground">
            Version History
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {versions.map((v) => (
              <Link key={v.id} href={`${basePath}/${v.id}`}>
                <Badge
                  variant={v.id === program.id ? "default" : "outline"}
                  className={`cursor-pointer ${
                    v.id === program.id
                      ? "bg-primary hover:bg-primary/90"
                      : "hover:border-primary"
                  }`}
                >
                  v{v.version_number}
                  <span className="ml-1 text-[10px] opacity-75">
                    {formatDate(v.created_at)}
                  </span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Separator className="my-6" />

      {/* Programme Content */}
      {editing ? (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              Edit Programme (creates new version)
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={savingVersion}
                onClick={handleSaveNewVersion}
              >
                {savingVersion && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                Save as Version {(program.version_number ?? 0) + 1}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditContent(content);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <ProgramEditor content={editContent} onChange={setEditContent} />
          </div>
        </div>
      ) : (
        <ProgramView content={content} collapsible />
      )}
    </div>
  );
}
