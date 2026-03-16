"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateCoachProfile } from "@/lib/staff/actions";

interface EditProfileDialogProps {
  currentPhone: string | null;
  currentAbn: string | null;
}

export function EditProfileDialog({
  currentPhone,
  currentAbn,
}: EditProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [abn, setAbn] = useState(currentAbn ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateCoachProfile({
        phone: phone.trim() || null,
        abn: abn.trim() || null,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated");
        setOpen(false);
        // Refresh page to show updated data
        window.location.reload();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Pencil className="h-3.5 w-3.5" />
        Edit Profile
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Personal Details</DialogTitle>
          <DialogDescription>
            Update your phone number and ABN. Name and email changes must be
            made by an administrator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0412 345 678"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-abn">ABN</Label>
            <Input
              id="edit-abn"
              type="text"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              placeholder="e.g. 12 345 678 901"
              maxLength={14}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-[#E8712A] hover:bg-[#d4650f] text-white"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
