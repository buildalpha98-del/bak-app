"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getParentChildren, addChild, type ChildInput } from "@/lib/parent/actions";
import { ChildCard } from "@/components/parent/child-card";
import { ChildForm } from "@/components/parent/child-form";
import { Button } from "@/components/ui/button";
import type { Child, ParentChild } from "@/lib/types/database";
import { Plus, Loader2, X } from "lucide-react";

const EMPTY_CHILD: ChildInput = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: null,
  medical_notes: null,
};

export default function ParentKidsPage() {
  const [children, setChildren] = useState<(ParentChild & { child: Child })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newChild, setNewChild] = useState<ChildInput>({ ...EMPTY_CHILD });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadChildren() {
    setLoading(true);
    const { data } = await getParentChildren();
    setChildren(data);
    setLoading(false);
  }

  useEffect(() => {
    loadChildren();
  }, []);

  async function handleAddChild() {
    if (!newChild.first_name.trim() || !newChild.last_name.trim() || !newChild.date_of_birth) return;

    setAdding(true);
    setError(null);

    const { error: addError } = await addChild(newChild);

    setAdding(false);

    if (addError) {
      setError(addError);
      toast.error("Could not add child. Please check the details and try again.");
      return;
    }

    toast.success(`${newChild.first_name} has been added!`);
    setNewChild({ ...EMPTY_CHILD });
    setShowAdd(false);
    loadChildren();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Kids</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage your children's profiles
          </p>
        </div>
        {!showAdd && (
          <Button
            onClick={() => setShowAdd(true)}
            className="bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Child
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add child form */}
      {showAdd && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Add a Child</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowAdd(false);
                setNewChild({ ...EMPTY_CHILD });
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChildForm
            index={0}
            child={newChild}
            onChange={(_, child) => setNewChild(child)}
          />
          <Button
            onClick={handleAddChild}
            disabled={adding || !newChild.first_name.trim() || !newChild.last_name.trim() || !newChild.date_of_birth}
            className="w-full h-11 bg-[#E8712A] text-white hover:bg-[#D4651F] rounded-lg"
          >
            {adding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add Child"
            )}
          </Button>
        </div>
      )}

      {/* Children list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#E8712A]" />
        </div>
      ) : children.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-orange-100">
          <p className="text-muted-foreground">
            No children registered yet. Add your first child above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {children.map((pc) => (
            <ChildCard key={pc.child.id} child={pc.child} />
          ))}
        </div>
      )}
    </div>
  );
}
