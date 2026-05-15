"use client";

import { useState, useEffect } from "react";
import { Check, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SPORTS } from "@/lib/types/enums";
import {
  listCustomSports,
  addCustomSport,
  type CustomTaxonomyItem,
} from "@/lib/programs/custom-taxonomy-actions";
import { cn } from "@/lib/utils";

interface SportComboboxProps {
  value: string;
  onChange: (sport: string) => void;
}

export function SportCombobox({ value, onChange }: SportComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<CustomTaxonomyItem[]>([]);

  useEffect(() => {
    listCustomSports().then(({ data }) => {
      if (data) setCustom(data);
    });
  }, []);

  const allSports = [...SPORTS, ...custom.map((c) => c.name)];
  const seen = new Set<string>();
  const dedupedSports = allSports.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const trimmed = query.trim();
  const exactMatch = dedupedSports.some(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = trimmed.length > 0 && !exactMatch;

  async function handleAdd() {
    if (!canAdd) return;
    const result = await addCustomSport(trimmed);
    if (result.data) {
      setCustom((prev) => [...prev, result.data!]);
      onChange(result.data.name);
      setOpen(false);
      setQuery("");
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        {value || "Select sport"}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or add a sport…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No sports found.
              </p>
            </CommandEmpty>
            <CommandGroup>
              {dedupedSports.map((s) => (
                <CommandItem
                  key={s}
                  value={s}
                  onSelect={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === s ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {s}
                </CommandItem>
              ))}
              {canAdd && (
                <CommandItem onSelect={handleAdd} className="text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Add "{trimmed}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
