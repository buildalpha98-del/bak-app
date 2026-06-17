"use client";

// ============================================================
// ChildDetailView
// ============================================================
//
// Refactored from three stacked Cards into a tabbed surface with
// count badges. Tabs:
//   - Engagement (last 12 weeks attended, attendance %, observations)
//   - Assessments (existing ChildAssessmentDisplay)
//   - Family (parents from parent_children + parent_profiles,
//     fallback parent_name text, medical notes, emergency contact)
//   - Insights (child_insights rows + on-demand generation stub)
//
// Deep link via `?tab=engagement|assessments|family|insights` —
// the list view uses this for the "Insight" badge click-through.
//
// Design language matches the staff close-out — `variant="line"`
// tabs, rounded-2xl inner cards, gap-6 between major sections.

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Users,
  CalendarDays,
  AlertTriangle,
  Trash2,
  Sparkles,
  Mail,
  Phone,
  TrendingUp,
  HeartPulse,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  updateChild,
  withdrawChildFromCentre,
  deleteChild,
} from "@/lib/children/actions";
import type { ChildDetail } from "@/lib/children/actions";
import type { AgeGroup, Gender } from "@/lib/types/enums";
import { ChildAssessmentDisplay } from "@/components/assessments/child-assessment-display";

interface ChildDetailViewProps {
  data: ChildDetail;
  basePath: string;
}

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ChildDetailView({
  data,
  basePath,
}: ChildDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isWithdrawing, startWithdrawTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // Deep-link support — defaults to engagement.
  const allowedTabs = [
    "engagement",
    "assessments",
    "family",
    "insights",
  ] as const;
  const tabParam = searchParams.get("tab");
  const initialTab = (
    tabParam && (allowedTabs as readonly string[]).includes(tabParam)
      ? tabParam
      : "engagement"
  ) as (typeof allowedTabs)[number];

  const [form, setForm] = useState({
    first_name: data.first_name,
    last_name: data.last_name,
    date_of_birth: data.date_of_birth ?? "",
    age_group: data.age_group,
    gender: (data.gender ?? "") as string,
    medical_notes: data.medical_notes ?? "",
    parent_name: data.parent_name ?? "",
    parent_phone: data.parent_phone ?? "",
    parent_email: data.parent_email ?? "",
  });

  // ============================================================
  // Derived stats for tab badges + Engagement summary
  // ============================================================

  const twelveWeeksAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 84);
    return d;
  }, []);

  const recentAttendance = useMemo(() => {
    return data.attendance_history.filter(
      (a) => new Date(a.date) >= twelveWeeksAgo,
    );
  }, [data.attendance_history, twelveWeeksAgo]);

  const recentPresent = recentAttendance.filter((a) => a.present).length;
  const recentTotal = recentAttendance.length;
  const attendancePct =
    recentTotal > 0 ? Math.round((recentPresent / recentTotal) * 100) : null;

  const observationsCount = data.observations.length;
  const engagementBadge = recentPresent;

  // Assessments tab count — total skill ratings across the most recent
  // sport+term group. We don't have direct skill counts here without a
  // round-trip, so we fall back to the attendance-attended count.
  const assessmentsBadge: number | null = null;

  const familyBadge =
    data.linked_parents.length +
    (data.linked_parents.length === 0 && data.parent_name ? 1 : 0);

  const insightsBadge = data.insights.length;

  // ============================================================
  // Handlers
  // ============================================================

  function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    startTransition(async () => {
      const { error } = await updateChild(data.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        age_group: form.age_group,
        gender: (form.gender as Gender) || null,
        medical_notes: form.medical_notes || null,
        parent_name: form.parent_name || null,
        parent_phone: form.parent_phone || null,
        parent_email: form.parent_email || null,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Child updated successfully.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const { error } = await deleteChild(data.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Child deleted successfully.");
        router.push(basePath);
        router.refresh();
      }
    });
  }

  function handleWithdraw(centreId: string, centreName: string) {
    startWithdrawTransition(async () => {
      const { error } = await withdrawChildFromCentre(data.id, centreId);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`Withdrawn from ${centreName}.`);
        router.refresh();
      }
    });
  }

  function handleGenerateInsight() {
    // The cron job at /api/cron/child-insights handles regular
    // generation; an on-demand admin trigger lands in Wave B.
    setIsGeneratingInsight(true);
    setTimeout(() => {
      setIsGeneratingInsight(false);
      toast.info("On-demand generation coming in Wave B.");
    }, 200);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            onClick={() => router.push(basePath)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {data.first_name} {data.last_name}
              </h1>
              <Badge variant="secondary">{data.age_group} yrs</Badge>
              <Badge
                variant={data.status === "active" ? "default" : "destructive"}
              >
                {data.status}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  className="min-h-[44px] text-red-600 hover:bg-red-50 hover:text-red-700"
                />
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Child</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {data.first_name}{" "}
                  {data.last_name}? This will also remove all associated
                  skill ratings, attendance records, and centre enrolments.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {isDeleting ? "Deleting..." : "Delete Child"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            className="min-h-[44px] bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            onClick={handleSave}
            disabled={isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Editable details — kept inline at the top so the operator
          can fix any data issue without diving into a tab. */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                className="min-h-[44px]"
                value={form.first_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, first_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                className="min-h-[44px]"
                value={form.last_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, last_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                className="min-h-[44px]"
                value={form.date_of_birth}
                onChange={(e) =>
                  setForm((p) => ({ ...p, date_of_birth: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age_group">Age group</Label>
              <Select
                value={form.age_group}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, age_group: v as AgeGroup }))
                }
              >
                <SelectTrigger id="age_group" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGE_GROUPS.map((ag) => (
                    <SelectItem key={ag} value={ag}>
                      {ag} years
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={form.gender}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, gender: v as string }))
              }
            >
              <SelectTrigger id="gender" className="min-h-[44px]">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Linked Centres — inline list with withdraw chips. */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" />
              Linked centres
            </p>
            {data.centres.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not enrolled at any centres.
              </p>
            ) : (
              <div className="space-y-2">
                {data.centres.map((centre) => (
                  <div
                    key={centre.id}
                    className="flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{centre.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Enrolled {formatDate(centre.enrolled_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          centre.enrolment_status === "active"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {centre.enrolment_status}
                      </Badge>
                      {centre.enrolment_status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[40px]"
                          disabled={isWithdrawing}
                          onClick={() =>
                            handleWithdraw(centre.id, centre.name)
                          }
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList variant="line">
          <TabsTrigger value="engagement">
            Engagement
            {engagementBadge > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {engagementBadge}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="assessments">
            Assessments
          </TabsTrigger>
          <TabsTrigger value="family">
            Family
            {familyBadge > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {familyBadge}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="insights">
            Insights
            {insightsBadge > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {insightsBadge}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Engagement */}
        <TabsContent value="engagement" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Sessions (12wk)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {recentPresent}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {recentTotal} session{recentTotal === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Attendance %
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {attendancePct === null ? "—" : `${attendancePct}%`}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total attended
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.total_sessions_attended}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-5 w-5" />
                Recent attendance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.attendance_history.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No attendance records yet.
                </p>
              ) : (
                <div className="rounded-2xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Sport</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Centre
                        </TableHead>
                        <TableHead>Attendance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.attendance_history.slice(0, 30).map((record) => (
                        <TableRow key={record.session_id}>
                          <TableCell className="text-sm">
                            {formatDate(record.date)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.sport}
                          </TableCell>
                          <TableCell className="hidden text-sm sm:table-cell">
                            {record.centre_name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                record.present ? "default" : "destructive"
                              }
                            >
                              {record.present ? "Present" : "Absent"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5" />
                Observations
                {observationsCount > 0 && (
                  <Badge variant="secondary">{observationsCount}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.observations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No coach observations yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.observations.slice(0, 10).map((obs) => (
                    <li
                      key={obs.id}
                      className="rounded-2xl border p-3"
                    >
                      <p className="text-sm">{obs.observation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(obs.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assessments */}
        <TabsContent value="assessments">
          <ChildAssessmentDisplay childId={data.id} />
        </TabsContent>

        {/* Family */}
        <TabsContent value="family" className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                Linked parents
                {data.linked_parents.length > 0 && (
                  <Badge variant="secondary">
                    {data.linked_parents.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.linked_parents.length === 0 ? (
                data.parent_name ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      No parent account linked. Contact details on file:
                    </p>
                    <div className="rounded-2xl border p-3">
                      <p className="font-medium">{data.parent_name}</p>
                      {data.parent_phone && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <Phone className="mr-1 inline size-3" />
                          {data.parent_phone}
                        </p>
                      )}
                      {data.parent_email && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          <Mail className="mr-1 inline size-3" />
                          {data.parent_email}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No parents linked yet.
                  </p>
                )
              ) : (
                <ul className="space-y-3">
                  {data.linked_parents.map((p) => (
                    <li key={p.id} className="rounded-2xl border p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {p.first_name} {p.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.relationship}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground sm:text-right">
                          <p>
                            <Mail className="mr-1 inline size-3" />
                            {p.email}
                          </p>
                          {p.phone && (
                            <p>
                              <Phone className="mr-1 inline size-3" />
                              {p.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="h-5 w-5" />
                Medical & emergency contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="medical_notes">Medical notes</Label>
                <Textarea
                  id="medical_notes"
                  placeholder="Allergies, conditions, etc."
                  value={form.medical_notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, medical_notes: e.target.value }))
                  }
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="parent_name_em">Emergency contact name</Label>
                <Input
                  id="parent_name_em"
                  className="min-h-[44px]"
                  value={form.parent_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, parent_name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="parent_phone_em">Emergency phone</Label>
                  <Input
                    id="parent_phone_em"
                    type="tel"
                    className="min-h-[44px]"
                    value={form.parent_phone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        parent_phone: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_email_em">Emergency email</Label>
                  <Input
                    id="parent_email_em"
                    type="email"
                    className="min-h-[44px]"
                    value={form.parent_email}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        parent_email: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights */}
        <TabsContent value="insights" className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-5 w-5 text-[#E8712A]" />
                  AI insights
                  {data.insights.length > 0 && (
                    <Badge variant="secondary">{data.insights.length}</Badge>
                  )}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateInsight}
                  disabled={isGeneratingInsight}
                >
                  <Sparkles className="size-4" />
                  Generate new insight
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {data.insights.length === 0 ? (
                <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                  No AI insights yet. Insights are generated at the end of
                  each term — the most recent run will appear here once it
                  has run.
                </div>
              ) : (
                <ul className="space-y-3">
                  {data.insights.map((insight) => (
                    <li
                      key={insight.id}
                      className="rounded-2xl border p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {insight.insight_type === "term_end"
                            ? "Term-end summary"
                            : "On-demand insight"}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(insight.created_at)}
                        </span>
                      </div>
                      {insight.summary && (
                        <p className="mt-2 text-sm">{insight.summary}</p>
                      )}
                      {(insight.strengths?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Strengths
                          </p>
                          <ul className="ml-4 mt-1 list-disc text-sm">
                            {insight.strengths.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(insight.areas_for_growth?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Areas for growth
                          </p>
                          <ul className="ml-4 mt-1 list-disc text-sm">
                            {insight.areas_for_growth.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(insight.recommendations?.length ?? 0) > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Recommendations
                          </p>
                          <ul className="ml-4 mt-1 list-disc text-sm">
                            {insight.recommendations.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
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
