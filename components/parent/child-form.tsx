"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import type { ChildInput } from "@/lib/parent/actions";

interface ChildFormProps {
  index: number;
  child: ChildInput;
  onChange: (index: number, child: ChildInput) => void;
  onRemove?: (index: number) => void;
  showRemove?: boolean;
}

export function ChildForm({
  index,
  child,
  onChange,
  onRemove,
  showRemove = false,
}: ChildFormProps) {
  function update(field: keyof ChildInput, value: string | null) {
    onChange(index, { ...child, [field]: value });
  }

  return (
    <div className="rounded-xl border border-orange-100 bg-card p-5 space-y-4 relative">
      {showRemove && onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      <h4 className="text-sm font-semibold text-foreground">
        Child {index + 1}
      </h4>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`child-first-${index}`}>First name *</Label>
          <Input
            id={`child-first-${index}`}
            value={child.first_name}
            onChange={(e) => update("first_name", e.target.value)}
            placeholder="First name"
            required
            className="h-11 rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`child-last-${index}`}>Last name *</Label>
          <Input
            id={`child-last-${index}`}
            value={child.last_name}
            onChange={(e) => update("last_name", e.target.value)}
            placeholder="Last name"
            required
            className="h-11 rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`child-dob-${index}`}>Date of birth *</Label>
          <Input
            id={`child-dob-${index}`}
            type="date"
            value={child.date_of_birth}
            onChange={(e) => update("date_of_birth", e.target.value)}
            required
            max={new Date().toISOString().split("T")[0]}
            className="h-11 rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`child-gender-${index}`}>Gender (optional)</Label>
          <Select
            value={child.gender ?? ""}
            onValueChange={(v) => update("gender", v || null)}
          >
            <SelectTrigger id={`child-gender-${index}`} className="h-11 rounded-lg">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`child-medical-${index}`}>
          Medical notes (optional)
        </Label>
        <Textarea
          id={`child-medical-${index}`}
          value={child.medical_notes ?? ""}
          onChange={(e) => update("medical_notes", e.target.value)}
          placeholder="Allergies, conditions, or anything our coaches should know"
          rows={2}
          className="rounded-lg resize-none"
        />
      </div>
    </div>
  );
}
