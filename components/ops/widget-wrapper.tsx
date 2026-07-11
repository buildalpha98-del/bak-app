"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/components/launch/use-count-up";

// ============================================================
// Shared collapsible widget wrapper for command centre
// ============================================================
//
// Used by every widget on /ops. The visual refresh aligned to the
// rest of the platform:
//   - rounded-2xl outer card with subtle hover-lift
//   - restrained brand orange (#E8712A) only applied to the count
//     pill when it's > 0 — the icon tile stays in the brand-orange
//     tint regardless
//   - the count animates up via useCountUp so first paint feels warm

interface WidgetWrapperProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  className?: string;
}

export function WidgetWrapper({
  title,
  icon: Icon,
  children,
  count,
  defaultOpen = true,
  className = "",
}: WidgetWrapperProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <Card className="rounded-2xl border bg-background transition hover:-translate-y-0.5 hover:shadow-md">
        <CollapsibleTrigger className="w-full cursor-pointer lg:cursor-default">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              {count !== undefined && count > 0 && (
                <WidgetCountPill count={count} />
              )}
            </div>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200 lg:hidden",
                open && "rotate-180"
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function WidgetCountPill({ count }: { count: number }) {
  const ticked = useCountUp(count);
  return (
    <span className="ml-0.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
      {ticked}
    </span>
  );
}
