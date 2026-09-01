"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronsUpDown, Building2, Star, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { setDefaultClientCentre } from "@/lib/client/actions";
import type { ClientUserCentre } from "@/lib/client/actions";
import { cn } from "@/lib/utils";

interface CentreSwitcherProps {
  /** Every centre the director can access. Hidden when length <= 1. */
  centres: ClientUserCentre[];
  currentCentreId: string;
}

// ============================================================
// CentreSwitcher
// ============================================================
//
// Multi-centre directors get a Popover in the header — click a
// different centre and we push() to /client/<id>. The default
// centre carries a star and a restrained orange ring; the rest
// stay neutral. Hidden when the user only has one centre, so
// single-centre directors see the same plain header as before.

export function CentreSwitcher({ centres, currentCentreId }: CentreSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [savingDefaultId, setSavingDefaultId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (centres.length <= 1) return null;

  const current = centres.find((c) => c.id === currentCentreId) ?? centres[0];

  function handleSwitch(centreId: string) {
    if (centreId === currentCentreId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(() => {
      router.push(`/client/${centreId}`);
    });
  }

  function handleMakeDefault(e: React.MouseEvent, centreId: string) {
    e.stopPropagation();
    setSavingDefaultId(centreId);
    setDefaultClientCentre(centreId).then(({ error }) => {
      setSavingDefaultId(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Default centre updated.");
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* base-ui pattern: trigger takes a render prop, not asChild */}
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex max-w-[260px] items-center gap-2 rounded-2xl border border-transparent bg-gray-50 px-3 py-1.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-600/40 data-[state=open]:bg-gray-100"
            aria-label="Switch centre"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{current.name}</span>
            <span className="ml-1 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {centres.length}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(20rem,92vw)] p-1.5"
      >
        <div className="px-2 pt-1 pb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
          Your centres
        </div>
        <ul className="flex flex-col gap-0.5" role="listbox" aria-label="Centres">
          {centres.map((c) => {
            const isCurrent = c.id === currentCentreId;
            const isSavingDefault = savingDefaultId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => handleSwitch(c.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    isCurrent
                      ? "bg-portal-600/5 ring-1 ring-inset ring-portal-600/30"
                      : "hover:bg-gray-50",
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-portal-50 text-xs font-semibold text-portal-700">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo_url} alt="" className="h-7 w-7 rounded-lg object-cover" />
                    ) : (
                      c.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {c.name}
                    </span>
                    {c.is_default && (
                      <span className="text-[11px] text-muted-foreground">
                        Default
                      </span>
                    )}
                  </span>

                  {isCurrent && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-portal-600" aria-hidden="true" />
                  )}
                  {!c.is_default && (
                    <button
                      type="button"
                      onClick={(e) => handleMakeDefault(e, c.id)}
                      title="Make default"
                      aria-label={`Make ${c.name} default`}
                      className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-portal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-600/40 group-hover:flex"
                    >
                      {isSavingDefault ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
