"use client";

import { useState, useTransition } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Trash2, Loader2, Save, Plus, X } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ReportDetail } from "@/lib/reports/actions";
import type { ReportContentJson } from "@/lib/types/database";
import { updateReportContent, deleteReport } from "@/lib/reports/actions";
import { sendReportEmail } from "@/lib/reports/send";

interface ReportPreviewProps {
  report: ReportDetail;
}

export function ReportPreview({ report }: ReportPreviewProps) {
  const router = useRouter();
  const isDraft = report.status === "draft";

  // Editable state (only relevant for drafts)
  const [title, setTitle] = useState(report.title);
  const [content, setContent] = useState<ReportContentJson>(
    report.content_json
  );
  const [newHighlight, setNewHighlight] = useState("");

  // Send dialog
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(
    report.centre_contact_email ?? ""
  );

  // Transition states
  const [isSaving, startSaving] = useTransition();
  const [isSending, startSending] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  function handleAddHighlight() {
    const trimmed = newHighlight.trim();
    if (!trimmed) return;
    setContent((prev) => ({
      ...prev,
      highlights: [...(prev.highlights ?? []), trimmed],
    }));
    setNewHighlight("");
  }

  function handleRemoveHighlight(index: number) {
    setContent((prev) => ({
      ...prev,
      highlights: (prev.highlights ?? []).filter((_, i) => i !== index),
    }));
  }

  function handleSave() {
    startSaving(async () => {
      const { error } = await updateReportContent(report.id, {
        title,
        content_json: content,
      });
      if (error) {
        alert(error);
      } else {
        router.refresh();
      }
    });
  }

  function handleSend() {
    if (!sendEmail.trim()) return;
    startSending(async () => {
      const { error } = await sendReportEmail(report.id, sendEmail.trim());
      if (error) {
        alert(error);
      } else {
        setSendOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Are you sure you want to delete this draft report?")) return;
    startDeleting(async () => {
      const { error } = await deleteReport(report.id);
      if (error) {
        alert(error);
      } else {
        router.push("/ops/reports");
      }
    });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const avgPerSession =
    (content.sessions_delivered ?? 0) > 0
      ? Math.round(
          (content.total_children ?? 0) / (content.sessions_delivered ?? 1)
        )
      : 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-28">
      {/* ---- Header ---- */}
      <div className="flex items-start gap-3">
        <Link
          href="/ops/reports"
          className="mt-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex-1 space-y-1">
          {isDraft ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold"
            />
          ) : (
            <h1 className="text-lg font-semibold">{title}</h1>
          )}
          <p className="text-sm text-muted-foreground">
            {report.centre_name} &middot; {report.term_name}
          </p>
        </div>

        <Badge variant={isDraft ? "secondary" : "default"}>
          {report.status}
        </Badge>
      </div>

      {/* Sent status */}
      {report.sent_at && report.sent_to && (
        <p className="text-sm text-muted-foreground">
          Sent to {report.sent_to.join(", ")} on {formatDate(report.sent_at)}
        </p>
      )}

      {/* ---- Summary ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {content.summary ?? "No summary available."}
          </p>
        </CardContent>
      </Card>

      {/* ---- Stats Grid ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {content.sessions_delivered ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Sessions Delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {content.total_children ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Total Children</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{avgPerSession}</p>
            <p className="text-xs text-muted-foreground">Avg per Session</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {content.average_rating?.toFixed(1) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">Avg Rating</p>
          </CardContent>
        </Card>
      </div>

      {/* ---- Sports Covered ---- */}
      {(content.sports_covered ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sports Covered</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {content.sports_covered!.map((sport) => (
              <Badge key={sport} variant="outline">
                {sport}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ---- Highlights ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Highlights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(content.highlights ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No highlights added yet.
            </p>
          )}

          <ul className="space-y-1.5">
            {(content.highlights ?? []).map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm leading-relaxed"
              >
                <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="flex-1">{item}</span>
                {isDraft && (
                  <button
                    type="button"
                    onClick={() => handleRemoveHighlight(idx)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isDraft && (
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="Add a highlight..."
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddHighlight();
                  }
                }}
                className="text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddHighlight}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Coach Observations ---- */}
      {(content.coach_notes ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coach Observations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {content.coach_notes!.map((note, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="mt-0.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---- Action Bar ---- */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {isDraft && (
            <>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>

              <Button
                variant="default"
                onClick={() => setSendOpen(true)}
                className="gap-1.5 bg-primary hover:bg-[#d4651f]"
              >
                <Send className="h-4 w-4" />
                Send Report
              </Button>

              <div className="flex-1" />

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
            </>
          )}

          {!isDraft && (
            <p className="text-sm text-muted-foreground">
              This report has been sent and is read-only.
            </p>
          )}
        </div>
      </div>

      {/* ---- Send Dialog ---- */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Report</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="send-email">Recipient email</Label>
              <Input
                id="send-email"
                type="email"
                placeholder="centre@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendOpen(false)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || !sendEmail.trim()}
              className="gap-1.5 bg-primary hover:bg-[#d4651f]"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
