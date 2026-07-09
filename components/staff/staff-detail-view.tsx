"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  UserX,
  UserCheck,
  Plus,
  CheckCircle,
  Trash2,
  Clock,
  Shield,
  KeyRound,
  Copy,
  Mail,
  MessageSquare,
  Banknote,
  BanknoteX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateStaffMember,
  archiveStaffMember,
  reactivateStaffMember,
  hardDeleteStaffMember,
  adminResetStaffPassword,
  sendStaffPasswordResetEmail,
  setStaffFinancialAccess,
  upsertPayRate,
  upsertComplianceDoc,
  verifyComplianceDoc,
  upsertAvailabilitySlot,
  deleteAvailabilitySlot,
  getStaffSessions,
} from "@/lib/staff/actions";
import { sendSms } from "@/lib/sms/actions";
import type { StaffDetail } from "@/lib/staff/actions";
import { EntityFeedbackTab } from "@/components/feedback/entity-feedback-tab";
import { PushOptInToggle } from "@/components/push/push-opt-in-toggle";
import type { Profile, PayRate, ComplianceDoc, AvailabilitySlot, Session } from "@/lib/types/database";
import type {
  UserRole,
  UserStatus,
  ComplianceDocType,
  ComplianceStatus,
  SessionType,
  RateUnit,
} from "@/lib/types/enums";

// ============================================================
// Constants
// ============================================================

const STATUS_STYLES: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Inactive", className: "bg-secondary text-muted-foreground" },
  onboarding: { label: "Onboarding", className: "bg-amber-100 text-amber-700" },
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  ops: "Ops",
  coach: "Coach",
  parent: "Parent",
};

const DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  police_check: "Police Check",
  insurance: "Insurance",
  coaching_cert: "Coaching Cert",
  code_of_conduct: "Code of Conduct",
  policy_ack: "Policy Ack",
  other: "Other",
};

const COMPLIANCE_STATUS_STYLES: Record<
  ComplianceStatus,
  { label: string; className: string }
> = {
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  expired: { label: "Expired", className: "bg-red-100 text-red-700" },
  rejected: { label: "Rejected", className: "bg-secondary text-muted-foreground" },
};

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  childcare: "Childcare",
  school_local: "School (Local)",
  school_travel: "School (Travel)",
  holiday_clinic: "Holiday Clinic",
};

