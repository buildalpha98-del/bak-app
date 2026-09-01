"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/app-link";
import { AppLogo } from "@/components/shared/app-logo";
import { uploadCentreLogo } from "@/lib/reports/actions";
import type { BrandingMode } from "@/lib/types/enums";
import {
  ArrowLeft,
  Building2,
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  User,
  DollarSign,
  Calendar,
  Package,
  FileText,
  StickyNote,
  Plus,
  Loader2,
  MessageSquare,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { updateCentre, addCentreNote, archiveCentre } from "@/lib/centres/actions";
import { centreColour } from "@/lib/utils/centre-colours";
import { CentreColourPicker } from "./centre-colour-picker";
import { EntityFeedbackTab } from "@/components/feedback/entity-feedback-tab";
import { CentreChildrenTab } from "@/components/centres/centre-children-tab";
import { CentreReportsTab } from "@/components/reports/centre-reports-tab";
import { PortalAccessTab } from "@/components/centres/portal-access-tab";
import { SchoolClassesTab } from "@/components/centres/school-classes-tab";
import { CentreGrantsTab } from "@/components/centres/centre-grants-tab";
import type { CentreDetail, CentreNoteWithAuthor, UpdateCentreData } from "@/lib/centres/actions";
import type {
  CentreType,
  PricingModel,
  ContractStatus,
  CentreNoteCategory,
} from "@/lib/types/enums";

// ============================================================
// Helpers
// ============================================================

function formatCentreType(type: string): string {
  return type === "childcare_centre" ? "Childcare Centre" : "School";
}

function formatPricingModel(model: string): string {
  switch (model) {
    case "centre_funded":
      return "Centre Funded";
    case "parent_funded":
      return "Parent Funded";
    case "per_head":
      return "Per Head";
    default:
      return model;
  }
}

function contractStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "trial":
      return "secondary";
    case "paused":
      return "outline";
    case "churned":
      return "destructive";
    default:
      return "outline";
  }
}

function formatContractStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatNoteCategory(category: string): string {
  switch (category) {
    case "general":
      return "General";
    case "access_logistics":
      return "Access & Logistics";
    case "safety":
      return "Safety";
    case "client_relationship":
      return "Client Relationship";
    default:
      return category;
  }
}

function noteCategoryVariant(
  category: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (category) {
    case "safety":
      return "destructive";
    case "client_relationship":
      return "default";
    case "access_logistics":
      return "secondary";
    default:
      return "outline";
  }
}

function formatSessionStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sessionStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "confirmed":
    case "in_progress":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amount);
}

// ============================================================
// Component
// ============================================================

interface CentreDetailViewProps {
  data: CentreDetail;
  basePath: string;
  /**
   * Viewer's role + financial_access flag — drives the Invoices tab
   * gate. Optional so older callers don't crash; when omitted, the
   * gate defaults to closed (no financial visibility).
   */
  profile?: { role: string; financial_access: boolean } | null;
  /**
   * All centres (id+name only) for the Portal Access tab link picker.
   * Optional — when omitted the link affordance is hidden.
   */
  allCentres?: Array<{ id: string; name: string }>;
}

