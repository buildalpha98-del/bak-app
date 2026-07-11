"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DollarSign, TrendingUp, Wallet, Calendar, AlertTriangle, Plus, Edit2, Award, X,
} from "lucide-react";
import {
  createGrantApplication, updateApplicationStatus,
} from "@/lib/grants/actions";
import { useCountUp } from "@/components/launch/use-count-up";
import type { GrantApplicationWithCentre, GrantOverview } from "@/lib/grants/actions";
import type { Grant, GrantApplicationStatus } from "@/lib/types/database";

interface Props {
  overview: GrantOverview;
  applications: GrantApplicationWithCentre[];
  grants: Grant[];
  schools: Array<{ id: string; name: string; type: "school" | "childcare_centre" | null }>;
}

const STATUS_OPTIONS: { value: GrantApplicationStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "funded", label: "Funded" },
  { value: "expired", label: "Expired" },
];

function formatAUD(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "funded":
    case "approved":
      return "default";
    case "rejected":
    case "expired":
      return "destructive";
    case "submitted":
      return "secondary";
    default:
      return "outline";
  }
}

export function GrantsDashboard({ overview, applications, grants, schools }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL-persisted filters
  const statusFilter = searchParams.get("status") ?? "all";
  const schoolFilter = searchParams.get("school") ?? "all";
  const yearFilter = searchParams.get("year") ?? "all";
  const expiringFilter = searchParams.get("expiring");
  const staleFilter = searchParams.get("stale");
  const approvedThisWeek = searchParams.get("approved") === "this_week";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Animated totals
  const approvedAnimated = useCountUp(Math.round(overview.totalApproved));
  const usedAnimated = useCountUp(Math.round(overview.totalUsed));
  const remainingAnimated = useCountUp(Math.round(overview.totalRemaining));
  const activeAnimated = useCountUp(overview.activeApplications);

  // Toast when pulse jumps deny-list
  useEffect(() => {
    // (Side-effect free; included for future hooks)
  }, [statusFilter]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    grantId: grants[0]?.id ?? "",
    centreId: "",
    term: "Term 1",
    year: String(new Date().getFullYear()),
    amountRequested: "",
    notes: "",
  });

  // Update status dialog
  const [updating, setUpdating] = useState<GrantApplicationWithCentre | null>(null);
  const [updateForm, setUpdateForm] = useState({
    status: "planning" as GrantApplicationStatus,
    amountApproved: "",
    approvedDate: "",
    fundingStartDate: "",
    fundingEndDate: "",
    applicationReference: "",
  });

  const filtered = useMemo(() => {
    const today = new Date();
    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(today.getDate() + 30);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);
    const monday = new Date(today);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);

    return applications.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (schoolFilter !== "all" && a.centre_id !== schoolFilter) return false;
      if (yearFilter !== "all" && String(a.application_year) !== yearFilter)
        return false;
      if (expiringFilter === "30") {
        if (a.status !== "funded") return false;
        if (!a.funding_end_date) return false;
        const end = new Date(a.funding_end_date);
        if (end < today || end > thirtyDaysOut) return false;
        if (a.amount_remaining <= 0) return false;
      }
      if (staleFilter === "14") {
        if (a.status !== "planning") return false;
        if (new Date(a.created_at) >= fourteenDaysAgo) return false;
      }
      if (approvedThisWeek) {
        if (a.status !== "approved") return false;
        if (!a.approved_date || new Date(a.approved_date) < monday) return false;
      }
      return true;
    });
  }, [
    applications,
    statusFilter,
    schoolFilter,
    yearFilter,
    expiringFilter,
    staleFilter,
    approvedThisWeek,
  ]);

  const years = [...new Set(applications.map((a) => a.application_year))].sort((a, b) => b - a);
  const hasActiveJumpFilter = !!(expiringFilter || staleFilter || approvedThisWeek);
  const hasAnyFilter =
    statusFilter !== "all" ||
    schoolFilter !== "all" ||
    yearFilter !== "all" ||
    hasActiveJumpFilter;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.grantId || !form.centreId) {
      toast.error("Select a grant and a school");
      return;
    }
    startTransition(async () => {
      const { error } = await createGrantApplication({
        grantId: form.grantId,
        centreId: form.centreId,
        applicationTerm: form.term,
        applicationYear: Number(form.year),
        amountRequested: form.amountRequested ? Number(form.amountRequested) : undefined,
        notes: form.notes || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success("Application created");
      setCreateOpen(false);
      setForm({ grantId: grants[0]?.id ?? "", centreId: "", term: "Term 1", year: String(new Date().getFullYear()), amountRequested: "", notes: "" });
      router.refresh();
    });
  }

  function openUpdateDialog(app: GrantApplicationWithCentre) {
    setUpdating(app);
    setUpdateForm({
      status: app.status,
      amountApproved: app.amount_approved ? String(app.amount_approved) : "",
      approvedDate: app.approved_date ?? "",
      fundingStartDate: app.funding_start_date ?? "",
      fundingEndDate: app.funding_end_date ?? "",
      applicationReference: app.application_reference ?? "",
    });
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!updating) return;
    startTransition(async () => {
      const { error } = await updateApplicationStatus({
        applicationId: updating.id,
        status: updateForm.status,
        amountApproved: updateForm.amountApproved ? Number(updateForm.amountApproved) : undefined,
        approvedDate: updateForm.approvedDate || undefined,
        fundingStartDate: updateForm.fundingStartDate || undefined,
        fundingEndDate: updateForm.fundingEndDate || undefined,
        applicationReference: updateForm.applicationReference || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success("Application updated");
      setUpdating(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Funding
          </p>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
            Grants
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Track Sporting Schools grants across schools, manage applications, and allocate grant funding to invoices.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="rounded-2xl bg-primary hover:bg-primary/90 text-white"
        >
          <Plus className="size-4 mr-1" />
          New Application
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2">
                <Award className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved (YTD)</p>
                <p className="text-2xl font-bold tabular-nums">
                  ${approvedAnimated.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-2">
                <Wallet className="size-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Used</p>
                <p className="text-2xl font-bold tabular-nums">
                  ${usedAnimated.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2">
                <DollarSign className="size-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold tabular-nums">
                  ${remainingAnimated.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl card-hover">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-muted p-2">
                <TrendingUp className="size-5 text-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Applications</p>
                <p className="text-2xl font-bold tabular-nums">{activeAnimated}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts — collapse into the pulse strip in most cases, but keep the
          full list visible since each one is a specific call-to-action. */}
      {(overview.upcomingExpiries.length > 0 ||
        overview.staleApplications.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {overview.upcomingExpiries.length > 0 && (
            <Card className="rounded-2xl border-amber-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="size-4 text-amber-500" />
                  Expiring Within 30 Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overview.upcomingExpiries.map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{app.centre_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {app.funding_end_date} · {formatAUD(app.amount_remaining)} unused
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openUpdateDialog(app)}>
                        <Edit2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {overview.staleApplications.length > 0 && (
            <Card className="rounded-2xl border-orange-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="size-4 text-primary" />
                  Stuck in Planning (14+ days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overview.staleApplications.map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{app.centre_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.application_term} {app.application_year}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openUpdateDialog(app)}>
                        <Edit2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters + applications table */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">All Applications</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => updateParam("status", v)}
              >
                <SelectTrigger className="h-9 text-sm w-[140px] rounded-2xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={schoolFilter}
                onValueChange={(v) => updateParam("school", v)}
              >
                <SelectTrigger className="h-9 text-sm w-[180px] rounded-2xl">
                  <SelectValue placeholder="School" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={yearFilter}
                onValueChange={(v) => updateParam("year", v)}
              >
                <SelectTrigger className="h-9 text-sm w-[100px] rounded-2xl">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasAnyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateParam("status", null);
                    updateParam("school", null);
                    updateParam("year", null);
                    updateParam("expiring", null);
                    updateParam("stale", null);
                    updateParam("approved", null);
                  }}
                  className="text-muted-foreground"
                >
                  <X className="size-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          {hasActiveJumpFilter && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {expiringFilter === "30" && (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                  Expiring within 30 days
                </Badge>
              )}
              {staleFilter === "14" && (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                  Stuck in planning (14+ days)
                </Badge>
              )}
              {approvedThisWeek && (
                <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                  Approved this week
                </Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {applications.length === 0 ? "No grant applications yet. Create one to get started." : "No applications match your filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">School</th>
                    <th className="text-left py-2 pr-4">Term</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2 pr-4">Requested</th>
                    <th className="text-right py-2 pr-4">Approved</th>
                    <th className="text-right py-2 pr-4">Used</th>
                    <th className="text-right py-2 pr-4">Remaining</th>
                    <th className="text-right py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <Link href={`/admin/centres/${a.centre_id}`} className="font-medium hover:underline">
                          {a.centre_name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{a.application_term} {a.application_year}</td>
                      <td className="py-3 pr-4"><Badge variant={statusVariant(a.status)}>{a.status}</Badge></td>
                      <td className="py-3 pr-4 text-right">{a.amount_requested ? formatAUD(Number(a.amount_requested)) : "—"}</td>
                      <td className="py-3 pr-4 text-right">{a.amount_approved ? formatAUD(Number(a.amount_approved)) : "—"}</td>
                      <td className="py-3 pr-4 text-right">{formatAUD(Number(a.amount_used))}</td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {a.amount_approved ? formatAUD(a.amount_remaining) : "—"}
                      </td>
                      <td className="py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openUpdateDialog(a)}>
                          <Edit2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Grant Application</DialogTitle>
            <DialogDescription>Track a new Sporting Schools grant application for a school.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Grant</Label>
              <Select value={form.grantId} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, grantId: v })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {grants.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">School</Label>
              <Select value={form.centreId} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, centreId: v })); }}>
                <SelectTrigger><SelectValue placeholder="Select a school" /></SelectTrigger>
                <SelectContent>
                  {schools.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No schools found. Add a centre with type=school first.</div>
                  ) : schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Term</Label>
                <Select value={form.term} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, term: v })); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Term 1">Term 1</SelectItem>
                    <SelectItem value="Term 2">Term 2</SelectItem>
                    <SelectItem value="Term 3">Term 3</SelectItem>
                    <SelectItem value="Term 4">Term 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount Requested (AUD)</Label>
              <Input type="number" step="0.01" value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Update status dialog */}
      <Dialog open={!!updating} onOpenChange={(open) => { if (!open) setUpdating(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Application</DialogTitle>
            <DialogDescription>
              {updating?.centre_name} — {updating?.application_term} {updating?.application_year}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={updateForm.status} onValueChange={(v) => { if (v) setUpdateForm((f) => ({ ...f, status: v as GrantApplicationStatus })); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount Approved (AUD)</Label>
              <Input type="number" step="0.01" value={updateForm.amountApproved} onChange={(e) => setUpdateForm((f) => ({ ...f, amountApproved: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Approved Date</Label>
                <Input type="date" value={updateForm.approvedDate} onChange={(e) => setUpdateForm((f) => ({ ...f, approvedDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Application Ref</Label>
                <Input value={updateForm.applicationReference} onChange={(e) => setUpdateForm((f) => ({ ...f, applicationReference: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Funding Start</Label>
                <Input type="date" value={updateForm.fundingStartDate} onChange={(e) => setUpdateForm((f) => ({ ...f, fundingStartDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Funding End</Label>
                <Input type="date" value={updateForm.fundingEndDate} onChange={(e) => setUpdateForm((f) => ({ ...f, fundingEndDate: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUpdating(null)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
