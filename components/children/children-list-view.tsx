"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Upload, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createChild } from "@/lib/children/actions";
import type { ChildListItem } from "@/lib/children/actions";
import type { AgeGroup, ChildStatus, Gender } from "@/lib/types/enums";

interface ChildrenListViewProps {
  children: ChildListItem[];
  centres: { id: string; name: string }[];
  basePath: string;
}

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export default function ChildrenListView({
  children: initialChildren,
  centres,
  basePath,
}: ChildrenListViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [search, setSearch] = useState("");
  const [centreFilter, setCentreFilter] = useState<string>("all");
  const [ageGroupFilter, setAgeGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    age_group: "3-5" as AgeGroup,
    gender: "" as string,
    medical_notes: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
  });
  const [selectedCentreIds, setSelectedCentreIds] = useState<string[]>([]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = initialChildren;

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.first_name.toLowerCase().includes(term) ||
          c.last_name.toLowerCase().includes(term)
      );
    }

    if (centreFilter !== "all") {
      result = result.filter((c) =>
        c.centres.some((centre) => centre.id === centreFilter)
      );
    }

    if (ageGroupFilter !== "all") {
      result = result.filter((c) => c.age_group === ageGroupFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    return result;
  }, [initialChildren, search, centreFilter, ageGroupFilter, statusFilter]);

  function resetForm() {
    setFormData({
      first_name: "",
      last_name: "",
      date_of_birth: "",
      age_group: "3-5",
      gender: "",
      medical_notes: "",
      parent_name: "",
      parent_phone: "",
      parent_email: "",
    });
    setSelectedCentreIds([]);
  }

  function toggleCentre(centreId: string) {
    setSelectedCentreIds((prev) =>
      prev.includes(centreId)
        ? prev.filter((id) => id !== centreId)
        : [...prev, centreId]
    );
  }

  function handleSubmit() {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    startTransition(async () => {
      const { error } = await createChild({
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth || null,
        age_group: formData.age_group,
        gender: (formData.gender as Gender) || null,
        medical_notes: formData.medical_notes || null,
        parent_name: formData.parent_name || null,
        parent_phone: formData.parent_phone || null,
        parent_email: formData.parent_email || null,
        centre_ids: selectedCentreIds.length > 0 ? selectedCentreIds : undefined,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Child added successfully.");
        setDialogOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  function statusBadgeVariant(status: ChildStatus) {
    return status === "active" ? "default" : "destructive";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Children</h1>
          <p className="text-muted-foreground text-sm">
            Manage children across all centres
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => router.push(`${basePath}/import`)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button className="min-h-[44px]" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Child
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Child</DialogTitle>
                <DialogDescription>
                  Create a new child record and optionally assign them to
                  centres.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                {/* Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First name *</Label>
                    <Input
                      id="first_name"
                      className="min-h-[44px]"
                      value={formData.first_name}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          first_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last name *</Label>
                    <Input
                      id="last_name"
                      className="min-h-[44px]"
                      value={formData.last_name}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          last_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* DOB & Age Group */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      className="min-h-[44px]"
                      value={formData.date_of_birth}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          date_of_birth: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age_group">Age group *</Label>
                    <Select
                      value={formData.age_group}
                      onValueChange={(v) =>
                        setFormData((p) => ({
                          ...p,
                          age_group: v as AgeGroup,
                        }))
                      }
                    >
                      <SelectTrigger id="age_group" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGE_GROUPS.map((ag) => (
                          <SelectItem key={ag} value={ag}>
                            {ag} years
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Gender */}
                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(v) =>
                      setFormData((p) => ({ ...p, gender: v as string }))
                    }
                  >
                    <SelectTrigger id="gender" className="min-h-[44px]">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Medical notes */}
                <div className="space-y-2">
                  <Label htmlFor="medical_notes">Medical notes</Label>
                  <Textarea
                    id="medical_notes"
                    placeholder="Allergies, conditions, etc."
                    value={formData.medical_notes}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        medical_notes: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Parent details */}
                <div className="space-y-2">
                  <Label htmlFor="parent_name">Parent / guardian name</Label>
                  <Input
                    id="parent_name"
                    className="min-h-[44px]"
                    value={formData.parent_name}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        parent_name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="parent_phone">Parent phone</Label>
                    <Input
                      id="parent_phone"
                      type="tel"
                      className="min-h-[44px]"
                      value={formData.parent_phone}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          parent_phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="parent_email">Parent email</Label>
                    <Input
                      id="parent_email"
                      type="email"
                      className="min-h-[44px]"
                      value={formData.parent_email}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          parent_email: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {/* Centre assignment */}
                {centres.length > 0 && (
                  <div className="space-y-2">
                    <Label>Assign to centres</Label>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                      {centres.map((centre) => (
                        <div
                          key={centre.id}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`centre-${centre.id}`}
                            checked={selectedCentreIds.includes(centre.id)}
                            onCheckedChange={() => toggleCentre(centre.id)}
                          />
                          <Label
                            htmlFor={`centre-${centre.id}`}
                            className="cursor-pointer text-sm font-normal"
                          >
                            {centre.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="min-h-[44px]"
                  onClick={handleSubmit}
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Add Child"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name..."
            className="min-h-[44px] pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={centreFilter} onValueChange={(v) => setCentreFilter(v ?? "all")}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[200px]">
            <SelectValue placeholder="All centres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All centres</SelectItem>
            {centres.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ageGroupFilter} onValueChange={(v) => setAgeGroupFilter(v ?? "all")}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[160px]">
            <SelectValue placeholder="All age groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All age groups</SelectItem>
            {AGE_GROUPS.map((ag) => (
              <SelectItem key={ag} value={ag}>
                {ag} years
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <Users className="text-muted-foreground mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            {initialChildren.length === 0
              ? "No children have been added yet."
              : "No children match your filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age Group</TableHead>
                <TableHead className="hidden sm:table-cell">Centres</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((child) => (
                <TableRow
                  key={child.id}
                  className="min-h-[44px] cursor-pointer"
                  onClick={() => router.push(`${basePath}/${child.id}`)}
                >
                  <TableCell className="font-medium">
                    {child.first_name} {child.last_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{child.age_group} yrs</Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {child.centres.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          None
                        </span>
                      ) : (
                        child.centres.map((centre) => (
                          <Badge key={centre.id} variant="outline">
                            {centre.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(child.status)}>
                      {child.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Showing {filtered.length} of {initialChildren.length} children
      </p>
    </div>
  );
}
