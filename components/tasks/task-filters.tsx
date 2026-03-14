"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, List, Filter, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TaskColumn } from "@/lib/types/database";

export interface TaskFilterState {
  myTasksOnly: boolean;
  overdueOnly: boolean;
  assigneeId: string;
  priority: string;
  columnId: string;
}

interface TaskFiltersProps {
  filters: TaskFilterState;
  onFiltersChange: (filters: TaskFilterState) => void;
  columns: TaskColumn[];
  teamMembers: { id: string; name: string }[];
  viewMode: "board" | "list";
  onViewModeChange: (mode: "board" | "list") => void;
}

export function TaskFilters({
  filters,
  onFiltersChange,
  columns,
  teamMembers,
  viewMode,
  onViewModeChange,
}: TaskFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const update = (partial: Partial<TaskFilterState>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const hasActiveFilters =
    filters.myTasksOnly ||
    filters.overdueOnly ||
    filters.assigneeId !== "" ||
    filters.priority !== "" ||
    filters.columnId !== "";

  const clearFilters = () => {
    onFiltersChange({
      myTasksOnly: false,
      overdueOnly: false,
      assigneeId: "",
      priority: "",
      columnId: "",
    });
  };

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Quick filters */}
      <Button
        variant={filters.myTasksOnly ? "default" : "outline"}
        size="sm"
        onClick={() => update({ myTasksOnly: !filters.myTasksOnly })}
        className={
          filters.myTasksOnly
            ? "bg-primary hover:bg-primary/90 text-white"
            : ""
        }
      >
        My Tasks
      </Button>
      <Button
        variant={filters.overdueOnly ? "default" : "outline"}
        size="sm"
        onClick={() => update({ overdueOnly: !filters.overdueOnly })}
        className={
          filters.overdueOnly
            ? "bg-red-500 hover:bg-red-600 text-white"
            : ""
        }
      >
        Overdue
      </Button>

      {/* Dropdowns */}
      <Select
        value={filters.priority}
        onValueChange={(v) => update({ priority: v === "all" ? "" : (v ?? "") })}
      >
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="All Priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.assigneeId}
        onValueChange={(v) => update({ assigneeId: v === "all" ? "" : (v ?? "") })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="All Assignees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Assignees</SelectItem>
          {teamMembers.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="w-3 h-3 mr-1" /> Clear
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      {/* Desktop filters */}
      <div className="hidden md:block">{filterControls}</div>

      {/* Mobile filter button */}
      <div className="md:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileOpen(true)}
        >
          <Filter className="w-4 h-4 mr-1" /> Filters
          {hasActiveFilters && (
            <span className="ml-1 w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      {/* View toggle */}
      <div className="hidden md:flex items-center gap-1 border rounded-md p-0.5">
        <button
          onClick={() => onViewModeChange("board")}
          className={`p-1.5 rounded ${
            viewMode === "board"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={`p-1.5 rounded ${
            viewMode === "list"
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile filter sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">{filterControls}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
