"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  User,
  Pencil,
  Check,
  X,
  MessageSquare,
  PhoneCall,
  Users,
  Clock,
  ArrowRightLeft,
  CircleDot,
  Trash2,
  StickyNote,
  Zap,
  Calendar,
  FileText,
  Upload,
  Download,
  Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  updateLead,
  changeLeadStage,
  addLeadActivity,
  deleteLead,
  getCrmStaffMembers,
} from "@/lib/crm/actions";
import { sendLeadEmail } from "@/lib/crm/email-actions";
import {
  scheduleDemoSession,
  recordDemoOutcome,
  getDemosForLead,
  cancelDemoSession,
} from "@/lib/crm/demo-actions";
import { convertLeadToCustomer } from "@/lib/crm/conversion-actions";
import type { DemoSessionWithCoach } from "@/lib/crm/demo-actions";
import {
  uploadLeadDocument,
  getDocumentsForLead,
  deleteLeadDocument,
  getDocumentDownloadUrl,
} from "@/lib/crm/document-actions";
import type { LeadDocumentWithUploader } from "@/lib/crm/document-actions";
import type { LeadWithOwner, LeadActivityWithUser } from "@/lib/crm/actions";
import type { LeadStage } from "@/lib/types/enums";

// ============================================================
// Constants
// ============================================================

