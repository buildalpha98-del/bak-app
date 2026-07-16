"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getParentChildren, updateChild, removeChildLink, type ChildInput } from "@/lib/parent/actions";
import { calculateAge, calculateAgeGroup } from "@/lib/utils/ageGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Child } from "@/lib/types/database";
import { Loader2, ChevronLeft, Save, Trash2, AlertCircle, Sparkles, ChevronRight } from "lucide-react";
import Link from "@/components/ui/app-link";

export default function ChildDetailPage() {
  const params = useParams();
  const router = useRouter();
  const childId = params.childId as string;

  const [child, setChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<string>("");
  const [medicalNotes, setMedicalNotes] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await getParentChildren();
      const match = data.find((pc) => pc.child.id === childId);
      if (!match) {
        router.push("/parent/kids");
        return;
      }
      setChild(match.child);
      setFirstName(match.child.first_name);
      setLastName(match.child.last_name);
      setDob(match.child.date_of_birth ?? "");
      setGender(match.child.gender ?? "");
      setMedicalNotes(match.child.medical_notes ?? "");
      setLoading(false);
    }
    load();
  }, [childId, router]);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);

    const updates: Partial<ChildInput> = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dob,
      gender: (gender || null) as ChildInput["gender"],
      medical_notes: medicalNotes.trim() || null,
    };

    const { error: saveError } = await updateChild(childId, updates);

    setSaving(false);

    if (saveError) {
      setError(saveError);
      toast.error("Could not save changes. Please try again.");
      return;
    }

    setSuccess(true);
    toast.success("Changes saved successfully.");
    setTimeout(() => setSuccess(false), 3000);
  }

  async function handleRemove() {
    if (!confirm("Remove this child from your profile? This won't delete their record.")) return;

    setRemoving(true);
    const { error: removeError } = await removeChildLink(childId);
    setRemoving(false);

    if (removeError) {
      setError(removeError);
      toast.error("Could not remove child. Please try again.");
      return;
    }

    toast.success("Child removed from your profile.");
    router.push("/parent/kids");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!child) return null;

  const age = dob ? calculateAge(new Date(dob)) : null;
  const ageGroup = dob ? calculateAgeGroup(new Date(dob)) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/parent/kids")}
          className="h-9 w-9"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {child.first_name} {child.last_name}
          </h1>
          {age !== null && ageGroup && (
            <p className="text-sm text-muted-foreground">
              {age} years old — Ages {ageGroup}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Changes saved successfully.
        </div>
      )}

      {/* Insights teaser */}
      <Link
        href={`/parent/kids/${child.id}/insights`}
        className="group flex items-center gap-3 rounded-2xl border border-orange-100 bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-primary flex-shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#1A1A1A] text-sm">
            Development insights
          </p>
          <p className="text-xs text-muted-foreground">
            AI-powered notes from {child.first_name}&apos;s coaches.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
      </Link>

      <div className="rounded-2xl border border-orange-100 bg-card p-5 space-y-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="h-11 rounded-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <Select value={gender} onValueChange={(v) => setGender(v ?? "")}>
              <SelectTrigger id="gender" className="h-11 rounded-lg">
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
          <Label htmlFor="medical">Medical notes</Label>
          <Textarea
            id="medical"
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            placeholder="Allergies, conditions, or anything our coaches should know"
            rows={3}
            className="rounded-lg resize-none"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !firstName.trim() || !lastName.trim()}
          className="w-full h-11 bg-primary text-white hover:bg-[#D4651F] rounded-lg"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Remove child */}
      <div className="rounded-xl border border-red-100 bg-red-50/50 p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-700">Remove Child</h3>
            <p className="text-xs text-red-600 mt-1">
              This removes {child.first_name} from your profile. Their record won't be deleted.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={removing}
              className="mt-3 border-red-200 text-red-600 hover:bg-red-100"
            >
              {removing ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-3 w-3" />
              )}
              Remove from Profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
