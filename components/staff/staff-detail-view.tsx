"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
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
  toggleStaffStatus,
  upsertPayRate,
  upsertComplianceDoc,
  verifyComplianceDoc,
  upsertAvailabilitySlot,
  deleteAvailabilitySlot,
  getStaffSessions,
} from "@/lib/staff/actions";
import type { StaffDetail } from "@/lib/staff/actions";
import { EntityFeedbackTab } from "@/components/feedback/entity-feedback-tab";
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
  inactive: { label: "Inactive", className: "bg-gray-100 text-gray-600" },
  onboarding: { label: "Onboarding", className: "bg-amber-100 text-amber-700" },
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  ops: "Ops",
  coach: "Coach",
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
  rejected: { label: "Rejected", className: "bg-gray-100 text-gray-600" },
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
}

export function StaffDetailView({ data: initialData }: StaffDetailViewProps) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialData.profile);
  const [payRates, setPayRates] = useState(initialData.pay_rates);
  const [compDocs, setCompDocs] = useState(initialData.compliance_docs);
  const [availability, setAvailability] = useState(initialData.availability_slots);
  const [sessions, setSessions] = useState<(Session & { centre_name: string })[] | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Dialogs
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
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
          <AvatarFallback className="bg-[#E8712A] text-sm font-semibold text-white">
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">{profile.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline">{ROLE_LABELS[profile.role]}</Badge>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditProfileOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant={profile.status === "active" ? "destructive" : "outline"}
            size="sm"
            onClick={() => setDeactivateOpen(true)}
          >
            {profile.status === "active" ? (
              <>
                <UserX className="h-3.5 w-3.5" />
                Deactivate
              </>
            ) : (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                Reactivate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
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
          <div className="mt-4 rounded-lg border bg-white p-6">
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
        </TabsContent>

        {/* Tab 2: Compliance */}
        <TabsContent value="compliance">
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddDocOpen(true)} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
                <Plus className="h-3.5 w-3.5" />
                Add Document
              </Button>
            </div>
            {compDocs.length === 0 ? (
              <EmptyState icon={<Shield className="h-8 w-8" />} message="No compliance documents yet." />
            ) : (
              <div className="rounded-lg border bg-white">
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
                          <TableCell className="text-[#666666]">
                            {doc.doc_number || "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cs.className}`}>
                              {cs.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-[#666666]">
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
              <Button size="sm" onClick={() => setAddRateOpen(true)} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
                <Plus className="h-3.5 w-3.5" />
                Add Rate
              </Button>
            </div>
            {payRates.length === 0 ? (
              <EmptyState icon={<Clock className="h-8 w-8" />} message="No pay rates set." />
            ) : (
              <div className="rounded-lg border bg-white">
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
                        <TableCell className="text-[#666666]">
                          {RATE_UNIT_LABELS[rate.rate_unit]}
                        </TableCell>
                        <TableCell className="text-[#666666]">
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
              <Button size="sm" onClick={() => setAddSlotOpen(true)} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
                <Plus className="h-3.5 w-3.5" />
                Add Slot
              </Button>
            </div>
            {availability.length === 0 ? (
              <EmptyState icon={<Clock className="h-8 w-8" />} message="No availability set." />
            ) : (
              <div className="rounded-lg border bg-white">
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
                        <TableCell className="text-[#666666]">
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
              <p className="text-sm text-[#666666]">Loading sessions...</p>
            ) : sessions && sessions.length > 0 ? (
              <div className="rounded-lg border bg-white">
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
      <dt className="text-xs font-medium text-[#999999] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[#1A1A1A]">{value || "—"}</dd>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-12 text-center">
      <div className="text-[#999999]">{icon}</div>
      <p className="mt-2 text-sm text-[#666666]">{message}</p>
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
            <Button type="submit" disabled={loading} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
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
    const res = await toggleStaffStatus(profile.id, newStatus);
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
            {isActive ? "Deactivate" : "Reactivate"} {profile.name}?
          </DialogTitle>
          <DialogDescription>
            {isActive
              ? "This will prevent the staff member from logging in and being assigned to sessions."
              : "This will restore the staff member's access to the platform."}
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
            className={!isActive ? "bg-[#E8712A] text-white hover:bg-[#d4641f]" : ""}
          >
            {loading
              ? "Processing..."
              : isActive
                ? "Deactivate"
                : "Reactivate"}
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
            <Button type="submit" disabled={loading} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
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
            <Button type="submit" disabled={loading} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
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
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
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
            <Button type="submit" disabled={loading} className="bg-[#E8712A] text-white hover:bg-[#d4641f]">
              {loading ? "Adding..." : "Add Slot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
