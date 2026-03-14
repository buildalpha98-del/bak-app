"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { updateCoachGSTRegistration } from "@/lib/invoicing/actions";
import { toast } from "sonner";

interface Props {
  initialValue: boolean;
}

export function GSTToggle({ initialValue }: Props) {
  const [checked, setChecked] = useState(initialValue);
  const [, startTransition] = useTransition();

  const handleChange = async (newValue: boolean) => {
    setChecked(newValue);
    startTransition(async () => {
      const { error } = await updateCoachGSTRegistration(newValue);
      if (error) {
        toast.error(error);
        setChecked(!newValue); // revert
      } else {
        toast.success(
          newValue ? "GST registration enabled." : "GST registration disabled."
        );
      }
    });
  };

  return (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        GST Registration
      </h2>
      <p className="text-xs text-muted-foreground">
        If you are registered for GST, enable this to include 10% GST on your invoices.
      </p>
      <div className="flex items-center gap-3">
        <Label htmlFor="gst-toggle" className="text-sm text-foreground">
          GST Registered
        </Label>
        <Input
          id="gst-toggle"
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-xs text-muted-foreground">
          {checked ? "Yes — 10% GST will be added" : "No"}
        </span>
      </div>
    </Card>
  );
}
