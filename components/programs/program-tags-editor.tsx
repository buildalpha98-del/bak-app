"use client";

// ============================================================
// Programme tags editor
// ============================================================
//
// Inline chip editor on the programme detail header. Tags are the
// operator's own vocabulary ("wet weather", "small space", "high
// energy") — searchable and filterable in the library, and the
// curation layer future recommendation ranking can lean on.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Tag, X } from "lucide-react";
import { updateProgramTags } from "@/lib/programs/actions";

interface Props {
  programId: string;
  initialTags: string[];
}

export function ProgramTagsEditor({ programId, initialTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    const { error } = await updateProgramTags(programId, next);
    setSaving(false);
    if (error) {
      toast.error(error);
      return false;
    }
    setTags(next);
    router.refresh();
    return true;
  }

  async function handleAdd() {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (tags.includes(value)) {
      setDraft("");
      return;
    }
    const ok = await save([...tags, value]);
    if (ok) {
      setDraft("");
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="size-3.5 text-muted-foreground" aria-hidden />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            disabled={saving}
            onClick={() => save(tags.filter((t) => t !== tag))}
            className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onBlur={() => void handleAdd()}
            placeholder="e.g. wet weather"
            className="h-6 w-32 rounded-full border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/40"
          />
          {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Plus className="size-3" />
          tag
        </button>
      )}
    </div>
  );
}
