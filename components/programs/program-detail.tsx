"use client";

// ============================================================
// ProgramDetailView
// ============================================================
//
// Tabbed detail page for a programme. Mirrors the assessments /
// centres / children detail-view pattern: a single TabsList with
// count badges, rounded-2xl card containers, restrained brand orange
// for the marquee actions.
//
// Four tabs:
//   - Overview         — the rendered programme content (read-only),
//                        plus inline editor when the operator opens
//                        the "Edit & Create Version" flow.
//   - Sessions         — every scheduled session that's used this
//                        programme (link out by centre).
//   - Variants         — every version in the parent_version_id
//                        family (current + siblings).
//   - Linked centres   — distinct centres that have scheduled this
//                        programme, with usage counts.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  GitBranch,
  Layers,
  ListTree,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Sparkles,
  Target,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { ProgramView } from "./program-view";
import { ProgramEditor } from "./program-editor";
import {
  createNewVersion,
  deleteProgram,
} from "@/lib/programs/actions";
import type {
  LinkedCentreSummary,
  ProgramDetail as ProgramDetailType,
  ProgramUsageStats,
  ProgramVersionItem,
  SaveProgramInput,
} from "@/lib/programs/actions";
import type { ProgramContentJson } from "@/lib/ai/types";
import {
  formatProgramAgeBandsShort,
  formatProgramAgeBandsTooltip,
  getProgramAgeBands,
} from "@/lib/utils/programs/age-bands";

// ============================================================
// Local helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface ProgramDetailProps {
  program: ProgramDetailType;
  versions: ProgramVersionItem[];
  usage: ProgramUsageStats;
  linkedCentres: LinkedCentreSummary[];
  basePath: string;
}

