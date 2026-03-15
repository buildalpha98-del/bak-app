"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChildForm } from "@/components/parent/child-form";
import {
  completeParentRegistration,
  type ChildInput,
} from "@/lib/parent/actions";
import { calculateAgeGroup } from "@/lib/utils/ageGroup";
import { Loader2, Plus, ChevronLeft, ChevronRight, Check } from "lucide-react";

const EMPTY_CHILD: ChildInput = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: null,
  medical_notes: null,
};

export default function ParentRegistrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") || undefined;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Parent details
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState("");

  // Step 2: Children
  const [children, setChildren] = useState<ChildInput[]>([{ ...EMPTY_CHILD }]);

  // Step 3: Terms
  const [termsAccepted, setTermsAccepted] = useState(false);

  function updateChild(index: number, child: ChildInput) {
    setChildren((prev) => prev.map((c, i) => (i === index ? child : c)));
  }

  function removeChild(index: number) {
    if (children.length <= 1) return;
    setChildren((prev) => prev.filter((_, i) => i !== index));
  }

  function addChild() {
    setChildren((prev) => [...prev, { ...EMPTY_CHILD }]);
  }

  function canProceedStep1() {
    return firstName.trim() && lastName.trim();
  }

  function canProceedStep2() {
    return children.every(
      (c) => c.first_name.trim() && c.last_name.trim() && c.date_of_birth
    );
  }

  async function handleSubmit() {
    if (!termsAccepted) return;

    setError(null);
    setLoading(true);

    const { error: regError } = await completeParentRegistration({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || undefined,
      suburb: suburb.trim() || undefined,
      children,
      terms_accepted: true,
      referral_code: referralCode,
    });

    setLoading(false);

    if (regError) {
      setError(regError);
      return;
    }

    router.push("/parent");
    router.refresh();
  }

  function getAgeGroupLabel(dob: string): string | null {
    if (!dob) return null;
    const group = calculateAgeGroup(new Date(dob));
    return `Ages ${group}`;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome to Build Alpha Kids
        </h1>
        <p className="text-muted-foreground mt-1">
          Let's get you set up in a few quick steps
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors ${
              s === step
                ? "bg-[#E8712A] text-white"
                : s < step
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
            }`}
          >
            {s < step ? <Check className="h-4 w-4" /> : s}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Your Details */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                className="h-11 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                className="h-11 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0400 000 000"
              className="h-11 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="suburb">Suburb (optional)</Label>
            <Input
              id="suburb"
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
              placeholder="e.g. Bankstown, Liverpool"
              className="h-11 rounded-lg"
            />
          </div>

          <Button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1()}
            className="w-full h-12 bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg text-base"
          >
            Continue
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Add Children */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Add Your Children</h2>
          <p className="text-sm text-muted-foreground">
            Add the children you'd like to book sessions for.
          </p>

          {children.map((child, i) => (
            <div key={i}>
              <ChildForm
                index={i}
                child={child}
                onChange={updateChild}
                onRemove={removeChild}
                showRemove={children.length > 1}
              />
              {child.date_of_birth && (
                <p className="text-xs text-[#E8712A] mt-1 ml-1 font-medium">
                  {getAgeGroupLabel(child.date_of_birth)}
                </p>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addChild}
            className="w-full h-11 rounded-lg border-dashed border-orange-200 text-[#E8712A] hover:bg-orange-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Another Child
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="h-12 rounded-lg flex-1"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2()}
              className="h-12 bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg flex-[2]"
            >
              Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Confirm Your Details</h2>

          {/* Parent summary */}
          <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Your Details
            </h3>
            <p className="font-medium">
              {firstName} {lastName}
            </p>
            {phone && (
              <p className="text-sm text-muted-foreground">{phone}</p>
            )}
            {suburb && (
              <p className="text-sm text-muted-foreground">{suburb}</p>
            )}
          </div>

          {/* Children summary */}
          <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Children
            </h3>
            {children.map((child, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-orange-50 last:border-0"
              >
                <div>
                  <p className="font-medium">
                    {child.first_name} {child.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    DOB: {new Date(child.date_of_birth).toLocaleDateString("en-AU")}
                    {" — "}
                    {getAgeGroupLabel(child.date_of_birth)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-4">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
              I agree to the Build Alpha Kids terms and conditions and acknowledge
              that my children's information will be used to provide coaching services.
            </Label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="h-12 rounded-lg flex-1"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!termsAccepted || loading}
              className="h-12 bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg flex-[2] text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Complete Registration"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
