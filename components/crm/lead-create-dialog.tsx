"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createLead, getCrmStaffMembers } from "@/lib/crm/actions";
import type { LeadStage } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

interface LeadCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  basePath: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

// ============================================================
// Component
// ============================================================

export function LeadCreateDialog({
  open,
  onOpenChange,
  basePath,
}: LeadCreateDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [centreName, setCentreName] = useState("");
  const [type, setType] = useState<string>("childcare_centre");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<LeadStage>("cold_lead");
  const [ownerId, setOwnerId] = useState("");

  // Staff list
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Duplicate warning
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Fetch staff when dialog opens
  useEffect(() => {
    if (!open) return;
    setStaffLoading(true);
    getCrmStaffMembers()
      .then(({ data }) => setStaffList(data))
      .catch(() => toast.error("Failed to load staff"))
      .finally(() => setStaffLoading(false));
  }, [open]);

  function resetForm() {
    setCentreName("");
    setType("childcare_centre");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setAddress("");
    setEstimatedValue("");
    setNotes("");
    setStage("cold_lead");
    setOwnerId("");
    setDuplicateWarning(null);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!centreName.trim()) {
      toast.error("Centre name is required.");
      return;
    }

    startTransition(async () => {
      const { data, error } = await createLead({
        centre_name: centreName.trim(),
        type: type || undefined,
        contact_name: contactName.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
        address: address.trim() || undefined,
        estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
        notes: notes.trim() || undefined,
        stage,
        owner_id: ownerId || undefined,
      });

      if (error) {
        // Check if this is a duplicate warning
        if (error.includes("Potential duplicate")) {
          setDuplicateWarning(error);
        } else {
          toast.error(error);
        }
        return;
      }

      toast.success("Lead created successfully.");
      handleClose(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
          <DialogDescription>
            Create a new lead to track in your pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {duplicateWarning}
            </div>
          )}

          {/* Centre name */}
          <div className="space-y-1.5">
            <Label htmlFor="create-centre-name">Centre Name *</Label>
            <Input
              id="create-centre-name"
              value={centreName}
              onChange={(e) => {
                setCentreName(e.target.value);
                setDuplicateWarning(null);
              }}
              placeholder="e.g. Little Stars Childcare"
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="create-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v ?? "")}
            >
              <SelectTrigger id="create-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="childcare_centre">Childcare Centre</SelectItem>
                <SelectItem value="school">School</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Contact fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-contact-name">Contact Name</Label>
              <Input
                id="create-contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Sarah Jones"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-contact-email">Contact Email</Label>
              <Input
                id="create-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="sarah@example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-contact-phone">Contact Phone</Label>
              <Input
                id="create-contact-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="04XX XXX XXX"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-estimated-value">Estimated Value ($)</Label>
              <Input
                id="create-estimated-value"
                type="number"
                min="0"
                step="1"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                placeholder="e.g. 8000"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="create-address">Address</Label>
            <Input
              id="create-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Example St, Bankstown NSW 2200"
            />
          </div>

          {/* Stage + Owner */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-stage">Initial Stage</Label>
              <Select
                value={stage}
                onValueChange={(v) => setStage((v ?? "cold_lead") as LeadStage)}
              >
                <SelectTrigger id="create-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold_lead">Cold Lead</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="free_trial">Free Trial</SelectItem>
                  <SelectItem value="proposal_sent">Proposal Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-owner">Owner</Label>
              <Select
                value={ownerId}
                onValueChange={(v) => setOwnerId(v ?? "")}
                disabled={staffLoading}
              >
                <SelectTrigger id="create-owner">
                  <SelectValue placeholder={staffLoading ? "Loading..." : "Select owner"} />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="create-notes">Notes</Label>
            <Textarea
              id="create-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context about this lead..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