export function ProgramDetailView({
  program,
  versions,
  usage,
  linkedCentres,
  basePath,
}: ProgramDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState<ProgramContentJson>(
    program.content_json as unknown as ProgramContentJson,
  );
  const [savingVersion, setSavingVersion] = useState(false);

  const content = program.content_json as unknown as ProgramContentJson;
  const ageBandsShort = formatProgramAgeBandsShort(program);
  const ageBandsTooltip = formatProgramAgeBandsTooltip(program) ?? ageBandsShort;

  async function handleDelete() {
    setDeleting(true);
    const { error } = await deleteProgram(program.id);
    setDeleting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Programme deleted.");
    router.push(basePath);
    router.refresh();
  }

  async function handleSaveNewVersion() {
    setSavingVersion(true);
    const input: SaveProgramInput = {
      sport: program.sport,
      ageGroups: getProgramAgeBands(program),
      durationMinutes: program.duration_minutes,
      skillFocus: program.skill_focus ?? undefined,
      contentJson: editContent,
      equipmentUsed: program.equipment_used,
    };
    const { data, error } = await createNewVersion(program.id, input);
    setSavingVersion(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Version ${data?.version_number} created.`);
    setEditing(false);
    router.push(`${basePath}/${data?.id}`);
    router.refresh();
  }

  const sessionsCount = usage.sessionCount;
  const variantsCount = versions.length;
  const centresCount = linkedCentres.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={basePath} />}
            aria-label="Back to programmes"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-heading text-foreground">
              {program.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="outline">{program.sport}</Badge>
              {ageBandsShort && (
                <Badge variant="secondary" title={ageBandsTooltip ?? ageBandsShort}>
                  Ages {ageBandsShort}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" />
                {program.duration_minutes} min
              </span>
              {program.version_number > 1 && (
                <Badge variant="outline" className="gap-0.5 text-xs">
                  <GitBranch className="size-3" />v{program.version_number}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="min-h-[40px]"
            >
              <Pencil className="size-4" />
              Edit &amp; Create Version
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="destructive"
                    size="sm"
                    className="min-h-[40px]"
                    disabled={deleting}
                  />
                }
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete programme?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &ldquo;{program.title}&rdquo;.
                    If the programme is assigned to any sessions, the delete
                    will be blocked. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {editing && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={savingVersion}
              onClick={handleSaveNewVersion}
              className="min-h-[40px] bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {savingVersion && <Loader2 className="size-4 animate-spin" />}
              Save as v{(program.version_number ?? 0) + 1}
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
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="line" className="flex-wrap gap-x-1 gap-y-2">
          <TabsTrigger value="overview">
            <Layers className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Calendar className="size-4" />
            Sessions ({sessionsCount})
          </TabsTrigger>
          <TabsTrigger value="variants">
            <GitBranch className="size-4" />
            Variants ({variantsCount})
          </TabsTrigger>
          <TabsTrigger value="centres">
            <Building2 className="size-4" />
            Linked centres ({centresCount})
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetaCard
                label="Created"
                rows={[
                  {
                    icon: Calendar,
                    text: formatDate(program.created_at),
                  },
                  ...(program.created_by_name
                    ? [{ icon: User, text: program.created_by_name }]
                    : []),
                ]}
              />
              <MetaCard
                label="Usage"
                rows={[
                  {
                    icon: BarChart3,
                    text: `${usage.sessionCount} session${usage.sessionCount === 1 ? "" : "s"}`,
                  },
                  ...(linkedCentres.length > 0
                    ? [
                        {
                          icon: MapPin,
                          text: `${linkedCentres.length} centre${linkedCentres.length === 1 ? "" : "s"}`,
                        },
                      ]
                    : []),
                  ...(usage.lastUsedAt
                    ? [
                        {
                          icon: Sparkles,
                          text: `Last used ${formatDate(usage.lastUsedAt)}`,
                        },
                      ]
                    : []),
                ]}
              />
              <MetaCard
                label="Details"
                rows={[
                  ...(program.skill_focus
                    ? [{ icon: Target, text: program.skill_focus }]
                    : []),
                  ...(program.equipment_used.length > 0
                    ? [
                        {
                          icon: Package,
                          text: `${program.equipment_used.length} equipment item${program.equipment_used.length === 1 ? "" : "s"}`,
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            {/* Programme content (read-only or editor) */}
            <Card className="rounded-2xl">
              <CardContent className="pt-6">
                {editing ? (
                  <ProgramEditor
                    content={editContent}
                    onChange={setEditContent}
                  />
                ) : (
                  <ProgramView content={content} collapsible />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sessions tab */}
        <TabsContent value="sessions">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Sessions using this programme</CardTitle>
              <CardDescription>
                Most recent scheduling first. Open a centre to see the full
                session schedule.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsCount === 0 ? (
                <EmptyTabState
                  title="No sessions yet"
                  description="This programme hasn't been assigned to a scheduled session yet. Roster a session and pick this programme to start tracking usage."
                />
              ) : (
                <ul className="space-y-2">
                  {linkedCentres.map((centre) => (
                    <li key={centre.id}>
                      <Link
                        href={`/admin/centres/${centre.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 transition hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {centre.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {centre.session_count} session
                            {centre.session_count === 1 ? "" : "s"}
                            {centre.last_session_at
                              ? ` · last ${formatDate(centre.last_session_at)}`
                              : ""}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variants tab */}
        <TabsContent value="variants">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Version history</CardTitle>
              <CardDescription>
                Each saved revision keeps its predecessor intact so reverts
                are non-destructive.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {variantsCount === 0 ? (
                <EmptyTabState
                  title="No version history"
                  description="This is the only version of the programme. Use Edit & Create Version above to fork a v2."
                />
              ) : (
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`${basePath}/${v.id}`}
                        className={
                          "flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 transition hover:bg-muted/30 " +
                          (v.id === program.id
                            ? "border-[#E8712A]/40 bg-[#E8712A]/5"
                            : "")
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            v{v.version_number}
                            {v.id === program.id && (
                              <span className="ml-2 text-xs text-[#E8712A]">
                                current
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(v.created_at)}
                            {v.created_by_name ? ` · ${v.created_by_name}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linked centres tab */}
        <TabsContent value="centres">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Centres using this programme</CardTitle>
              <CardDescription>
                Sorted by usage. Open the centre to drill into its sessions and
                history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {centresCount === 0 ? (
                <EmptyTabState
                  title="No centres yet"
                  description="No centres have scheduled this programme. Add it to a session to see usage here."
                />
              ) : (
                <ul className="space-y-2">
                  {linkedCentres.map((centre) => (
                    <li key={centre.id}>
                      <Link
                        href={`/admin/centres/${centre.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 transition hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8712A]/10">
                            <Building2 className="size-4 text-[#E8712A]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {centre.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {centre.session_count} session
                              {centre.session_count === 1 ? "" : "s"}
                              {centre.last_session_at
                                ? ` · last ${formatDate(centre.last_session_at)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// MetaCard — Overview tab summary card
// ============================================================

function MetaCard({
  label,
  rows,
}: {
  label: string;
  rows: { icon: React.ComponentType<{ className?: string }>; text: string }[];
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-2 space-y-1.5">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            rows.map((row, i) => (
              <p
                key={i}
                className="flex items-center gap-1.5 text-sm text-foreground"
              >
                <row.icon className="size-3.5 text-muted-foreground" />
                {row.text}
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// EmptyTabState
// ============================================================

function EmptyTabState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
      <ListTree className="mx-auto mb-2 size-6 text-muted-foreground/60" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
