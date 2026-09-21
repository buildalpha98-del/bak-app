"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveReportCardComment, type ReportCardComment } from "@/lib/client/report-card-comment-actions";

// The class teacher's word on the term, printed on the report card
// under the marks (migration 097). Two fields, as every school report
// has them: a general comment and next steps.

export function ReportCardCommentForm({
  centreId,
  childId,
  comment,
  canEdit,
}: {
  centreId: string;
  childId: string;
  comment: ReportCardComment;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [general, setGeneral] = useState(comment.general_comment);
  const [next, setNext] = useState(comment.next_steps);
  const [saving, startSaving] = useTransition();
  const dirty = general !== comment.general_comment || next !== comment.next_steps;

  function save() {
    startSaving(async () => {
      const { error } = await saveReportCardComment(centreId, { childId, termId: comment.term_id, generalComment: general, nextSteps: next });
      if (error) toast.error(error);
      else {
        toast.success("Report card comment saved.");
        router.refresh();
      }
    });
  }

  if (!canEdit) {
    if (!comment.general_comment && !comment.next_steps) return null;
    return (
      <div className="rounded-2xl border border-portal-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MessageSquareText className="h-4 w-4 text-portal-600" /> Teacher&apos;s comment · {comment.term_name}</h3>
        {comment.general_comment && <p className="mt-2 whitespace-pre-line text-sm text-foreground">{comment.general_comment}</p>}
        {comment.next_steps && (
          <p className="mt-2 text-sm text-foreground"><span className="font-medium">Next steps:</span> {comment.next_steps}</p>
        )}
        {comment.author_name && <p className="mt-2 text-xs text-muted-foreground">{comment.author_name}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-portal-200 bg-white p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MessageSquareText className="h-4 w-4 text-portal-600" /> Report card comment · {comment.term_name}</h3>
        <p className="text-xs text-muted-foreground">Printed on the student&apos;s report card under the marks. Write it for the family.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rc-general">General comment</Label>
        <Textarea id="rc-general" value={general} onChange={(e) => setGeneral(e.target.value)} rows={4} maxLength={1200} placeholder="How the student has approached the term: effort, growth, highlights." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rc-next">Next steps</Label>
        <Textarea id="rc-next" value={next} onChange={(e) => setNext(e.target.value)} rows={3} maxLength={1200} placeholder="Two or three concrete things to work on next term." />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {comment.updated_at ? `Last saved ${new Date(comment.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })}${comment.author_name ? ` by ${comment.author_name}` : ""}` : "Not written yet"}
        </p>
        <Button onClick={save} disabled={!dirty || saving} className="min-h-[44px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save comment
        </Button>
      </div>
    </div>
  );
}
