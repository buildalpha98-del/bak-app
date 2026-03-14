"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  Eye,
  Calendar,
} from "lucide-react";
import { FormRenderer } from "./form-renderer";
import {
  submitForm,
  getFormTemplateById,
} from "@/lib/forms/actions";
import { FORM_TYPE_LABELS } from "@/lib/forms/constants";
import type { FormTemplateListItem, FormSubmissionListItem } from "@/lib/forms/actions";
import type { FormField } from "@/lib/types/database";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { queueFormSubmission } from "@/lib/offline/formQueue";
import { toast } from "sonner";

// ============================================================
// Coach Forms View — available templates + past submissions
// ============================================================

interface CoachFormsViewProps {
  templates: FormTemplateListItem[];
  submissions: FormSubmissionListItem[];
  coachName: string;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CoachFormsView({
  templates,
  submissions,
  coachName,
}: CoachFormsViewProps) {
  const { isOnline } = useOnlineStatus();

  // Submit dialog
  const [submitOpen, setSubmitOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<FormTemplateListItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View submission
  const [viewOpen, setViewOpen] = useState(false);
  const [viewSubmission, setViewSubmission] = useState<FormSubmissionListItem | null>(null);
  const [viewFields, setViewFields] = useState<FormField[]>([]);

  function handleOpenSubmit(template: FormTemplateListItem) {
    setActiveTemplate(template);
    setSubmitOpen(true);
  }

  async function handleFormSubmit(
    data: Record<string, unknown>,
    attachments: string[]
  ) {
    if (!activeTemplate) return;

    if (!isOnline) {
      // Queue offline
      await queueFormSubmission({
        formTemplateId: activeTemplate.id,
        sessionId: null,
        dataJson: data,
        attachments,
      });
      toast.success("Form saved locally — will sync when online.", {
        icon: "🟠",
      });
      setSubmitOpen(false);
      return;
    }

    setSubmitting(true);
    const { error } = await submitForm({
      formTemplateId: activeTemplate.id,
      sessionId: null,
      dataJson: data,
      attachments,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success("Form submitted successfully!");
      setSubmitOpen(false);
    }
  }

  async function handleViewSubmission(sub: FormSubmissionListItem) {
    const { data: template } = await getFormTemplateById(sub.form_template_id);
    if (template) {
      setViewFields(template.fields_json ?? []);
    }
    setViewSubmission(sub);
    setViewOpen(true);
  }

  // Standalone templates (risk assessment, compliance — not session-linked)
  const standaloneTemplates = templates.filter(
    (t) => t.form_type === "risk_assessment" || t.form_type === "compliance"
  );
  const sessionTemplates = templates.filter(
    (t) => t.form_type !== "risk_assessment" && t.form_type !== "compliance"
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Forms</h1>
        <p className="text-sm text-muted-foreground">
          Submit and view your forms.
        </p>
      </div>

      {/* Standalone forms */}
      {standaloneTemplates.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-foreground mb-2">
            Quick Submit
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {standaloneTemplates.map((t) => (
              <Card
                key={t.id}
                className="cursor-pointer transition-shadow hover:shadow-md card-hover"
                onClick={() => handleOpenSubmit(t)}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-lg bg-[var(--brand-orange-light)] p-2">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.field_count} fields
                    </p>
                  </div>
                  <Plus className="ml-auto h-4 w-4 text-muted-foreground/60" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Session-linked forms note */}
      {sessionTemplates.length > 0 && (
        <div className="mb-6 rounded-lg bg-secondary p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Session forms</strong> (Attendance, Feedback, Incident) are submitted
            through the session workflow when you end a session. You can also submit them
            manually below.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sessionTemplates.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => handleOpenSubmit(t)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Past submissions */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-2">
          My Submissions
        </h2>
        {submissions.length > 0 ? (
          <div className="space-y-2">
            {submissions.map((sub) => (
              <Card
                key={sub.id}
                className="cursor-pointer transition-shadow hover:shadow-md card-hover"
                onClick={() => handleViewSubmission(sub)}
              >
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm text-foreground truncate block">
                        {sub.template_name}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(sub.submitted_at)}
                        {sub.centre_name && ` · ${sub.centre_name}`}
                      </span>
                    </div>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground/60" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">
              No submissions yet. Your submitted forms will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Submit Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeTemplate?.name}</DialogTitle>
          </DialogHeader>
          {activeTemplate && (
            <FormRenderer
              fields={activeTemplate.fields_json}
              sessionContext={{ coachName }}
              mode="edit"
              onSubmit={handleFormSubmit}
              submitting={submitting}
              isOffline={!isOnline}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Submission Sheet */}
      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{viewSubmission?.template_name}</SheetTitle>
            <SheetDescription>
              Submitted {viewSubmission ? formatDateTime(viewSubmission.submitted_at) : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 pt-2">
            {viewFields.length > 0 && viewSubmission && (
              <FormRenderer
                fields={viewFields}
                mode="view"
                initialData={viewSubmission.data_json}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
