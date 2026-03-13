"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { createAnnouncement } from "@/lib/announcements/actions";
import type { AnnouncementAudience } from "@/lib/types/enums";

interface CreateAnnouncementFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAnnouncementForm({
  open,
  onOpenChange,
}: CreateAnnouncementFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter a message body");
      return;
    }

    setSubmitting(true);
    const { error } = await createAnnouncement({
      title: title.trim(),
      body: body.trim(),
      audience,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success("Announcement published");
    setTitle("");
    setBody("");
    setAudience("all");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
          <DialogDescription>
            Publish an announcement to your team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="Announcement title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              required
              placeholder="Supports **bold**, *italic*, [links](url), and - lists"
              className="min-h-32"
            />
            <p className="text-xs text-muted-foreground">
              Supports Markdown formatting
            </p>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ops_and_coaches">Ops &amp; Coaches</SelectItem>
                <SelectItem value="coaches_only">Coaches Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              )}
              Publish Announcement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
