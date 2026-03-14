"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Users,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateChild, withdrawChildFromCentre } from "@/lib/children/actions";
import type { ChildDetail } from "@/lib/children/actions";
import type { AgeGroup, Gender } from "@/lib/types/enums";
import { ChildAssessmentDisplay } from "@/components/assessments/child-assessment-display";

interface ChildDetailViewProps {
  data: ChildDetail;
  basePath: string;
}

const AGE_GROUPS: AgeGroup[] = ["3-5", "5-8", "8-12"];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ChildDetailView({
  data,
  basePath,
}: ChildDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isWithdrawing, startWithdrawTransition] = useTransition();

  const [form, setForm] = useState({
    first_name: data.first_name,
    last_name: data.last_name,
    date_of_birth: data.date_of_birth ?? "",
    age_group: data.age_group,
    gender: (data.gender ?? "") as string,
    medical_notes: data.medical_notes ?? "",
    parent_name: data.parent_name ?? "",
    parent_phone: data.parent_phone ?? "",
    parent_email: data.parent_email ?? "",
  });

  function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    startTransition(async () => {
      const { error } = await updateChild(data.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        age_group: form.age_group,
        gender: (form.gender as Gender) || null,
        medical_notes: form.medical_notes || null,
        parent_name: form.parent_name || null,
        parent_phone: form.parent_phone || null,
        parent_email: form.parent_email || null,
      });

      if (error) {
        toast.error(error);
      } else {
        toast.success("Child updated successfully.");
        router.refresh();
      }
    });
  }

  function handleWithdraw(centreId: string, centreName: string) {
    startWithdrawTransition(async () => {
      const { error } = await withdrawChildFromCentre(data.id, centreId);
      if (error) {
        toast.error(error);
      } else {
        toast.success(`Withdrawn from ${centreName}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            onClick={() => router.push(basePath)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {data.first_name} {data.last_name}
              </h1>
              <Badge variant="secondary">{data.age_group} yrs</Badge>
              <Badge
                variant={data.status === "active" ? "default" : "destructive"}
              >
                {data.status}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          className="min-h-[44px]"
          onClick={handleSave}
          disabled={isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Editable fields */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                className="min-h-[44px]"
                value={form.first_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, first_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                className="min-h-[44px]"
                value={form.last_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, last_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                className="min-h-[44px]"
                value={form.date_of_birth}
                onChange={(e) =>
                  setForm((p) => ({ ...p, date_of_birth: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age_group">Age group</Label>
              <Select
                value={form.age_group}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, age_group: v as AgeGroup }))
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

          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={form.gender}
              onValueChange={(v) => setForm((p) => ({ ...p, gender: v as string }))}
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

          <div className="space-y-2">
            <Label htmlFor="medical_notes">Medical notes</Label>
            <Textarea
              id="medical_notes"
              placeholder="Allergies, conditions, etc."
              value={form.medical_notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, medical_notes: e.target.value }))
              }
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="parent_name">Parent / guardian name</Label>
            <Input
              id="parent_name"
              className="min-h-[44px]"
              value={form.parent_name}
              onChange={(e) =>
                setForm((p) => ({ ...p, parent_name: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent_phone">Parent phone</Label>
              <Input
                id="parent_phone"
                type="tel"
                className="min-h-[44px]"
                value={form.parent_phone}
                onChange={(e) =>
                  setForm((p) => ({ ...p, parent_phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_email">Parent email</Label>
              <Input
                id="parent_email"
                type="email"
                className="min-h-[44px]"
                value={form.parent_email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, parent_email: e.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Centres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Linked Centres
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.centres.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Not enrolled at any centres.
            </p>
          ) : (
            <div className="space-y-3">
              {data.centres.map((centre) => (
                <div
                  key={centre.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{centre.name}</p>
                    <p className="text-muted-foreground text-xs">
                      Enrolled {formatDate(centre.enrolled_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        centre.enrolment_status === "active"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {centre.enrolment_status}
                    </Badge>
                    {centre.enrolment_status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        disabled={isWithdrawing}
                        onClick={() => handleWithdraw(centre.id, centre.name)}
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Attendance History
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {data.total_sessions_attended} session
            {data.total_sessions_attended !== 1 ? "s" : ""} attended
          </p>
        </CardHeader>
        <CardContent>
          {data.attendance_history.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No attendance records yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Sport</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Centre
                    </TableHead>
                    <TableHead>Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attendance_history.map((record) => (
                    <TableRow key={record.session_id}>
                      <TableCell className="text-sm">
                        {formatDate(record.date)}
                      </TableCell>
                      <TableCell className="text-sm">{record.sport}</TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">
                        {record.centre_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={record.present ? "default" : "destructive"}
                        >
                          {record.present ? "Present" : "Absent"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skill Assessments */}
      <ChildAssessmentDisplay childId={data.id} />
    </div>
  );
}