const RATE_UNIT_LABELS: Record<RateUnit, string> = {
  per_session: "Per Session",
  per_hour: "Per Hour",
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Main component
// ============================================================

interface StaffDetailViewProps {
  data: StaffDetail;
  /**
   * When true, the viewer is an admin and may grant/revoke financial
   * access on this profile. Hides the toggle for non-admin viewers
   * (e.g. ops viewing a coach's detail). Defaults to false — the
   * page.tsx is the source of truth.
   */
  canEditFinancialAccess?: boolean;
  /**
   * When non-null the viewer IS this staff member (admin/ops viewing
   * their own row in /admin/staff/[id] or /ops/staff/[id]). We render
   * the push opt-in card with this count as the starting state. The
   * card is hidden when null because push subscriptions are
   * per-browser -- an admin can't enable push for someone else's
   * device.
   */
  selfPushCount?: number | null;
}

export function StaffDetailView({
  data: initialData,
  canEditFinancialAccess = false,
  selfPushCount = null,
}: StaffDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link support: ?tab=compliance|pay-rates|availability|sessions|feedback
  // picks the tab on first paint. Used by the list view's compliance
  // indicator click-through and the at-risk pulse jumps.
  const allowedTabs = [
    "overview",
    "compliance",
    "pay-rates",
    "availability",
    "sessions",
    "feedback",
  ] as const;
  const tabParam = searchParams.get("tab");
  const initialTab = (
    tabParam && (allowedTabs as readonly string[]).includes(tabParam)
      ? tabParam
      : "overview"
  ) as (typeof allowedTabs)[number];
  const [profile, setProfile] = useState(initialData.profile);
  const [payRates, setPayRates] = useState(initialData.pay_rates);
  const [compDocs, setCompDocs] = useState(initialData.compliance_docs);
  const [availability, setAvailability] = useState(initialData.availability_slots);
  const [sessions, setSessions] = useState<(Session & { centre_name: string })[] | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Password reset
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Financial access toggle
  const [financialBusy, setFinancialBusy] = useState(false);

  // SMS test affordance — admin-only triage for verifying the SMS bridge
  // is reachable for this staff member. The send goes through the configured
  // provider (Twilio in prod, mock in dev) and writes an sms_log row either
  // way so admins can audit later.
  const [smsBusy, setSmsBusy] = useState(false);

  async function handleSendTestSms() {
    if (!profile.phone) {
      toast.error("No phone number on file for this staff member.");
      return;
    }
    setSmsBusy(true);
    const { error } = await sendSms({
      userId: profile.id,
      body: `Build Alpha Kids: test SMS for ${profile.name}. If you received this you're reachable for urgent alerts.`,
    });
    setSmsBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Test SMS sent to ${profile.name}.`);
  }

  async function handleToggleFinancialAccess() {
    const next = !profile.financial_access;
    setFinancialBusy(true);
    const { error } = await setStaffFinancialAccess(profile.id, next);
    setFinancialBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setProfile((p) => ({ ...p, financial_access: next }));
    toast.success(
      next
        ? `Financial access granted to ${profile.name}.`
        : `Financial access revoked from ${profile.name}.`,
    );
  }

  // Dialogs
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addRateOpen, setAddRateOpen] = useState(false);
  const [addSlotOpen, setAddSlotOpen] = useState(false);

  const statusStyle = STATUS_STYLES[profile.status];

  async function loadSessions() {
    if (sessionsLoaded) return;
    const res = await getStaffSessions(profile.id);
    setSessions(res.data ?? []);
    setSessionsLoaded(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" render={<Link href="/admin/staff" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar size="lg">
          {profile.photo_url && <AvatarImage src={profile.photo_url} alt={profile.name} />}
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{profile.name}</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{ROLE_LABELS[profile.role]}</Badge>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
            {profile.financial_access && (
              <Badge variant="secondary" className="gap-1">
                <Banknote className="h-3 w-3" />
                Financial access
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditProfileOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setResetPasswordOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            Reset Password
          </Button>
          {canEditFinancialAccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendTestSms}
              disabled={smsBusy || !profile.phone}
              title={
                profile.phone
                  ? "Send a test SMS to verify the bridge is reachable."
                  : "Add a phone number first."
              }
            >
              <MessageSquare className="h-3.5 w-3.5" />
              SMS test
            </Button>
          )}
          {canEditFinancialAccess && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFinancialAccess}
              disabled={financialBusy}
              title={
                profile.financial_access
                  ? "Hides invoicing, payroll, analytics, grants, and intelligence from this user."
                  : "Grants invoicing, payroll, analytics, grants, and intelligence to this user."
              }
            >
              {profile.financial_access ? (
                <>
                  <BanknoteX className="h-3.5 w-3.5" />
                  Revoke financial access
                </>
              ) : (
                <>
                  <Banknote className="h-3.5 w-3.5" />
                  Grant financial access
                </>
              )}
            </Button>
          )}
          <Button
            variant={profile.status === "active" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setDeactivateOpen(true)}
          >
            {profile.status === "active" ? (
              <>
                <UserX className="h-3.5 w-3.5" />
                Delete
              </>
            ) : (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                Restore
              </>
            )}
          </Button>
          {canEditFinancialAccess && profile.status === "inactive" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setHardDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Permanently
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="pay-rates">Pay Rates</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="sessions" onClick={loadSessions}>
            Sessions
          </TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview">
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border bg-card p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Email" value={profile.email} />
                <InfoRow label="Phone" value={profile.phone} />
                <InfoRow label="Address" value={profile.address} />
                <InfoRow label="Date of Birth" value={formatDate(profile.date_of_birth)} />
                <InfoRow label="Emergency Contact" value={profile.emergency_contact_name} />
                <InfoRow label="Emergency Phone" value={profile.emergency_contact_phone} />
                <InfoRow label="ABN" value={profile.abn} />
                <InfoRow
                  label="Default Pay Rate"
                  value={profile.default_pay_rate ? `$${profile.default_pay_rate.toFixed(2)}` : null}
                />
                <InfoRow label="Account Created" value={formatDate(profile.created_at)} />
              </div>
            </div>
            {selfPushCount !== null && (
              <PushOptInToggle
                initialCount={selfPushCount}
                heading="Push notifications -- this device"
                description="You're viewing your own profile. Enable push to receive urgent shift swaps and waitlist offers on this browser."
              />
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Compliance */}
        <TabsContent value="compliance">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddDocOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" />
                Add Document
              </Button>
            </div>
            {compDocs.length === 0 ? (
              <EmptyState icon={<Shield className="h-8 w-8" />} message="No compliance documents yet." />
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Doc Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compDocs.map((doc) => {
                      const cs = COMPLIANCE_STATUS_STYLES[doc.status];
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            {DOC_TYPE_LABELS[doc.doc_type]}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {doc.doc_number || "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cs.className}`}>
                              {cs.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDate(doc.expiry_date)}
                          </TableCell>
                          <TableCell className="text-right">
                            {doc.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const res = await verifyComplianceDoc(doc.id);
                                  if (!res.error) {
                                    setCompDocs((prev) =>
                                      prev.map((d) =>
                                        d.id === doc.id
                                          ? { ...d, status: "verified" as ComplianceStatus }
                                          : d
                                      )
                                    );
                                  }
                                }}
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                Verify
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Pay Rates */}
        <TabsContent value="pay-rates">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddRateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" />
                Add Rate
              </Button>
            </div>
            {payRates.length === 0 ? (
              <EmptyState icon={<Clock className="h-8 w-8" />} message="No pay rates set." />
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session Type</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Effective From</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payRates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">
                          {SESSION_TYPE_LABELS[rate.session_type as SessionType] ?? rate.session_type}
                        </TableCell>
                        <TableCell>${rate.rate.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {RATE_UNIT_LABELS[rate.rate_unit]}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(rate.effective_from)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 4: Availability */}
        <TabsContent value="availability">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddSlotOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" />
                Add Slot
              </Button>
            </div>
            {availability.length === 0 ? (
              <EmptyState icon={<Clock className="h-8 w-8" />} message="No availability set." />
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Location Preferences</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availability.map((slot) => (
                      <TableRow key={slot.id}>
                        <TableCell className="font-medium">
                          {DAY_LABELS[slot.day_of_week]}
                        </TableCell>
                        <TableCell>{slot.start_time}</TableCell>
                        <TableCell>{slot.end_time}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {slot.location_preferences.length > 0
                            ? slot.location_preferences.join(", ")
                            : "Any"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const res = await deleteAvailabilitySlot(slot.id);
                              if (!res.error) {
                                setAvailability((prev) =>
                                  prev.filter((s) => s.id !== slot.id)
                                );
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 5: Sessions */}
        <TabsContent value="sessions">
          <div className="mt-4">
            {!sessionsLoaded ? (
              <p className="text-sm text-muted-foreground">Loading sessions...</p>
            ) : sessions && sessions.length > 0 ? (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Centre</TableHead>
                      <TableHead>Sport</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{formatDate(s.date)}</TableCell>
                        <TableCell>{s.time}</TableCell>
                        <TableCell>{s.centre_name}</TableCell>
                        <TableCell>{s.sport}</TableCell>
                        <TableCell>{s.duration_minutes}min</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {s.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<Clock className="h-8 w-8" />} message="No sessions found." />
            )}
          </div>
        </TabsContent>

        {/* Tab 6: Feedback */}
        <TabsContent value="feedback">
          <EntityFeedbackTab entityType="coach" entityId={profile.id} />
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* Dialogs                                                       */}
      {/* ============================================================ */}

      {/* Edit Profile Dialog */}
      <EditProfileDialog
        profile={profile}
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        onSaved={(updated) => setProfile(updated)}
      />

      {/* Deactivate/Reactivate Dialog */}
      <DeactivateDialog
        profile={profile}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        onDone={(newStatus) => {
          setProfile((p) => ({ ...p, status: newStatus }));
        }}
      />

      {/* Permanent Delete Dialog */}
      <HardDeleteDialog
        profile={profile}
        open={hardDeleteOpen}
        onOpenChange={setHardDeleteOpen}
        onDone={() => router.push("/admin/staff")}
      />

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={(open) => {
        setResetPasswordOpen(open);
        if (!open) { setTempPassword(null); setCopied(false); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password for {profile.name}</DialogTitle>
            <DialogDescription>
              Generate a temporary password or send a reset email to {profile.email}.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Temporary password generated. Share this with {profile.name.split(" ")[0]} — they&apos;ll be prompted to change it on first login.
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted p-3 font-mono text-sm">
                <span className="flex-1 select-all">{tempPassword}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Button
                onClick={async () => {
                  setResetLoading(true);
                  const res = await adminResetStaffPassword(profile.id);
                  setResetLoading(false);
                  if (res.data) setTempPassword(res.data.tempPassword);
                }}
                disabled={resetLoading}
              >
                <KeyRound className="h-4 w-4" />
                {resetLoading ? "Generating..." : "Generate Temporary Password"}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setResetLoading(true);
                  const res = await sendStaffPasswordResetEmail(profile.email);
                  setResetLoading(false);
                  if (!res.error) {
                    setResetPasswordOpen(false);
                    router.refresh();
                  }
                }}
                disabled={resetLoading}
              >
                <Mail className="h-4 w-4" />
                {resetLoading ? "Sending..." : "Send Reset Email"}
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>
              {tempPassword ? "Done" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Compliance Doc Dialog */}
      <AddComplianceDocDialog
        userId={profile.id}
        open={addDocOpen}
        onOpenChange={setAddDocOpen}
        onAdded={(doc) => setCompDocs((prev) => [...prev, doc])}
      />

      {/* Add Pay Rate Dialog */}
      <AddPayRateDialog
        userId={profile.id}
        open={addRateOpen}
        onOpenChange={setAddRateOpen}
        onAdded={(rate) => setPayRates((prev) => [rate, ...prev])}
      />

      {/* Add Availability Slot Dialog */}
      <AddAvailabilityDialog
        userId={profile.id}
        open={addSlotOpen}
        onOpenChange={setAddSlotOpen}
        onAdded={(slot) =>
          setAvailability((prev) => [...prev, slot].sort((a, b) => a.day_of_week - b.day_of_week))
        }
      />
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ============================================================
// Edit Profile Dialog
// ============================================================

function EditProfileDialog({
  profile,
  open,
  onOpenChange,
  onSaved,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Profile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const updates = {
      name: (fd.get("name") as string).trim(),
      phone: (fd.get("phone") as string).trim() || null,
      address: (fd.get("address") as string).trim() || null,
      date_of_birth: (fd.get("date_of_birth") as string) || null,
      emergency_contact_name: (fd.get("emergency_contact_name") as string).trim() || null,
      emergency_contact_phone: (fd.get("emergency_contact_phone") as string).trim() || null,
      abn: (fd.get("abn") as string).trim() || null,
    };

    const res = await updateStaffMember(profile.id, updates);
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    onSaved({ ...profile, ...updates });
    onOpenChange(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" name="name" defaultValue={profile.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input id="edit-phone" name="phone" defaultValue={profile.phone ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-address">Address</Label>
            <Input id="edit-address" name="address" defaultValue={profile.address ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-dob">Date of Birth</Label>
            <Input
              id="edit-dob"
              name="date_of_birth"
              type="date"
              defaultValue={profile.date_of_birth ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-ec-name">Emergency Contact Name</Label>
            <Input
              id="edit-ec-name"
              name="emergency_contact_name"
              defaultValue={profile.emergency_contact_name ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-ec-phone">Emergency Contact Phone</Label>
            <Input
              id="edit-ec-phone"
              name="emergency_contact_phone"
              defaultValue={profile.emergency_contact_phone ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-abn">ABN</Label>
            <Input id="edit-abn" name="abn" defaultValue={profile.abn ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Deactivate/Reactivate Dialog
// ============================================================

function DeactivateDialog({
  profile,
  open,
  onOpenChange,
  onDone,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (newStatus: UserStatus) => void;
}) {
  const [loading, setLoading] = useState(false);
  const isActive = profile.status === "active";
  const newStatus = isActive ? "inactive" : "active";

  async function handleConfirm() {
    setLoading(true);
    const res = isActive
      ? await archiveStaffMember(profile.id)
      : await reactivateStaffMember(profile.id);
    if (!res.error) {
      onDone(newStatus);
      onOpenChange(false);
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isActive ? "Delete" : "Restore"} {profile.name}?
          </DialogTitle>
          <DialogDescription>
            {isActive ? (
              <>
                Their account will be locked, any open session will be signed out, and they won&apos;t be eligible for new shifts. They&apos;ll move to the Archive tab on the Staff list. Their details (sessions worked, swap requests, invoices) are kept — not erased — since staff records must be retained for 7 years under Fair Work record-keeping requirements. You can restore them from the Archive at any time.
              </>
            ) : (
              "This will move the staff member out of the Archive and restore their access to the platform."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isActive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
            className={!isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
          >
            {loading
              ? "Processing..."
              : isActive
                ? "Delete"
                : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Permanent Delete Dialog
// ============================================================

function HardDeleteDialog({
  profile,
  open,
  onOpenChange,
  onDone,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameMatches =
    confirmName.trim().toLowerCase() === profile.name.trim().toLowerCase();

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await hardDeleteStaffMember(profile.id, confirmName);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmName("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Permanently delete {profile.name}?</DialogTitle>
          <DialogDescription>
            This cannot be undone. Their invoices, pay rates, performance
            history, badges, and availability will be permanently destroyed.
            Sessions they worked will keep the record but lose the coach
            attribution. If they have session notes, skill ratings, or
            other authored records that must be preserved, this will be
            blocked instead of silently deleting them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-name" className="text-foreground font-medium">
            Type <span className="font-semibold">{profile.name}</span> to confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !nameMatches}
          >
            {loading ? "Deleting..." : "Delete Permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Compliance Doc Dialog
// ============================================================

function AddComplianceDocDialog({
  userId,
  open,
  onOpenChange,
  onAdded,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (doc: ComplianceDoc) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<ComplianceDocType>("wwcc");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      user_id: userId,
      doc_type: docType,
      doc_number: (fd.get("doc_number") as string).trim() || undefined,
      expiry_date: (fd.get("expiry_date") as string) || undefined,
      notes: (fd.get("notes") as string).trim() || undefined,
    };

    const res = await upsertComplianceDoc(data);
    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Optimistic — create a temporary doc object
    const tempDoc: ComplianceDoc = {
      id: crypto.randomUUID(),
      user_id: userId,
      doc_type: docType,
      doc_number: data.doc_number ?? null,
      expiry_date: data.expiry_date ?? null,
      file_url: null,
      file_name: null,
      status: "pending",
      verified_by: null,
      verified_at: null,
      notes: data.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onAdded(tempDoc);
    onOpenChange(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Compliance Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as ComplianceDocType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-number">Document Number</Label>
            <Input id="doc-number" name="doc_number" placeholder="e.g. WWC123456" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-expiry">Expiry Date</Label>
            <Input id="doc-expiry" name="expiry_date" type="date" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-notes">Notes</Label>
            <Input id="doc-notes" name="notes" placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? "Adding..." : "Add Document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Pay Rate Dialog
// ============================================================

function AddPayRateDialog({
  userId,
  open,
  onOpenChange,
  onAdded,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (rate: PayRate) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>("childcare");
  const [rateUnit, setRateUnit] = useState<RateUnit>("per_session");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const rate = parseFloat(fd.get("rate") as string);
    const effectiveFrom = fd.get("effective_from") as string;

    if (!rate || !effectiveFrom) {
      setError("Rate and effective date are required.");
      setLoading(false);
      return;
    }

    const res = await upsertPayRate({
      user_id: userId,
      session_type: sessionType,
      rate,
      rate_unit: rateUnit,
      effective_from: effectiveFrom,
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const tempRate: PayRate = {
      id: crypto.randomUUID(),
      user_id: userId,
      session_type: sessionType,
      rate,
      rate_unit: rateUnit,
      effective_from: effectiveFrom,
      created_at: new Date().toISOString(),
    };

    onAdded(tempRate);
    onOpenChange(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Pay Rate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label>Session Type</Label>
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-amount">Rate ($)</Label>
            <Input id="rate-amount" name="rate" type="number" step="0.01" min="0" required placeholder="e.g. 45.00" />
          </div>
          <div className="space-y-1">
            <Label>Rate Unit</Label>
            <Select value={rateUnit} onValueChange={(v) => setRateUnit(v as RateUnit)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_session">Per Session</SelectItem>
                <SelectItem value="per_hour">Per Hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate-from">Effective From</Label>
            <Input id="rate-from" name="effective_from" type="date" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? "Adding..." : "Add Rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Availability Slot Dialog
// ============================================================

function AddAvailabilityDialog({
  userId,
  open,
  onOpenChange,
  onAdded,
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (slot: AvailabilitySlot) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState("1");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const startTime = fd.get("start_time") as string;
    const endTime = fd.get("end_time") as string;

    if (!startTime || !endTime) {
      setError("Start and end time are required.");
      setLoading(false);
      return;
    }

    const res = await upsertAvailabilitySlot({
      user_id: userId,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      location_preferences: [],
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const tempSlot: AvailabilitySlot = {
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: parseInt(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      location_preferences: [],
      created_at: new Date().toISOString(),
    };

    onAdded(tempSlot);
    onOpenChange(false);
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Availability Slot</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label>Day</Label>
            <Select value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="slot-start">Start Time</Label>
            <Input id="slot-start" name="start_time" type="time" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slot-end">End Time</Label>
            <Input id="slot-end" name="end_time" type="time" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? "Adding..." : "Add Slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
