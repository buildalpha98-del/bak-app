"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { createCentre } from "@/lib/centres/actions";
import type { CentreType, PricingModel, ContractStatus, CentreNoteCategory } from "@/lib/types/enums";
import { SPORTS } from "@/lib/types/enums";

interface AddCentreFormProps {
  basePath: string;
}

export function AddCentreForm({ basePath }: AddCentreFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic Info
  const [name, setName] = useState("");
  const [type, setType] = useState<CentreType>("childcare_centre");
  const [address, setAddress] = useState("");

  // Contact
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");

  // Commercial
  const [pricingModel, setPricingModel] = useState<PricingModel>("centre_funded");
  const [agreedRate, setAgreedRate] = useState("");
  const [contractStatus, setContractStatus] = useState<ContractStatus>("trial");

  // Session Preferences
  const [groupSize, setGroupSize] = useState("");
  const [ageGroups, setAgeGroups] = useState("");
  const [preferredSports, setPreferredSports] = useState<string[]>([]);
  const [preferredDays, setPreferredDays] = useState("");

  // Initial Note
  const [noteCategory, setNoteCategory] = useState<CentreNoteCategory>("general");
  const [noteContent, setNoteContent] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Centre name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    const sessionPrefs: Record<string, unknown> = {};
    if (preferredSports.length > 0) sessionPrefs.preferred_sports = preferredSports;
    if (preferredDays.trim()) sessionPrefs.preferred_days = preferredDays;

    const { data, error: createError } = await createCentre({
      name: name.trim(),
      type,
      address: address.trim() || undefined,
      primary_contact_name: contactName.trim() || undefined,
      primary_contact_phone: contactPhone.trim() || undefined,
      primary_contact_email: contactEmail.trim() || undefined,
      primary_contact_role: contactRole.trim() || undefined,
      group_size: groupSize ? parseInt(groupSize, 10) : undefined,
      age_groups: ageGroups
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      pricing_model: pricingModel,
      agreed_rate: agreedRate ? parseFloat(agreedRate) : undefined,
      contract_status: contractStatus,
      session_preferences: Object.keys(sessionPrefs).length > 0 ? sessionPrefs : undefined,
      initial_note:
        noteContent.trim()
          ? { category: noteCategory, content: noteContent.trim() }
          : undefined,
    });

    setLoading(false);

    if (createError) {
      setError(createError);
      return;
    }

    router.push(data ? `${basePath}/${data.id}` : basePath);
  }

  function toggleSport(sport: string) {
    setPreferredSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href={basePath} />} aria-label="Go back">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Add Centre</h1>
          <p className="text-sm text-muted-foreground">
            Register a new childcare centre or school
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Name, type, and location</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Centre Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Little Stars Childcare"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CentreType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="childcare_centre">Childcare Centre</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full street address"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Primary Contact</CardTitle>
            <CardDescription>Main point of contact at this venue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactName">Name</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contact name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactRole">Role</Label>
                <Input
                  id="contactRole"
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  placeholder="e.g. Director, Principal"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Phone</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="04xx xxx xxx"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Commercial */}
        <Card>
          <CardHeader>
            <CardTitle>Commercial</CardTitle>
            <CardDescription>Pricing and contract details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Pricing Model</Label>
                <Select
                  value={pricingModel}
                  onValueChange={(v) => setPricingModel(v as PricingModel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="centre_funded">Centre Funded</SelectItem>
                    <SelectItem value="parent_funded">Parent Funded</SelectItem>
                    <SelectItem value="per_head">Per Head</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agreedRate">Agreed Rate ($)</Label>
                <Input
                  id="agreedRate"
                  type="number"
                  step="0.01"
                  value={agreedRate}
                  onChange={(e) => setAgreedRate(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Contract Status</Label>
              <Select
                value={contractStatus}
                onValueChange={(v) => setContractStatus(v as ContractStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Session Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Session Preferences</CardTitle>
            <CardDescription>Group size, age ranges, and preferred sports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="groupSize">Typical Group Size</Label>
                <Input
                  id="groupSize"
                  type="number"
                  value={groupSize}
                  onChange={(e) => setGroupSize(e.target.value)}
                  placeholder="e.g. 20"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageGroups">Age Groups</Label>
                <Input
                  id="ageGroups"
                  value={ageGroups}
                  onChange={(e) => setAgeGroups(e.target.value)}
                  placeholder="e.g. 3-5, 5-8, 8-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preferred Sports</Label>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((sport) => (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      preferredSports.includes(sport)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {sport}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredDays">Preferred Days/Times</Label>
              <Input
                id="preferredDays"
                value={preferredDays}
                onChange={(e) => setPreferredDays(e.target.value)}
                placeholder="e.g. Mon & Wed mornings, Thu afternoon"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Initial Note */}
        <Card>
          <CardHeader>
            <CardTitle>Operational Notes</CardTitle>
            <CardDescription>Add an initial note (optional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={noteCategory}
                onValueChange={(v) => setNoteCategory(v as CentreNoteCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="access_logistics">Access & Logistics</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="client_relationship">Client Relationship</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="noteContent">Note</Label>
              <Textarea
                id="noteContent"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Any important details about this venue..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" render={<Link href={basePath} />}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Creating..." : "Create Centre"}
          </Button>
        </div>
      </form>
    </div>
  );
}
