"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Flag } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  sessionInfo: string;
  onSubmit: (issue: string) => void;
}

export function FlagDialog({ open, onClose, sessionInfo, onSubmit }: Props) {
  const [issue, setIssue] = useState("");

  const handleSubmit = () => {
    if (!issue.trim()) return;
    onSubmit(issue.trim());
    setIssue("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-amber-600" />
            Flag Line Item
          </DialogTitle>
          <DialogDescription>{sessionInfo}</DialogDescription>
        </DialogHeader>

        <Textarea
          placeholder="Describe the issue (e.g. incorrect rate, wrong duration)…"
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          rows={3}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white"
            onClick={handleSubmit}
            disabled={!issue.trim()}
          >
            Flag Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