export function CentreDetailView({
  data,
  basePath,
  profile,
  allCentres = [],
}: CentreDetailViewProps) {
  const router = useRouter();
  const { centre } = data;
  const [notes, setNotes] = useState<CentreNoteWithAuthor[]>(data.notes);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const hasFinancial = !!profile?.financial_access;

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);
    const { error } = await archiveCentre(centre.id);
    setArchiving(false);
    if (error) {
      setArchiveError(error);
      return;
    }
    router.push(basePath);
    router.refresh();
  }

  const TypeIcon =
    centre.type === "childcare_centre" ? Building2 : GraduationCap;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" render={<Link href={basePath} />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <TypeIcon className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">
                {centre.name}
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={contractStatusVariant(centre.contract_status)}>
                {formatContractStatus(centre.contract_status)}
              </Badge>
              {centre.churn_risk && (
                <Badge variant="destructive">At risk</Badge>
              )}
              {centre.health_score !== null && (
                <span
                  className={
                    "inline-flex items-center gap-1 text-xs font-medium " +
                    (centre.health_score >= 80
                      ? "text-emerald-700"
                      : centre.health_score >= 60
                        ? "text-amber-700"
                        : "text-red-700")
                  }
                >
                  <span
                    className={
                      "inline-block size-2 rounded-full " +
                      (centre.health_score >= 80
                        ? "bg-emerald-500"
                        : centre.health_score >= 60
                          ? "bg-amber-500"
                          : "bg-red-500")
                    }
                  />
                  Health {centre.health_score}/100
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {formatCentreType(centre.type)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" />}
            >
              Archive Centre
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive Centre</AlertDialogTitle>
                <AlertDialogDescription>
                  This will set the centre status to &quot;Churned&quot; and effectively archive it.
                  Associated sessions, notes, and invoices will be preserved. This action can be
                  reversed by changing the contract status back.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {archiveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {archiveError}
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleArchive}
                  disabled={archiving}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {archiving ? "Archiving..." : "Archive Centre"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit Centre
          </Button>
        </div>
      </div>

      {/* Tabs — grouped into Engagement / Operations / Access with
          quiet uppercase subheaders, all inside one TabsList so the
          shared underline-active state still works. */}
      <Tabs defaultValue="overview">
        <TabsList variant="line" className="flex-wrap gap-x-1 gap-y-2">
          <GroupLabel>Engagement</GroupLabel>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">
            Sessions ({data.sessions_count})
          </TabsTrigger>
          <TabsTrigger value="feedback">
            Feedback ({data.feedback_count})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="reports">
            Reports ({data.reports_count})
          </TabsTrigger>

          <GroupLabel>Operations</GroupLabel>
          <TabsTrigger value="equipment">
            Equipment ({data.equipment_kits.length})
          </TabsTrigger>
          <TabsTrigger value="invoices">
            {hasFinancial
              ? `Invoices (${data.outbound_invoices.length})`
              : "Invoices"}
          </TabsTrigger>
          <TabsTrigger value="children">
            Children ({data.children_count})
          </TabsTrigger>
          {centre.type === "school" && (
            <TabsTrigger value="classes">Classes</TabsTrigger>
          )}

          <GroupLabel>Access</GroupLabel>
          <TabsTrigger value="portal">Portal Access</TabsTrigger>
          {centre.type === "school" && (
            <TabsTrigger value="grants">Grants</TabsTrigger>
          )}
        </TabsList>

        {/* ==================== Overview Tab ==================== */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact & Location */}
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Contact & Location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {centre.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                    <span>{centre.address}</span>
                  </div>
                )}
                {centre.primary_contact_name && (
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span>
                      {centre.primary_contact_name}
                      {centre.primary_contact_role && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {centre.primary_contact_role}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {centre.primary_contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <span>{centre.primary_contact_phone}</span>
                  </div>
                )}
                {centre.primary_contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <span>{centre.primary_contact_email}</span>
                  </div>
                )}
                {!centre.address &&
                  !centre.primary_contact_name &&
                  !centre.primary_contact_phone &&
                  !centre.primary_contact_email && (
                    <p className="text-muted-foreground">No contact details added yet.</p>
                  )}
              </CardContent>
            </Card>

            {/* Commercial — rate row gated by financial access so
                non-financial viewers see the pricing model but not
                the dollar figure. */}
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Commercial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">Pricing:</span>{" "}
                    {formatPricingModel(centre.pricing_model)}
                  </span>
                </div>
                {centre.agreed_rate !== null && hasFinancial && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-4 text-muted-foreground" />
                    <span>
                      <span className="font-medium">Rate:</span>{" "}
                      {formatCurrency(centre.agreed_rate)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">Status:</span>{" "}
                    {formatContractStatus(centre.contract_status)}
                    {centre.status_changed_at && (
                      <span className="text-muted-foreground">
                        {" "}
                        since {formatDate(centre.status_changed_at)}
                      </span>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Session Preferences */}
            <Card className="md:col-span-2 rounded-2xl">
              <CardHeader>
                <CardTitle>Session Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Group Size</p>
                    <p className="font-medium">
                      {centre.group_size ?? "Not specified"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Age Groups</p>
                    <p className="font-medium">
                      {centre.age_groups.length > 0
                        ? centre.age_groups.join(", ")
                        : "Not specified"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Added</p>
                    <p className="font-medium">{formatDate(centre.created_at)}</p>
                  </div>
                </div>
                {centre.session_preferences &&
                  Object.keys(centre.session_preferences).length > 0 && (
                    <div className="mt-2">
                      <p className="text-muted-foreground">Preferences</p>
                      {!!(centre.session_preferences as Record<string, unknown>).preferred_sports && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(
                            (centre.session_preferences as Record<string, unknown>)
                              .preferred_sports as string[]
                          ).map((sport) => (
                            <Badge key={sport} variant="outline">
                              {sport}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== Sessions Tab ==================== */}
        <TabsContent value="sessions">
          {data.sessions.length === 0 ? (
            <EmptyState icon={Calendar} message="No sessions recorded" />
          ) : (
            <div className="rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Sport</TableHead>
                    <TableHead>Coach</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{formatDate(s.date)}</TableCell>
                      <TableCell>
                        {s.time} ({s.duration_minutes} min)
                      </TableCell>
                      <TableCell>{s.sport}</TableCell>
                      <TableCell>{s.coach_name ?? "Unassigned"}</TableCell>
                      <TableCell>
                        <Badge variant={sessionStatusVariant(s.status)}>
                          {formatSessionStatus(s.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ==================== Notes Tab ==================== */}
        <TabsContent value="notes">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setNoteOpen(true)}>
                <Plus className="size-4" />
                Add Note
              </Button>
            </div>

            {notes.length === 0 ? (
              <EmptyState icon={StickyNote} message="No notes yet" />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <Card key={note.id} size="sm" className="rounded-2xl">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Badge variant={noteCategoryVariant(note.category)}>
                          {formatNoteCategory(note.category)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by {note.author_name} · {formatDate(note.created_at)}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Add Note Dialog */}
          <AddNoteDialog
            centreId={centre.id}
            open={noteOpen}
            onOpenChange={setNoteOpen}
            onSuccess={(note) => setNotes((prev) => [note, ...prev])}
          />
        </TabsContent>

        {/* ==================== Equipment Tab ==================== */}
        <TabsContent value="equipment">
          {data.equipment_kits.length === 0 ? (
            <EmptyState icon={Package} message="No equipment kits at this centre" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.equipment_kits.map((kit) => (
                <Card key={kit.id} size="sm" className="rounded-2xl transition hover:shadow-md hover:-translate-y-0.5">
                  <CardHeader>
                    <CardTitle>{kit.name}</CardTitle>
                    <CardDescription>
                      Condition:{" "}
                      <Badge
                        variant={
                          kit.condition === "good"
                            ? "default"
                            : kit.condition === "needs_attention"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {kit.condition.replace("_", " ")}
                      </Badge>
                    </CardDescription>
                  </CardHeader>
                  {kit.notes && (
                    <CardContent>
                      <p className="text-xs text-muted-foreground">{kit.notes}</p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================== Feedback Tab ==================== */}
        <TabsContent value="feedback">
          <EntityFeedbackTab entityType="centre" entityId={centre.id} />
        </TabsContent>

        {/* ==================== Invoices Tab ==================== */}
        <TabsContent value="invoices">
          {!hasFinancial ? (
            <Card className="rounded-2xl">
              <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Lock className="size-4" />
                Financial visibility is restricted on this account. Ask an admin for access.
              </CardContent>
            </Card>
          ) : data.outbound_invoices.length === 0 ? (
            <EmptyState icon={FileText} message="No invoices generated" />
          ) : (
            <div className="rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.outbound_invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                      </TableCell>
                      <TableCell>{formatCurrency(inv.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {formatSessionStatus(inv.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(inv.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ==================== Children Tab ==================== */}
        <TabsContent value="children">
          <CentreChildrenTab centreId={centre.id} basePath={basePath} />
        </TabsContent>

        {/* ==================== Reports Tab ==================== */}
        <TabsContent value="reports">
          <CentreReportsTab centreId={centre.id} centreName={centre.name} />
        </TabsContent>

        {/* ==================== Portal Access Tab ==================== */}
        <TabsContent value="portal">
          <PortalAccessTab
            centreId={centre.id}
            centreName={centre.name}
            contactEmail={centre.primary_contact_email}
            availableCentres={allCentres}
          />
        </TabsContent>

        {/* ==================== Grants Tab (schools only) ==================== */}
        {centre.type === "school" && (
          <TabsContent value="grants">
            <CentreGrantsTab centreId={centre.id} centreName={centre.name} />
          </TabsContent>
        )}

        {/* ==================== Classes Tab (schools only) ==================== */}
        {centre.type === "school" && (
          <TabsContent value="classes">
            <SchoolClassesTab centreId={centre.id} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Centre Dialog */}
      <EditCentreDialog
        centre={centre}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
      <Icon className="mb-3 size-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ============================================================
// GroupLabel — quiet uppercase header for tab groups
// ============================================================
//
// Rendered as a non-interactive span inside TabsList. Uses the same
// muted typography as the AdminContextStrip date label so the visual
// rhythm carries over from the home dashboard.

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="ml-1 mr-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground/70 select-none [&:not(:first-child)]:ml-3"
    >
      {children}
    </span>
  );
}

// ============================================================
// Edit Centre Dialog
// ============================================================

function EditCentreDialog({
  centre,
  open,
  onOpenChange,
  onSuccess,
}: {
  centre: CentreDetail["centre"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(centre.name);
  const [type, setType] = useState<CentreType>(centre.type);
  const [address, setAddress] = useState(centre.address ?? "");
  const [contactName, setContactName] = useState(centre.primary_contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(centre.primary_contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(centre.primary_contact_email ?? "");
  const [contactRole, setContactRole] = useState(centre.primary_contact_role ?? "");
  const [pricingModel, setPricingModel] = useState<PricingModel>(centre.pricing_model);
  const [agreedRate, setAgreedRate] = useState(centre.agreed_rate?.toString() ?? "");
  const [contractStatus, setContractStatus] = useState<ContractStatus>(centre.contract_status);
  const [groupSize, setGroupSize] = useState(centre.group_size?.toString() ?? "");
  const [colour, setColour] = useState(
    centreColour({ id: centre.id, colour: centre.colour }),
  );
  const [brandingMode, setBrandingMode] = useState<BrandingMode>(
    centre.branding_mode
  );
  const [logoUrl, setLogoUrl] = useState(centre.logo_url);
  const [brandColour, setBrandColour] = useState<string | null>(
    centre.brand_colour
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("logo", file);
    const { url, error: uploadError } = await uploadCentreLogo(
      centre.id,
      formData
    );
    setLogoUploading(false);
    if (uploadError || !url) {
      setError(uploadError ?? "Failed to upload the logo.");
      return;
    }
    setLogoUrl(url);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setLoading(true);
    setError(null);

    const payload: UpdateCentreData = {
      name: name.trim(),
      type,
      address: address.trim() || null,
      primary_contact_name: contactName.trim() || null,
      primary_contact_phone: contactPhone.trim() || null,
      primary_contact_email: contactEmail.trim() || null,
      primary_contact_role: contactRole.trim() || null,
      pricing_model: pricingModel,
      agreed_rate: agreedRate ? parseFloat(agreedRate) : null,
      contract_status: contractStatus,
      group_size: groupSize ? parseInt(groupSize, 10) : null,
      colour,
      branding_mode: brandingMode,
      brand_colour: brandColour,
    };

    const { error: updateError } = await updateCentre(centre.id, payload);
    setLoading(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    onOpenChange(false);
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Centre</DialogTitle>
          <DialogDescription>Update centre details</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CentreType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="childcare_centre">Childcare Centre</SelectItem>
                <SelectItem value="school">School</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Roster colour</Label>
            <CentreColourPicker value={colour} onChange={setColour} />
            <p className="text-xs text-muted-foreground">
              Shown as the card accent when the roster is coloured by centre.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Portal branding</Label>
            <Select
              value={brandingMode}
              onValueChange={(v) => setBrandingMode(v as BrandingMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bak_branded">Build Alpha Kids branded</SelectItem>
                <SelectItem value="white_label">
                  White label (centre&apos;s own logo)
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-3 pt-1">
              {logoUrl ? (
                <AppLogo size="sm" logoUrl={logoUrl} alt={`${name} logo`} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  No logo uploaded
                </span>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={logoUploading}
                onClick={() => logoInputRef.current?.click()}
              >
                {logoUploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
            </div>
            {brandingMode === "white_label" && (
              <div className="flex items-center gap-3 pt-1">
                <Label className="text-xs font-normal text-muted-foreground">
                  Portal accent
                </Label>
                <input
                  type="color"
                  value={brandColour ?? "#0891B2"}
                  onChange={(e) => setBrandColour(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                  aria-label="Portal accent colour"
                />
                {brandColour && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setBrandColour(null)}
                  >
                    Use default
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              White label swaps the Build Alpha Kids crest for this logo in the
              centre&apos;s portal, shared links, and report PDFs — and the
              accent colour re-themes the portal&apos;s buttons, chips and
              charts. Pick a dark-ish colour so white text stays readable.
              PNG, JPG, SVG or WebP, max 2MB.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Role</Label>
              <Input value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pricing Model</Label>
              <Select value={pricingModel} onValueChange={(v) => setPricingModel(v as PricingModel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="centre_funded">Centre Funded</SelectItem>
                  <SelectItem value="parent_funded">Parent Funded</SelectItem>
                  <SelectItem value="per_head">Per Head</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agreed Rate ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={agreedRate}
                onChange={(e) => setAgreedRate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Contract Status</Label>
              <Select
                value={contractStatus}
                onValueChange={(v) => setContractStatus(v as ContractStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Group Size</Label>
              <Input
                type="number"
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Note Dialog
// ============================================================

function AddNoteDialog({
  centreId,
  open,
  onOpenChange,
  onSuccess,
}: {
  centreId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (note: CentreNoteWithAuthor) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CentreNoteCategory>("general");
  const [content, setContent] = useState("");

  async function handleSubmit() {
    if (!content.trim()) {
      setError("Note content is required.");
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: noteError } = await addCentreNote({
      centre_id: centreId,
      category,
      content: content.trim(),
    });

    setLoading(false);

    if (noteError || !data) {
      setError(noteError ?? "Failed to add note.");
      return;
    }

    setContent("");
    setCategory("general");
    onOpenChange(false);
    onSuccess(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>Add an operational note to this centre</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CentreNoteCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="access_logistics">Access & Logistics</SelectItem>
                <SelectItem value="safety">Safety</SelectItem>
                <SelectItem value="client_relationship">Client Relationship</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter note content..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Adding..." : "Add Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
