"use client";

import { useState, useTransition } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  BookOpen,
  GraduationCap,
  AlertCircle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { TrainingAssignment, TrainingModule, TrainingPathway } from "@/lib/types/database";
import {
  assignModuleToCoach,
  assignPathwayToCoach,
  getCoachAssignments,
  getModuleAssignees,
  getPathwayAssignees,
  bulkAssignModule,
  bulkAssignPathway,
} from "@/lib/training/assignment-actions";

interface AssignmentManagerProps {
  coaches: Array<{ id: string; name: string }>;
  modules: Array<{ id: string; title: string; type: string }>;
  pathways: Array<{ id: string; title: string; category: string }>;
}

type AssignmentWithDetails = TrainingAssignment & {
  module?: TrainingModule;
  pathway?: TrainingPathway;
};

type AssigneeRow = {
  assignment: TrainingAssignment;
  coach: { id: string; name: string };
};

const STATUS_STYLES: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  assigned: {
    label: "Assigned",
    variant: "outline",
    className: "border-amber-500 text-amber-700 bg-amber-50",
  },
  in_progress: {
    label: "In Progress",
    variant: "outline",
    className: "border-blue-500 text-blue-700 bg-blue-50",
  },
  completed: {
    label: "Completed",
    variant: "outline",
    className: "border-green-500 text-green-700 bg-green-50",
  },
  overdue: {
    label: "Overdue",
    variant: "destructive",
    className: "",
  },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.assigned;
  return (
    <Badge variant={style.variant} className={style.className}>
      {style.label}
    </Badge>
  );
}

function AssignmentTypeLabel({
  assignment,
}: {
  assignment: AssignmentWithDetails;
}) {
  if (assignment.module) {
    return (
      <Badge variant="secondary" className="text-xs">
        <BookOpen className="mr-1 h-3 w-3" />
        Module
      </Badge>
    );
  }
  if (assignment.pathway) {
    return (
      <Badge variant="secondary" className="text-xs">
        <GraduationCap className="mr-1 h-3 w-3" />
        Pathway
      </Badge>
    );
  }
  return null;
}

// ─────────────────────────────────────────────
// BY COACH TAB
// ─────────────────────────────────────────────

