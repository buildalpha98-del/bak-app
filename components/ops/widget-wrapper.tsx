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
      <Card>
        <CollapsibleTrigger className="w-full cursor-pointer lg:cursor-default">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="size-5 text-[#E8712A]" />
              <CardTitle className="text-base">{title}</CardTitle>
              {count !== undefined && count > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {count}
                </Badge>
              )}
            </div>
            <ChevronDown
              className={`size-4 text-[#666666] transition-transform lg:hidden ${
                open ? "rotate-180" : ""
              }`}
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
