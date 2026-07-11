"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  StickyNote,
  Link2,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { convertLeadToCentre } from "@/lib/crm/trial-actions";

// ============================================================
// Component
// ============================================================

interface WonConversionDialogProps {
  leadId: string;
  centreName: string;
  onConverted?: (centreId: string) => void;
}

export function WonConversionDialog({
  leadId,
  centreName,
  onConverted,
}: WonConversionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await convertLeadToCentre(leadId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.centreId) {
        toast.success(`${centreName} has been converted to an active centre`);
        setOpen(false);
        onConverted?.(result.centreId);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" />
        }
      >
        <CheckCircle2 className="size-3.5" />
        Convert to Centre
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convert to Active Centre</DialogTitle>
          <DialogDescription>
            Convert {centreName} to an active centre?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            The following actions will be performed:
          </p>
          <ul className="space-y-2.5">
            <ConversionStep
              icon={Building2}
              text="Create or upgrade centre to active status"
            />
            <ConversionStep
              icon={StickyNote}
              text="Copy lead notes and activity history to centre notes"
            />
            <ConversionStep
              icon={Link2}
              text="Link the lead record to the new centre"
            />
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <ArrowRight className="size-3.5" />
                Confirm Conversion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Sub-component
// ============================================================

function ConversionStep({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-3.5 text-primary" />
      </div>
      <span className="text-sm text-foreground">{text}</span>
    </li>
  );
}