function ByCoachTab({
  coaches,
  modules,
  pathways,
}: {
  coaches: AssignmentManagerProps["coaches"];
  modules: AssignmentManagerProps["modules"];
  pathways: AssignmentManagerProps["pathways"];
}) {
  const [selectedCoachId, setSelectedCoachId] = useState<string>("");
  const [coachAssignments, setCoachAssignments] = useState<{
    assigned: AssignmentWithDetails[];
    in_progress: AssignmentWithDetails[];
    completed: AssignmentWithDetails[];
    overdue: AssignmentWithDetails[];
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Assign module dialog state
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [moduleDueDate, setModuleDueDate] = useState("");
  const [moduleAssigning, startModuleAssign] = useTransition();

  // Assign pathway dialog state
  const [pathwayDialogOpen, setPathwayDialogOpen] = useState(false);
  const [selectedPathwayId, setSelectedPathwayId] = useState("");
  const [pathwayDueDate, setPathwayDueDate] = useState("");
  const [pathwayAssigning, startPathwayAssign] = useTransition();

  const [error, setError] = useState<string | null>(null);

  function loadCoachAssignments(coachId: string | null) {
    if (!coachId) return;
    setSelectedCoachId(coachId);
    setError(null);
    startTransition(async () => {
      const data = await getCoachAssignments(coachId);
      setCoachAssignments(data);
    });
  }

  function handleAssignModule() {
    if (!selectedCoachId || !selectedModuleId) return;
    setError(null);
    startModuleAssign(async () => {
      const result = await assignModuleToCoach(
        selectedCoachId,
        selectedModuleId,
        moduleDueDate || undefined
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setModuleDialogOpen(false);
      setSelectedModuleId("");
      setModuleDueDate("");
      // Reload assignments
      const data = await getCoachAssignments(selectedCoachId);
      setCoachAssignments(data);
    });
  }

  function handleAssignPathway() {
    if (!selectedCoachId || !selectedPathwayId) return;
    setError(null);
    startPathwayAssign(async () => {
      const result = await assignPathwayToCoach(
        selectedCoachId,
        selectedPathwayId,
        pathwayDueDate || undefined
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPathwayDialogOpen(false);
      setSelectedPathwayId("");
      setPathwayDueDate("");
      // Reload assignments
      const data = await getCoachAssignments(selectedCoachId);
      setCoachAssignments(data);
    });
  }

  const sections: Array<{
    key: string;
    title: string;
    icon: React.ReactNode;
    items: AssignmentWithDetails[];
    borderColor: string;
  }> = coachAssignments
    ? [
        {
          key: "assigned",
          title: "Assigned",
          icon: <Clock className="h-4 w-4 text-amber-600" />,
          items: coachAssignments.assigned,
          borderColor: "border-l-amber-500",
        },
        {
          key: "in_progress",
          title: "In Progress",
          icon: <BookOpen className="h-4 w-4 text-blue-600" />,
          items: coachAssignments.in_progress,
          borderColor: "border-l-blue-500",
        },
        {
          key: "completed",
          title: "Completed",
          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
          items: coachAssignments.completed,
          borderColor: "border-l-green-500",
        },
        {
          key: "overdue",
          title: "Overdue",
          icon: <AlertCircle className="h-4 w-4 text-red-600" />,
          items: coachAssignments.overdue,
          borderColor: "border-l-red-500",
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <Select value={selectedCoachId} onValueChange={loadCoachAssignments}>
            <SelectTrigger>
              <SelectValue placeholder="Select a coach..." />
            </SelectTrigger>
            <SelectContent>
              {coaches.map((coach) => (
                <SelectItem key={coach.id} value={coach.id}>
                  {coach.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCoachId && (
          <div className="flex gap-2">
            <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
              <DialogTrigger
                render={<Button variant="outline" size="sm" />}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Assign Module
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Module</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Module</Label>
                    <Select
                      value={selectedModuleId}
                      onValueChange={(v) => setSelectedModuleId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a module..." />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map((mod) => (
                          <SelectItem key={mod.id} value={mod.id}>
                            {mod.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date (optional)</Label>
                    <Input
                      type="date"
                      value={moduleDueDate}
                      onChange={(e) => setModuleDueDate(e.target.value)}
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button
                    onClick={handleAssignModule}
                    disabled={!selectedModuleId || moduleAssigning}
                    className="w-full"
                  >
                    {moduleAssigning ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={pathwayDialogOpen}
              onOpenChange={setPathwayDialogOpen}
            >
              <DialogTrigger
                render={<Button variant="outline" size="sm" />}
              >
                <GraduationCap className="mr-2 h-4 w-4" />
                Assign Pathway
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Pathway</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Pathway</Label>
                    <Select
                      value={selectedPathwayId}
                      onValueChange={(v) => setSelectedPathwayId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a pathway..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pathways.map((pw) => (
                          <SelectItem key={pw.id} value={pw.id}>
                            {pw.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date (optional)</Label>
                    <Input
                      type="date"
                      value={pathwayDueDate}
                      onChange={(e) => setPathwayDueDate(e.target.value)}
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Button
                    onClick={handleAssignPathway}
                    disabled={!selectedPathwayId || pathwayAssigning}
                    className="w-full"
                  >
                    {pathwayAssigning ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {isPending && (
        <p className="text-sm text-muted-foreground">Loading assignments...</p>
      )}

      {coachAssignments && !isPending && (
        <div className="space-y-4">
          {sections.map((section) => (
            <Card key={section.key} className={`border-l-4 ${section.borderColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {section.icon}
                  {section.title}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {section.items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {section.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No {section.title.toLowerCase()} training.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.items.map((assignment) => (
                        <TableRow key={assignment.id}>
                          <TableCell className="font-medium">
                            {assignment.module?.title ??
                              assignment.pathway?.title ??
                              "Unknown"}
                          </TableCell>
                          <TableCell>
                            <AssignmentTypeLabel assignment={assignment} />
                          </TableCell>
                          <TableCell>
                            {assignment.due_date
                              ? new Date(
                                  assignment.due_date
                                ).toLocaleDateString("en-AU")
                              : "--"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={assignment.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!selectedCoachId && !isPending && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Select a coach to view and manage their training assignments.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BY MODULE/PATHWAY TAB
// ─────────────────────────────────────────────

function ByModulePathwayTab({
  modules,
  pathways,
}: {
  modules: AssignmentManagerProps["modules"];
  pathways: AssignmentManagerProps["pathways"];
}) {
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedPathwayId, setSelectedPathwayId] = useState("");
  const [moduleAssignees, setModuleAssignees] = useState<AssigneeRow[] | null>(
    null
  );
  const [pathwayAssignees, setPathwayAssignees] = useState<
    AssigneeRow[] | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"module" | "pathway">(
    "module"
  );
  const [bulkDueDate, setBulkDueDate] = useState("");

  function loadModuleAssignees(moduleId: string | null) {
    if (!moduleId) return;
    setSelectedModuleId(moduleId);
    setBulkResult(null);
    startTransition(async () => {
      const data = await getModuleAssignees(moduleId);
      setModuleAssignees(data);
    });
  }

  function loadPathwayAssignees(pathwayId: string | null) {
    if (!pathwayId) return;
    setSelectedPathwayId(pathwayId);
    setBulkResult(null);
    startTransition(async () => {
      const data = await getPathwayAssignees(pathwayId);
      setPathwayAssignees(data);
    });
  }

  function openBulkConfirm(type: "module" | "pathway") {
    setConfirmType(type);
    setBulkDueDate("");
    setBulkResult(null);
    setConfirmDialogOpen(true);
  }

  function handleBulkAssign() {
    startBulkTransition(async () => {
      if (confirmType === "module" && selectedModuleId) {
        const result = await bulkAssignModule(
          selectedModuleId,
          bulkDueDate || undefined
        );
        if ("error" in result) {
          setBulkResult(`Error: ${result.error}`);
        } else {
          setBulkResult(`Assigned to ${result.assigned} coach(es).`);
          // Reload assignees
          const data = await getModuleAssignees(selectedModuleId);
          setModuleAssignees(data);
        }
      } else if (confirmType === "pathway" && selectedPathwayId) {
        const result = await bulkAssignPathway(
          selectedPathwayId,
          bulkDueDate || undefined
        );
        if ("error" in result) {
          setBulkResult(`Error: ${result.error}`);
        } else {
          setBulkResult(`Assigned to ${result.assigned} coach(es).`);
          // Reload assignees
          const data = await getPathwayAssignees(selectedPathwayId);
          setPathwayAssignees(data);
        }
      }
      setConfirmDialogOpen(false);
    });
  }

  return (
    <div className="space-y-6">
      {/* Modules section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Modules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-72">
              <Select
                value={selectedModuleId}
                onValueChange={loadModuleAssignees}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a module..." />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((mod) => (
                    <SelectItem key={mod.id} value={mod.id}>
                      {mod.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedModuleId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBulkConfirm("module")}
                disabled={bulkPending}
              >
                <Users className="mr-2 h-4 w-4" />
                Assign to All Coaches
              </Button>
            )}
          </div>

          {isPending && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}

          {moduleAssignees && !isPending && (
            <>
              {bulkResult && (
                <p className="text-sm text-muted-foreground">{bulkResult}</p>
              )}
              {moduleAssignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No coaches assigned to this module yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coach</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleAssignees.map((row) => (
                      <TableRow key={row.assignment.id}>
                        <TableCell className="font-medium">
                          {row.coach.name}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.assignment.status} />
                        </TableCell>
                        <TableCell>
                          {row.assignment.due_date
                            ? new Date(
                                row.assignment.due_date
                              ).toLocaleDateString("en-AU")
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {new Date(
                            row.assignment.assigned_at
                          ).toLocaleDateString("en-AU")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Pathways section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Pathways
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-72">
              <Select
                value={selectedPathwayId}
                onValueChange={loadPathwayAssignees}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a pathway..." />
                </SelectTrigger>
                <SelectContent>
                  {pathways.map((pw) => (
                    <SelectItem key={pw.id} value={pw.id}>
                      {pw.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedPathwayId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBulkConfirm("pathway")}
                disabled={bulkPending}
              >
                <Users className="mr-2 h-4 w-4" />
                Assign to All Coaches
              </Button>
            )}
          </div>

          {isPending && (
            <p className="text-sm text-muted-foreground">Loading...</p>
          )}

          {pathwayAssignees && !isPending && (
            <>
              {bulkResult && (
                <p className="text-sm text-muted-foreground">{bulkResult}</p>
              )}
              {pathwayAssignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No coaches assigned to this pathway yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coach</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pathwayAssignees.map((row) => (
                      <TableRow key={row.assignment.id}>
                        <TableCell className="font-medium">
                          {row.coach.name}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.assignment.status} />
                        </TableCell>
                        <TableCell>
                          {row.assignment.due_date
                            ? new Date(
                                row.assignment.due_date
                              ).toLocaleDateString("en-AU")
                            : "--"}
                        </TableCell>
                        <TableCell>
                          {new Date(
                            row.assignment.assigned_at
                          ).toLocaleDateString("en-AU")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk assign confirmation dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign{" "}
              {confirmType === "module" ? "Module" : "Pathway"} to All
              Coaches
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              This will assign the selected{" "}
              {confirmType === "module" ? "module" : "pathway"} to all active
              coaches who are not already assigned.
            </p>
            <div className="space-y-2">
              <Label>Due Date (optional)</Label>
              <Input
                type="date"
                value={bulkDueDate}
                onChange={(e) => setBulkDueDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setConfirmDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleBulkAssign} disabled={bulkPending}>
                {bulkPending ? "Assigning..." : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

export function AssignmentManager({
  coaches,
  modules,
  pathways,
}: AssignmentManagerProps) {
  return (
    <Tabs defaultValue="by-coach">
      <TabsList>
        <TabsTrigger value="by-coach">
          <Users className="mr-2 h-4 w-4" />
          By Coach
        </TabsTrigger>
        <TabsTrigger value="by-content">
          <BookOpen className="mr-2 h-4 w-4" />
          By Module/Pathway
        </TabsTrigger>
      </TabsList>

      <TabsContent value="by-coach" className="mt-4">
        <ByCoachTab coaches={coaches} modules={modules} pathways={pathways} />
      </TabsContent>

      <TabsContent value="by-content" className="mt-4">
        <ByModulePathwayTab modules={modules} pathways={pathways} />
      </TabsContent>
    </Tabs>
  );
}
