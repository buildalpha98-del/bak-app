"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Play,
  CheckCircle2,
  Trash2,
  LayoutTemplate,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TermFormDialog } from "./term-form-dialog";
import { DuplicateTermDialog } from "./duplicate-term-dialog";
import { updateTerm, deleteTerm } from "@/lib/terms/actions";
import type { TermListItem } from "@/lib/terms/actions";
import type { Term } from "@/lib/types/database";

// ============================================================
// Helpers
// ============================================================

function termStatusVariant(
  status: string
): "default" | "secondary" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "completed":
      return "secondary";
    default:
      return "outline";
  }
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ============================================================
// Component
// ============================================================

interface TermListViewProps {
  initialData: TermListItem[];
  basePath: string;
}

export function TermListView({ initialData, basePath }: TermListViewProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTerm, setEditTerm] = useState<Term | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [dupTerm, setDupTerm] = useState<Term | undefined>();
  const [dupOpen, setDupOpen] = useState(false);
  const [termToDelete, setTermToDelete] = useState<string | null>(null);

  async function handleActivate(id: string) {
    const { error } = await updateTerm(id, { status: "active" });
    if (error) {
      toast.error(error);
      return;
    }
    router.refresh();
  }

  async function handleComplete(id: string) {
    const { error } = await updateTerm(id, { status: "completed" });
    if (error) {
      toast.error(error);
      return;
    }
    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!termToDelete) return;
    const { error } = await deleteTerm(termToDelete);
    setTermToDelete(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Term deleted");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Terms & Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage school terms and weekly session templates
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create Term
        </Button>
      </div>

      {/* Table */}
      {initialData.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Calendar className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No terms created yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Create your first term to start building the roster
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Term</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Templates</TableHead>
                <TableHead className="text-center">Sessions</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialData.map((term) => (
                <TableRow key={term.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{term.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {term.year}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(term.start_date)} – {formatDate(term.end_date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={termStatusVariant(term.status)}>
                      {formatStatus(term.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {term.template_count}
                  </TableCell>
                  <TableCell className="text-center">
                    {term.session_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link href={`${basePath}/${term.id}/template`} />
                        }
                      >
                        <LayoutTemplate className="size-4" />
                        Template
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditTerm(term);
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                            Edit Term
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDupTerm(term);
                              setDupOpen(true);
                            }}
                          >
                            <Copy className="size-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {term.status === "draft" && (
                            <DropdownMenuItem
                              onClick={() => handleActivate(term.id)}
                            >
                              <Play className="size-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          {term.status === "active" && (
                            <DropdownMenuItem
                              onClick={() => handleComplete(term.id)}
                            >
                              <CheckCircle2 className="size-4" />
                              Complete
                            </DropdownMenuItem>
                          )}
                          {term.status === "draft" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setTermToDelete(term.id)}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <TermFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => router.refresh()}
      />

      {editTerm && (
        <TermFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          term={editTerm}
          onSuccess={() => router.refresh()}
        />
      )}

      {dupTerm && (
        <DuplicateTermDialog
          open={dupOpen}
          onOpenChange={setDupOpen}
          term={dupTerm}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={termToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTermToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this term? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
