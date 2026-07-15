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
  MessageSquare,
  Package,
  Pencil,
  Sparkles,
  Target,
  Trash2,
  User,
} from "lucide-react";
import { Download, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import type { ProgramFeedbackSummary } from "@/lib/programs/feedback-actions";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCentresForSelect } from "@/lib/terms/actions";
import { mondayOfIso } from "@/lib/utils/roster";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

import { ProgramView } from "./program-view";
import { ProgramEditor } from "./program-editor";
import {
  createNewVersion,
  deleteProgram,
  generateProgramPdf,
  applyProgramToSessions,
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
  /** Coach delivery feedback aggregate — null until any exists. */
  feedbackSummary?: ProgramFeedbackSummary | null;
}

export function ProgramDetailView({
  program,
  versions,
  usage,
  linkedCentres,
  basePath,
  feedbackSummary = null,
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

  // ---- PDF download ----
  const [pdfBusy, setPdfBusy] = useState(false);
  async function handleDownloadPdf() {
    setPdfBusy(true);
    const { data, error } = await generateProgramPdf(program.id);
    setPdfBusy(false);
    if (error || !data) {
      toast.error(error ?? "Failed to generate the PDF.");
      return;
    }
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Session plan downloaded.");
  }

  // ---- Apply to roster ----
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyWeek, setApplyWeek] = useState(() => {
    // Default to next week's Monday (Sydney) — this week's earlier
    // sessions have usually already run.
    const m = mondayOfIso(sydneyTodayIso());
    return new Date(
      Date.UTC(
        Number(m.slice(0, 4)),
        Number(m.slice(5, 7)) - 1,
        Number(m.slice(8, 10)) + 7
      )
    )
      .toISOString()
      .split("T")[0];
  });
  const [applyCentre, setApplyCentre] = useState<string>("all");
  const [applyOverwrite, setApplyOverwrite] = useState(false);
  const [centreOptions, setCentreOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  async function openApplyDialog() {
    setApplyOpen(true);
    if (centreOptions.length === 0) {
      const { data } = await getCentresForSelect();
      setCentreOptions(data ?? []);
    }
  }

  async function handleApply() {
    setApplyBusy(true);
    const { data, error } = await applyProgramToSessions({
      programId: program.id,
      weekOf: applyWeek,
      centreId: applyCentre === "all" ? undefined : applyCentre,
      overwrite: applyOverwrite,
    });
    setApplyBusy(false);
    if (error || !data) {
      toast.error(error ?? "Failed to apply the programme.");
      return;
    }
    if (data.updated === 0) {
      toast.info(
        data.matched === 0
          ? `No ${program.sport} sessions found that week.`
          : `All ${data.matched} matching sessions already have a programme — tick overwrite to replace.`
      );
      return;
    }
    toast.success(
      `Applied to ${data.updated} session${data.updated === 1 ? "" : "s"}.`
    );
    setApplyOpen(false);
    router.refresh();
  }

  const sessionsCount = usage.sessionCount;
  const variantsCount = versions.length;
  const centresCount = linkedCentres.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 animate-fade-up">
      {/* Apply-to-roster dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply to roster</DialogTitle>
            <DialogDescription>
              Attaches this programme to every {program.sport} session in the
              chosen week{applyCentre === "all" ? " across all centres" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="apply-week">Week of</Label>
              <Input
                id="apply-week"
                type="date"
                value={applyWeek}
                onChange={(e) => setApplyWeek(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Any day works — it snaps to that week&apos;s Monday.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Centre</Label>
              <Select value={applyCentre} onValueChange={(v) => setApplyCentre(v ?? "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All centres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All centres</SelectItem>
                  {centreOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={applyOverwrite}
                onCheckedChange={(v) => setApplyOverwrite(v === true)}
              />
              Replace sessions that already have a programme
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={applyBusy}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {applyBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
              className="min-h-[40px]"
            >
              {pdfBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              onClick={openApplyDialog}
              className="min-h-[40px] bg-primary text-white hover:bg-primary/90"
            >
              <CalendarPlus className="size-4" />
              Apply to roster
            </Button>
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
              className="min-h-[40px] bg-primary text-white hover:bg-primary/90"
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
                  ...(feedbackSummary && feedbackSummary.total > 0
                    ? [
                        {
                          icon: MessageSquare,
                          text: `Coach feedback: ${feedbackSummary.justRight}× just right · ${feedbackSummary.tooEasy}× too easy · ${feedbackSummary.tooHard}× too hard`,
                        },
                      ]
                    : []),
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
              <CardTitle>Centres using this programme</CardTitle>
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
                            ? "border-primary/40 bg-primary/5"
                            : "")
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            v{v.version_number}
                            {v.id === program.id && (
                              <span className="ml-2 text-xs text-primary">
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
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Building2 className="size-4 text-primary" />
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
