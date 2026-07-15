"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// Being bounced out of a section with no explanation reads as a broken
// link, not a permission boundary. The financial gate has always
// appended ?denied=financial "so the destination can surface a toast" —
// nothing ever read it, so Abdul just landed back on /admin wondering
// what he'd clicked.
const MESSAGES: Record<string, string> = {
  financial:
    "That section is limited to team members with financial access. Ask an admin if you need it.",
};

export function DeniedToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const denied = params.get("denied");
  // StrictMode double-invokes effects in development; without this the
  // toast fires twice on every denied navigation.
  const shown = useRef<string | null>(null);

  useEffect(() => {
    if (!denied || shown.current === denied) return;
    const message = MESSAGES[denied];
    if (!message) return;

    shown.current = denied;
    toast.error(message);

    // Drop the param so a refresh (or a later back-navigation) doesn't
    // replay the toast.
    const next = new URLSearchParams(params.toString());
    next.delete("denied");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [denied, params, pathname, router]);

  return null;
}
