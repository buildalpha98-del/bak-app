"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Save,
  X,
  Building2,
  Users,
  Target,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  getRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  type RegionListItem,
  type CreateRegionData,
  type UpdateRegionData,
} from "@/lib/regions/actions";
import type { RegionStatus } from "@/lib/types/enums";

// ============================================================
// Constants
// ============================================================

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

const STATUS_BADGE_STYLES: Record<RegionStatus, string> = {
  active: "bg-green-100 text-green-800",
  planned: "bg-amber-100 text-amber-800",
  inactive: "bg-gray-100 text-gray-500",
};

const EMPTY_FORM: CreateRegionData = {
  name: "",
  code: "",
  state: "NSW",
  suburbs: [],
  target_centres: null,
  regional_manager_id: null,
  notes: null,
  status: "planned",
};

// ============================================================
// Page
// ============================================================

export default function RegionsPage() {
  const [regions, setRegions] = useState<RegionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateRegionData>({ ...EMPTY_FORM });
  const [createSuburbsRaw, setCreateSuburbsRaw] = useState("");
  const [saving, setSaving] = useState(false);

  // Expanded / editing row
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateRegionData>({});
  const [editSuburbsRaw, setEditSuburbsRaw] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // --------------------------------------------------------
  // Load regions
  // --------------------------------------------------------

  const loadRegions = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getRegions();
    if (err) {
      setError(err);
    } else {
      setRegions(data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  // --------------------------------------------------------
  // Create
  // --------------------------------------------------------

  function resetCreate() {
    setCreateForm({ ...EMPTY_FORM });
    setCreateSuburbsRaw("");
    setShowCreate(false);
  }

  async function handleCreate() {
    setSaving(true);
    const suburbs = createSuburbsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: err } = await createRegion({
      ...createForm,
      suburbs,
    });

    if (err) {
      setError(err);
      toast.error("Could not create region. Please try again.");
    } else {
      toast.success("Region created.");
      resetCreate();
      await loadRegions();
    }
    setSaving(false);
  }

  // --------------------------------------------------------
  // Expand / Edit
  // --------------------------------------------------------

  function handleExpand(region: RegionListItem) {
    if (expandedId === region.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(region.id);
    setEditForm({
      name: region.name,
      code: region.code,
      state: region.state,
      suburbs: region.suburbs,
      target_centres: region.target_centres,
      regional_manager_id: region.regional_manager_id,
      notes: region.notes,
      status: region.status,
    });
    setEditSuburbsRaw((region.suburbs ?? []).join(", "));
  }

  async function handleUpdate() {
    if (!expandedId) return;
    setEditSaving(true);

    const suburbs = editSuburbsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error: err } = await updateRegion(expandedId, {
      ...editForm,
      suburbs,
    });

    if (err) {
      setError(err);
      toast.error("Could not update region. Please try again.");
    } else {
      toast.success("Region updated.");
      setExpandedId(null);
      await loadRegions();
    }
    setEditSaving(false);
  }

  async function handleDelete(id: string) {
    const { error: err } = await deleteRegion(id);
    if (err) {
      setError(err);
      toast.error("Could not delete region. Please try again.");
    } else {
      toast.success("Region deleted.");
      if (expandedId === id) setExpandedId(null);
      await loadRegions();
    }
  }

  async function handleStatusToggle(
    region: RegionListItem,
    newStatus: RegionStatus
  ) {
    const { error: err } = await updateRegion(region.id, {
      status: newStatus,
    });
    if (err) {
      setError(err);
      toast.error("Could not update region status.");
    } else {
      toast.success(`Region ${newStatus === "active" ? "activated" : "deactivated"}.`);
      await loadRegions();
    }
  }

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Regions
          </h1>
          <p className="mt-1 text-sm text-[#666666]">
            Manage geographic regions, suburb mappings, and expansion targets.
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary hover:bg-[#d4631f] text-white"
        >
          <Plus className="mr-1 h-4 w-4" />
          Create Region
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border bg-card p-4 space-y-4 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A]">New Region</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="South-West Sydney"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-code">Code *</Label>
              <Input
                id="create-code"
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="SWS"
              />
            </div>
            <div className="space-y-1.5">
              <Label>State *</Label>
              <Select
                value={createForm.state}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, state: v ?? "NSW" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-suburbs">
              Suburbs (comma-separated)
            </Label>
            <Input
              id="create-suburbs"
              value={createSuburbsRaw}
              onChange={(e) => setCreateSuburbsRaw(e.target.value)}
              placeholder="Bankstown, Liverpool, Fairfield, Cabramatta"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-target">Target Centres</Label>
              <Input
                id="create-target"
                type="number"
                value={createForm.target_centres ?? ""}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    target_centres: e.target.value
                      ? parseInt(e.target.value, 10)
                      : null,
                  }))
                }
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-manager">Regional Manager</Label>
              <Input
                id="create-manager"
                value={createForm.regional_manager_id ?? ""}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    regional_manager_id: e.target.value || null,
                  }))
                }
                placeholder="Manager name or ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={createForm.status ?? "planned"}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    status: (v ?? "planned") as RegionStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-notes">Notes</Label>
            <Textarea
              id="create-notes"
              value={createForm.notes ?? ""}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  notes: e.target.value || null,
                }))
              }
              placeholder="Any additional notes about this region..."
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleCreate}
              disabled={saving || !createForm.name || !createForm.code || !createForm.state}
              className="bg-primary hover:bg-[#d4631f] text-white"
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              <Save className="mr-1 h-4 w-4" />
              Create
            </Button>
            <Button variant="outline" onClick={resetCreate}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-[#666666]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading regions...
        </div>
      )}

      {/* Regions list */}
      {!loading && regions.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-[#666666]">
          <MapPin className="mx-auto mb-2 h-10 w-10 text-gray-300" />
          <p className="font-medium text-[#1A1A1A]">No regions yet</p>
          <p className="text-sm">
            Create your first region to start organising by geography.
          </p>
        </div>
      )}

      {!loading && regions.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_80px_60px_80px_80px_80px_80px_80px] gap-2 px-4 py-2.5 border-b bg-gray-50 text-xs font-medium text-[#666666] uppercase tracking-wider">
            <span>Region</span>
            <span>Code</span>
            <span>State</span>
            <span className="text-center">Status</span>
            <span className="text-center">Suburbs</span>
            <span className="text-center">Centres</span>
            <span className="text-center">Leads</span>
            <span className="text-center">Coaches</span>
          </div>

          {regions.map((region) => (
            <div key={region.id} className="border-b last:border-b-0">
              {/* Row */}
              <button
                onClick={() => handleExpand(region)}
                className="w-full grid grid-cols-1 md:grid-cols-[1fr_80px_60px_80px_80px_80px_80px_80px] gap-2 px-4 py-3 hover:bg-gray-50 transition-colors text-left items-center"
              >
                <div className="flex items-center gap-2">
                  {expandedId === region.id ? (
                    <ChevronDown className="h-4 w-4 text-[#666666] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[#666666] shrink-0" />
                  )}
                  <span className="font-medium text-[#1A1A1A]">
                    {region.name}
                  </span>
                </div>
                <span className="text-sm text-[#666666] font-mono">
                  {region.code}
                </span>
                <span className="text-sm text-[#666666]">{region.state}</span>
                <div className="text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_STYLES[region.status]}`}
                  >
                    {region.status}
                  </span>
                </div>
                <span className="text-sm text-center text-[#666666]">
                  {region.suburbs?.length ?? 0}
                </span>
                <span className="text-sm text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    {region.centre_count}
                  </span>
                </span>
                <span className="text-sm text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3.5 w-3.5 text-blue-500" />
                    {region.lead_count}
                  </span>
                </span>
                <span className="text-sm text-center font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-green-600" />
                    {region.coach_count}
                  </span>
                </span>
              </button>

              {/* Expanded edit form */}
              {expandedId === region.id && (
                <div className="px-4 pb-4 pt-1 bg-gray-50 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-name-${region.id}`}>Name</Label>
                      <Input
                        id={`edit-name-${region.id}`}
                        value={editForm.name ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-code-${region.id}`}>Code</Label>
                      <Input
                        id={`edit-code-${region.id}`}
                        value={editForm.code ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            code: e.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State</Label>
                      <Select
                        value={editForm.state ?? region.state}
                        onValueChange={(v) =>
                          setEditForm((f) => ({
                            ...f,
                            state: v ?? region.state,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-suburbs-${region.id}`}>
                      Suburbs (comma-separated)
                    </Label>
                    <Input
                      id={`edit-suburbs-${region.id}`}
                      value={editSuburbsRaw}
                      onChange={(e) => setEditSuburbsRaw(e.target.value)}
                    />
                    {editSuburbsRaw && (
                      <p className="text-xs text-[#666666]">
                        {editSuburbsRaw.split(",").filter((s) => s.trim()).length}{" "}
                        suburb(s)
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-target-${region.id}`}>
                        Target Centres
                      </Label>
                      <Input
                        id={`edit-target-${region.id}`}
                        type="number"
                        value={editForm.target_centres ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            target_centres: e.target.value
                              ? parseInt(e.target.value, 10)
                              : null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`edit-manager-${region.id}`}>
                        Regional Manager
                      </Label>
                      <Input
                        id={`edit-manager-${region.id}`}
                        value={editForm.regional_manager_id ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            regional_manager_id: e.target.value || null,
                          }))
                        }
                        placeholder="Manager name or ID"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select
                        value={editForm.status ?? region.status}
                        onValueChange={(v) =>
                          handleStatusToggle(
                            region,
                            (v ?? region.status) as RegionStatus
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-notes-${region.id}`}>Notes</Label>
                    <Textarea
                      id={`edit-notes-${region.id}`}
                      value={editForm.notes ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          notes: e.target.value || null,
                        }))
                      }
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={handleUpdate}
                      disabled={editSaving}
                      className="bg-primary hover:bg-[#d4631f] text-white"
                    >
                      {editSaving && (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      )}
                      <Save className="mr-1 h-4 w-4" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setExpandedId(null)}
                    >
                      Cancel
                    </Button>
                    <div className="flex-1" />
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleDelete(region.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Deactivate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