const ALL_STAGES: { value: LeadStage; label: string }[] = [
  { value: "cold_lead", label: "Cold Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "free_trial", label: "Free Trial" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "churned", label: "Churned" },
];

const REQUIRES_REASON: LeadStage[] = ["won", "lost", "churned"];

function stageVariant(
  stage: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (stage) {
    case "won":
      return "default";
    case "lost":
      return "destructive";
    case "churned":
      return "secondary";
    default:
      return "outline";
  }
}

function formatStageLabel(stage: string): string {
  return stage
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function activityIcon(type: string) {
  switch (type) {
    case "note":
      return StickyNote;
    case "call":
      return PhoneCall;
    case "meeting":
      return Users;
    case "email_sent":
      return Mail;
    case "stage_change":
      return ArrowRightLeft;
    case "system":
      return Zap;
    default:
      return CircleDot;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================
// Component
// ============================================================

interface LeadDetailViewProps {
  lead: LeadWithOwner;
  activities: LeadActivityWithUser[];
  basePath: string;
}

export function LeadDetailView({
  lead,
  activities,
  basePath,
}: LeadDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Stage change with reason
  const [stageDialog, setStageDialog] = useState<{
    open: boolean;
    newStage: LeadStage;
  }>({ open: false, newStage: "won" });
  const [stageReason, setStageReason] = useState("");

  // Activity creation
  const [activityType, setActivityType] = useState<"note" | "call" | "meeting" | "email">("note");
  const [activityContent, setActivityContent] = useState("");
  const [callDuration, setCallDuration] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState("");
  const [emailSubject, setEmailSubject] = useState("");

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Demo sessions
  const [demos, setDemos] = useState<DemoSessionWithCoach[]>([]);
  const [demosLoaded, setDemosLoaded] = useState(false);
  const [scheduleDemoOpen, setScheduleDemoOpen] = useState(false);
  const [demoDate, setDemoDate] = useState("");
  const [demoTime, setDemoTime] = useState("");
  const [demoDuration, setDemoDuration] = useState("60");
  const [demoCoachId, setDemoCoachId] = useState("");
  const [demoAttendees, setDemoAttendees] = useState("");
  const [recordOutcomeId, setRecordOutcomeId] = useState<string | null>(null);
  const [outcomeValue, setOutcomeValue] = useState<"positive" | "neutral" | "negative">("positive");
  const [outcomeAttendees, setOutcomeAttendees] = useState("");
  const [outcomeCoachFeedback, setOutcomeCoachFeedback] = useState("");
  const [outcomeDmFeedback, setOutcomeDmFeedback] = useState("");

  // Documents
  const [documents, setDocuments] = useState<LeadDocumentWithUploader[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [docType, setDocType] = useState<"pitch_deck" | "proposal" | "agreement" | "correspondence" | "other">("other");
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);

  // Owner assignment
  const [staffList, setStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);

  function loadStaff() {
    if (staffLoaded) return;
    getCrmStaffMembers()
      .then(({ data }) => {
        setStaffList(data);
        setStaffLoaded(true);
      })
      .catch(() => toast.error("Failed to load staff"));
  }

  function loadDemos() {
    if (demosLoaded) return;
    getDemosForLead(lead.id)
      .then(({ data, error }) => {
        if (error) toast.error(error);
        else setDemos(data);
        setDemosLoaded(true);
      })
      .catch(() => toast.error("Failed to load demos"));
  }

  function loadDocuments() {
    if (docsLoaded) return;
    getDocumentsForLead(lead.id)
      .then(({ data, error }) => {
        if (error) toast.error(error);
        else setDocuments(data);
        setDocsLoaded(true);
      })
      .catch(() => toast.error("Failed to load documents"));
  }

  function handleTabChange(value: string) {
    if (value === "demos") { loadDemos(); loadStaff(); }
    if (value === "documents") loadDocuments();
  }

  function handleScheduleDemo(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const { error } = await scheduleDemoSession({
        leadId: lead.id,
        scheduledDate: demoDate,
        scheduledTime: demoTime,
        durationMinutes: Number(demoDuration),
        coachId: demoCoachId || undefined,
        attendeesExpected: demoAttendees ? Number(demoAttendees) : undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success("Demo scheduled");
      setScheduleDemoOpen(false);
      setDemoDate(""); setDemoTime(""); setDemoDuration("60"); setDemoCoachId(""); setDemoAttendees("");
      setDemosLoaded(false); loadDemos();
      router.refresh();
    });
  }

  function handleRecordOutcome(e: React.FormEvent) {
    e.preventDefault();
    if (!recordOutcomeId) return;
    startTransition(async () => {
      const { error } = await recordDemoOutcome({
        demoId: recordOutcomeId,
        outcome: outcomeValue,
        attendeesActual: outcomeAttendees ? Number(outcomeAttendees) : undefined,
        coachFeedback: outcomeCoachFeedback || undefined,
        decisionMakerFeedback: outcomeDmFeedback || undefined,
      });
      if (error) { toast.error(error); return; }
      toast.success("Outcome recorded");
      setRecordOutcomeId(null);
      setOutcomeValue("positive"); setOutcomeAttendees(""); setOutcomeCoachFeedback(""); setOutcomeDmFeedback("");
      setDemosLoaded(false); loadDemos();
      router.refresh();
    });
  }

  function handleCancelDemo(demoId: string) {
    startTransition(async () => {
      const { error } = await cancelDemoSession(demoId);
      if (error) { toast.error(error); return; }
      toast.success("Demo cancelled");
      setDemosLoaded(false); loadDemos();
      router.refresh();
    });
  }

  function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) return;
    startTransition(async () => {
      const { error } = await uploadLeadDocument({
        leadId: lead.id,
        documentType: docType,
        name: docName || docFile.name,
        file: docFile,
      });
      if (error) { toast.error(error); return; }
      toast.success("Document uploaded");
      setDocFile(null); setDocName(""); setDocType("other");
      setDocsLoaded(false); loadDocuments();
      router.refresh();
    });
  }

  function handleDeleteDocument(docId: string) {
    startTransition(async () => {
      const { error } = await deleteLeadDocument(docId);
      if (error) { toast.error(error); return; }
      toast.success("Document deleted");
      setDocsLoaded(false); loadDocuments();
    });
  }

  async function handleDownloadDocument(storagePath: string) {
    const { data: url, error } = await getDocumentDownloadUrl(storagePath);
    if (error || !url) { toast.error(error ?? "Failed to get download URL"); return; }
    window.open(url, "_blank");
  }

  function demoStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "scheduled": return "outline";
      case "delivered": return "default";
      case "cancelled": return "secondary";
      case "no_show": return "destructive";
      default: return "outline";
    }
  }

  function docTypeLabel(type: string): string {
    return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // ============================================================
  // Inline edit handlers
  // ============================================================

  function startEdit(field: string, currentValue: string | number | null) {
    setEditingField(field);
    setEditValue(currentValue?.toString() ?? "");
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValue("");
  }

  function saveEdit(field: string) {
    startTransition(async () => {
      const updates: Record<string, unknown> = {};

      if (field === "estimated_value") {
        updates[field] = editValue ? Number(editValue) : null;
      } else {
        updates[field] = editValue.trim() || null;
      }

      const { error } = await updateLead(lead.id, updates);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Lead updated");
        setEditingField(null);
        router.refresh();
      }
    });
  }

  // ============================================================
  // Stage change
  // ============================================================

  function handleStageChange(newStage: LeadStage) {
    if (newStage === lead.stage) return;

    if (REQUIRES_REASON.includes(newStage)) {
      setStageDialog({ open: true, newStage });
      setStageReason("");
      return;
    }

    startTransition(async () => {
      const { error } = await changeLeadStage(lead.id, newStage);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Stage updated");
        router.refresh();
      }
    });
  }

  function handleStageConfirm() {
    if (!stageReason.trim()) {
      toast.error("Please provide a reason.");
      return;
    }

    startTransition(async () => {
      const { error } = await changeLeadStage(
        lead.id,
        stageDialog.newStage,
        stageReason.trim()
      );
      if (error) {
        toast.error(error);
      } else {
        toast.success("Stage updated");
        setStageDialog((prev) => ({ ...prev, open: false }));
        router.refresh();
      }
    });
  }

  // ============================================================
  // Owner change
  // ============================================================

  function handleOwnerChange(ownerId: string) {
    startTransition(async () => {
      const { error } = await updateLead(lead.id, {
        owner_id: ownerId || null,
      });
      if (error) {
        toast.error(error);
      } else {
        toast.success("Owner updated");
        router.refresh();
      }
    });
  }

  // ============================================================
  // Activity creation
  // ============================================================

  function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();

    if (!activityContent.trim()) {
      toast.error("Please enter some content.");
      return;
    }

    // Handle email type separately
    if (activityType === "email") {
      if (!emailSubject.trim()) {
        toast.error("Please enter an email subject.");
        return;
      }
      if (!lead.contact_email) {
        toast.error("This lead has no email address.");
        return;
      }

      startTransition(async () => {
        const { error } = await sendLeadEmail({
          leadId: lead.id,
          to: lead.contact_email!,
          subject: emailSubject.trim(),
          body: activityContent.trim(),
        });

        if (error) {
          toast.error(error);
        } else {
          toast.success("Email sent");
          setActivityContent("");
          setEmailSubject("");
          router.refresh();
        }
      });
      return;
    }

    const metadata: Record<string, unknown> = {};
    if (activityType === "call" && callDuration) {
      metadata.duration_minutes = Number(callDuration);
    }
    if (activityType === "meeting" && meetingAttendees) {
      metadata.attendees = meetingAttendees;
    }

    startTransition(async () => {
      const { error } = await addLeadActivity({
        leadId: lead.id,
        type: activityType,
        content: activityContent.trim(),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Activity added");
        setActivityContent("");
        setCallDuration("");
        setMeetingAttendees("");
        router.refresh();
      }
    });
  }

  // ============================================================
  // Delete
  // ============================================================

  function handleDelete() {
    startTransition(async () => {
      const { error } = await deleteLead(lead.id);
      if (error) {
        toast.error(error);
      } else {
        toast.success("Lead deleted");
        router.push(basePath);
      }
    });
  }

  // ============================================================
  // Render
  // ============================================================

  const TypeIcon = lead.type === "school" ? GraduationCap : Building2;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Back button */}
      <Button variant="ghost" size="sm" render={<Link href={basePath} />}>
        <ArrowLeft className="size-4" />
        Back to Pipeline
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <TypeIcon className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold font-heading text-foreground">
              {lead.centre_name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={stageVariant(lead.stage)}>
                {formatStageLabel(lead.stage)}
              </Badge>
              {lead.type && (
                <Badge variant="outline">
                  {lead.type === "childcare_centre" ? "Childcare Centre" : "School"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Lead details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stage selector */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Pipeline Stage</h2>
            <Select
              value={lead.stage}
              onValueChange={(v) => handleStageChange((v ?? lead.stage) as LeadStage)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {/* Owner */}
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-medium text-foreground">Owner</h2>
            <Select
              value={lead.owner_id ?? ""}
              onValueChange={(v) => handleOwnerChange(v ?? "")}
              disabled={isPending}
              onOpenChange={(open) => { if (open) loadStaff(); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {/* Lead fields */}
          <Card className="p-4 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Details</h2>

            <EditableField
              icon={Building2}
              label="Centre Name"
              field="centre_name"
              value={lead.centre_name}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
            />

            <EditableField
              icon={User}
              label="Contact Name"
              field="contact_name"
              value={lead.contact_name}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
            />

            <EditableField
              icon={Mail}
              label="Email"
              field="contact_email"
              value={lead.contact_email}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="email"
            />

            <EditableField
              icon={Phone}
              label="Phone"
              field="contact_phone"
              value={lead.contact_phone}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="tel"
            />

            <EditableField
              icon={MapPin}
              label="Address"
              field="address"
              value={lead.address}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
            />

            <EditableField
              icon={DollarSign}
              label="Estimated Value"
              field="estimated_value"
              value={lead.estimated_value}
              displayValue={
                lead.estimated_value != null
                  ? formatCurrency(lead.estimated_value)
                  : null
              }
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="number"
            />

            <EditableField
              icon={User}
              label="Contact Role"
              field="contact_role"
              value={lead.contact_role}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
            />

            <EditableField
              icon={Users}
              label="Student Count"
              field="student_count"
              value={lead.student_count}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="number"
            />

            <EditableField
              icon={Calendar}
              label="Expected Close"
              field="expected_close_date"
              value={lead.expected_close_date}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="date"
            />

            <EditableField
              icon={Calendar}
              label="Next Follow-up"
              field="next_follow_up_date"
              value={lead.next_follow_up_date}
              editingField={editingField}
              editValue={editValue}
              isPending={isPending}
              onStartEdit={startEdit}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onEditValueChange={setEditValue}
              inputType="date"
            />

            {/* Notes (editable) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                {editingField !== "notes" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startEdit("notes", lead.notes)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                )}
              </div>
              {editingField === "notes" ? (
                <div className="space-y-2">
                  <Textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => saveEdit("notes")}
                      disabled={isPending}
                    >
                      <Check className="size-3" />
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="size-3" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {lead.notes || <span className="text-muted-foreground">No notes</span>}
                </p>
              )}
            </div>

            {/* Metadata */}
            <div className="pt-3 border-t text-xs text-muted-foreground space-y-1">
              <p>Source: {formatStageLabel(lead.source)}{lead.source_detail ? ` — ${lead.source_detail}` : ""}</p>
              {lead.suburb && <p>Location: {[lead.suburb, lead.state, lead.postcode].filter(Boolean).join(" ")}</p>}
              {lead.last_contacted_at && (
                <p>Last contacted: {new Date(lead.last_contacted_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
              )}
              <p>
                Created:{" "}
                {new Date(lead.created_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {lead.trial_start_date && (
                <p>Trial: {lead.trial_start_date} — {lead.trial_end_date ?? "ongoing"}</p>
              )}
              {lead.converted_at && (
                <p>Converted: {new Date(lead.converted_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
              )}
              {lead.lost_reason && <p>Lost reason: {lead.lost_reason}</p>}
              {lead.churn_reason && <p>Churn reason: {lead.churn_reason}</p>}
              {lead.lost_at && (
                <p>Lost: {new Date(lead.lost_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>
              )}
            </div>
          </Card>

          {/* Convert to Customer */}
          {!lead.centre_id && ["proposal_sent", "won", "free_trial"].includes(lead.stage) && (
            <Card className="p-4">
              <Button
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const { data, error } = await convertLeadToCustomer({ leadId: lead.id });
                    if (error) { toast.error(error); return; }
                    toast.success(`Converted to customer! Centre created.`);
                    router.refresh();
                  });
                }}
              >
                <Check className="size-4" />
                Convert to Customer
              </Button>
            </Card>
          )}

          {/* Delete */}
          <Card className="p-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="w-full"
            >
              <Trash2 className="size-4" />
              Delete Lead
            </Button>
          </Card>
        </div>

        {/* Right: Tabs — Timeline / Demos / Documents */}
        <div className="lg:col-span-3 space-y-4">
          <Tabs defaultValue="timeline" onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="demos">Demos</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

          <TabsContent value="timeline" className="space-y-4">
          {/* Quick actions */}
          <Card className="p-4 space-y-4">
            <h2 className="text-sm font-medium text-foreground">Add Activity</h2>

            <div className="flex gap-2">
              <Button
                variant={activityType === "note" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActivityType("note")}
              >
                <MessageSquare className="size-3.5" />
                Note
              </Button>
              <Button
                variant={activityType === "call" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActivityType("call")}
              >
                <PhoneCall className="size-3.5" />
                Call
              </Button>
              <Button
                variant={activityType === "meeting" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActivityType("meeting")}
              >
                <Users className="size-3.5" />
                Meeting
              </Button>
              <Button
                variant={activityType === "email" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActivityType("email")}
              >
                <Mail className="size-3.5" />
                Email
              </Button>
            </div>

            <form onSubmit={handleAddActivity} className="space-y-3">
              {activityType === "email" && (
                <div className="space-y-1.5">
                  <Label htmlFor="email-to" className="text-xs">
                    To
                  </Label>
                  <Input
                    id="email-to"
                    value={lead.contact_email || ""}
                    disabled
                    className="h-8 text-sm bg-muted"
                  />
                  <Label htmlFor="email-subject" className="text-xs">
                    Subject
                  </Label>
                  <Input
                    id="email-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="e.g. Following up on our conversation"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {activityType === "call" && (
                <div className="space-y-1.5">
                  <Label htmlFor="call-duration" className="text-xs">
                    Duration (minutes)
                  </Label>
                  <Input
                    id="call-duration"
                    type="number"
                    min="1"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    placeholder="e.g. 15"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {activityType === "meeting" && (
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-attendees" className="text-xs">
                    Attendees
                  </Label>
                  <Input
                    id="meeting-attendees"
                    value={meetingAttendees}
                    onChange={(e) => setMeetingAttendees(e.target.value)}
                    placeholder="e.g. Sarah, Abdul"
                    className="h-8 text-sm"
                  />
                </div>
              )}

              <Textarea
                value={activityContent}
                onChange={(e) => setActivityContent(e.target.value)}
                placeholder={
                  activityType === "note"
                    ? "Add a note about this lead..."
                    : activityType === "call"
                    ? "Summarise the call..."
                    : activityType === "email"
                    ? "Write your email body..."
                    : "Summarise the meeting..."
                }
                rows={3}
              />

              <Button type="submit" size="sm" disabled={isPending}>
                {isPending
                  ? activityType === "email" ? "Sending..." : "Saving..."
                  : activityType === "email" ? "Send Email" : "Add Activity"}
              </Button>
            </form>
          </Card>

          {/* Activity timeline */}
          <Card className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-4">
              Activity Timeline
            </h2>

            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No activity yet. Add a note or log a call to get started.
              </p>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, idx) => {
                  const Icon = activityIcon(activity.type);
                  const isLast = idx === activities.length - 1;

                  return (
                    <div key={activity.id} className="flex gap-3">
                      {/* Timeline line + icon */}
                      <div className="flex flex-col items-center">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                          <Icon className="size-3.5 text-muted-foreground" />
                        </div>
                        {!isLast && (
                          <div className="w-px flex-1 bg-border" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={`pb-6 min-w-0 flex-1 ${isLast ? "pb-0" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {formatStageLabel(activity.type)}
                          </Badge>
                          {activity.user_name && (
                            <span className="text-xs text-muted-foreground">
                              {activity.user_name}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                            {formatDateTime(activity.created_at)}
                          </span>
                        </div>
                        {activity.content && (
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                            {activity.content}
                          </p>
                        )}
                        {activity.metadata &&
                          typeof activity.metadata === "object" &&
                          (() => {
                            const meta = activity.metadata as Record<string, string | number | null>;
                            return (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {meta.duration_minutes != null && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="size-3" />
                                    {String(meta.duration_minutes)} min
                                  </span>
                                )}
                                {meta.attendees != null && (
                                  <span className="flex items-center gap-1">
                                    <Users className="size-3" />
                                    {String(meta.attendees)}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          </TabsContent>

          {/* ==================== DEMOS TAB ==================== */}
          <TabsContent value="demos" className="space-y-4">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">Demo Sessions</h2>
                <Button size="sm" onClick={() => { loadStaff(); setScheduleDemoOpen(true); }}>
                  <Calendar className="size-3.5 mr-1" />
                  Schedule Demo
                </Button>
              </div>

              {!demosLoaded ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
              ) : demos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No demo sessions yet. Schedule one to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {demos.map((demo) => (
                    <div key={demo.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={demoStatusVariant(demo.status)}>{formatStageLabel(demo.status)}</Badge>
                          {demo.outcome && (
                            <Badge variant={demo.outcome === "positive" ? "default" : demo.outcome === "negative" ? "destructive" : "secondary"}>
                              {demo.outcome}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(demo.scheduled_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          {" "}at {demo.scheduled_time?.slice(0, 5)}
                        </span>
                      </div>

                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {demo.coach_name && <p>Coach: {demo.coach_name}</p>}
                        <p>{demo.duration_minutes} min · {demo.attendees_expected ?? "—"} expected{demo.attendees_actual != null ? ` · ${demo.attendees_actual} attended` : ""}</p>
                      </div>

                      {demo.coach_feedback && (
                        <p className="text-xs text-foreground"><strong>Coach:</strong> {demo.coach_feedback}</p>
                      )}
                      {demo.decision_maker_feedback && (
                        <p className="text-xs text-foreground"><strong>Decision maker:</strong> {demo.decision_maker_feedback}</p>
                      )}

                      {demo.status === "scheduled" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setRecordOutcomeId(demo.id)}>
                            Record Outcome
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancelDemo(demo.id)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                      {demo.status === "delivered" && !demo.outcome && (
                        <Button size="sm" variant="outline" onClick={() => setRecordOutcomeId(demo.id)}>
                          Record Outcome
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ==================== DOCUMENTS TAB ==================== */}
          <TabsContent value="documents" className="space-y-4">
            <Card className="p-4 space-y-4">
              <h2 className="text-sm font-medium text-foreground">Documents</h2>

              <form onSubmit={handleUploadDocument} className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-name" className="text-xs">Name (optional)</Label>
                    <Input id="doc-name" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-type" className="text-xs">Type</Label>
                    <Select value={docType} onValueChange={(v) => setDocType(v as typeof docType)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pitch_deck">Pitch Deck</SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="agreement">Agreement</SelectItem>
                        <SelectItem value="correspondence">Correspondence</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    id="doc-file"
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="h-8 text-sm flex-1"
                  />
                  <Button type="submit" size="sm" disabled={isPending || !docFile}>
                    <Upload className="size-3.5 mr-1" />
                    Upload
                  </Button>
                </div>
              </form>

              {!docsLoaded ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
              ) : documents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No documents yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="size-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">{docTypeLabel(doc.document_type)}</Badge>
                            {doc.uploader_name && <span>{doc.uploader_name}</span>}
                            <span>{new Date(doc.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadDocument(doc.storage_path)}>
                          <Download className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteDocument(doc.id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          </Tabs>
        </div>
      </div>

      {/* Schedule Demo dialog */}
      <Dialog open={scheduleDemoOpen} onOpenChange={setScheduleDemoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Demo</DialogTitle>
            <DialogDescription>Schedule a demo session for {lead.centre_name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScheduleDemo} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-date" className="text-xs">Date</Label>
                <Input id="demo-date" type="date" value={demoDate} onChange={(e) => setDemoDate(e.target.value)} required className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-time" className="text-xs">Time</Label>
                <Input id="demo-time" type="time" value={demoTime} onChange={(e) => setDemoTime(e.target.value)} required className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-duration" className="text-xs">Duration (min)</Label>
                <Select value={demoDuration} onValueChange={(v) => { if (v) setDemoDuration(v); }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="45">45</SelectItem>
                    <SelectItem value="60">60</SelectItem>
                    <SelectItem value="90">90</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-attendees" className="text-xs">Expected Attendees</Label>
                <Input id="demo-attendees" type="number" min="1" value={demoAttendees} onChange={(e) => setDemoAttendees(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-coach" className="text-xs">Assign Coach</Label>
              <Select value={demoCoachId} onValueChange={(v) => setDemoCoachId(v ?? "")}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select coach (optional)" /></SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleDemoOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Scheduling…" : "Schedule"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Outcome dialog */}
      <Dialog open={!!recordOutcomeId} onOpenChange={(open) => { if (!open) setRecordOutcomeId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Demo Outcome</DialogTitle>
            <DialogDescription>How did the demo go?</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordOutcome} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Outcome</Label>
                <Select value={outcomeValue} onValueChange={(v) => setOutcomeValue(v as typeof outcomeValue)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Actual Attendees</Label>
                <Input type="number" min="0" value={outcomeAttendees} onChange={(e) => setOutcomeAttendees(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Coach Feedback</Label>
              <Textarea value={outcomeCoachFeedback} onChange={(e) => setOutcomeCoachFeedback(e.target.value)} placeholder="How did the coach feel it went?" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Decision Maker Feedback</Label>
              <Textarea value={outcomeDmFeedback} onChange={(e) => setOutcomeDmFeedback(e.target.value)} placeholder="Any feedback from the principal/coordinator?" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecordOutcomeId(null)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Outcome"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stage change reason dialog */}
      <Dialog
        open={stageDialog.open}
        onOpenChange={(open) => setStageDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Move to {ALL_STAGES.find((s) => s.value === stageDialog.newStage)?.label}
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for this stage change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="detail-stage-reason">Reason</Label>
            <Textarea
              id="detail-stage-reason"
              value={stageReason}
              onChange={(e) => setStageReason(e.target.value)}
              placeholder={
                stageDialog.newStage === "won"
                  ? "e.g. Signed contract for Term 2"
                  : stageDialog.newStage === "lost"
                  ? "e.g. Went with a competitor"
                  : "e.g. Centre closed down"
              }
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStageDialog((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button onClick={handleStageConfirm} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{lead.centre_name}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Editable Field sub-component
// ============================================================

function EditableField({
  icon: Icon,
  label,
  field,
  value,
  displayValue,
  editingField,
  editValue,
  isPending,
  onStartEdit,
  onSave,
  onCancel,
  onEditValueChange,
  inputType = "text",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  field: string;
  value: string | number | null;
  displayValue?: string | null;
  editingField: string | null;
  editValue: string;
  isPending: boolean;
  onStartEdit: (field: string, value: string | number | null) => void;
  onSave: (field: string) => void;
  onCancel: () => void;
  onEditValueChange: (value: string) => void;
  inputType?: string;
}) {
  const isEditing = editingField === field;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon className="size-3" />
          {label}
        </Label>
        {!isEditing && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStartEdit(field, value)}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            type={inputType}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(field);
              if (e.key === "Escape") onCancel();
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onSave(field)}
            disabled={isPending}
          >
            <Check className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onCancel}>
            <X className="size-3" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-foreground">
          {displayValue ?? value ?? (
            <span className="text-muted-foreground">Not set</span>
          )}
        </p>
      )}
    </div>
  );
}
