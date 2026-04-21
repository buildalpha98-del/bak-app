"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getPackagesAdmin,
  createPackage,
  updatePackage,
} from "@/lib/bookings/booking-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Package } from "@/lib/types/database";
import { Plus, Save, Loader2, Edit, X } from "lucide-react";

const SESSION_TYPES = [
  "holiday_clinic",
  "after_school",
  "weekend",
  "specialist",
  "other",
] as const;

const SESSION_TYPE_LABELS: Record<string, string> = {
  holiday_clinic: "Holiday Clinic",
  after_school: "After School",
  weekend: "Weekend",
  specialist: "Specialist",
  other: "Other",
};

interface PackageFormState {
  name: string;
  description: string;
  session_count: string;
  price_dollars: string;
  savings_dollars: string;
  valid_days: string;
  applicable_session_types: string[];
  all_types: boolean;
  status: "active" | "inactive";
}

const EMPTY_FORM: PackageFormState = {
  name: "",
  description: "",
  session_count: "",
  price_dollars: "",
  savings_dollars: "",
  valid_days: "",
  applicable_session_types: [],
  all_types: true,
  status: "active",
};

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  async function loadPackages() {
    setLoading(true);
    const { data, error: loadError } = await getPackagesAdmin();
    if (data) setPackages(data);
    if (loadError) setError(loadError);
    setLoading(false);
  }

  useEffect(() => {
    loadPackages();
  }, []);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function openEditForm(pkg: Package) {
    const hasAllTypes =
      !pkg.applicable_session_types ||
      pkg.applicable_session_types.length === 0;
    setForm({
      name: pkg.name,
      description: pkg.description ?? "",
      session_count: String(pkg.session_count),
      price_dollars: (pkg.price_cents / 100).toFixed(2),
      savings_dollars: (pkg.savings_cents / 100).toFixed(2),
      valid_days: String(pkg.valid_days),
      applicable_session_types: hasAllTypes
        ? []
        : (pkg.applicable_session_types as string[]),
      all_types: hasAllTypes,
      status: pkg.status as "active" | "inactive",
    });
    setEditingId(pkg.id);
    setShowForm(true);
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleSessionTypeToggle(type: string) {
    setForm((prev) => {
      const types = prev.applicable_session_types.includes(type)
        ? prev.applicable_session_types.filter((t) => t !== type)
        : [...prev.applicable_session_types, type];
      return { ...prev, applicable_session_types: types, all_types: false };
    });
  }

  function handleAllTypesToggle() {
    setForm((prev) => ({
      ...prev,
      all_types: !prev.all_types,
      applicable_session_types: [],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    const sessionCount = parseInt(form.session_count, 10);
    const priceCents = Math.round(parseFloat(form.price_dollars) * 100);
    const savingsCents = Math.round(
      parseFloat(form.savings_dollars || "0") * 100
    );
    const validDays = parseInt(form.valid_days, 10);

    if (isNaN(sessionCount) || sessionCount < 1) {
      setError("Session count must be at least 1.");
      return;
    }
    if (isNaN(priceCents) || priceCents < 1) {
      setError("Price must be greater than $0.");
      return;
    }
    if (isNaN(validDays) || validDays < 1) {
      setError("Valid days must be at least 1.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      session_count: sessionCount,
      price_cents: priceCents,
      savings_cents: isNaN(savingsCents) ? 0 : savingsCents,
      valid_days: validDays,
      applicable_session_types: form.all_types
        ? null
        : form.applicable_session_types.length > 0
          ? form.applicable_session_types
          : null,
      status: form.status as "active" | "inactive",
    };

    setSaving(true);

    if (editingId) {
      const { error: updateError } = await updatePackage(editingId, payload);
      if (updateError) {
        setError(updateError);
        toast.error("Could not update package. Please try again.");
        setSaving(false);
        return;
      }
      toast.success("Package updated.");
    } else {
      const { error: createError } = await createPackage(payload);
      if (createError) {
        setError(createError);
        toast.error("Could not create package. Please try again.");
        setSaving(false);
        return;
      }
      toast.success("Package created.");
    }

    setSaving(false);
    closeForm();
    await loadPackages();
  }

  async function handleToggleStatus(pkg: Package) {
    const newStatus = pkg.status === "active" ? "inactive" : "active";
    const { error: toggleError } = await updatePackage(pkg.id, {
      status: newStatus,
    });
    if (toggleError) {
      setError(toggleError);
      toast.error("Could not update package status.");
      return;
    }
    toast.success(`Package ${newStatus === "active" ? "activated" : "deactivated"}.`);
    await loadPackages();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Session Packages
          </h1>
          <p className="text-muted-foreground mt-1">
            Create and manage session packs for parents
          </p>
        </div>
        {!showForm && (
          <Button
            className="bg-[#E8712A] hover:bg-[#D4641F] text-white"
            onClick={openCreateForm}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Package
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Inline Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-orange-100 bg-white p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {editingId ? "Edit Package" : "Create Package"}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeForm}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. 10-Session Pack"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="session_count">Session Count</Label>
              <Input
                id="session_count"
                type="number"
                min="1"
                value={form.session_count}
                onChange={(e) =>
                  setForm((p) => ({ ...p, session_count: e.target.value }))
                }
                placeholder="e.g. 10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={form.price_dollars}
                onChange={(e) =>
                  setForm((p) => ({ ...p, price_dollars: e.target.value }))
                }
                placeholder="e.g. 90.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="savings">Savings ($)</Label>
              <Input
                id="savings"
                type="number"
                step="0.01"
                min="0"
                value={form.savings_dollars}
                onChange={(e) =>
                  setForm((p) => ({ ...p, savings_dollars: e.target.value }))
                }
                placeholder="e.g. 10.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="valid_days">Valid Days</Label>
              <Input
                id="valid_days"
                type="number"
                min="1"
                value={form.valid_days}
                onChange={(e) =>
                  setForm((p) => ({ ...p, valid_days: e.target.value }))
                }
                placeholder="e.g. 90"
              />
            </div>
          </div>

          {/* Session Types */}
          <div className="space-y-3">
            <Label>Applicable Session Types</Label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.all_types}
                  onChange={handleAllTypesToggle}
                  className="rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
                />
                All Types
              </label>
              {SESSION_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={
                      !form.all_types &&
                      form.applicable_session_types.includes(type)
                    }
                    disabled={form.all_types}
                    onChange={() => handleSessionTypeToggle(type)}
                    className="rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
                  />
                  {SESSION_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3">
            <Label htmlFor="status">Status</Label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.status === "active"}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    status: e.target.checked ? "active" : "inactive",
                  }))
                }
                className="rounded border-gray-300 text-[#E8712A] focus:ring-[#E8712A]"
              />
              Active
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              className="bg-[#E8712A] hover:bg-[#D4641F] text-white"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {editingId ? "Update Package" : "Create Package"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Table */}
      {packages.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-white border border-orange-100">
          <p className="text-sm text-muted-foreground">
            No packages yet. Create your first session pack.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-orange-100 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Sessions</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Savings</TableHead>
                <TableHead className="text-center">Valid Days</TableHead>
                <TableHead>Session Types</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell className="text-center">
                    {pkg.session_count}
                  </TableCell>
                  <TableCell className="text-right">
                    ${(pkg.price_cents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {pkg.savings_cents > 0
                      ? `$${(pkg.savings_cents / 100).toFixed(2)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {pkg.valid_days}
                  </TableCell>
                  <TableCell>
                    {!pkg.applicable_session_types ||
                    pkg.applicable_session_types.length === 0 ? (
                      <span className="text-muted-foreground text-sm">All</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {pkg.applicable_session_types.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-xs"
                          >
                            {SESSION_TYPE_LABELS[t] ?? t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={
                        pkg.status === "active"
                          ? "border-green-200 text-green-700 bg-green-50"
                          : "border-gray-200 text-gray-500 bg-gray-50"
                      }
                    >
                      {pkg.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditForm(pkg)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(pkg)}
                        className="text-xs"
                      >
                        {pkg.status === "active" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
