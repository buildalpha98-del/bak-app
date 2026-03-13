"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ============================================================
// Shared collapsible widget wrapper for command centre
// ============================================================

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
      <Card className="card-hover">
        <CollapsibleTrigger className="w-full cursor-pointer lg:cursor-default">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-orange-light)]">
                <Icon className="size-4 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              {count !== undefined && count > 0 && (
                <Badge variant="secondary" className="ml-0.5 text-xs font-semibold">
                  {count}
                </Badge>
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
